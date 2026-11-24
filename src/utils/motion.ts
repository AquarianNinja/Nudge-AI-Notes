import type { Transition, Variants } from 'motion/react';
import type { MotionIntensityPreset } from '../types/index.ts';

export interface MotionIntensityOption {
  id: MotionIntensityPreset;
  label: string;
  tagline: string;
  description: string;
}

export const MOTION_INTENSITY_OPTIONS: readonly MotionIntensityOption[] = [
  {
    id: 'reduced',
    label: 'Reduced',
    tagline: 'Opacity fades',
    description: 'Minimal spatial translation; honors system reduced motion'
  },
  {
    id: 'standard',
    label: 'Standard',
    tagline: 'Balanced springs',
    description: 'Crisp ease-out entrances and responsive spring physics'
  },
  {
    id: 'fluid',
    label: 'Fluid',
    tagline: 'Elastic glass',
    description: 'Expressive Liquid Glass inertia with buoyant spring bounce'
  }
] as const;

export function getMotionConfigProps(preset: MotionIntensityPreset): {
  reducedMotion: 'always' | 'user';
  transition: Transition;
} {
  if (preset === 'reduced') {
    return {
      reducedMotion: 'always',
      transition: {
        duration: 0.16,
        ease: [0.16, 1, 0.3, 1]
      }
    };
  }
  if (preset === 'fluid') {
    return {
      reducedMotion: 'user',
      transition: {
        type: 'spring',
        stiffness: 290,
        damping: 20,
        mass: 0.95
      }
    };
  }
  return {
    reducedMotion: 'user',
    transition: {
      type: 'spring',
      stiffness: 420,
      damping: 32,
      mass: 0.85
    }
  };
}

/**
 * Central Motion Specification — Single Source of Truth.
 * Rules:
 *  - Micro-interactions: 100–200ms
 *  - Element transitions: 250–350ms
 *  - Screen transitions: 300–450ms
 *  - Ease-out for entering, ease-in for exiting, spring physics for interactive/gesture motion
 *  - Only GPU-composited properties (transform, opacity, SVG pathLength)
 */
export const MOTION_DURATIONS = {
  microFast: 0.11,
  micro: 0.14,
  element: 0.28,
  elementExit: 0.25,
  screen: 0.36,
  screenExit: 0.3,
  shimmer: 1.35
} as const;

export const MOTION_EASINGS = {
  enter: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  standard: [0.22, 1, 0.36, 1] as const
};

export const MOTION_SPRINGS = {
  interactive: {
    type: 'spring' as const,
    stiffness: 460,
    damping: 32,
    mass: 0.8
  },
  sheet: {
    type: 'spring' as const,
    stiffness: 360,
    damping: 34,
    mass: 0.9
  },
  pill: {
    type: 'spring' as const,
    stiffness: 480,
    damping: 36,
    mass: 0.7
  },
  snappy: {
    type: 'spring' as const,
    stiffness: 520,
    damping: 34,
    mass: 0.7
  }
};

export const MOTION_OFFSETS = {
  tapScale: 0.97,
  cardTapScale: 0.98,
  staggerStepSec: 0.04,
  maxStaggerSec: 0.24,
  screenSlidePx: 24,
  tabSlidePx: 14,
  listItemSlidePx: 8,
  parallaxFactor: 0.35,
  parallaxScale: 0.985,
  sheetDismissOffsetPx: 90,
  sheetDismissVelocity: 450,
  shakeKeyframes: [0, -5, 5, -3, 3, 0] as number[]
} as const;

export const MOTION_TRANSITIONS = {
  microEnter: {
    duration: MOTION_DURATIONS.micro,
    ease: MOTION_EASINGS.enter
  },
  elementEnter: {
    duration: MOTION_DURATIONS.element,
    ease: MOTION_EASINGS.enter
  },
  elementExit: {
    duration: MOTION_DURATIONS.elementExit,
    ease: MOTION_EASINGS.exit
  },
  screenEnter: {
    duration: MOTION_DURATIONS.screen,
    ease: MOTION_EASINGS.enter
  },
  screenExit: {
    duration: MOTION_DURATIONS.screenExit,
    ease: MOTION_EASINGS.exit
  },
  backdropEnter: {
    duration: MOTION_DURATIONS.element,
    ease: MOTION_EASINGS.enter
  },
  backdropExit: {
    duration: MOTION_DURATIONS.elementExit,
    ease: MOTION_EASINGS.exit
  }
} as const;

export function getTabTransitionDirection<T extends string>(
  orderedTabs: readonly T[],
  prevTab: T,
  nextTab: T
): 1 | -1 {
  const prevIdx = orderedTabs.indexOf(prevTab);
  const nextIdx = orderedTabs.indexOf(nextTab);
  if (prevIdx === -1 || nextIdx === -1 || nextIdx >= prevIdx) return 1;
  return -1;
}

