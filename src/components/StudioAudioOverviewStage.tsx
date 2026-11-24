import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileText,
  Headphones,
  Pause,
  Play,
  Sparkles,
  Volume2,
  VolumeX
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type {
  MeetingSession,
  PodcastDialogueTurn,
  PodcastEpisode,
  VoiceProfileConfig
} from '../types/index.ts';
import { SAMPLE_PODCAST_EPISODES } from '../data/mockData.ts';
import {
  calculateEpisodeDuration,
  estimateSpokenDurationSec,
  resolvePodcastVoiceProfile
} from '../utils/audioSynthesis.ts';
import { createEpisodeOverviewWavBytes, sanitizeDownloadBaseName } from '../utils/audioConversion.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS } from '../utils/motion.ts';
import { AudioDownloadSource, AudioFormatDownloadModal } from './AudioFormatDownloadModal.tsx';
import { TranscriptDetailView } from './TranscriptDetailView.tsx';
import { TranscriptFormatDownloadModal } from './TranscriptFormatDownloadModal.tsx';

interface StudioAudioOverviewStageProps {
  session: MeetingSession;
  voiceProfile?: VoiceProfileConfig;
  ttsEngine: 'on-device' | 'secure-cloud';
}

function buildMeetingEpisode(session: MeetingSession): PodcastEpisode {
  const decisions = session.items.filter((i) => i.category === 'decision');
  const actions = session.items.filter((i) => i.category === 'action');
  const risks = session.items.filter((i) => i.category === 'risk');

  const turns: PodcastDialogueTurn[] = [
    {
      id: `mturn-${session.id}-1`,
      speaker: 'Alex',
      speakerRole: 'Deep Tech Host',
      text: `Welcome back. Let us break down Session ${session.sessionNumber}: ${session.title}. ${session.summary}`,
      durationSec: estimateSpokenDurationSec(session.summary) + 2.2,
      citations: [1]
    },
    {
      id: `mturn-${session.id}-2`,
      speaker: 'Maya',
      speakerRole: 'Practical Synthesizer',
      text:
        decisions.length > 0
          ? `The big architecture decision here: ${decisions.map((d) => d.text).join(' ')}`
          : `During this discussion, the team aligned on keeping core workflows modular and traceable.`,
      durationSec: 7.4,
      citations: [1]
    },
    {
      id: `mturn-${session.id}-3`,
      speaker: 'Alex',
      speakerRole: 'Deep Tech Host',
      text:
        actions.length > 0
          ? `On execution follow-ups: ${actions
              .map((a) => `${a.owner ? `${a.owner} owns ` : ''}${a.text}`)
              .join(' ')}`
          : `Next steps focus on verifying integrations cleanly and documenting test baselines.`,
      durationSec: 7.6,
      citations: [2]
    },
    {
      id: `mturn-${session.id}-4`,
      speaker: 'Maya',
      speakerRole: 'Practical Synthesizer',
      text:
        risks.length > 0
          ? `Watch out for these risks: ${risks.map((r) => r.text).join(' ')}`
          : `And keeping all session outputs organized inside Studio makes handoffs seamless.`,
      durationSec: 6.5,
      citations: [2]
    }
  ];

  const duration = calculateEpisodeDuration(turns);
  return {
    id: `ep-meeting-${session.id}`,
    title: `${session.title} — Audio Overview`,
    subtitle: `Session S${session.sessionNumber} · ${session.items.length} structured notes`,
    topic: `Meeting S${session.sessionNumber}`,
    durationMinutes: Number((duration.totalSec / 60).toFixed(1)) || 1.2,
    hosts: {
      alex: { name: 'Alex', voice: 'Evan', tone: 'Architect' },
      maya: { name: 'Maya', voice: 'Zoe', tone: 'Lead Dev' }
    },
    coverGradient: 'from-zinc-800 to-zinc-900',
    sourceDocumentIds: [session.id],
    dialogue: turns
  };
}

