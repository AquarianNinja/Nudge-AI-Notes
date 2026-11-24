import React, { useEffect } from 'react';
import {
  AnimatePresence,
  PanInfo,
  motion,
  useDragControls,
  useReducedMotion
} from 'motion/react';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  shouldDismissSheet
} from '../utils/motion.ts';
import { triggerHaptic } from '../utils/haptics.ts';

interface MotionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}

/**
 * Spring-in modal / bottom sheet with dimmed backdrop fade and
 * finger-tracking, interruptible drag-to-dismiss gesture.
 */
export const MotionSheet: React.FC<MotionSheetProps> = ({
  isOpen,
  onClose,
  ariaLabel,
  children,
  maxWidthClass = 'max-w-lg'
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const dragControls = useDragControls();

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (shouldDismissSheet(info.offset.y, info.velocity.y)) {
      triggerHaptic('selection');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="motion-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: MOTION_TRANSITIONS.backdropEnter }}
          exit={{ opacity: 0, transition: MOTION_TRANSITIONS.backdropExit }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/65 backdrop-blur-sm"
        >
          <motion.div
            key="motion-sheet-surface"
            drag={prefersReduced ? false : 'y'}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.06, bottom: 0.55 }}
            dragSnapToOrigin
            onDragEnd={handleDragEnd}
            initial={
              prefersReduced
                ? { opacity: 0 }
                : { opacity: 0, y: 36, scale: 0.98 }
            }
            animate={
              prefersReduced
                ? { opacity: 1, transition: MOTION_TRANSITIONS.elementEnter }
                : { opacity: 1, y: 0, scale: 1, transition: MOTION_SPRINGS.sheet }
            }
            exit={
              prefersReduced
                ? { opacity: 0, transition: MOTION_TRANSITIONS.elementExit }
                : { opacity: 0, y: 28, scale: 0.98, transition: MOTION_TRANSITIONS.elementExit }
            }
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${maxWidthClass} group-data-[device-frame=true]/app:max-w-[396px] rounded-[28px] liquid-glass-elevated overflow-hidden flex flex-col max-h-[84vh]`}
          >
            {/* Interactive drag handle bar */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              aria-hidden="true"
              className="flex justify-center pt-2.5 pb-1.5 cursor-grab active:cursor-grabbing touch-none shrink-0"
            >
              <div className="w-10 h-1 rounded-full bg-white/25" />
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface SkeletonStreamLoaderProps {
  label?: string;
  lines?: number;
}

/**
 * GPU-composited skeleton shimmer replacing spinner icons during async work.
 */
export const SkeletonStreamLoader: React.FC<SkeletonStreamLoaderProps> = ({
  label,
  lines = 3
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const widths = ['w-11/12', 'w-4/5', 'w-3/5'];

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
      exit={{ opacity: 0, transition: MOTION_TRANSITIONS.elementExit }}
      aria-busy="true"
      aria-label={label || 'Loading content'}
      className="rounded-2xl liquid-glass-subtle p-3.5 space-y-2.5 max-w-md"
    >
      {label && (
        <div className="text-[11px] font-mono text-zinc-300">{label}</div>
      )}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, idx) => (
          <div
            key={idx}
            className={`h-2.5 rounded-full bg-white/10 motion-shimmer ${
              widths[idx % widths.length]
            }`}
          />
        ))}
      </div>
    </motion.div>
  );
};

interface AnimatedCheckmarkProps {
  className?: string;
}

/**
 * Animated SVG pathLength checkmark for Save / Ready / Export confirmation.
 */
export const AnimatedCheckmark: React.FC<AnimatedCheckmarkProps> = ({
  className = 'w-3.5 h-3.5 text-emerald-400'
}) => {
  const prefersReduced = Boolean(useReducedMotion());

  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`${className} shrink-0`}
    >
      <motion.path
        d="M3.5 8.5L6.5 11.5L12.5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={prefersReduced ? { pathLength: 1, opacity: 0 } : { pathLength: 0, opacity: 0.4 }}
        animate={{
          pathLength: 1,
          opacity: 1,
          transition: MOTION_TRANSITIONS.elementEnter
        }}
      />
    </svg>
  );
};

interface MotionAlertBannerProps {
  shakeKey?: number | string | boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Subtle horizontal shake feedback for error / gate / warning banners.
 */
export const MotionAlertBanner: React.FC<MotionAlertBannerProps> = ({
  shakeKey,
  className = '',
  children
}) => {
  const prefersReduced = Boolean(useReducedMotion());

  return (
    <motion.div
      key={String(shakeKey)}
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, x: 0 }}
      animate={
        prefersReduced
          ? { opacity: 1, transition: MOTION_TRANSITIONS.elementEnter }
          : {
              opacity: 1,
              x: MOTION_OFFSETS.shakeKeyframes,
              transition: MOTION_TRANSITIONS.elementEnter
            }
      }
      exit={{ opacity: 0, transition: MOTION_TRANSITIONS.elementExit }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
