import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { formatAudioDuration } from '../utils/meetingNotes.ts';
import {
  clampSeekSeconds,
  createSyntheticMeetingWavUrl
} from '../utils/audioDrive.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS, MOTION_TRANSITIONS } from '../utils/motion.ts';

export interface SeekRequest {
  seconds: number;
  nonce: number;
}

interface InlineAudioPlayerProps {
  audioUrl?: string;
  durationSec?: number;
  fileName: string;
  seekRequest?: SeekRequest | null;
  compact?: boolean;
}

export const InlineAudioPlayer: React.FC<InlineAudioPlayerProps> = ({
  audioUrl,
  durationSec = 120,
  fileName,
  seekRequest,
  compact = false
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(durationSec);

  const fallbackUrl = useMemo(() => {
    if (audioUrl) return '';
    return createSyntheticMeetingWavUrl(durationSec, fileName.length);
  }, [audioUrl, durationSec, fileName]);

  const resolvedSrc = audioUrl || fallbackUrl;
  const effectiveDuration = Math.max(1, mediaDuration || durationSec);
  const progressRatio = Math.min(1, Math.max(0, currentTime / effectiveDuration));

  useEffect(() => {
    setMediaDuration(durationSec);
  }, [durationSec]);

  useEffect(() => {
    return () => {
      if (fallbackUrl && fallbackUrl.startsWith('blob:')) {
        URL.revokeObjectURL(fallbackUrl);
      }
    };
  }, [fallbackUrl]);

  useEffect(() => {
    if (!seekRequest) return;
    const audio = audioRef.current;
    const target = clampSeekSeconds(seekRequest.seconds, effectiveDuration);
    setCurrentTime(target);
    containerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    if (audio) {
      try {
        audio.currentTime = target;
        const p = audio.play();
        if (p && typeof p.then === 'function') {
          p.then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        } else {
          setIsPlaying(true);
        }
      } catch {
        setIsPlaying(false);
      }
    }
  }, [seekRequest, effectiveDuration]);

  const togglePlay = () => {
    triggerHaptic('selection');
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      } else {
        setIsPlaying(true);
      }
    }
  };

  const handleScrub = (nextSec: number) => {
    const clamped = clampSeekSeconds(nextSec, effectiveDuration);
    setCurrentTime(clamped);
    if (audioRef.current) {
      audioRef.current.currentTime = clamped;
    }
    triggerHaptic('selection');
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden flex items-center gap-2.5 rounded-xl liquid-glass-subtle ${
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
      }`}
    >
      <audio
        ref={audioRef}
        src={resolvedSrc}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setMediaDuration(d);
          }
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      <motion.button
        type="button"
        data-haptic="selection"
        whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
        transition={MOTION_SPRINGS.interactive}
        onClick={togglePlay}
        aria-label={isPlaying ? `Pause ${fileName}` : `Play ${fileName}`}
        className="w-7 h-7 rounded-full liquid-lens-active flex items-center justify-center shrink-0 transition-opacity hover:opacity-95"
      >
        <AnimatePresence mode="wait" initial={false}>
          {isPlaying ? (
            <motion.span
              key="pause-icon"
              initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1, transition: MOTION_TRANSITIONS.microEnter }}
              exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, transition: MOTION_TRANSITIONS.microEnter }}
              className="flex items-center justify-center"
            >
              <Pause className="w-3.5 h-3.5" />
            </motion.span>
          ) : (
            <motion.span
              key="play-icon"
              initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1, transition: MOTION_TRANSITIONS.microEnter }}
              exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, transition: MOTION_TRANSITIONS.microEnter }}
              className="flex items-center justify-center"
            >
              <Play className="w-3.5 h-3.5 ml-0.5" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <input
        type="range"
        aria-label={`Seek ${fileName}`}
        min={0}
        max={effectiveDuration}
        step={1}
        value={Math.min(effectiveDuration, Math.round(currentTime))}
        onChange={(e) => handleScrub(Number(e.target.value))}
        className="flex-1 h-1 accent-[#2B98FF] bg-white/15 rounded-full cursor-pointer min-w-[60px]"
      />

      <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-zinc-300 shrink-0">
        <Volume2 className={`w-3 h-3 hidden sm:block transition-colors ${isPlaying ? 'text-[#2B98FF]' : 'text-zinc-400'}`} />
        <span>
          {formatAudioDuration(currentTime)} / {formatAudioDuration(effectiveDuration)}
        </span>
      </div>

      {/* Subtle GPU-composited playback progress hairline */}
      <motion.div
        aria-hidden="true"
        animate={{ scaleX: progressRatio }}
        transition={MOTION_TRANSITIONS.microEnter}
        style={{ transformOrigin: 'left' }}
        className={`pointer-events-none absolute bottom-0 left-0 right-0 h-[1.5px] ${
          isPlaying ? 'bg-[#2B98FF]' : 'bg-white/20'
        }`}
      />
    </div>
  );
};
