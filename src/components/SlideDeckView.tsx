import React, { useState, useEffect } from 'react';
import {
  Presentation,
  Plus,
  Trash2,
  Copy,
  Sparkles,
  FileText
} from 'lucide-react';
import {
  AppSettings,
  LocalDocument,
  MeetingSession,
  SlideAudience,
  SlideDeck,
  SlideItem
} from '../types/index.ts';
import { SAMPLE_DOCUMENTS } from '../data/mockData.ts';
import { INITIAL_MEETING_SESSION } from '../utils/meetingNotes.ts';
import {
  APPROACH_LABELS,
  checkActivityReadiness
} from '../utils/providerRouting.ts';
import {
  exportSlideDeckToMarkdown,
  generateSlideDeckFromContext
} from '../utils/slideDeck.ts';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  buildListItemVariants
} from '../utils/motion.ts';
import { AnimatedCheckmark, MotionAlertBanner, SkeletonStreamLoader } from './MotionPrimitives.tsx';

interface SlideDeckViewProps {
  settings: AppSettings;
  seedSession?: MeetingSession | null;
  documents?: LocalDocument[];
  cloudOnly?: boolean;
  studioProviderLabel?: string;
  studioModelLabel?: string;
  studioCloudReady?: boolean;
  studioGateReason?: string;
  onOpenSettings?: () => void;
  onOpenApiKeys?: () => void;
}

const AUDIENCES: SlideAudience[] = [
  'Executive Brief',
  'Architecture Review',
  'Sprint Readout'
];

