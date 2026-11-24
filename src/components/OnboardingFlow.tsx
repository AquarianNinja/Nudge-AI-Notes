import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  FileText,
  Headphones,
  Layers,
  Mic,
  Presentation,
  Search,
  ShieldCheck,
  Sparkles,
  WifiOff
} from 'lucide-react';
import { AnimatePresence, motion, PanInfo, useReducedMotion } from 'motion/react';
import { useFirebaseAuth } from './FirebaseProvider.tsx';
import { MotionAlertBanner, MotionSheet } from './MotionPrimitives.tsx';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS, MOTION_TRANSITIONS } from '../utils/motion.ts';

interface OnboardingSlide {
  id: 'search' | 'meetings' | 'studio' | 'privacy';
  eyebrow: string;
  headline: string;
  bullets: readonly string[];
  accentClass: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    id: 'search',
    eyebrow: '01 · Workspace',
    headline: 'Search Your Knowledge',
    bullets: [
      'Run verified deep search across notes and web sources',
      'Upload PDFs, EPUBs, and notes into your Workspace Sources drawer',
      'Toggle Crew Planner and Office Diary whenever you want them'
    ],
    accentClass: 'bg-[#0F7FFF]/18 text-[#54B0FF] border-[#54B0FF]/35',
    Icon: Search
  },
  {
    id: 'meetings',
    eyebrow: '02 · Meetings',
    headline: 'Capture Every Meeting',
    bullets: [
      'Stream live A→B transcription directly in Meeting Notes',
      'Keep meeting lists clean until you open a session detail view',
      'Enable optional Scout web research inside opened meetings'
    ],
    accentClass: 'bg-cyan-500/18 text-cyan-300 border-cyan-400/35',
    Icon: Mic
  },
  {
    id: 'studio',
    eyebrow: '03 · Studio',
    headline: 'Create in Studio',
    bullets: [
      'Pull any recorded meeting straight into Studio',
      'Generate slide decks, flashcards, GWT specs, and audio overviews',
      'Save finished decks and notes to Google Drive or device'
    ],
    accentClass: 'bg-violet-500/18 text-violet-300 border-violet-400/35',
    Icon: Sparkles
  },
  {
    id: 'privacy',
    eyebrow: '04 · Control',
    headline: 'Your Rules, Your Privacy',
    bullets: [
      'Switch Local-Only mode on to block outbound network requests',
      'Manage offline models, custom endpoints, and haptics in Settings',
      'Sign in with Google to sync preferences across devices'
    ],
    accentClass: 'bg-emerald-500/18 text-emerald-300 border-emerald-400/35',
    Icon: ShieldCheck
  }
];

interface OnboardingFlowProps {
  initialStage?: 'carousel' | 'link';
  onComplete: () => void;
}

const GoogleGIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.1Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4 3.1C6.23 6.87 8.88 4.76 12 4.76Z"
    />
  </svg>
);

