import type {
  HapticCategoriesConfig,
  HapticIntensity,
  HapticProfileId,
  HapticSettingsConfig
} from '../types/index.ts';

export type HapticKind =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning';

export interface HapticProfileMeta {
  id: HapticProfileId;
  name: string;
  tagline: string;
  cadenceLabel: string;
}

export const HAPTIC_PROFILES: HapticProfileMeta[] = [
  {
    id: 'crisp',
    name: 'Crisp Taptic',
    tagline: 'Tight single-impulse ticks modeled after precision actuators',
    cadenceLabel: 'Single crisp pulse'
  },
  {
    id: 'subtle',
    name: 'Whisper Soft',
    tagline: 'Ultra-light low-fatigue micro-taps for quiet focus sessions',
    cadenceLabel: 'Feather micro-tap'
  },
  {
    id: 'rhythmic',
    name: 'Rhythmic Double',
    tagline: 'Distinct double-beat cadence separating navigation and outcomes',
    cadenceLabel: 'Dual-beat pulse'
  },
  {
    id: 'mechanical',
    name: 'Mechanical Switch',
    tagline: 'Two-stage tactile pre-travel and release snap feel',
    cadenceLabel: 'Two-stage thock'
  },
  {
    id: 'expressive',
    name: 'Studio Bold',
    tagline: 'High-contrast sustained patterns for unmistakable tactile feedback',
    cadenceLabel: 'High-contrast pulse'
  }
];

export const HAPTIC_INTENSITY_MULTIPLIERS: Record<HapticIntensity, number> = {
  gentle: 0.65,
  balanced: 1.0,
  strong: 1.4
};

export const HAPTIC_PROFILE_PATTERNS: Record<HapticProfileId, Record<HapticKind, number[]>> = {
  crisp: {
    selection: [8],
    light: [12],
    medium: [20],
    heavy: [32],
    success: [12, 35, 18],
    warning: [22, 40, 22]
  },
  subtle: {
    selection: [5],
    light: [7],
    medium: [12],
    heavy: [18],
    success: [8, 28, 12],
    warning: [14, 34, 14]
  },
  rhythmic: {
    selection: [6, 18, 6],
    light: [10, 22, 8],
    medium: [16, 26, 12],
    heavy: [24, 28, 18],
    success: [10, 24, 14, 24, 20],
    warning: [18, 30, 18, 30, 22]
  },
  mechanical: {
    selection: [10, 12, 6],
    light: [14, 14, 10],
    medium: [22, 16, 14],
    heavy: [34, 18, 20],
    success: [14, 24, 24],
    warning: [26, 32, 26]
  },
  expressive: {
    selection: [11],
    light: [16],
    medium: [28],
    heavy: [44],
    success: [16, 34, 26, 34, 18],
    warning: [30, 38, 30, 38, 20]
  }
};

// Backwards-compatible default pattern table
export const HAPTIC_PATTERNS: Record<HapticKind, number[]> = HAPTIC_PROFILE_PATTERNS.crisp;

export const DEFAULT_HAPTIC_CONFIG: HapticSettingsConfig = {
  enabled: true,
  profile: 'crisp',
  intensity: 'balanced',
  categories: {
    navigation: true,
    taps: true,
    outcomes: true,
    alerts: true
  }
};

let activeConfig: HapticSettingsConfig = {
  ...DEFAULT_HAPTIC_CONFIG,
  categories: { ...DEFAULT_HAPTIC_CONFIG.categories }
};

export function getHapticCategory(kind: HapticKind): keyof HapticCategoriesConfig {
  if (kind === 'selection') return 'navigation';
  if (kind === 'success') return 'outcomes';
  if (kind === 'warning') return 'alerts';
  return 'taps';
}

export function computeHapticPattern(
  kind: HapticKind,
  profile: HapticProfileId = activeConfig.profile,
  intensity: HapticIntensity = activeConfig.intensity
): number[] {
  const base = HAPTIC_PROFILE_PATTERNS[profile]?.[kind] ?? HAPTIC_PROFILE_PATTERNS.crisp[kind];
  const scale = HAPTIC_INTENSITY_MULTIPLIERS[intensity] ?? 1.0;

  return base.map((ms, idx) => {
    // Even indices are vibration bursts; odd indices are silent pause gaps
    if (idx % 2 === 0) {
      return Math.max(3, Math.min(90, Math.round(ms * scale)));
    }
    return Math.max(10, Math.min(60, Math.round(ms)));
  });
}