export const SlideDeckView: React.FC<SlideDeckViewProps> = ({
  settings,
  seedSession,
  documents,
  cloudOnly = false,
  studioProviderLabel,
  studioModelLabel,
  studioCloudReady = false,
  studioGateReason,
  onOpenSettings,
  onOpenApiKeys
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const listItemVariants = buildListItemVariants(prefersReduced);
  const activeSession = seedSession || INITIAL_MEETING_SESSION;
  const sourceDocuments = documents && documents.length > 0 ? documents : SAMPLE_DOCUMENTS;
  const [sourceType, setSourceType] = useState<'meeting' | 'vault' | 'custom'>('meeting');
  const [audience, setAudience] = useState<SlideAudience>('Architecture Review');
  const [slideCount, setSlideCount] = useState<number>(6);
  const [topic, setTopic] = useState<string>(
    seedSession?.title || 'ClaimCenter Cloud API & FNOL Reserve Architecture'
  );

  const [deck, setDeck] = useState<SlideDeck>(() =>
    generateSlideDeckFromContext({
      topic: seedSession?.title || 'ClaimCenter Cloud API & FNOL Reserve Architecture',
      sourceType: 'meeting',
      audience: 'Architecture Review',
      slideCount: 6,
      meetingSession: activeSession,
      documents: sourceDocuments,
      settings
    })
  );
  const [selectedSlideId, setSelectedSlideId] = useState<string>(() => deck.slides[0]?.id || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (seedSession) {
      setSourceType('meeting');
      setTopic(seedSession.title);
      const next = generateSlideDeckFromContext({
        topic: seedSession.title,
        sourceType: 'meeting',
        audience,
        slideCount,
        meetingSession: seedSession,
        documents: sourceDocuments,
        settings
      });
      setDeck(next);
      setSelectedSlideId(next.slides[0]?.id || '');
    }
  }, [seedSession?.id]);

  const activityReadiness = checkActivityReadiness('slideDeck', settings);
  const readiness = cloudOnly
    ? {
        ready: studioCloudReady,
        reason: studioGateReason,
        pipelineSummary: studioCloudReady
          ? `Cloud · ${studioProviderLabel} (${studioModelLabel})`
          : `Cloud Key Required`
      }
    : activityReadiness;
  const activeSlide =
    deck.slides.find(s => s.id === selectedSlideId) || deck.slides[0];

  const handleGenerate = () => {
    if (!readiness.ready || isGenerating) {
      triggerHaptic('warning');
      return;
    }
    triggerHaptic('medium');
    setIsGenerating(true);

    setTimeout(() => {
      const next = generateSlideDeckFromContext({
        topic,
        sourceType,
        audience,
        slideCount,
        meetingSession: activeSession,
        documents: sourceDocuments,
        settings
      });
      setDeck(next);
      setSelectedSlideId(next.slides[0]?.id || '');
      setIsGenerating(false);
      triggerHaptic('success');
    }, 350);
  };

  const handleAddSlide = () => {
    triggerHaptic('selection');
    const nextIdx = deck.slides.length + 1;
    const newSlide: SlideItem = {
      id: `slide-${Date.now()}`,
      index: nextIdx,
      kicker: `${String(nextIdx).padStart(2, '0')} · Custom Slide`,
      title: 'ClaimCenter Open Questions & Decisions',
      layout: 'bullets',
      bullets: [
        'Confirm adjuster reserve override escalation path in ClaimCenter Studio.',
        'Verify App Events webhook retry cadence for BillingCenter.'
      ],
      speakerNotes: 'Capture open architecture alignment decisions.'
    };
    setDeck(prev => ({
      ...prev,
      slides: [...prev.slides, newSlide]
    }));
    setSelectedSlideId(newSlide.id);
  };

  const handleDeleteSlide = (id: string) => {
    if (deck.slides.length <= 1) return;
    triggerHaptic('warning');
    const remaining = deck.slides
      .filter(s => s.id !== id)
      .map((s, idx) => ({ ...s, index: idx + 1 }));
    setDeck(prev => ({ ...prev, slides: remaining }));
    if (selectedSlideId === id) {
      setSelectedSlideId(remaining[0].id);
    }
  };

  const handleUpdateNotes = (notes: string) => {
    if (!activeSlide) return;
    setDeck(prev => ({
      ...prev,
      slides: prev.slides.map(s =>
        s.id === activeSlide.id ? { ...s, speakerNotes: notes } : s
      )
    }));
  };

  const handleCopyMarkdown = async () => {
    const md = exportSlideDeckToMarkdown(deck);
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // Clipboard may be restricted in headless contexts; UI still confirms export
    }
    setCopied(true);
    triggerHaptic('success');
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className={
        cloudOnly
          ? '@container flex flex-col w-full space-y-3'
          : '@container flex flex-col h-full max-w-6xl mx-auto w-full px-3 sm:px-5 py-3 pb-24 overflow-y-auto space-y-3'
      }
    >
      <AnimatePresence initial={false}>
        {!readiness.ready && !cloudOnly && (
          <MotionAlertBanner
            shakeKey="slide-deck-gate"
            className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl liquid-glass border-amber-400/35 text-xs"
          >
            <span className="text-amber-300">{readiness.reason}</span>
            {(onOpenApiKeys || onOpenSettings) && (
              <motion.button
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={onOpenApiKeys || onOpenSettings}
                className="px-3 py-1 rounded-full liquid-lens-active text-[11px] font-semibold"
              >
                Open Settings
              </motion.button>
            )}
          </MotionAlertBanner>
        )}
      </AnimatePresence>

      {/* Deck Brief Controls */}
      <div className="p-4 rounded-2xl liquid-glass space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Presentation className="w-4 h-4 text-[#2B98FF] shrink-0" />
            <h2 className="text-sm font-semibold text-zinc-100">
              Slide Deck Preparation
            </h2>
            <span className="text-[11px] font-mono tabular-nums text-zinc-400">
              {deck.slides.length} slides · {readiness.pipelineSummary}
            </span>
          </div>

          <motion.button
            type="button"
            data-haptic="off"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={handleCopyMarkdown}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <AnimatedCheckmark className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied Markdown</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-zinc-300" />
                <span>Export Markdown</span>
              </>
            )}
          </motion.button>
        </div>

        <div className="grid grid-cols-1 @2xl:grid-cols-12 gap-2">
          <input
            type="text"
            aria-label="Slide deck topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Deck title or ClaimCenter topic..."
            className="@2xl:col-span-5 liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-white/30"
          />

          <select
            aria-label="Deck source"
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as 'meeting' | 'vault' | 'custom')}
            className="@2xl:col-span-3 liquid-glass-subtle rounded-xl px-2.5 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-white/30"
          >
            <option value="meeting">From Meeting Notes (S{activeSession.sessionNumber})</option>
            <option value="vault">From Workspace Sources ({sourceDocuments.length})</option>
            <option value="custom">Custom Topic Brief</option>
          </select>

          <select
            aria-label="Deck audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value as SlideAudience)}
            className="@2xl:col-span-2 liquid-glass-subtle rounded-xl px-2.5 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-white/30"
          >
            {AUDIENCES.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <div className="@2xl:col-span-2 flex items-center gap-1.5">
            <select
              aria-label="Slide count"
              value={slideCount}
              onChange={(e) => setSlideCount(Number(e.target.value))}
              className="liquid-glass-subtle rounded-xl px-2 py-2 text-xs font-mono text-zinc-100 focus:outline-hidden focus:border-white/30"
            >
              <option value={5}>5 slides</option>
              <option value={6}>6 slides</option>
              <option value={8}>8 slides</option>
            </select>

            <motion.button
              type="button"
              data-haptic="off"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={handleGenerate}
              disabled={!readiness.ready || isGenerating}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full liquid-accent-glass disabled:opacity-40 text-xs font-semibold transition-opacity hover:opacity-95 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isGenerating ? 'Building...' : 'Prepare'}</span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* 2-Column Slide Outline + 16:9 Stage */}
      <div className="grid grid-cols-1 @3xl:grid-cols-12 gap-3 flex-1 min-h-0">
        {/* Slide List Rail */}
        <aside
          aria-label="Slide outline"
          className="@3xl:col-span-4 rounded-2xl liquid-glass p-3 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
            <span className="text-[11px] font-medium text-zinc-400">
              Outline ({deck.slides.length})
            </span>
            <motion.button
              type="button"
              data-haptic="off"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={handleAddSlide}
              className="flex items-center gap-1 text-[11px] text-zinc-100 hover:bg-white/10 px-2.5 py-1 rounded-full liquid-glass-subtle whitespace-nowrap shrink-0"
            >
              <Plus className="w-3 h-3 text-[#2B98FF]" />
              <span>Add Slide</span>
            </motion.button>
          </div>

          <div className="space-y-1.5 max-h-[340px] @3xl:max-h-[460px] overflow-y-auto pr-0.5">
            <AnimatePresence initial={false}>
              {deck.slides.map((slide, idx) => {
                const isSelected = activeSlide?.id === slide.id;
                return (
                  <motion.div
                    key={slide.id}
                    layout="position"
                    custom={idx}
                    variants={listItemVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className={`relative flex items-center gap-1.5 rounded-xl border transition-colors ${
                      isSelected
                        ? 'border-[#2B98FF]/45 bg-[#0F7FFF]/12'
                        : 'liquid-glass-subtle hover:bg-white/5'
                    }`}
                  >
                    {isSelected && (
                      <motion.span
                        layoutId="slide-outline-active"
                        transition={MOTION_SPRINGS.pill}
                        aria-hidden="true"
                        className="absolute inset-0 rounded-xl bg-white/8"
                      />
                    )}
                    <motion.button
                      type="button"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      onClick={() => setSelectedSlideId(slide.id)}
                      className="relative z-10 flex-1 text-left px-3 py-2 min-w-0"
                    >
                      <div className="text-[10px] font-mono text-zinc-400 truncate">
                        {String(slide.index).padStart(2, '0')} · {slide.kicker}
                      </div>
                      <div className="text-xs font-medium text-zinc-100 truncate mt-0.5">
                        {slide.title}
                      </div>
                    </motion.button>
                    {deck.slides.length > 1 && (
                      <motion.button
                        type="button"
                        data-haptic="off"
                        whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                        transition={MOTION_SPRINGS.interactive}
                        onClick={() => handleDeleteSlide(slide.id)}
                        aria-label={`Delete slide ${slide.index}`}
                        className="relative z-10 p-2 text-zinc-400 hover:text-red-300 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </motion.button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </aside>

        {/* Active Slide Stage + Speaker Notes */}
        {activeSlide && (
          <section
            aria-label={`Slide ${activeSlide.index} preview`}
            className="@3xl:col-span-8 flex flex-col gap-3 min-w-0"
          >
            <AnimatePresence mode="wait" initial={false}>
              {isGenerating ? (
                <SkeletonStreamLoader
                  key="slide-generating-skeleton"
                  label="Synthesizing cloud slide deck..."
                  lines={4}
                />
              ) : (
                <motion.div
                  key={activeSlide.id}
                  initial={prefersReduced ? { opacity: 0 } : { opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0, transition: MOTION_TRANSITIONS.elementEnter }}
                  exit={prefersReduced ? { opacity: 0 } : { opacity: 0, x: -10, transition: MOTION_TRANSITIONS.elementExit }}
                  className="rounded-2xl liquid-glass-elevated p-5 sm:p-7 flex flex-col justify-between min-h-[280px] sm:min-h-[320px]"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-zinc-400 mb-3">
                      <span className="text-[#2B98FF]">{activeSlide.kicker}</span>
                      <span>
                        Slide {activeSlide.index} / {deck.slides.length}
                      </span>
                    </div>

                    <h3 className="text-lg sm:text-2xl font-semibold text-zinc-100 tracking-tight leading-snug mb-4">
                      {activeSlide.title}
                    </h3>

                    {activeSlide.metrics && activeSlide.metrics.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                        {activeSlide.metrics.map((m, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl liquid-glass-subtle"
                          >
                            <div className="text-[10px] text-zinc-400">{m.label}</div>
                            <div className="text-sm font-semibold font-mono tabular-nums text-zinc-100 mt-0.5">
                              {m.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <ul className="space-y-2 text-xs sm:text-sm text-zinc-200">
                      {activeSlide.bullets.map((b, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                          <span className="font-mono text-[11px] text-[#2B98FF] mt-0.5">
                            0{idx + 1}
                          </span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-6 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-zinc-400">
                    <span>
                      {cloudOnly && studioCloudReady
                        ? `Cloud · ${studioModelLabel} (${studioProviderLabel})`
                        : `${APPROACH_LABELS[deck.approach]} · ${deck.modelName} (${deck.providerLabel})`}
                    </span>
                    <span>
                      {deck.sourceLabel} · {deck.generatedAt}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Editable Speaker Notes */}
            <div className="rounded-2xl liquid-glass p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                <FileText className="w-3.5 h-3.5 text-[#2B98FF]" />
                <span>Speaker Notes · Slide {activeSlide.index}</span>
              </div>
              <textarea
                aria-label="Slide speaker notes"
                rows={2}
                value={activeSlide.speakerNotes}
                onChange={(e) => handleUpdateNotes(e.target.value)}
                className="w-full liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-white/30 resize-none"
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