const OnboardingSlidePreview: React.FC<{
  slideId: OnboardingSlide['id'];
  prefersReduced: boolean;
}> = ({ slideId, prefersReduced }) => {
  if (slideId === 'search') {
    return (
      <div
        aria-hidden="true"
        className="w-full rounded-2xl liquid-glass-subtle border border-white/15 p-3 space-y-2 text-left"
      >
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-black/30 border border-white/10">
          <Search className="w-3.5 h-3.5 text-[#54B0FF] shrink-0" />
          <motion.div
            animate={prefersReduced ? undefined : { opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 2.2, repeat: Infinity }}
            className="text-[11px] font-mono text-zinc-200 truncate"
          >
            ClaimCenter FNOL &amp; Sources…
          </motion.div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: 'Sources', val: '12 docs', icon: Database },
            { label: 'Synthesis', val: '96% cite', icon: Layers },
            { label: 'Sparkpage', val: 'Ready', icon: FileText }
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.label}
                initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: prefersReduced ? 0 : idx * 0.08 }}
                className="p-2 rounded-xl bg-white/[0.04] border border-white/10"
              >
                <Icon className="w-3 h-3 text-[#54B0FF] mb-1" />
                <div className="text-[10px] font-semibold text-zinc-100">{item.label}</div>
                <div className="text-[9.5px] font-mono text-zinc-400">{item.val}</div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  if (slideId === 'meetings') {
    const bars = [14, 24, 18, 30, 20, 28, 16, 26];
    return (
      <div
        aria-hidden="true"
        className="w-full rounded-2xl liquid-glass-subtle border border-white/15 p-3 space-y-2 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-mono text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>Live A→B Stream</span>
          </span>
          <span className="text-[10px] font-mono text-zinc-400">EN → ES</span>
        </div>
        <div className="flex items-end justify-center gap-1.5 h-8 px-2">
          {bars.map((height, idx) => (
            <motion.span
              key={idx}
              className="w-1.5 rounded-full bg-gradient-to-t from-[#0F7FFF] to-cyan-300"
              animate={
                prefersReduced
                  ? { height: `${Math.round(height * 0.8)}px` }
                  : { height: [`${Math.round(height * 0.45)}px`, `${height}px`, `${Math.round(height * 0.55)}px`] }
              }
              transition={{
                duration: 1.15,
                repeat: Infinity,
                delay: idx * 0.1,
                ease: 'easeInOut'
              }}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-zinc-300 truncate">
            A: Reserve rule verified
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-400/25 text-cyan-200 truncate">
            B: Regla verificada
          </div>
        </div>
      </div>
    );
  }

  if (slideId === 'studio') {
    return (
      <div
        aria-hidden="true"
        className="w-full rounded-2xl liquid-glass-subtle border border-white/15 p-3 space-y-2 text-left"
      >
        <div className="flex items-center justify-between text-[10.5px] font-mono text-violet-300">
          <span>Selected Session → Studio Hub</span>
          <span>8 Tools</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { label: 'Slides', icon: Presentation },
            { label: 'Cards', icon: Layers },
            { label: 'Audio', icon: Headphones },
            { label: 'Drive', icon: Sparkles }
          ].map((tile, idx) => {
            const Icon = tile.icon;
            return (
              <motion.div
                key={tile.label}
                animate={
                  prefersReduced
                    ? undefined
                    : { y: [0, -2, 0] }
                }
                transition={{
                  duration: 2.2,
                  repeat: Infinity,
                  delay: idx * 0.22
                }}
                className="p-2 rounded-xl bg-white/[0.05] border border-white/12 flex flex-col items-center gap-1"
              >
                <Icon className="w-3.5 h-3.5 text-violet-300" />
                <span className="text-[9.5px] font-medium text-zinc-200">{tile.label}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="w-full rounded-2xl liquid-glass-subtle border border-white/15 p-3 space-y-2 text-left"
    >
      <div className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-400/25">
        <div className="flex items-center gap-2">
          <WifiOff className="w-3.5 h-3.5 text-emerald-300" />
          <span className="text-[11px] font-semibold text-zinc-100">Local-Only Firewall</span>
        </div>
        <motion.span
          animate={prefersReduced ? undefined : { opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="px-2 py-0.5 rounded-full bg-emerald-500/25 text-[9.5px] font-mono text-emerald-200"
        >
          Zero Egress
        </motion.span>
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 px-1">
        <span>On-Device Whisper</span>
        <span>·</span>
        <span>Modular Toggles</span>
      </div>
    </div>
  );
};

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  initialStage = 'carousel',
  onComplete
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const { user, isSigningIn, authError, signInWithGoogle, clearAuthError } = useFirebaseAuth();

  const [stage, setStage] = useState<'carousel' | 'link'>(initialStage);
  const [[slideIdx, slideDir], setSlideState] = useState<[number, 1 | -1]>([0, 1]);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

  const currentSlide = ONBOARDING_SLIDES[slideIdx];
  const isLastSlide = slideIdx === ONBOARDING_SLIDES.length - 1;
  const SlideIcon = currentSlide.Icon;

  const goToSlide = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(ONBOARDING_SLIDES.length - 1, nextIdx));
    if (clamped === slideIdx) return;
    triggerHaptic('selection');
    setSlideState([clamped, clamped > slideIdx ? 1 : -1]);
  };

  const handleNext = () => {
    if (isLastSlide) {
      triggerHaptic('medium');
      setStage('link');
      return;
    }
    goToSlide(slideIdx + 1);
  };

  const handleSkipCarousel = () => {
    triggerHaptic('selection');
    setStage('link');
  };

  const handleSwipeEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -50 || info.velocity.x < -300) {
      if (!isLastSlide) goToSlide(slideIdx + 1);
    } else if (info.offset.x > 50 || info.velocity.x > 300) {
      if (slideIdx > 0) goToSlide(slideIdx - 1);
    }
  };

  useEffect(() => {
    if (stage !== 'carousel') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && !isLastSlide) {
        goToSlide(slideIdx + 1);
      } else if (e.key === 'ArrowLeft' && slideIdx > 0) {
        goToSlide(slideIdx - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage, slideIdx, isLastSlide]);

  const handleLinkGoogle = async () => {
    triggerHaptic('medium');
    clearAuthError();
    await signInWithGoogle();
  };

  const handleCompleteOnboarding = () => {
    triggerHaptic('success');
    onComplete();
  };

  return (
    <div
      role="region"
      aria-label="Onboarding and Account Setup"
      className="flex flex-col h-full w-full px-4 pt-3 pb-6 overflow-y-auto justify-between gap-4"
    >
      <AnimatePresence mode="wait">
        {stage === 'carousel' ? (
          <motion.div
            key="onboarding-carousel-stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: MOTION_TRANSITIONS.elementEnter }}
            exit={{ opacity: 0, transition: MOTION_TRANSITIONS.elementExit }}
            className="flex flex-col flex-1 min-h-0 justify-between gap-4"
          >
            {/* Top Bar */}
            <div className="min-h-[44px] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 tabular-nums">
                <Bot className="w-4 h-4 text-[#54B0FF]" />
                <span>
                  {slideIdx + 1} / {ONBOARDING_SLIDES.length}
                </span>
              </div>

              {!isLastSlide ? (
                <button
                  type="button"
                  data-haptic="selection"
                  onClick={handleSkipCarousel}
                  aria-label="Skip onboarding carousel"
                  className="min-h-[44px] px-3 rounded-xl liquid-glass-subtle text-xs font-medium text-zinc-200 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Skip
                </button>
              ) : (
                <span className="min-h-[44px]" aria-hidden="true" />
              )}
            </div>

            {/* Swipeable Card Carousel with Interactive Micro-Preview */}
            <div className="flex-1 min-h-0 flex items-center justify-center py-1 overflow-hidden relative">
              <AnimatePresence initial={false} mode="popLayout" custom={slideDir}>
                <motion.div
                  key={currentSlide.id}
                  custom={slideDir}
                  drag={prefersReduced ? false : 'x'}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.22}
                  onDragEnd={handleSwipeEnd}
                  initial={
                    prefersReduced
                      ? { opacity: 0 }
                      : { opacity: 0, x: slideDir * 24 }
                  }
                  animate={{
                    opacity: 1,
                    x: 0,
                    transition: { duration: 0.18, ease: 'easeOut' }
                  }}
                  exit={
                    prefersReduced
                      ? { opacity: 0, transition: { duration: 0.1 } }
                      : {
                          opacity: 0,
                          x: slideDir * -24,
                          transition: { duration: 0.12 }
                        }
                  }
                  className="w-full max-w-sm rounded-[32px] liquid-glass-elevated p-5 sm:p-6 flex flex-col items-center text-center gap-4 cursor-grab active:cursor-grabbing select-none"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div
                      className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${currentSlide.accentClass}`}
                    >
                      <SlideIcon className="w-6 h-6" />
                    </div>
                    <div className="text-left min-w-0">
                      <div className="text-[10.5px] font-mono tracking-wider uppercase text-[#54B0FF]">
                        {currentSlide.eyebrow}
                      </div>
                      <h1 className="text-lg font-semibold text-zinc-50 tracking-tight leading-snug">
                        {currentSlide.headline}
                      </h1>
                    </div>
                  </div>

                  <OnboardingSlidePreview
                    slideId={currentSlide.id}
                    prefersReduced={prefersReduced}
                  />

                  <ul className="w-full space-y-2 text-left pt-0.5">
                    {currentSlide.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-start gap-2 text-[12.5px] text-zinc-200 leading-snug"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#54B0FF] shrink-0 mt-0.5" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Page Indicator + Next / Get Started */}
            <div className="space-y-3 shrink-0">
              <div
                role="tablist"
                aria-label="Onboarding slides"
                className="mx-auto w-fit flex items-center gap-1.5 px-3 py-2 rounded-full liquid-glass-subtle"
              >
                {ONBOARDING_SLIDES.map((slide, idx) => {
                  const active = idx === slideIdx;
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-label={`Slide ${idx + 1}: ${slide.headline}`}
                      onClick={() => goToSlide(idx)}
                      className={`h-2 rounded-full transition-all duration-200 ${
                        active
                          ? 'w-6 bg-[#54B0FF]'
                          : 'w-2 bg-white/25 hover:bg-white/45'
                      }`}
                    />
                  );
                })}
              </div>

              <motion.button
                type="button"
                data-haptic="medium"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={handleNext}
                className="w-full min-h-[50px] px-5 py-3 rounded-2xl liquid-accent-glass text-sm font-semibold flex items-center justify-center gap-2"
              >
                <span>{isLastSlide ? 'Get Started' : 'Next'}</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="onboarding-link-stage"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.screenEnter }}
            exit={{ opacity: 0, transition: MOTION_TRANSITIONS.elementExit }}
            className="flex flex-col flex-1 min-h-0 justify-between gap-5 max-w-sm mx-auto w-full"
          >
            {/* Header */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                data-haptic="selection"
                onClick={() => setStage('carousel')}
                className="min-h-[44px] px-3 rounded-xl liquid-glass-subtle text-xs font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Back
              </button>

              <button
                type="button"
                data-haptic="selection"
                onClick={handleCompleteOnboarding}
                aria-label="Skip account linking for now"
                className="min-h-[44px] px-3 rounded-xl text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors"
              >
                Skip for now
              </button>
            </div>

            {/* Center Card */}
            <div className="rounded-[32px] liquid-glass-elevated p-6 space-y-5 my-auto">
              <div className="w-14 h-14 rounded-2xl bg-[#0F7FFF]/18 border border-[#54B0FF]/35 flex items-center justify-center text-[#54B0FF] mx-auto">
                <ShieldCheck className="w-7 h-7" />
              </div>

              <div className="text-center space-y-1.5">
                <h1 className="text-lg font-semibold text-zinc-50 tracking-tight">
                  Link Your Account
                </h1>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Connect Google to sync preferences, Workspace sources, and save Studio files to Drive.
                </p>
              </div>

              {user ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl liquid-glass-subtle border border-emerald-400/35 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-zinc-100 truncate">
                        {user.displayName || 'Google Account Linked'}
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate">
                        {user.email || 'Verified Firebase session'}
                      </div>
                    </div>
                  </div>

                  <motion.button
                    type="button"
                    data-haptic="medium"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={handleCompleteOnboarding}
                    className="w-full min-h-[50px] px-4 py-3 rounded-2xl liquid-accent-glass text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <span>Continue to Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              ) : (
                <div className="space-y-3">
                  <motion.button
                    type="button"
                    data-haptic="medium"
                    disabled={isSigningIn}
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => void handleLinkGoogle()}
                    aria-label="Link Google Account"
                    className="w-full min-h-[52px] px-4 py-3 rounded-2xl liquid-glass hover:bg-white/[0.12] border border-white/20 flex items-center justify-between gap-3 text-sm font-semibold text-zinc-50 transition-colors disabled:opacity-55"
                  >
                    <GoogleGIcon className="w-5 h-5 shrink-0" />
                    <span className="flex-1 text-center">
                      {isSigningIn ? 'Linking Google…' : 'Link Google'}
                    </span>
                    <span className="w-5 shrink-0" aria-hidden="true" />
                  </motion.button>

                  {authError && (
                    <MotionAlertBanner
                      shakeKey={authError}
                      className="p-3 rounded-2xl bg-amber-500/12 border border-amber-400/35 text-xs text-amber-200 flex items-start justify-between gap-2"
                    >
                      <span className="leading-relaxed">{authError}</span>
                      <button
                        type="button"
                        onClick={clearAuthError}
                        className="text-[11px] font-semibold text-amber-300 hover:text-white shrink-0"
                      >
                        Dismiss
                      </button>
                    </MotionAlertBanner>
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-white/10 text-center space-y-2">
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Internal bot sandboxes and workspace records stay scoped strictly to your account ID.
                </p>
                <div className="flex items-center justify-center gap-3 text-[11px] font-medium text-[#54B0FF]">
                  <button
                    type="button"
                    onClick={() => setLegalModal('terms')}
                    className="hover:underline"
                  >
                    Terms
                  </button>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <button
                    type="button"
                    onClick={() => setLegalModal('privacy')}
                    className="hover:underline"
                  >
                    Privacy
                  </button>
                </div>
              </div>
            </div>

            <div className="text-center pb-1">
              <button
                type="button"
                data-haptic="selection"
                onClick={handleCompleteOnboarding}
                className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Continue without linking · Sync later in Settings
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terms / Privacy Sheet */}
      <MotionSheet
        isOpen={legalModal !== null}
        onClose={() => setLegalModal(null)}
        ariaLabel={legalModal === 'terms' ? 'Terms of Use' : 'Privacy Policy'}
        maxWidthClass="max-w-md"
      >
        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <h2 className="text-sm font-semibold text-zinc-50">
              {legalModal === 'terms' ? 'Terms of Use' : 'Privacy & Sandbox Policy'}
            </h2>
            <button
              type="button"
              onClick={() => setLegalModal(null)}
              aria-label="Close legal sheet"
              className="px-2.5 py-1 rounded-full text-xs text-zinc-300 hover:text-white hover:bg-white/10"
            >
              Done
            </button>
          </div>
          {legalModal === 'terms' ? (
            <div className="space-y-2 text-xs text-zinc-300 leading-relaxed">
              <p>
                Nudge AI Notes processes transcripts, search synthesis, and Studio deliverables according to the execution policy you select. Always review critical exports before sharing.
              </p>
              <p>
                Optional Cloud AI and Scout features ask for disclosure consent before sending approved queries off-device.
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-xs text-zinc-300 leading-relaxed">
              <p>
                Account sessions are managed via Firebase Authentication. Your immutable backend User ID (NB-XXXX-XXXX) scopes synced settings, sources, and sandboxes.
              </p>
              <p>
                Enable Local-Only Mode in Settings at any time to enforce zero outbound cloud network calls.
              </p>
            </div>
          )}
        </div>
      </MotionSheet>
    </div>
  );
};
