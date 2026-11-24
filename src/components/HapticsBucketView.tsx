import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BellRing,
  Compass,
  Hand,
  RotateCcw,
  Sparkles,
  Vibrate,
  VolumeX
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AppSettings,
  HapticCategoriesConfig,
  HapticIntensity,
  HapticProfileId
} from '../types/index.ts';
import {
  DEFAULT_HAPTIC_CONFIG,
  HAPTIC_PROFILES,
  HapticKind,
  HapticTriggerResult,
  computeHapticPattern,
  configureHaptics,
  getHapticCategory,
  triggerHaptic
} from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS
} from '../utils/motion.ts';
import { AnimatedCheckmark } from './MotionPrimitives.tsx';

interface HapticsBucketViewProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
}

const INTENSITY_OPTIONS: Array<{
  id: HapticIntensity;
  label: string;
  factor: string;
}> = [
  { id: 'gentle', label: 'Gentle', factor: '0.65x' },
  { id: 'balanced', label: 'Balanced', factor: '1.0x' },
  { id: 'strong', label: 'Strong', factor: '1.4x' }
];

const CATEGORY_ITEMS: Array<{
  key: keyof HapticCategoriesConfig;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: 'navigation',
    label: 'Navigation & Selection',
    description: 'Tabs, segmented switches, pickers, and range sliders',
    Icon: Compass
  },
  {
    key: 'taps',
    label: 'Buttons & Tactile Taps',
    description: 'Action buttons, cards, and light/medium/heavy presses',
    Icon: Hand
  },
  {
    key: 'outcomes',
    label: 'Completions & Exports',
    description: 'Export saves, downloads, and calibration confirmations',
    Icon: Sparkles
  },
  {
    key: 'alerts',
    label: 'Alerts & Warnings',
    description: 'Delete confirmations, resets, and validation warnings',
    Icon: BellRing
  }
];

const TEST_PAD_KINDS: Array<{
  kind: HapticKind;
  label: string;
  categoryLabel: string;
}> = [
  { kind: 'selection', label: 'Selection', categoryLabel: 'Navigation' },
  { kind: 'light', label: 'Light Tap', categoryLabel: 'Taps' },
  { kind: 'medium', label: 'Medium Impact', categoryLabel: 'Taps' },
  { kind: 'heavy', label: 'Heavy Press', categoryLabel: 'Taps' },
  { kind: 'success', label: 'Success Rhythm', categoryLabel: 'Outcomes' },
  { kind: 'warning', label: 'Warning Alert', categoryLabel: 'Alerts' }
];

function formatPatternMs(pattern: number[]): string {
  return `${pattern.join(' · ')} ms`;
}

