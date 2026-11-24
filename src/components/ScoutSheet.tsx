import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  Compass,
  Copy,
  Database,
  ExternalLink,
  FilePlus2,
  Globe,
  Lock,
  Newspaper,
  NotebookText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  WifiOff,
  X,
  Zap
} from 'lucide-react';
import { AnimatePresence, PanInfo, motion, useDragControls, useReducedMotion } from 'motion/react';
import type {
  Nanobot,
  NanobotEngineId,
  NanobotWizardSeed,
  ScoutCitation,
  ScoutErrorCode,
  ScoutLaunchRequest,
  ScoutResult,
  ScoutScope,
  ScoutStage
} from '../types/index.ts';
import {
  NANOBOT_ENGINES,
  getEngineSpec
} from '../utils/nanobotCatalog.ts';
import {
  SCOUT_QUICK_INTENTS,
  applyIntentPrefix,
  buildScoutInsertText,
  isSafePublicHttpUrl,
  recordAiConsentIso,
  redactSensitiveText,
  resolveStoredAiConsentIso,
  streamScoutSearch,
  trackScoutEvent
} from '../utils/scoutAgent.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  shouldDismissSheet
} from '../utils/motion.ts';
import { AnimatedCheckmark } from './MotionPrimitives.tsx';

interface ScoutSheetProps {
  request: ScoutLaunchRequest | null;
  userId: string;
  offlineOnly: boolean;
  nanobots: Nanobot[];
  onClose: () => void;
  onEnableHybridAndRetry?: () => void;
  onSwitchToNotes?: () => void;
  onSaveAsSource: (result: ScoutResult) => Promise<void>;
  onPromoteToNanobot: (seed: NanobotWizardSeed) => void;
}

type SheetUiState =
  | 'empty'
  | 'loading'
  | 'result'
  | 'offline'
  | 'error'
  | 'rate_limited'
  | 'no_results'
  | 'cancelled';

const TRAIL_STEPS: ReadonlyArray<{ id: Exclude<ScoutStage, 'complete'>; label: string }> = [
  { id: 'searching', label: 'Searching' },
  { id: 'reading', label: 'Reading' },
  { id: 'synthesizing', label: 'Synthesizing' }
];