export const StudioAudioOverviewStage: React.FC<StudioAudioOverviewStageProps> = ({
  session,
  voiceProfile,
  ttsEngine
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const sessionEpisode = useMemo(() => buildMeetingEpisode(session), [session]);

  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([
    sessionEpisode,
    ...SAMPLE_PODCAST_EPISODES
  ]);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>(sessionEpisode.id);
  const [viewMode, setViewMode] = useState<'overview' | 'transcript'>('overview');

  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTurnIdx, setActiveTurnIdx] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.25 | 1.5>(1);
  const [isMuted, setIsMuted] = useState(false);

  const [audioDownloadSource, setAudioDownloadSource] = useState<AudioDownloadSource | null>(null);
  const [transcriptDownloadEpisode, setTranscriptDownloadEpisode] = useState<PodcastEpisode | null>(
    null
  );

  const timerRef = useRef<number | null>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    setEpisodes([sessionEpisode, ...SAMPLE_PODCAST_EPISODES]);
    setSelectedEpisodeId(sessionEpisode.id);
    setActiveTurnIdx(0);
    setIsPlaying(false);
    setViewMode('overview');
  }, [sessionEpisode]);

  const selectedEpisode =
    episodes.find((ep) => ep.id === selectedEpisodeId) || episodes[0];

  const resolvedVoice = useMemo(
    () => resolvePodcastVoiceProfile(voiceProfile),
    [voiceProfile]
  );

  const episodeDuration = useMemo(
    () => calculateEpisodeDuration(selectedEpisode.dialogue),
    [selectedEpisode]
  );

  const speakTurn = (ep: PodcastEpisode, index: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || isMuted) return;
    window.speechSynthesis.cancel();
    const turn = ep.dialogue[index];
    if (!turn) return;
    const utterance = new SpeechSynthesisUtterance(turn.text);
    const isMaya = turn.speaker === 'Maya';
    utterance.rate = (isMaya ? resolvedVoice.mayaRate : resolvedVoice.alexRate) * speed;
    utterance.pitch = isMaya ? resolvedVoice.mayaPitch : resolvedVoice.alexPitch;
    window.speechSynthesis.speak(utterance);
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  useEffect(() => {
    if (!isPlaying) return;
    const turn = selectedEpisode.dialogue[activeTurnIdx];
    if (!turn) {
      stopPlayback();
      return;
    }
    speakTurn(selectedEpisode, activeTurnIdx);
    const delayMs = Math.max(1200, ((turn.durationSec || 5) * 1000) / speed);
    timerRef.current = window.setTimeout(() => {
      if (!isPlayingRef.current) return;
      if (activeTurnIdx + 1 < selectedEpisode.dialogue.length) {
        setActiveTurnIdx((prev) => prev + 1);
      } else {
        stopPlayback();
        setActiveTurnIdx(0);
      }
    }, delayMs);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, activeTurnIdx, selectedEpisode, speed, isMuted]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleTogglePlay = () => {
    triggerHaptic('medium');
    if (isPlaying) {
      stopPlayback();
    } else {
      setIsPlaying(true);
    }
  };

  const handleSelectEpisode = (epId: string) => {
    triggerHaptic('selection');
    stopPlayback();
    setSelectedEpisodeId(epId);
    setActiveTurnIdx(0);
  };

  const handleRegenerateFromSession = () => {
    triggerHaptic('medium');
    const refreshed = buildMeetingEpisode(session);
    setEpisodes([refreshed, ...SAMPLE_PODCAST_EPISODES]);
    setSelectedEpisodeId(refreshed.id);
    setActiveTurnIdx(0);
    setIsPlaying(false);
  };

  if (viewMode === 'transcript') {
    return (
      <>
        <TranscriptDetailView
          episode={selectedEpisode}
          isEpisodeSelected
          isPlaying={isPlaying}
          activeTurnIndex={activeTurnIdx}
          hostAlexLabel={resolvedVoice.hostAlexLabel}
          hostMayaLabel={resolvedVoice.hostMayaLabel}
          onBack={() => setViewMode('overview')}
          onTogglePlay={handleTogglePlay}
          onSelectTurn={(idx) => {
            setActiveTurnIdx(idx);
            setIsPlaying(true);
          }}
        />
      </>
    );
  }

  const activeTurn = selectedEpisode.dialogue[activeTurnIdx] || selectedEpisode.dialogue[0];

  return (
    <div className="space-y-3">
      {/* Audio Overview Header + Player */}
      <div className="p-4 rounded-2xl liquid-glass space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Headphones className="w-4 h-4 text-[#2B98FF] shrink-0" />
              <h3 className="text-xs font-semibold text-zinc-100">
                Dual-Host Audio Overview
              </h3>
            </div>
            <p className="text-[11px] font-mono text-zinc-400 truncate mt-0.5">
              {resolvedVoice.engineLabel} · {ttsEngine === 'on-device' ? 'On-Device' : 'Secure Cloud'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <motion.button
              type="button"
              data-haptic="medium"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={handleRegenerateFromSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#54B0FF]" />
              <span>Rebuild Episode</span>
            </motion.button>

            <button
              type="button"
              onClick={() => setViewMode('transcript')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-zinc-300" />
              <span>Transcript</span>
            </button>
          </div>
        </div>

        {/* Active Player Card */}
        <div className="p-4 rounded-2xl liquid-glass-elevated border border-white/15 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10.5px] font-mono text-[#54B0FF]">
                {selectedEpisode.topic} · {episodeDuration.formatted} · {selectedEpisode.dialogue.length} turns
              </div>
              <h4 className="text-sm font-semibold text-zinc-50 mt-0.5 truncate">
                {selectedEpisode.title}
              </h4>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setSpeed((prev) => (prev === 1 ? 1.25 : prev === 1.25 ? 1.5 : 1))
                }
                aria-label="Cycle playback speed"
                className="px-2.5 py-1 rounded-full liquid-glass-subtle text-[11px] font-mono text-zinc-200 hover:text-white"
              >
                {speed}x
              </button>
              <button
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                className="p-2 rounded-full liquid-glass-subtle text-zinc-300 hover:text-white"
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Turn Progress Scrubber */}
          <div className="flex items-center gap-1.5">
            {selectedEpisode.dialogue.map((turn, idx) => (
              <button
                key={turn.id}
                type="button"
                aria-label={`Jump to turn ${idx + 1} (${turn.speaker})`}
                onClick={() => {
                  triggerHaptic('selection');
                  setActiveTurnIdx(idx);
                }}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  idx === activeTurnIdx
                    ? 'bg-[#54B0FF]'
                    : idx < activeTurnIdx
                      ? 'bg-[#0F7FFF]/45'
                      : 'bg-white/15 hover:bg-white/25'
                }`}
              />
            ))}
          </div>

          {activeTurn && (
            <div className="p-3 rounded-xl liquid-glass-subtle text-xs text-zinc-200 leading-relaxed">
              <span className="font-semibold text-[#54B0FF] mr-2">{activeTurn.speaker}:</span>
              <span>{activeTurn.text}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <motion.button
              type="button"
              data-haptic="medium"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={handleTogglePlay}
              className="min-h-[40px] px-4 py-2 rounded-full liquid-accent-glass text-xs font-semibold flex items-center gap-2"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              <span>{isPlaying ? 'Pause Overview' : 'Play Overview'}</span>
            </motion.button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setAudioDownloadSource({
                    title: selectedEpisode.title,
                    subtitle: `${selectedEpisode.dialogue.length} turns · ${episodeDuration.formatted}`,
                    baseName: sanitizeDownloadBaseName(selectedEpisode.title),
                    sourceExt: 'wav',
                    getSourceBytes: async () => createEpisodeOverviewWavBytes(selectedEpisode)
                  })
                }
                className="min-h-[38px] px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-200 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-[#54B0FF]" />
                <span>Audio</span>
              </button>

              <button
                type="button"
                onClick={() => setTranscriptDownloadEpisode(selectedEpisode)}
                className="min-h-[38px] px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-200 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-zinc-300" />
                <span>Script</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Episode List */}
      <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
        {episodes.map((ep) => {
          const active = ep.id === selectedEpisode.id;
          return (
            <button
              key={ep.id}
              type="button"
              onClick={() => handleSelectEpisode(ep.id)}
              className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 transition-colors ${
                active ? 'bg-[#0F7FFF]/12' : 'hover:bg-white/[0.04]'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-100 truncate">{ep.title}</div>
                <div className="text-[11px] text-zinc-400 truncate mt-0.5">{ep.subtitle}</div>
              </div>
              <span className="text-[10.5px] font-mono text-zinc-400 shrink-0">
                ~{ep.durationMinutes}m
              </span>
            </button>
          );
        })}
      </div>

      <AudioFormatDownloadModal
        source={audioDownloadSource}
        onClose={() => setAudioDownloadSource(null)}
      />

      <TranscriptFormatDownloadModal
        episode={transcriptDownloadEpisode}
        engineLabel={resolvedVoice.engineLabel}
        onClose={() => setTranscriptDownloadEpisode(null)}
      />
    </div>
  );
};
