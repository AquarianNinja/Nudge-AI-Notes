import React, { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  CheckCircle2,
  Cloud,
  Mic,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2
} from 'lucide-react';
import {
  AppSettings,
  DriveAudioFile,
  OpenSourceVoiceModId,
  VoiceInferenceHost,
  VoiceSourceMode
} from '../types/index.ts';
import {
  OPEN_SOURCE_VOICE_MODS,
  VOICE_TRAINING_PROMPTS
} from '../data/mockData.ts';
import {
  createDriveAudioFile,
  createSyntheticMeetingWavUrl
} from '../utils/audioDrive.ts';
import { resolvePodcastVoiceProfile } from '../utils/audioSynthesis.ts';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS, MOTION_TRANSITIONS } from '../utils/motion.ts';
import { AnimatedCheckmark } from './MotionPrimitives.tsx';

interface VoiceProfileBucketViewProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onSaveToDrive: (file: DriveAudioFile) => void;
}

const INFERENCE_HOSTS: Array<{ id: VoiceInferenceHost; label: string }> = [
  { id: 'modal-serverless', label: 'Modal Serverless GPU' },
  { id: 'fal-cloud', label: 'fal.ai Cloud Inference' },
  { id: 'runpod-gpu', label: 'RunPod Dedicated' },
  { id: 'custom-tts', label: 'Custom Self-Hosted TTS' }
];

