import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Pause,
  Play,
  Search
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { PodcastEpisode } from '../types/index.ts';
import {
  computeTranscriptTurnsWithOffsets,
  filterTranscriptTurns,
  formatEpisodeTranscriptText
} from '../utils/audioSynthesis.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS } from '../utils/motion.ts';

interface TranscriptDetailViewProps {
  episode: PodcastEpisode;
  isEpisodeSelected: boolean;
  isPlaying: boolean;
  activeTurnIndex: number;
  hostAlexLabel?: string;
  hostMayaLabel?: string;
  onBack: () => void;
  onTogglePlay: () => void;
  onSelectTurn: (turnIndex: number) => void;
}

export const TranscriptDetailView: React.FC<TranscriptDetailViewProps> = ({
  episode,
  isEpisodeSelected,
  isPlaying,
  activeTurnIndex,
  hostAlexLabel = 'Alex',
  hostMayaLabel = 'Maya',
  onBack,
  onTogglePlay,
  onSelectTurn
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [speakerFilter, setSpeakerFilter] = useState<'all' | 'Alex' | 'Maya'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const timedTurns = useMemo(
    () => computeTranscriptTurnsWithOffsets(episode.dialogue),
    [episode.dialogue]
  );

  const visibleTurns = useMemo(
    () => filterTranscriptTurns(timedTurns, speakerFilter, searchQuery),
    [timedTurns, speakerFilter, searchQuery]
  );

  const handleCopyTranscript = async () => {
    const formatted = formatEpisodeTranscriptText(episode.title, episode.dialogue);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(formatted);
      }
      setCopied(true);
      triggerHaptic('success');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      triggerHaptic('warning');
    }
  };

  return (
    <section aria-label={`Transcript for ${episode.title}`} className="space-y-3">
      {/* Top Navigation & Quick Actions (Downloads stay in Top Audio Overview only) */}
      <div className="rounded-2xl liquid-glass px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <motion.button
          type="button"
          data-haptic="selection"
          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
          transition={MOTION_SPRINGS.interactive}
          onClick={onBack}
          aria-label="Back to audio overviews"
          className="min-h-[38px] px-2 py-1.5 -ml-1 rounded-xl flex items-center gap-1.5 text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Audio Overviews</span>
        </motion.button>

        <div className="flex items-center gap-2 shrink-0">
          <motion.button
            type="button"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={handleCopyTranscript}
            aria-label="Copy full transcript"
            className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-zinc-400" />
                <span>Copy</span>
              </>
            )}
          </motion.button>

          <motion.button
            type="button"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={onTogglePlay}
            aria-label={
              isEpisodeSelected && isPlaying
                ? `Pause ${episode.title}`
                : `Play ${episode.title}`
            }
            className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-accent-glass text-xs font-medium whitespace-nowrap"
          >
            {isEpisodeSelected && isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 ml-0.5" />
                <span>Listen</span>
              </>
            )}
          </motion.button>
        </div>
      </div>

      {/* Episode Header */}
      <div className="px-1">
        <div className="text-[11px] font-mono text-zinc-400">
          ~{episode.durationMinutes} min · {episode.dialogue.length} turns
        </div>
        <h2 className="text-base font-semibold text-zinc-50 tracking-tight mt-0.5">
          {episode.title}
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Tap any turn to play from that point
        </p>
      </div>

      {/* Speaker Filter & Transcript Search */}
      <div className="rounded-2xl liquid-glass p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Filter transcript turns"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transcript dialogue..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#0F7FFF]"
          />
        </div>

        <div
          role="group"
          aria-label="Filter transcript by speaker"
          className="flex items-center gap-0.5 p-1 rounded-full liquid-glass-subtle text-[11px] shrink-0"
        >
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'Alex', label: hostAlexLabel.split(' · ')[0] || 'Alex' },
              { id: 'Maya', label: hostMayaLabel.split(' · ')[0] || 'Maya' }
            ] as const
          ).map((opt) => {
            const active = speakerFilter === opt.id;
            return (
              <motion.button
                key={opt.id}
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={() => setSpeakerFilter(opt.id)}
                className={`relative px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                  active ? 'text-zinc-950 font-semibold' : 'text-zinc-300 hover:text-zinc-100'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId={`transcript-speaker-pill-${episode.id}`}
                    transition={MOTION_SPRINGS.pill}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full liquid-lens-active"
                  />
                )}
                <span className="relative z-10">{opt.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Turn-by-Turn Transcript List */}
      <div className="rounded-2xl liquid-glass p-3.5 space-y-2">
        {visibleTurns.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-400">
            No transcript turns match this filter.
          </div>
        ) : (
          visibleTurns.map(({ turn, originalIndex, timestampLabel }) => {
            const isActive = isEpisodeSelected && originalIndex === activeTurnIndex;
            return (
              <motion.button
                key={turn.id}
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={() => onSelectTurn(originalIndex)}
                className={`w-full text-left p-3 rounded-xl transition-colors ${
                  isActive
                    ? 'liquid-glass border-[#2B98FF]/45 bg-[#0F7FFF]/12 text-zinc-100'
                    : 'liquid-glass-subtle hover:bg-white/8 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span
                    className={`text-xs font-medium ${
                      isActive ? 'text-[#2B98FF]' : 'text-zinc-200'
                    }`}
                  >
                    {turn.speaker}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-zinc-400 whitespace-nowrap">
                    {timestampLabel} · {turn.durationSec}s
                  </span>
                </div>
                <p className="text-xs leading-relaxed">{turn.text}</p>
              </motion.button>
            );
          })
        )}
      </div>
    </section>
  );
};