export function shouldDismissSheet(offsetY: number, velocityY: number): boolean {
  return (
    offsetY > MOTION_OFFSETS.sheetDismissOffsetPx ||
    velocityY > MOTION_OFFSETS.sheetDismissVelocity
  );
}

export function getStaggerDelay(
  index: number,
  stepSec: number = MOTION_OFFSETS.staggerStepSec
): number {
  if (index <= 0) return 0;
  return Math.min(index * stepSec, MOTION_OFFSETS.maxStaggerSec);
}

export function buildScreenVariants(reducedMotion: boolean = false): Variants {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: MOTION_TRANSITIONS.elementEnter },
      exit: { opacity: 0, transition: MOTION_TRANSITIONS.elementExit }
    };
  }

  return {
    initial: (direction: number = 1) => ({
      opacity: 0,
      x: direction * MOTION_OFFSETS.screenSlidePx,
      scale: 1
    }),
    animate: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: MOTION_TRANSITIONS.screenEnter
    },
    exit: (direction: number = 1) => ({
      opacity: 0,
      x: -direction * Math.round(MOTION_OFFSETS.screenSlidePx * MOTION_OFFSETS.parallaxFactor),
      scale: MOTION_OFFSETS.parallaxScale,
      transition: MOTION_TRANSITIONS.screenExit
    })
  };
}

export function buildTabVariants(reducedMotion: boolean = false): Variants {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: MOTION_TRANSITIONS.elementEnter },
      exit: { opacity: 0, transition: MOTION_TRANSITIONS.elementExit }
    };
  }

  return {
    initial: (direction: number = 1) => ({
      opacity: 0,
      x: direction * MOTION_OFFSETS.tabSlidePx
    }),
    animate: {
      opacity: 1,
      x: 0,
      transition: MOTION_TRANSITIONS.elementEnter
    },
    exit: (direction: number = 1) => ({
      opacity: 0,
      x: -direction * Math.round(MOTION_OFFSETS.tabSlidePx * 0.6),
      transition: MOTION_TRANSITIONS.elementExit
    })
  };
}

export function buildListItemVariants(reducedMotion: boolean = false): Variants {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: MOTION_TRANSITIONS.elementEnter },
      exit: { opacity: 0, transition: MOTION_TRANSITIONS.elementExit }
    };
  }

  return {
    initial: {
      opacity: 0,
      y: MOTION_OFFSETS.listItemSlidePx
    },
    animate: (index: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: {
        ...MOTION_TRANSITIONS.elementEnter,
        delay: getStaggerDelay(index)
      }
    }),
    exit: {
      opacity: 0,
      y: -Math.round(MOTION_OFFSETS.listItemSlidePx * 0.6),
      transition: MOTION_TRANSITIONS.elementExit
    }
  };
}

export function buildTimelineStepVariants(reducedMotion: boolean = false): Variants {
  if (reducedMotion) {
    return {
      initial: { opacity: 0 },
      pending: (index: number = 0) => ({
        opacity: 0.78,
        transition: {
          ...MOTION_TRANSITIONS.elementEnter,
          delay: getStaggerDelay(index)
        }
      }),
      running: (index: number = 0) => ({
        opacity: 1,
        transition: {
          ...MOTION_TRANSITIONS.elementEnter,
          delay: getStaggerDelay(index)
        }
      }),
      completed: (index: number = 0) => ({
        opacity: [0.78, 1],
        transition: {
          ...MOTION_TRANSITIONS.elementEnter,
          delay: getStaggerDelay(index)
        }
      }),
      failed: {
        opacity: 1,
        transition: MOTION_TRANSITIONS.elementEnter
      }
    };
  }

  return {
    initial: {
      opacity: 0,
      y: MOTION_OFFSETS.listItemSlidePx
    },
    pending: (index: number = 0) => ({
      opacity: 0.78,
      y: 0,
      scale: 1,
      transition: {
        ...MOTION_TRANSITIONS.elementEnter,
        delay: getStaggerDelay(index)
      }
    }),
    running: (index: number = 0) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        ...MOTION_TRANSITIONS.elementEnter,
        delay: getStaggerDelay(index)
      }
    }),
    completed: (index: number = 0) => ({
      opacity: [0.78, 1],
      y: [Math.round(MOTION_OFFSETS.listItemSlidePx * 0.75), 0],
      scale: [0.98, 1],
      transition: {
        ...MOTION_TRANSITIONS.elementEnter,
        delay: getStaggerDelay(index)
      }
    }),
    failed: {
      opacity: 1,
      y: 0,
      x: MOTION_OFFSETS.shakeKeyframes,
      transition: MOTION_TRANSITIONS.elementEnter
    }
  };
}