export function configureHaptics(patch: Partial<HapticSettingsConfig>): HapticSettingsConfig {
  activeConfig = {
    enabled: patch.enabled ?? activeConfig.enabled,
    profile: patch.profile ?? activeConfig.profile,
    intensity: patch.intensity ?? activeConfig.intensity,
    categories: {
      ...activeConfig.categories,
      ...(patch.categories ?? {})
    }
  };
  return getHapticsConfig();
}

export function getHapticsConfig(): HapticSettingsConfig {
  return {
    ...activeConfig,
    categories: { ...activeConfig.categories }
  };
}

export function setHapticsEnabled(enabled: boolean): void {
  activeConfig = {
    ...activeConfig,
    enabled
  };
}

export function isHapticsEnabled(): boolean {
  return activeConfig.enabled;
}

export interface HapticTriggerResult {
  triggered: boolean;
  kind: HapticKind;
  profile: HapticProfileId;
  intensity: HapticIntensity;
  pattern: number[];
  blockedReason?: 'disabled' | 'category-muted';
}

export function triggerHaptic(
  kind: HapticKind,
  options?: {
    enabled?: boolean;
    profile?: HapticProfileId;
    intensity?: HapticIntensity;
    bypassCategoryCheck?: boolean;
    vibrateFn?: (pattern: number | number[]) => boolean;
  }
): HapticTriggerResult {
  const enabled = options?.enabled ?? activeConfig.enabled;
  const profile = options?.profile ?? activeConfig.profile;
  const intensity = options?.intensity ?? activeConfig.intensity;

  if (!enabled) {
    return {
      triggered: false,
      kind,
      profile,
      intensity,
      pattern: [],
      blockedReason: 'disabled'
    };
  }

  const category = getHapticCategory(kind);
  if (!options?.bypassCategoryCheck && !activeConfig.categories[category]) {
    return {
      triggered: false,
      kind,
      profile,
      intensity,
      pattern: [],
      blockedReason: 'category-muted'
    };
  }

  const pattern = computeHapticPattern(kind, profile, intensity);

  try {
    if (options?.vibrateFn) {
      options.vibrateFn(pattern);
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Safe fallback when Vibration API is blocked by browser policy
  }

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.lastHaptic = kind;
    document.documentElement.dataset.lastHapticProfile = profile;
    document.documentElement.dataset.lastHapticPattern = pattern.join(',');
    const prevCount = Number(document.documentElement.dataset.hapticCount || '0');
    document.documentElement.dataset.hapticCount = String(prevCount + 1);
  }

  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('locally:haptic', {
        detail: { kind, profile, intensity, pattern }
      })
    );
  }

  return { triggered: true, kind, profile, intensity, pattern };
}

const VALID_KINDS = new Set<string>([
  'selection',
  'light',
  'medium',
  'heavy',
  'success',
  'warning'
]);

export interface ElementLike {
  tagName?: string;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
  dataset?: Record<string, string | undefined>;
  closest?: (selector: string) => ElementLike | null;
}

export function resolveInteractiveHapticKind(target: ElementLike | null): HapticKind | null {
  if (!target || typeof target.closest !== 'function') return null;

  const interactive = target.closest(
    'button, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], select, input[type="range"], input[type="checkbox"], input[type="radio"], a[href]'
  );
  if (!interactive) return null;

  if (interactive.hasAttribute?.('disabled') || interactive.getAttribute?.('aria-disabled') === 'true') {
    return null;
  }

  const explicit = interactive.dataset?.haptic || interactive.getAttribute?.('data-haptic');
  if (explicit === 'off') return null;
  if (explicit && VALID_KINDS.has(explicit)) {
    return explicit as HapticKind;
  }

  const role = interactive.getAttribute?.('role');
  const tag = (interactive.tagName || '').toLowerCase();
  const inputType = (interactive.getAttribute?.('type') || '').toLowerCase();

  if (
    role === 'tab' ||
    role === 'switch' ||
    role === 'checkbox' ||
    role === 'radio' ||
    tag === 'select' ||
    (tag === 'input' && (inputType === 'checkbox' || inputType === 'radio' || inputType === 'range'))
  ) {
    return 'selection';
  }

  return 'light';
}