export const HapticsBucketView: React.FC<HapticsBucketViewProps> = ({
  settings,
  onUpdateSettings
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const haptics = settings.haptics;
  const isMasterEnabled = settings.hapticFeedback && haptics.enabled;

  const [lastResult, setLastResult] = useState<HapticTriggerResult | null>(null);
  const [pulseState, setPulseState] = useState<{ kind: HapticKind; nonce: number } | null>(null);

  const activeProfileMeta = useMemo(
    () => HAPTIC_PROFILES.find(p => p.id === haptics.profile) || HAPTIC_PROFILES[0],
    [haptics.profile]
  );

  const isModified = useMemo(() => {
    return (
      !isMasterEnabled ||
      haptics.profile !== DEFAULT_HAPTIC_CONFIG.profile ||
      haptics.intensity !== DEFAULT_HAPTIC_CONFIG.intensity ||
      haptics.categories.navigation !== DEFAULT_HAPTIC_CONFIG.categories.navigation ||
      haptics.categories.taps !== DEFAULT_HAPTIC_CONFIG.categories.taps ||
      haptics.categories.outcomes !== DEFAULT_HAPTIC_CONFIG.categories.outcomes ||
      haptics.categories.alerts !== DEFAULT_HAPTIC_CONFIG.categories.alerts
    );
  }, [haptics, isMasterEnabled]);

  const handleToggleMaster = () => {
    const next = !isMasterEnabled;
    const nextHaptics = { ...haptics, enabled: next };
    configureHaptics(nextHaptics);
    onUpdateSettings({
      hapticFeedback: next,
      haptics: nextHaptics
    });
    if (next) {
      const res = triggerHaptic('success', {
        enabled: true,
        profile: nextHaptics.profile,
        intensity: nextHaptics.intensity,
        bypassCategoryCheck: true
      });
      setLastResult(res);
      setPulseState({ kind: 'success', nonce: Date.now() });
    } else {
      setLastResult({
        triggered: false,
        kind: 'selection',
        profile: nextHaptics.profile,
        intensity: nextHaptics.intensity,
        pattern: [],
        blockedReason: 'disabled'
      });
    }
  };

  const handleSelectProfile = (profileId: HapticProfileId) => {
    const nextHaptics = { ...haptics, profile: profileId };
    configureHaptics({ ...nextHaptics, enabled: isMasterEnabled });
    onUpdateSettings({ haptics: nextHaptics });

    if (isMasterEnabled) {
      const res = triggerHaptic('medium', {
        enabled: true,
        profile: profileId,
        intensity: haptics.intensity,
        bypassCategoryCheck: true
      });
      setLastResult(res);
      setPulseState({ kind: 'medium', nonce: Date.now() });
    }
  };

  const handleSelectIntensity = (intensity: HapticIntensity) => {
    const nextHaptics = { ...haptics, intensity };
    configureHaptics({ ...nextHaptics, enabled: isMasterEnabled });
    onUpdateSettings({ haptics: nextHaptics });

    if (isMasterEnabled) {
      const res = triggerHaptic('medium', {
        enabled: true,
        profile: haptics.profile,
        intensity,
        bypassCategoryCheck: true
      });
      setLastResult(res);
      setPulseState({ kind: 'medium', nonce: Date.now() });
    }
  };

  const handleToggleCategory = (key: keyof HapticCategoriesConfig) => {
    const nextVal = !haptics.categories[key];
    const nextHaptics = {
      ...haptics,
      categories: {
        ...haptics.categories,
        [key]: nextVal
      }
    };
    configureHaptics({ ...nextHaptics, enabled: isMasterEnabled });
    onUpdateSettings({ haptics: nextHaptics });

    if (isMasterEnabled && nextVal) {
      const previewKind: HapticKind =
        key === 'navigation'
          ? 'selection'
          : key === 'outcomes'
          ? 'success'
          : key === 'alerts'
          ? 'warning'
          : 'light';
      const res = triggerHaptic(previewKind, {
        enabled: true,
        profile: haptics.profile,
        intensity: haptics.intensity,
        bypassCategoryCheck: true
      });
      setLastResult(res);
      setPulseState({ kind: previewKind, nonce: Date.now() });
    }
  };

  const handleTestKind = (kind: HapticKind) => {
    configureHaptics({
      ...haptics,
      enabled: isMasterEnabled
    });
    const res = triggerHaptic(kind);
    setLastResult(res);
    setPulseState({ kind, nonce: Date.now() });
  };

  const handleResetDefaults = () => {
    const nextHaptics = {
      ...DEFAULT_HAPTIC_CONFIG,
      categories: { ...DEFAULT_HAPTIC_CONFIG.categories }
    };
    configureHaptics(nextHaptics);
    onUpdateSettings({
      hapticFeedback: true,
      haptics: nextHaptics
    });
    const res = triggerHaptic('success', {
      enabled: true,
      profile: nextHaptics.profile,
      intensity: nextHaptics.intensity,
      bypassCategoryCheck: true
    });
    setLastResult(res);
    setPulseState({ kind: 'success', nonce: Date.now() });
  };

  return (
    <div className="rounded-2xl liquid-glass divide-y divide-white/10 text-xs overflow-hidden">
      {/* Header + Master Toggle + Intensity Segmented Control */}
      <div className="p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Vibrate className={`w-4 h-4 shrink-0 ${isMasterEnabled ? 'text-[#2B98FF]' : 'text-zinc-500'}`} />
            <div className="min-w-0">
              <div className="text-xs font-medium text-zinc-100">Haptic Feedback</div>
              <div className="text-[11px] text-zinc-400 truncate">
                {isMasterEnabled
                  ? `${activeProfileMeta.name} · ${haptics.intensity.charAt(0).toUpperCase() + haptics.intensity.slice(1)}`
                  : 'Tactile engine muted across all screens'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isModified && (
              <motion.button
                type="button"
                data-haptic="off"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={handleResetDefaults}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] text-zinc-300 hover:text-white transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </motion.button>
            )}
            <motion.button
              type="button"
              role="switch"
              data-haptic="off"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              aria-checked={isMasterEnabled}
              aria-label="Toggle master haptic feedback"
              onClick={handleToggleMaster}
              className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition-colors ${
                isMasterEnabled
                  ? 'liquid-lens-active font-semibold'
                  : 'liquid-glass-subtle text-zinc-400'
              }`}
            >
              {isMasterEnabled ? 'ON' : 'OFF'}
            </motion.button>
          </div>
        </div>

        {/* Intensity Segmented Scale */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-[11px] text-zinc-300">
            Pulse Intensity
          </div>
          <div
            role="radiogroup"
            aria-label="Haptic intensity"
            className="flex items-center gap-0.5 p-1 rounded-full liquid-glass-subtle text-[11px]"
          >
            {INTENSITY_OPTIONS.map((opt) => {
              const active = haptics.intensity === opt.id;
              return (
                <motion.button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-haptic="off"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => handleSelectIntensity(opt.id)}
                  className={`relative flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition-colors ${
                    active
                      ? 'text-zinc-950'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="haptic-intensity-pill"
                      transition={MOTION_SPRINGS.pill}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full liquid-lens-active"
                    />
                  )}
                  <span className="relative z-10">{opt.label}</span>
                  <span
                    className={`relative z-10 font-mono tabular-nums text-[10px] ${
                      active ? 'text-zinc-600' : 'text-zinc-400'
                    }`}
                  >
                    {opt.factor}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SECTION A: Haptic Style Profiles */}
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-zinc-100">Haptic Feel Profile</span>
          <span className="text-[10px] font-mono tabular-nums text-zinc-500">
            {HAPTIC_PROFILES.length} profiles
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Haptic feel profile"
          className="divide-y divide-white/10 rounded-xl liquid-glass-subtle overflow-hidden"
        >
          {HAPTIC_PROFILES.map((profile) => {
            const isSelected = haptics.profile === profile.id;
            const successPreview = computeHapticPattern('success', profile.id, haptics.intensity);
            return (
              <motion.button
                key={profile.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                data-haptic="off"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={() => handleSelectProfile(profile.id)}
                className={`relative w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                  isSelected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-medium text-zinc-100">{profile.name}</span>
                    <span className="text-zinc-500">·</span>
                    <span className="text-zinc-300">{profile.cadenceLabel}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    {profile.tagline}
                  </div>
                </div>

                <div className="text-right shrink-0 font-mono text-[10px]">
                  <div
                    className={`inline-flex items-center gap-1 ${
                      isSelected ? 'text-emerald-400' : 'text-zinc-400'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <span>Active</span>
                        <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                      </>
                    ) : (
                      <span>Select</span>
                    )}
                  </div>
                  <div className="text-zinc-400 tabular-nums mt-0.5">
                    {formatPatternMs(successPreview)}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* SECTION B: Event Category Filters */}
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-zinc-100">Feedback Categories</span>
          <span className="text-[10px] font-mono tabular-nums text-zinc-400">
            {Object.values(haptics.categories).filter(Boolean).length}/4 active
          </span>
        </div>

        <div className="divide-y divide-white/10 rounded-xl liquid-glass-subtle overflow-hidden">
          {CATEGORY_ITEMS.map(({ key, label, description, Icon }) => {
            const enabled = haptics.categories[key];
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-3.5 h-3.5 shrink-0 ${
                      enabled && isMasterEnabled ? 'text-[#2B98FF]' : 'text-zinc-500'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-zinc-100">{label}</div>
                    <div className="text-[10px] text-zinc-400 truncate">{description}</div>
                  </div>
                </div>

                <motion.button
                  type="button"
                  role="switch"
                  data-haptic="off"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  aria-checked={enabled}
                  aria-label={`Toggle ${label} haptics`}
                  onClick={() => handleToggleCategory(key)}
                  className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] transition-colors shrink-0 ${
                    enabled
                      ? 'liquid-lens-active font-semibold'
                      : 'liquid-glass-subtle text-zinc-400'
                  }`}
                >
                  {enabled ? 'ON' : 'MUTED'}
                </motion.button>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION C: Interactive Tactile Test Pad */}
      <div className="p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-xs font-medium text-zinc-100">Tactile Test Pad</span>
          </div>

          <div
            aria-live="polite"
            className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums"
          >
            {lastResult ? (
              lastResult.triggered ? (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                  <span>
                    Triggered · {lastResult.kind} ({formatPatternMs(lastResult.pattern)})
                  </span>
                </span>
              ) : lastResult.blockedReason === 'category-muted' ? (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <VolumeX className="w-3 h-3 text-amber-400" />
                  <span>Muted by category ({getHapticCategory(lastResult.kind)})</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-zinc-500">
                  <AlertCircle className="w-3 h-3 text-zinc-500" />
                  <span>Master switch off</span>
                </span>
              )
            ) : (
              <span className="text-zinc-500">Tap any pattern below to preview</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TEST_PAD_KINDS.map((item) => {
            const pattern = computeHapticPattern(item.kind, haptics.profile, haptics.intensity);
            const cat = getHapticCategory(item.kind);
            const catEnabled = haptics.categories[cat];
            const isMuted = !isMasterEnabled || !catEnabled;
            const isRecent = pulseState?.kind === item.kind;

            return (
              <motion.button
                key={item.kind}
                type="button"
                data-haptic="off"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={() => handleTestKind(item.kind)}
                className={`p-2.5 rounded-xl border text-left transition-colors space-y-2 ${
                  isMuted
                    ? 'liquid-glass-subtle opacity-70 text-zinc-400'
                    : isRecent
                    ? 'bg-white/[0.1] border-white/30 text-zinc-50'
                    : 'liquid-glass-subtle text-zinc-200 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[11px] font-medium truncate">{item.label}</span>
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                    {!isMasterEnabled ? 'Off' : !catEnabled ? 'Muted' : item.categoryLabel}
                  </span>
                </div>

                {/* Compositor-safe waveform bar visualization */}
                <div className="flex items-center gap-1 h-4" aria-hidden="true">
                  {pattern.map((ms, idx) => {
                    const isBurst = idx % 2 === 0;
                    const normalizedScale = isBurst ? Math.min(1, Math.max(0.28, ms / 48)) : 0.14;
                    return (
                      <motion.span
                        key={`${idx}-${isRecent ? pulseState?.nonce : 0}`}
                        initial={
                          !prefersReduced && isRecent && isBurst && !isMuted
                            ? { scaleY: 0.35, opacity: 0.6 }
                            : false
                        }
                        animate={{
                          scaleY: normalizedScale,
                          opacity: isMuted ? 0.35 : isBurst ? 1 : 0.35
                        }}
                        transition={MOTION_TRANSITIONS.microEnter}
                        className={`flex-1 h-4 origin-bottom rounded-xs ${
                          isBurst
                            ? isMuted
                              ? 'bg-zinc-600'
                              : isRecent
                              ? 'bg-emerald-400'
                              : 'bg-zinc-300'
                            : 'bg-zinc-800'
                        }`}
                      />
                    );
                  })}
                </div>

                <div className="text-[10px] font-mono tabular-nums text-zinc-500 truncate">
                  {formatPatternMs(pattern)}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