export const VoiceProfileBucketView: React.FC<VoiceProfileBucketViewProps> = ({
  settings,
  onUpdateSettings,
  onSaveToDrive
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const voice = settings.voiceProfile;
  const personal = voice.personalProfile;
  const activeStepIdx = Math.min(personal.samplesCompleted, VOICE_TRAINING_PROMPTS.length - 1);
  const currentPrompt = VOICE_TRAINING_PROMPTS[activeStepIdx];

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [waveTick, setWaveTick] = useState(0);
  const [testPhrase, setTestPhrase] = useState(
    'ClaimCenter FNOL validation completed in 340 milliseconds with zero policy sync errors.'
  );
  const [isSpeakingTest, setIsSpeakingTest] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const resolvedVoice = resolvePodcastVoiceProfile(voice);

  const updateVoiceProfile = (patch: Partial<AppSettings['voiceProfile']>) => {
    onUpdateSettings({
      voiceProfile: {
        ...voice,
        ...patch
      }
    });
  };

  const updatePersonalProfile = (
    patch: Partial<AppSettings['voiceProfile']['personalProfile']>
  ) => {
    updateVoiceProfile({
      personalProfile: {
        ...personal,
        ...patch
      }
    });
  };

  const finalizeSampleCapture = (durationSec: number, url?: string, sizeBytes?: number) => {
    const cleanDuration = Math.max(3, Math.round(durationSec));
    const sampleUrl = url || createSyntheticMeetingWavUrl(cleanDuration, personal.samplesCompleted + 11);
    const nextCompleted = Math.min(VOICE_TRAINING_PROMPTS.length, personal.samplesCompleted + 1);
    const allDone = nextCompleted >= VOICE_TRAINING_PROMPTS.length;

    if (voice.saveSamplesToDrive) {
      onSaveToDrive(
        createDriveAudioFile({
          fileName: `voice_profile_card_${nextCompleted}.wav`,
          origin: 'recorded',
          durationSec: cleanDuration,
          sizeBytes: sizeBytes || cleanDuration * 16000,
          audioUrl: sampleUrl,
          mimeType: 'audio/wav',
          linkedSessionTitle: `Voice Training · ${personal.name}`
        })
      );
    }

    onUpdateSettings({
      voiceProfile: {
        ...voice,
        activeMode: allDone ? 'trained-personal' : voice.activeMode,
        personalProfile: {
          ...personal,
          samplesCompleted: nextCompleted,
          sampleDurationsSec: [...personal.sampleDurationsSec, cleanDuration],
          sampleUrls: [...personal.sampleUrls, sampleUrl],
          status: allDone ? 'ready' : 'recording',
          trainedAt: allDone
            ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : personal.trainedAt
        }
      }
    });
    triggerHaptic('success');
  };

  const handleToggleRecord = async () => {
    if (isRecording) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      const capturedSec = Math.max(3, durationRef.current || recordSeconds || 4);
      setRecordSeconds(0);

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      } else {
        finalizeSampleCapture(capturedSec);
      }
      return;
    }

    setRecordSeconds(0);
    durationRef.current = 0;
    setIsRecording(true);
    timerRef.current = setInterval(() => {
      durationRef.current += 1;
      setRecordSeconds(prev => prev + 1);
      setWaveTick(prev => prev + 1);
    }, 350);

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          finalizeSampleCapture(durationRef.current || 4, url, blob.size || 24000);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
      } catch {
        // Headless or mic-restricted browser: reactive synthetic capture continues seamlessly
        mediaRecorderRef.current = null;
      }
    }
  };

  const handleQuickCompleteSample = () => {
    if (isRecording) return;
    finalizeSampleCapture(5);
  };

  const handleResetTraining = () => {
    triggerHaptic('warning');
    if (isRecording && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      setIsRecording(false);
    }
    updateVoiceProfile({
      activeMode: 'open-source-mod',
      personalProfile: {
        ...personal,
        samplesCompleted: 0,
        sampleDurationsSec: [],
        sampleUrls: [],
        trainedAt: undefined,
        status: 'untrained'
      }
    });
  };

  const handleTestDriveSpeak = () => {
    if (!testPhrase.trim()) return;
    if (isSpeakingTest) {
      triggerHaptic('selection');
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setIsSpeakingTest(false);
      return;
    }

    triggerHaptic('medium');
    setIsSpeakingTest(true);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(testPhrase.trim());
      utterance.pitch = resolvedVoice.alexPitch;
      utterance.rate = resolvedVoice.alexRate;
      utterance.onend = () => setIsSpeakingTest(false);
      utterance.onerror = () => setIsSpeakingTest(false);
      window.speechSynthesis.speak(utterance);
      // Safety fallback in headless contexts where onend may not fire
      setTimeout(() => setIsSpeakingTest(false), 3200);
    } else {
      setTimeout(() => setIsSpeakingTest(false), 1800);
    }
  };

  const activeMod = OPEN_SOURCE_VOICE_MODS.find(m => m.id === voice.openSourceModId) || OPEN_SOURCE_VOICE_MODS[0];

  return (
    <div className="rounded-2xl liquid-glass divide-y divide-white/10 text-xs overflow-hidden">
      {/* Top Bar: Active Podcast Voice Mode + Test-Drive */}
      <div className="p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AudioLines className="w-4 h-4 text-[#2B98FF] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-zinc-100">
                Voice Profile
              </div>
              <div className="text-[11px] text-zinc-400 truncate">
                {resolvedVoice.engineLabel}
              </div>
            </div>
          </div>

          {/* Award-app clean binary source toggle */}
          <div
            role="group"
            aria-label="Podcast voice source"
            className="flex items-center gap-0.5 p-1 rounded-full liquid-glass-subtle text-[11px]"
          >
            {(
              [
                { id: 'trained-personal', label: 'My Trained Voice' },
                { id: 'open-source-mod', label: 'Open-Source Cloud Mods' }
              ] as Array<{ id: VoiceSourceMode; label: string }>
            ).map(opt => (
              <motion.button
                key={opt.id}
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={() => updateVoiceProfile({ activeMode: opt.id })}
                className={`relative px-2.5 py-1 rounded-full font-medium transition-colors ${
                  voice.activeMode === opt.id
                    ? 'text-zinc-950'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                {voice.activeMode === opt.id && (
                  <motion.span
                    layoutId="voice-source-pill"
                    transition={MOTION_SPRINGS.pill}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full liquid-lens-active"
                  />
                )}
                <span className="relative z-10">{opt.label}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Instant Test-Drive Bar (Award-App Pattern) */}
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl liquid-glass-subtle">
          <Volume2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <input
            type="text"
            aria-label="Test drive voice sample text"
            value={testPhrase}
            onChange={(e) => setTestPhrase(e.target.value)}
            className="flex-1 min-w-[180px] bg-transparent text-[11px] text-zinc-100 focus:outline-hidden"
          />
          <motion.button
            type="button"
            data-haptic="off"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={handleTestDriveSpeak}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass hover:bg-white/10 text-[11px] font-medium text-zinc-100 shrink-0"
          >
            {isSpeakingTest ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{isSpeakingTest ? 'Stop Preview' : 'Test-Drive Voice'}</span>
          </motion.button>
        </div>
      </div>

      {/* Active Voice Mode Panel */}
      {voice.activeMode === 'trained-personal' ? (
      <div className="p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-100">
                Personal Voice Calibration
              </span>
              <span className="text-[10px] font-mono tabular-nums text-zinc-400">
                {personal.samplesCompleted}/{personal.totalSamples}
              </span>
              {personal.status === 'ready' && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                  <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                  <span>Ready {personal.trainedAt ? `· ${personal.trainedAt}` : ''}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              aria-label="Personal voice profile name"
              value={personal.name}
              onChange={(e) => updatePersonalProfile({ name: e.target.value })}
              className="w-36 liquid-glass-subtle rounded-lg px-2 py-1 text-[11px] text-zinc-100 focus:outline-hidden focus:border-[#0F7FFF]"
            />
            {personal.samplesCompleted > 0 && (
              <motion.button
                type="button"
                data-haptic="off"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={handleResetTraining}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] text-zinc-300"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </motion.button>
            )}
          </div>
        </div>

        {/* 3-Step Card Progress Indicators */}
        <div className="grid grid-cols-3 gap-1.5">
          {VOICE_TRAINING_PROMPTS.map((card, idx) => {
            const done = idx < personal.samplesCompleted;
            const current = idx === activeStepIdx && personal.status !== 'ready';
            return (
              <div
                key={card.id}
                className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-mono flex items-center justify-between ${
                  done
                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                    : current
                    ? 'liquid-glass text-zinc-100'
                    : 'liquid-glass-subtle text-zinc-400'
                }`}
              >
                <span className="truncate">{card.stepLabel}</span>
                <span>{done ? '✓' : current ? 'Next' : 'Queued'}</span>
              </div>
            );
          })}
        </div>

        {/* Active Prompt Card + Reactive Waveform */}
        <AnimatePresence mode="wait" initial={false}>
        {personal.status !== 'ready' ? (
          <motion.div
            key="calibration-card"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: MOTION_OFFSETS.listItemSlidePx }}
            animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -MOTION_OFFSETS.listItemSlidePx, transition: MOTION_TRANSITIONS.elementExit }}
            className="p-3.5 rounded-2xl liquid-glass-subtle space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-zinc-400">
              <span>{currentPrompt.stepLabel} · {currentPrompt.title}</span>
              <span>{currentPrompt.focusPhonetics}</span>
            </div>

            <p className="text-sm text-zinc-100 leading-relaxed font-normal">
              "{currentPrompt.script}"
            </p>

            {/* Reactive Waveform Bars (Compositor-only scaleY) */}
            <div className="flex items-center justify-center gap-1 h-9 rounded-xl liquid-glass-subtle px-3">
              {Array.from({ length: 32 }).map((_, i) => {
                const scaleY = isRecording
                  ? 0.3 + Math.abs(Math.sin((i + waveTick) * 0.7)) * 0.7
                  : 0.2 + (i % 3) * 0.08;
                return (
                  <div
                    key={i}
                    style={{ transform: `scaleY(${scaleY.toFixed(2)})` }}
                    className={`w-1 h-7 origin-center rounded-full transition-transform duration-150 ${
                      isRecording ? 'bg-[#2B98FF]' : 'bg-white/15'
                    }`}
                  />
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Local{voice.saveSamplesToDrive ? ' · Drive synced' : ''}</span>
              </div>

              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  data-haptic="heavy"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={handleToggleRecord}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isRecording
                      ? 'bg-red-500 text-white hover:bg-red-400'
                      : 'liquid-lens-active'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      <span>Stop & Save ({recordSeconds}s)</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      <span>Record Sample</span>
                    </>
                  )}
                </motion.button>

                {!isRecording && (
                  <motion.button
                    type="button"
                    data-haptic="off"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={handleQuickCompleteSample}
                    className="px-2.5 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] text-zinc-200"
                  >
                    Simulate Clip
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="ready-card"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: MOTION_OFFSETS.listItemSlidePx }}
            animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -MOTION_OFFSETS.listItemSlidePx, transition: MOTION_TRANSITIONS.elementExit }}
            className="p-3.5 rounded-xl liquid-glass-subtle border border-emerald-500/35 space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="text-xs font-medium text-zinc-100">
                    {personal.name} Ready
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono">
                    {personal.samplesCompleted} clips · {personal.sampleDurationsSec.reduce((a, b) => a + b, 0)}s
                  </div>
                </div>
              </div>

              {voice.activeMode !== 'trained-personal' && (
                <motion.button
                  type="button"
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => updateVoiceProfile({ activeMode: 'trained-personal' })}
                  className="px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-medium"
                >
                  Use My Voice
                </motion.button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                <span>Pitch ({personal.pitchMultiplier.toFixed(2)}x)</span>
                <input
                  type="range"
                  aria-label="Personal voice pitch"
                  min={0.75}
                  max={1.25}
                  step={0.02}
                  value={personal.pitchMultiplier}
                  onChange={(e) => {
                    triggerHaptic('selection');
                    updatePersonalProfile({ pitchMultiplier: Number(e.target.value) });
                  }}
                  className="w-28 accent-zinc-200"
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                <span>Cadence ({personal.rateMultiplier.toFixed(2)}x)</span>
                <input
                  type="range"
                  aria-label="Personal voice cadence"
                  min={0.85}
                  max={1.25}
                  step={0.02}
                  value={personal.rateMultiplier}
                  onChange={(e) => {
                    triggerHaptic('selection');
                    updatePersonalProfile({ rateMultiplier: Number(e.target.value) });
                  }}
                  className="w-28 accent-zinc-200"
                />
              </label>
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="text-zinc-400">Save calibration clips into Drive folder</span>
          <motion.button
            type="button"
            role="switch"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            aria-checked={voice.saveSamplesToDrive}
            onClick={() => updateVoiceProfile({ saveSamplesToDrive: !voice.saveSamplesToDrive })}
            className={`px-2.5 py-0.5 rounded-full font-mono transition-colors ${
              voice.saveSamplesToDrive
                ? 'liquid-lens-active font-semibold'
                : 'liquid-glass-subtle text-zinc-400'
            }`}
          >
            {voice.saveSamplesToDrive ? 'ON' : 'OFF'}
          </motion.button>
        </div>
      </div>
      ) : (
      <div className="p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-[#2B98FF]" />
            <div className="text-xs font-medium text-zinc-100">
              Open-Source Cloud Voice Mods
            </div>
          </div>

          <select
            aria-label="Open-source cloud voice inference host"
            value={voice.cloudInferenceHost}
            onChange={(e) =>
              updateVoiceProfile({ cloudInferenceHost: e.target.value as VoiceInferenceHost })
            }
            className="liquid-glass-subtle rounded-lg px-2 py-1 text-[11px] text-zinc-100"
          >
            {INFERENCE_HOSTS.map(h => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </select>
        </div>

        {voice.cloudInferenceHost === 'custom-tts' && (
          <input
            type="text"
            aria-label="Custom TTS endpoint URL"
            value={voice.customVoiceEndpoint}
            onChange={(e) => updateVoiceProfile({ customVoiceEndpoint: e.target.value })}
            placeholder="https://tts.internal.carrier.local/v1/synthesize"
            className="w-full liquid-glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-zinc-200"
          />
        )}

        <div className="divide-y divide-white/10 rounded-xl liquid-glass-subtle overflow-hidden">
          {OPEN_SOURCE_VOICE_MODS.map(mod => {
            const isSelected = voice.openSourceModId === mod.id;
            return (
              <motion.button
                key={mod.id}
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={() =>
                  updateVoiceProfile({
                    openSourceModId: mod.id as OpenSourceVoiceModId,
                    activeMode:
                      voice.activeMode === 'trained-personal' && personal.status === 'ready'
                        ? voice.activeMode
                        : 'open-source-mod'
                  })
                }
                className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                  isSelected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-medium text-zinc-100">{mod.name}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="font-mono text-zinc-400">{mod.params}</span>
                    <span className="text-zinc-600">·</span>
                    <span className="font-mono text-zinc-500">{mod.license}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {mod.bestFor}
                  </div>
                </div>

                <div className="text-right shrink-0 font-mono text-[10px]">
                  <div className={`inline-flex items-center gap-1 ${isSelected ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {isSelected ? (
                      <>
                        <span>Selected</span>
                        <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                      </>
                    ) : (
                      <span>Select</span>
                    )}
                  </div>
                  <div className="text-zinc-600 mt-0.5">{mod.coHostPair}</div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <div className="text-[10px] font-mono text-zinc-500 truncate">
          {activeMod.endpointHint}
        </div>
      </div>
      )}
    </div>
  );
};