export const ScoutSheet: React.FC<ScoutSheetProps> = ({
  request,
  userId,
  offlineOnly,
  nanobots,
  onClose,
  onEnableHybridAndRetry,
  onSwitchToNotes,
  onSaveAsSource,
  onPromoteToNanobot
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const dragControls = useDragControls();

  const [queryDraft, setQueryDraft] = useState('');
  const [scope, setScope] = useState<ScoutScope>('web');
  const [engine, setEngine] = useState<NanobotEngineId>('atlas');
  const [redactPii, setRedactPii] = useState(true);
  const [consentIso, setConsentIso] = useState<string | null>(() =>
    resolveStoredAiConsentIso(nanobots)
  );
  const [consentChecked, setConsentChecked] = useState(false);

  const [uiState, setUiState] = useState<SheetUiState>('empty');
  const [activeStage, setActiveStage] = useState<ScoutStage>('searching');
  const [stageDetail, setStageDetail] = useState('Searching web sources…');
  const [streamedSummary, setStreamedSummary] = useState('');
  const [citations, setCitations] = useState<ScoutCitation[]>([]);
  const [completedResult, setCompletedResult] = useState<ScoutResult | null>(null);

  const [errorCode, setErrorCode] = useState<ScoutErrorCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [retryAfterSec, setRetryAfterSec] = useState<number>(0);

  const [refineText, setRefineText] = useState('');
  const [showRefineInput, setShowRefineInput] = useState(false);

  const [insertedFeedback, setInsertedFeedback] = useState<'plain' | 'cited' | null>(null);
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [savedSourceFeedback, setSavedSourceFeedback] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const queryInputRef = useRef<HTMLInputElement>(null);

  const isOpen = Boolean(request);
  const noteContext = request?.noteContext?.trim() || '';
  const hasNoteContext = noteContext.length > 0;

  // Refresh stored consent when Nanobots list changes
  useEffect(() => {
    const stored = resolveStoredAiConsentIso(nanobots);
    if (stored) setConsentIso(stored);
  }, [nanobots]);

  // Countdown for rate-limited state
  useEffect(() => {
    if (uiState !== 'rate_limited' || retryAfterSec <= 0) return;
    const t = setInterval(() => {
      setRetryAfterSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [uiState, retryAfterSec]);

  // Escape key & focus cleanup
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseSheet();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // Cleanup active SSE stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Automatically clear offline block banner once user switches back to Hybrid mode
  useEffect(() => {
    if (!offlineOnly && uiState === 'offline') {
      setUiState('empty');
      setErrorCode(null);
      setErrorMessage('');
    }
  }, [offlineOnly, uiState]);

  const stopActiveStream = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  };

  const handleCloseSheet = () => {
    stopActiveStream();
    onClose();
  };

  const executeScoutRun = async (opts: {
    queryText: string;
    runScope: ScoutScope;
    runEngine: NanobotEngineId;
    runRedactPii: boolean;
    runConsentIso: string | null;
    refineInstruction?: string;
    bypassCache?: boolean;
    ignoreOfflineFlag?: boolean;
  }) => {
    const cleanQuery = opts.queryText.trim();
    if (!cleanQuery) {
      setUiState('empty');
      return;
    }

    const effectiveOffline = opts.ignoreOfflineFlag ? false : offlineOnly;
    if (effectiveOffline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      setUiState('offline');
      setErrorCode('OFFLINE_BLOCKED');
      setErrorMessage(
        effectiveOffline
          ? 'Offline Air-Gap Mode is enabled. Switch to Notes search or enable Hybrid mode to search the web.'
          : 'Device appears offline. Reconnect or switch to local Notes search.'
      );
      return;
    }

    if (!opts.runConsentIso) {
      setUiState('empty');
      return;
    }

    stopActiveStream();
    const controller = new AbortController();
    abortRef.current = controller;

    const startedAtMs = Date.now();
    let recordedFirstToken = false;

    setUiState('loading');
    setActiveStage('searching');
    setStageDetail('Searching authoritative web sources…');
    setStreamedSummary('');
    setCitations([]);
    setCompletedResult(null);
    setErrorCode(null);
    setErrorMessage('');
    setInsertedFeedback(null);
    setCopiedFeedback(false);
    setSavedSourceFeedback(false);

    let accumSummary = '';
    const accumCitations: ScoutCitation[] = [];

    try {
      for await (const ev of streamScoutSearch({
        userId,
        query: cleanQuery,
        scope: opts.runScope,
        engine: opts.runEngine,
        noteContextSnippet: opts.runScope === 'web+note' ? noteContext : undefined,
        redactPii: opts.runRedactPii,
        consentTimestampIso: opts.runConsentIso,
        refineInstruction: opts.refineInstruction,
        signal: controller.signal,
        bypassCache: opts.bypassCache
      })) {
        if (controller.signal.aborted) break;

        if (ev.type === 'stage') {
          setActiveStage(ev.stage);
          setStageDetail(ev.detail);
        } else if (ev.type === 'delta') {
          if (!recordedFirstToken) {
            recordedFirstToken = true;
            trackScoutEvent({ type: 'first_token', latencyMs: Date.now() - startedAtMs });
          }
          accumSummary += ev.text;
          setStreamedSummary(accumSummary);
        } else if (ev.type === 'citation') {
          if (!accumCitations.some((c) => c.url === ev.citation.url)) {
            accumCitations.push(ev.citation);
            setCitations([...accumCitations]);
          }
        } else if (ev.type === 'complete') {
          const finalSummary = ev.summary || accumSummary;
          const finalCitations = ev.citations.length > 0 ? ev.citations : accumCitations;
          const redacted = opts.runRedactPii
            ? redactSensitiveText(cleanQuery).redactedText
            : cleanQuery;

          setStreamedSummary(finalSummary);
          setCitations(finalCitations);
          setActiveStage('complete');

          if (!finalSummary.trim() && finalCitations.length === 0) {
            setUiState('no_results');
          } else {
            const resultObj: ScoutResult = {
              query: cleanQuery,
              redactedQuery: redacted,
              scope: opts.runScope,
              engine: opts.runEngine,
              summary: finalSummary,
              citations: finalCitations,
              durationMs: ev.durationMs,
              provider: ev.provider
            };
            setCompletedResult(resultObj);
            setUiState('result');
            trackScoutEvent({ type: 'complete', durationMs: ev.durationMs });
            triggerHaptic('success');
          }
          abortRef.current = null;
          return;
        } else if (ev.type === 'error') {
          trackScoutEvent({ type: 'error', code: ev.code });
          setErrorCode(ev.code);
          setErrorMessage(ev.message);

          if (ev.code === 'OFFLINE_BLOCKED') {
            setUiState('offline');
          } else if (ev.code === 'RATE_LIMITED') {
            setRetryAfterSec(ev.retryAfterSec || 15);
            setUiState('rate_limited');
          } else if (ev.code === 'CANCELLED') {
            setUiState('cancelled');
          } else {
            setUiState('error');
          }
          triggerHaptic('warning');
          abortRef.current = null;
          return;
        }
      }

      if (controller.signal.aborted) {
        setUiState('cancelled');
        trackScoutEvent({ type: 'cancel' });
      }
    } catch {
      if (controller.signal.aborted) {
        setUiState('cancelled');
      } else {
        setErrorCode('UPSTREAM_ERROR');
        setErrorMessage('Unexpected error while streaming Scout results.');
        setUiState('error');
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  };

  // Sync incoming launch request cleanly
  useEffect(() => {
    if (!request) return;

    const initialScope: ScoutScope =
      request.scope || (request.intent === 'news' ? 'news' : 'web');
    const initialEngine: NanobotEngineId = request.engine || 'atlas';
    const initialQuery = request.intent
      ? applyIntentPrefix(request.query, request.intent)
      : request.query.trim();
    const currentConsent = resolveStoredAiConsentIso(nanobots);

    setScope(initialScope);
    setEngine(initialEngine);
    setQueryDraft(initialQuery);
    setConsentIso(currentConsent);
    setConsentChecked(Boolean(currentConsent));
    setShowRefineInput(false);
    setRefineText('');
    setInsertedFeedback(null);
    setCopiedFeedback(false);
    setSavedSourceFeedback(false);
    setCompletedResult(null);
    setStreamedSummary('');
    setCitations([]);

    trackScoutEvent({ type: 'trigger', entryPoint: request.entryPoint });

    if (offlineOnly || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      setUiState('offline');
      return;
    }

    if (request.autoRun && initialQuery.trim() && currentConsent) {
      void executeScoutRun({
        queryText: initialQuery,
        runScope: initialScope,
        runEngine: initialEngine,
        runRedactPii: redactPii,
        runConsentIso: currentConsent
      });
    } else {
      setUiState('empty');
      setTimeout(() => {
        queryInputRef.current?.focus();
      }, 120);
    }
  }, [request]);

  // Pre-send privacy preview computation
  const privacyPreview = useMemo(() => {
    const queryRaw = queryDraft.trim();
    const queryCheck = redactPii
      ? redactSensitiveText(queryRaw)
      : { redactedText: queryRaw, redactionCount: 0, redactedTypes: [] };

    const noteSnippet = scope === 'web+note' && hasNoteContext ? noteContext.slice(0, 1200) : '';
    const noteCheck = redactPii
      ? redactSensitiveText(noteSnippet)
      : { redactedText: noteSnippet, redactionCount: 0, redactedTypes: [] };

    return {
      queryText: queryCheck.redactedText,
      redactionCount: queryCheck.redactionCount + noteCheck.redactionCount,
      redactedTypes: Array.from(new Set([...queryCheck.redactedTypes, ...noteCheck.redactedTypes])),
      noteBytesShared: scope === 'web+note' ? noteCheck.redactedText.length : 0
    };
  }, [queryDraft, redactPii, scope, hasNoteContext, noteContext]);

  const handleStopStream = () => {
    triggerHaptic('selection');
    stopActiveStream();
    setUiState('cancelled');
    trackScoutEvent({ type: 'cancel' });
  };

  const handleGrantConsentAndRun = () => {
    const iso = recordAiConsentIso();
    setConsentIso(iso);
    setConsentChecked(true);
    triggerHaptic('success');
    if (queryDraft.trim()) {
      void executeScoutRun({
        queryText: queryDraft,
        runScope: scope,
        runEngine: engine,
        runRedactPii: redactPii,
        runConsentIso: iso
      });
    }
  };

  const handleSubmitQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentIso) return;
    triggerHaptic('medium');
    void executeScoutRun({
      queryText: queryDraft,
      runScope: scope,
      runEngine: engine,
      runRedactPii: redactPii,
      runConsentIso: consentIso
    });
  };

  const handleRunRefine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentIso || !refineText.trim()) return;
    trackScoutEvent({ type: 'action', action: 'refine' });
    triggerHaptic('medium');
    const instr = refineText.trim();
    setShowRefineInput(false);
    setRefineText('');
    void executeScoutRun({
      queryText: queryDraft,
      runScope: scope,
      runEngine: engine,
      runRedactPii: redactPii,
      runConsentIso: consentIso,
      refineInstruction: instr,
      bypassCache: true
    });
  };

  const handleCopyResult = async () => {
    if (!completedResult) return;
    const text = buildScoutInsertText(completedResult, true);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore headless clipboard refusal
    }
    setCopiedFeedback(true);
    trackScoutEvent({ type: 'action', action: 'copy' });
    triggerHaptic('success');
    setTimeout(() => setCopiedFeedback(false), 1800);
  };

  const handleInsertResult = (withCitations: boolean) => {
    if (!completedResult || !request?.onInsert) return;
    const text = buildScoutInsertText(completedResult, withCitations);
    request.onInsert(text);
    setInsertedFeedback(withCitations ? 'cited' : 'plain');
    trackScoutEvent({
      type: 'action',
      action: withCitations ? 'insert_cited' : 'insert'
    });
    triggerHaptic('success');
  };

  const handleSaveSourceClick = async () => {
    if (!completedResult || savedSourceFeedback) return;
    await onSaveAsSource(completedResult);
    setSavedSourceFeedback(true);
    trackScoutEvent({ type: 'action', action: 'save_source' });
    triggerHaptic('success');
  };

  const handleMakeNanobot = () => {
    if (!completedResult) return;
    trackScoutEvent({ type: 'action', action: 'make_nanobot' });
    triggerHaptic('medium');
    const engineSpec = getEngineSpec(engine);
    handleCloseSheet();
    onPromoteToNanobot({
      engine,
      styleId: 'researcher',
      taskPrompt: `Monitor and verify: ${completedResult.redactedQuery}`,
      name: `${engineSpec.name} Scout`,
      consentTimestampIso: consentIso || recordAiConsentIso(),
      nonce: Date.now()
    });
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (shouldDismissSheet(info.offset.y, info.velocity.y)) {
      triggerHaptic('selection');
      handleCloseSheet();
    }
  };

  const surfaceTitle =
    request?.surface === 'meetings'
      ? 'Meeting Notes'
      : request?.surface === 'studio'
      ? 'Cloud Studio'
      : 'Office Diary';

  return (
    <AnimatePresence>
      {isOpen && request && (
        <motion.div
          key="scout-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Scout web research sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: MOTION_TRANSITIONS.backdropEnter }}
          exit={{ opacity: 0, transition: MOTION_TRANSITIONS.backdropExit }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseSheet();
          }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-md"
        >
          <motion.div
            key="scout-sheet-surface"
            layoutId={prefersReduced ? undefined : 'scout-orb-sheet-morph'}
            drag={prefersReduced ? false : 'y'}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.5 }}
            dragSnapToOrigin
            onDragEnd={handleDragEnd}
            initial={
              prefersReduced ? { opacity: 0 } : { opacity: 0, y: 34, scale: 0.96 }
            }
            animate={
              prefersReduced
                ? { opacity: 1, transition: MOTION_TRANSITIONS.elementEnter }
                : { opacity: 1, y: 0, scale: 1, transition: MOTION_SPRINGS.sheet }
            }
            exit={
              prefersReduced
                ? { opacity: 0, transition: MOTION_TRANSITIONS.elementExit }
                : { opacity: 0, y: 24, scale: 0.97, transition: MOTION_TRANSITIONS.elementExit }
            }
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl group-data-[device-frame=true]/app:max-w-[396px] rounded-[28px] liquid-glass-elevated border border-white/20 overflow-hidden flex flex-col max-h-[88vh] shadow-2xl"
          >
            {/* Interactive Drag Handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              aria-hidden="true"
              className="flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none shrink-0"
            >
              <div className="w-10 h-1 rounded-full bg-white/25" />
            </div>

            {/* Header */}
            <div className="px-4 pb-2.5 flex items-center justify-between gap-2 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-xl liquid-accent-glass flex items-center justify-center shrink-0">
                  <Compass className="w-4 h-4 text-white" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-zinc-50 flex items-center gap-1.5">
                    <span>Scout</span>
                    <span className="text-[10px] font-mono text-[#54B0FF]">
                      · {surfaceTitle}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">
                    Ephemeral cited research · Zero background access to other notes
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseSheet}
                aria-label="Close Scout sheet"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full liquid-glass-subtle text-zinc-300 hover:text-white hover:bg-white/15 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3">
              {/* Shared AI & Data Disclosure Gate (only if user has never consented yet) */}
              {!consentIso && (
                <div className="rounded-2xl liquid-glass p-3.5 border border-amber-400/35 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <Lock className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs">
                      <div className="font-semibold text-zinc-50">
                        AI & Web Disclosure Required Once
                      </div>
                      <p className="text-zinc-300 text-[11px] leading-relaxed">
                        Scout uses AI grounded with Google Search and transmits only the previewed
                        query below. Sharing this consent also unlocks NanoTeam Nanobots.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <label className="flex items-center gap-2 text-[11px] text-zinc-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={consentChecked}
                        onChange={(e) => setConsentChecked(e.target.checked)}
                        className="rounded border-white/25 bg-black/40 text-[#0F7FFF]"
                      />
                      <span>I understand and agree</span>
                    </label>
                    <button
                      type="button"
                      disabled={!consentChecked}
                      onClick={handleGrantConsentAndRun}
                      className="min-h-[34px] px-3.5 py-1 rounded-full liquid-accent-glass text-[11px] font-semibold disabled:opacity-40"
                    >
                      Approve & Scout
                    </button>
                  </div>
                </div>
              )}

              {/* Editable Query Composer */}
              <form onSubmit={handleSubmitQuery} className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <input
                    ref={queryInputRef}
                    type="text"
                    aria-label="Scout query input"
                    value={queryDraft}
                    onChange={(e) => setQueryDraft(e.target.value)}
                    placeholder="Ask Scout anything across the live web…"
                    className="flex-1 min-w-0 min-h-[42px] liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#54B0FF]"
                  />

                  {uiState === 'loading' ? (
                    <button
                      type="button"
                      onClick={handleStopStream}
                      aria-label="Stop Scout search"
                      className="min-h-[42px] px-3.5 py-2 rounded-xl bg-red-500/85 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!queryDraft.trim() || !consentIso}
                      className="min-h-[42px] px-4 py-2 rounded-xl liquid-accent-glass text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Search</span>
                    </button>
                  )}
                </div>

                {/* Scope Chips & Engine Picker */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    role="radiogroup"
                    aria-label="Scout search scope"
                    className="flex items-center gap-1 flex-wrap"
                  >
                    {(
                      [
                        { id: 'web', label: 'Web', icon: Globe, disabled: false },
                        {
                          id: 'web+note',
                          label: 'Web + this note',
                          icon: NotebookText,
                          disabled: !hasNoteContext
                        },
                        { id: 'news', label: 'News', icon: Newspaper, disabled: false }
                      ] as const
                    ).map((s) => {
                      const active = scope === s.id;
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={s.disabled}
                          onClick={() => {
                            triggerHaptic('selection');
                            setScope(s.id);
                          }}
                          className={`min-h-[30px] px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center gap-1 border transition-colors disabled:opacity-35 ${
                            active
                              ? 'liquid-lens-active text-zinc-950 font-semibold border-white/60'
                              : 'liquid-glass-subtle text-zinc-300 border-white/10 hover:text-white'
                          }`}
                        >
                          <Icon className="w-3 h-3 shrink-0" />
                          <span>{s.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div
                    role="radiogroup"
                    aria-label="Scout engine tier"
                    className="flex items-center gap-1 p-0.5 rounded-full liquid-glass-subtle"
                  >
                    {NANOBOT_ENGINES.map((eng) => {
                      const active = engine === eng.id;
                      return (
                        <button
                          key={eng.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            triggerHaptic('selection');
                            setEngine(eng.id);
                          }}
                          title={`${eng.name}: ${eng.speedLabel} · ${eng.depthLabel}`}
                          className={`px-2.5 py-1 rounded-full text-[10.5px] font-medium flex items-center gap-1 transition-colors ${
                            active
                              ? 'liquid-accent-glass text-white font-semibold'
                              : 'text-zinc-300 hover:text-white'
                          }`}
                        >
                          <Zap className="w-2.5 h-2.5" />
                          <span>{eng.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </form>

              {/* Pre-Send Privacy Cue Banner */}
              <div className="rounded-xl liquid-glass-subtle px-3 py-2 border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[10.5px]">
                  <div className="flex items-center gap-1.5 text-emerald-300 font-medium min-w-0">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {privacyPreview.noteBytesShared === 0
                        ? 'Privacy Cue · 0 note bytes shared'
                        : `Privacy Cue · Query + ${privacyPreview.noteBytesShared} approved note chars`}
                    </span>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={redactPii}
                    aria-label="Toggle PII redaction before sending"
                    onClick={() => {
                      triggerHaptic('selection');
                      setRedactPii((prev) => !prev);
                    }}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono border shrink-0 transition-colors ${
                      redactPii
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/35'
                        : 'bg-amber-500/15 text-amber-300 border-amber-400/35'
                    }`}
                  >
                    Redact PII: {redactPii ? 'ON' : 'OFF'}
                  </button>
                </div>

                {privacyPreview.queryText && (
                  <div className="text-[10.5px] font-mono text-zinc-300 truncate">
                    Sending only: “{privacyPreview.queryText}”
                    {privacyPreview.redactionCount > 0 && (
                      <span className="text-emerald-300 ml-1.5">
                        ({privacyPreview.redactionCount} redacted)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* ================= STATE 1: EMPTY ================= */}
              {uiState === 'empty' && (
                <div className="rounded-2xl liquid-glass p-4 space-y-3">
                  <div className="text-xs font-semibold text-zinc-100">
                    Choose a Quick Intent or Ask Anything
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SCOUT_QUICK_INTENTS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('selection');
                          const updated = applyIntentPrefix(queryDraft, item.id);
                          setQueryDraft(updated);
                          setScope(item.defaultScope);
                          if (consentIso && queryDraft.trim()) {
                            void executeScoutRun({
                              queryText: updated,
                              runScope: item.defaultScope,
                              runEngine: engine,
                              runRedactPii: redactPii,
                              runConsentIso: consentIso
                            });
                          } else {
                            queryInputRef.current?.focus();
                          }
                        }}
                        className="p-2.5 rounded-xl liquid-glass-subtle hover:bg-white/10 text-left space-y-0.5 transition-colors"
                      >
                        <div className="text-xs font-semibold text-[#54B0FF]">{item.label}</div>
                        <div className="text-[10.5px] text-zinc-400 leading-snug">
                          {item.description}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="text-[10.5px] font-mono text-zinc-400 pt-1">
                    Shortcuts: type <span className="text-zinc-200">/web</span> or{' '}
                    <span className="text-zinc-200">@scout</span> inside an opened meeting, or press{' '}
                    <span className="text-zinc-200">⌘K / Ctrl+K</span> inside Meeting Detail.
                  </div>
                </div>
              )}

              {/* ================= STATE 2: OFFLINE ================= */}
              {uiState === 'offline' && (
                <div
                  role="alert"
                  className="rounded-2xl liquid-glass p-4 border border-amber-400/35 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <WifiOff className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-zinc-100">
                        Web Search Unavailable Offline
                      </div>
                      <p className="text-[11px] text-zinc-300 leading-relaxed">
                        {errorMessage ||
                          'Offline Air-Gap Mode is enabled. Switch to Notes search or enable Hybrid mode to fetch cited web sources.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {onSwitchToNotes && (
                      <button
                        type="button"
                        onClick={() => {
                          onSwitchToNotes();
                          handleCloseSheet();
                        }}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-100"
                      >
                        Switch to Notes
                      </button>
                    )}
                    {offlineOnly && onEnableHybridAndRetry && (
                      <button
                        type="button"
                        onClick={() => {
                          onEnableHybridAndRetry();
                          if (consentIso && queryDraft.trim()) {
                            void executeScoutRun({
                              queryText: queryDraft,
                              runScope: scope,
                              runEngine: engine,
                              runRedactPii: redactPii,
                              runConsentIso: consentIso,
                              ignoreOfflineFlag: true
                            });
                          } else {
                            setUiState('empty');
                            setErrorCode(null);
                            setErrorMessage('');
                            setTimeout(() => queryInputRef.current?.focus(), 60);
                          }
                        }}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-full liquid-accent-glass text-xs font-semibold"
                      >
                        Enable Hybrid & Retry
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ================= STATE 3: RATE LIMITED ================= */}
              {uiState === 'rate_limited' && (
                <div
                  role="alert"
                  className="rounded-2xl liquid-glass p-4 border border-amber-400/35 space-y-2.5"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-zinc-100">
                        Scout Rate Limit Reached
                      </div>
                      <p className="text-[11px] text-zinc-300">
                        {errorMessage}{' '}
                        {retryAfterSec > 0 && (
                          <span className="font-mono text-[#54B0FF]">
                            Retry in {retryAfterSec}s
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={retryAfterSec > 0 || !consentIso}
                    onClick={() => {
                      if (!consentIso) return;
                      void executeScoutRun({
                        queryText: queryDraft,
                        runScope: scope,
                        runEngine: engine,
                        runRedactPii: redactPii,
                        runConsentIso: consentIso
                      });
                    }}
                    className="min-h-[34px] px-3.5 py-1 rounded-full liquid-accent-glass text-xs font-semibold disabled:opacity-40"
                  >
                    {retryAfterSec > 0 ? `Wait ${retryAfterSec}s` : 'Retry Now'}
                  </button>
                </div>
              )}

              {/* ================= STATE 4: ERROR ================= */}
              {uiState === 'error' && (
                <div
                  role="alert"
                  className="rounded-2xl liquid-glass p-4 border border-red-400/35 space-y-2.5"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-zinc-100">
                        Scout Couldn’t Complete Research ({errorCode || 'ERROR'})
                      </div>
                      <p className="text-[11px] text-zinc-300">{errorMessage}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!consentIso}
                    onClick={() => {
                      if (!consentIso) return;
                      void executeScoutRun({
                        queryText: queryDraft,
                        runScope: scope,
                        runEngine: engine,
                        runRedactPii: redactPii,
                        runConsentIso: consentIso
                      });
                    }}
                    className="min-h-[34px] px-3.5 py-1 rounded-full liquid-accent-glass text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry Search</span>
                  </button>
                </div>
              )}

              {/* ================= STATE 5: NO RESULTS ================= */}
              {uiState === 'no_results' && (
                <div className="rounded-2xl liquid-glass p-4 text-center space-y-2.5">
                  <Globe className="w-6 h-6 text-zinc-400 mx-auto" />
                  <div className="text-xs font-semibold text-zinc-100">
                    No Grounded Web Results Found
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Try broader keywords or remove strict filters before searching again.
                  </p>
                  {scope !== 'web' && (
                    <button
                      type="button"
                      onClick={() => {
                        setScope('web');
                        if (consentIso) {
                          void executeScoutRun({
                            queryText: queryDraft,
                            runScope: 'web',
                            runEngine: engine,
                            runRedactPii: redactPii,
                            runConsentIso: consentIso
                          });
                        }
                      }}
                      className="min-h-[34px] px-3.5 py-1 rounded-full liquid-accent-glass text-xs font-semibold"
                    >
                      Search Broad Web
                    </button>
                  )}
                </div>
              )}

              {/* ================= STATE 6 & 7: AGENT TRAIL + LOADING / RESULT / CANCELLED ================= */}
              {(uiState === 'loading' || uiState === 'result' || uiState === 'cancelled') && (
                <div className="space-y-3">
                  {/* Animated 3-Step Agent Trail */}
                  <div className="rounded-2xl liquid-glass p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {TRAIL_STEPS.map((step, idx) => {
                          const stageOrder = ['searching', 'reading', 'synthesizing', 'complete'];
                          const currentRank = stageOrder.indexOf(activeStage);
                          const stepRank = stageOrder.indexOf(step.id);
                          const isDone =
                            uiState === 'result' || currentRank > stepRank;
                          const isActive =
                            uiState === 'loading' && currentRank === stepRank;

                          return (
                            <React.Fragment key={step.id}>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10.5px] font-medium flex items-center gap-1 transition-colors ${
                                  isDone
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/35'
                                    : isActive
                                    ? 'liquid-accent-glass text-white font-semibold'
                                    : 'liquid-glass-subtle text-zinc-400'
                                }`}
                              >
                                {isDone && <Check className="w-2.5 h-2.5" />}
                                <span>{step.label}</span>
                              </span>
                              {idx < TRAIL_STEPS.length - 1 && (
                                <span className="text-zinc-600" aria-hidden="true">
                                  →
                                </span>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>

                      {uiState === 'cancelled' && (
                        <span className="text-[10px] font-mono text-amber-300">Stopped</span>
                      )}
                    </div>

                    <div className="text-[11px] text-zinc-300 truncate">{stageDetail}</div>
                  </div>

                  {/* Cancelled Notice with Partial Recovery */}
                  {uiState === 'cancelled' && (
                    <div className="rounded-xl liquid-glass-subtle px-3 py-2 border border-amber-400/30 flex items-center justify-between gap-2 text-xs">
                      <span className="text-zinc-200 text-[11px]">
                        Search stopped. Any sources found so far remain below.
                      </span>
                      <button
                        type="button"
                        disabled={!consentIso}
                        onClick={() => {
                          if (!consentIso) return;
                          void executeScoutRun({
                            queryText: queryDraft,
                            runScope: scope,
                            runEngine: engine,
                            runRedactPii: redactPii,
                            runConsentIso: consentIso
                          });
                        }}
                        className="px-3 py-1 rounded-full liquid-accent-glass text-[11px] font-semibold shrink-0"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {/* Synthesized Summary */}
                  {uiState === 'loading' && !streamedSummary ? (
                    <div className="rounded-2xl liquid-glass p-3.5 space-y-2" aria-busy="true">
                      <div className="h-2.5 w-11/12 rounded-full bg-white/10 motion-shimmer" />
                      <div className="h-2.5 w-4/5 rounded-full bg-white/10 motion-shimmer" />
                      <div className="h-2.5 w-3/5 rounded-full bg-white/10 motion-shimmer" />
                    </div>
                  ) : (
                    streamedSummary && (
                      <div className="rounded-2xl liquid-glass p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono text-zinc-400">
                          <span className="text-[#54B0FF]">
                            {getEngineSpec(engine).name} Synthesis
                          </span>
                          {completedResult && (
                            <span>
                              {(completedResult.durationMs / 1000).toFixed(1)}s ·{' '}
                              {completedResult.provider === 'gemini-grounding'
                                ? 'Google Grounded'
                                : 'Web Grounded'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-100 leading-relaxed whitespace-pre-wrap">
                          {streamedSummary}
                        </div>
                      </div>
                    )
                  )}

                  {/* Source Citation Cards */}
                  {citations.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="px-1 text-[10.5px] font-mono uppercase tracking-wider text-zinc-400">
                        Sources · {citations.length}
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        {citations.map((cit) => {
                          const safeHref = isSafePublicHttpUrl(cit.url) ? cit.url : undefined;
                          return (
                            <div
                              key={`${cit.id}-${cit.url}`}
                              className="rounded-xl liquid-glass-subtle p-2.5 flex items-start justify-between gap-2.5"
                            >
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <span className="w-6 h-6 rounded-lg bg-[#0F7FFF]/20 border border-[#54B0FF]/40 text-[#54B0FF] text-[10px] font-mono font-semibold flex items-center justify-center shrink-0">
                                  {cit.faviconText}
                                </span>
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <div className="text-xs font-semibold text-zinc-100 truncate">
                                    [{cit.id}] {cit.title}
                                  </div>
                                  <div className="text-[10px] font-mono text-[#54B0FF] truncate">
                                    {cit.domain}
                                  </div>
                                  {cit.snippet && (
                                    <p className="text-[11px] text-zinc-300 line-clamp-2 leading-snug">
                                      {cit.snippet}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {safeHref && (
                                <a
                                  href={safeHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Open source ${cit.title}`}
                                  className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 shrink-0"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Completed Actions Bar */}
                  {uiState === 'result' && completedResult && (
                    <div className="rounded-2xl liquid-glass p-3 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {request.onInsert && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleInsertResult(false)}
                              className="min-h-[34px] px-3 py-1 rounded-full liquid-accent-glass text-[11px] font-semibold flex items-center gap-1"
                            >
                              {insertedFeedback === 'plain' ? (
                                <AnimatedCheckmark className="w-3 h-3 text-white" />
                              ) : (
                                <FilePlus2 className="w-3 h-3" />
                              )}
                              <span>
                                {insertedFeedback === 'plain' ? 'Inserted' : 'Insert into note'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleInsertResult(true)}
                              className="min-h-[34px] px-3 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-100 flex items-center gap-1"
                            >
                              {insertedFeedback === 'cited' ? (
                                <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <FilePlus2 className="w-3 h-3 text-[#54B0FF]" />
                              )}
                              <span>
                                {insertedFeedback === 'cited'
                                  ? 'Inserted w/ Citations'
                                  : 'Insert with citations'}
                              </span>
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => void handleCopyResult()}
                          className="min-h-[34px] px-3 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-100 flex items-center gap-1"
                        >
                          {copiedFeedback ? (
                            <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-zinc-300" />
                          )}
                          <span>{copiedFeedback ? 'Copied' : 'Copy'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={savedSourceFeedback}
                          onClick={() => void handleSaveSourceClick()}
                          className="min-h-[34px] px-3 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-100 flex items-center gap-1 disabled:opacity-65"
                        >
                          {savedSourceFeedback ? (
                            <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Database className="w-3 h-3 text-[#54B0FF]" />
                          )}
                          <span>{savedSourceFeedback ? 'Saved to Vault' : 'Save as source'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleMakeNanobot}
                          className="min-h-[34px] px-3 py-1 rounded-full bg-[#0F7FFF]/20 border border-[#54B0FF]/45 hover:bg-[#0F7FFF]/35 text-[11px] font-semibold text-[#54B0FF] flex items-center gap-1"
                        >
                          <Bot className="w-3 h-3" />
                          <span>Make this a Nanobot</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowRefineInput((prev) => !prev)}
                          className="min-h-[34px] px-3 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-200 flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3 text-[#54B0FF]" />
                          <span>Refine</span>
                        </button>
                      </div>

                      {showRefineInput && (
                        <form onSubmit={handleRunRefine} className="space-y-2 pt-1 border-t border-white/10">
                          <div className="flex flex-wrap gap-1">
                            {['Go deeper with primary metrics', 'Find counter-arguments', 'Recent updates only'].map(
                              (preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => setRefineText(preset)}
                                  className="px-2 py-0.5 rounded-lg liquid-glass-subtle text-[10px] text-zinc-300 hover:text-white"
                                >
                                  {preset}
                                </button>
                              )
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              aria-label="Refine Scout search"
                              value={refineText}
                              onChange={(e) => setRefineText(e.target.value)}
                              placeholder="Tell Scout how to go deeper…"
                              className="flex-1 min-w-0 min-h-[36px] liquid-glass-subtle rounded-xl px-3 py-1 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#54B0FF]"
                            />
                            <button
                              type="submit"
                              disabled={!refineText.trim()}
                              className="min-h-[36px] px-3.5 py-1 rounded-xl liquid-accent-glass text-xs font-semibold disabled:opacity-40"
                            >
                              Go Deeper
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
