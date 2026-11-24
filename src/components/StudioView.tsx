import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Copy,
  FileCheck2,
  FileDown,
  FileText,
  Headphones,
  Key,
  Layers,
  MessageSquare,
  Mic,
  Presentation,
  Search,
  Sparkles,
  Upload,
  UploadCloud
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AnnotatedTranscriptEntry,
  AnnotationTagType,
  AppSettings,
  ClientPdfReport,
  CoreDataVectorStoreState,
  DictionaryEntry,
  GwtCriterion,
  MeetingSession,
  PaidProviderId,
  StudioDeliverableTab,
  StudioProviderId
} from '../types/index.ts';
import { resolveActiveLlmFromRegistry } from '../utils/modelRegistry.ts';
import { createInitialCoreDataStore, toLocalDocument } from '../utils/coreDataVectorDb.ts';
import { extractTextFromPdfBytesOrString } from '../utils/dictionaryLearning.ts';
import {
  SIMULATED_REQUIREMENTS_PDF_TEXT,
  STUDIO_CLOUD_PROVIDERS,
  buildClientReportPdfBytes,
  checkStudioCloudReadiness,
  exportAnnotatedTranscriptToMarkdown,
  exportGwtCriteriaToMarkdown,
  generateAnnotatedTranscript,
  generateClientPdfReport,
  generateGwtCriteriaFromPdfText
} from '../utils/studioEngine.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  buildListItemVariants
} from '../utils/motion.ts';
import { AnimatedCheckmark, MotionAlertBanner } from './MotionPrimitives.tsx';
import { SlideDeckView } from './SlideDeckView.tsx';
import { StudioFlashcardsStage } from './StudioFlashcardsStage.tsx';
import { StudioAudioOverviewStage } from './StudioAudioOverviewStage.tsx';
import { StudioRagAskStage } from './StudioRagAskStage.tsx';
import { StudioSaveShareStage } from './StudioSaveShareStage.tsx';

interface StudioViewProps {
  settings: AppSettings;
  meetingSessions: MeetingSession[];
  dictionaryEntries: DictionaryEntry[];
  seedSession?: MeetingSession | null;
  coreDataStore?: CoreDataVectorStoreState;
  onOpenSettings: () => void;
  onOpenApiKeys: (focusProvider?: PaidProviderId) => void;
}

interface StudioToolSpec {
  id: StudioDeliverableTab;
  title: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}

const STUDIO_TOOLS: StudioToolSpec[] = [
  {
    id: 'slides',
    title: 'Slide Deck',
    description: 'Build presentation slides and speaker notes from this meeting',
    icon: Presentation
  },
  {
    id: 'flashcards',
    title: 'Flashcards',
    description: 'Interactive review cards for decisions, actions, risks & terms',
    icon: Layers
  },
  {
    id: 'gwt',
    title: 'GWT Criteria',
    description: 'Turn requirements documents into Given/When/Then test stories',
    icon: FileCheck2
  },
  {
    id: 'pdf-report',
    title: 'Client PDF Report',
    description: 'Generate print-grade stakeholder briefings and action matrices',
    icon: FileDown
  },
  {
    id: 'annotated-transcript',
    title: 'Annotated Transcript',
    description: 'Filter speaker turns by Decision, Action, Risk, Rule & Entity',
    icon: FileText
  },
  {
    id: 'audio-overview',
    title: 'Audio Overview',
    description: 'Listen to or download a dual-host audio synthesis',
    icon: Headphones
  },
  {
    id: 'rag-ask',
    title: 'RAG Search & Ask AI',
    description: 'Query this meeting alongside your Workspace Sources',
    icon: MessageSquare
  },
  {
    id: 'save-share',
    title: 'Save & Share',
    description: 'Save deliverables to Google Drive or download to your device',
    icon: UploadCloud
  }
];

const TAG_STYLE: Record<AnnotationTagType, string> = {
  DECISION: 'text-emerald-300 border-emerald-800/60 bg-emerald-950/30',
  ACTION: 'text-sky-300 border-sky-800/60 bg-sky-950/30',
  RISK: 'text-amber-300 border-amber-800/60 bg-amber-950/30',
  RULE: 'text-zinc-200 border-zinc-700 bg-zinc-900',
  ENTITY: 'text-zinc-300 border-zinc-800 bg-zinc-950'
};

export const StudioView: React.FC<StudioViewProps> = ({
  settings,
  meetingSessions,
  dictionaryEntries,
  seedSession,
  coreDataStore,
  onOpenSettings,
  onOpenApiKeys
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const listItemVariants = buildListItemVariants(prefersReduced);

  // Stage 1: null -> Pull a Meeting; Stage 2: selectedSessionId && !activeStage -> Hub; Stage 3: activeStage -> Focused Tool
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() =>
    seedSession ? seedSession.id : null
  );
  const [activeStage, setActiveStage] = useState<StudioDeliverableTab | null>(null);
  const [meetingSearch, setMeetingSearch] = useState('');
  const [preferredProvider, setPreferredProvider] = useState<StudioProviderId>('anthropic');

  useEffect(() => {
    if (seedSession) {
      setSelectedSessionId(seedSession.id);
      setActiveStage(null);
    }
  }, [seedSession]);

  const selectedSession = useMemo(() => {
    if (!selectedSessionId) return null;
    return (
      meetingSessions.find((s) => s.id === selectedSessionId) ||
      (seedSession && seedSession.id === selectedSessionId ? seedSession : null) ||
      null
    );
  }, [meetingSessions, seedSession, selectedSessionId]);

  const activeStore = useMemo(
    () => coreDataStore || createInitialCoreDataStore(),
    [coreDataStore]
  );
  const workspaceDocuments = useMemo(
    () => activeStore.documents.map(toLocalDocument),
    [activeStore.documents]
  );
  const activeLocalLlm = useMemo(
    () => resolveActiveLlmFromRegistry(settings.activeLlmId),
    [settings.activeLlmId]
  );

  const readiness = useMemo(
    () => checkStudioCloudReadiness(settings, preferredProvider),
    [settings, preferredProvider]
  );

  // GWT Acceptance Criteria state
  const reqFileRef = useRef<HTMLInputElement>(null);
  const [reqFileName, setReqFileName] = useState('ClaimCenter_FNOL_Reserve_PRD_v3.2.pdf');
  const [reqText, setReqText] = useState(SIMULATED_REQUIREMENTS_PDF_TEXT);
  const [gwtCriteria, setGwtCriteria] = useState<GwtCriterion[]>(() =>
    generateGwtCriteriaFromPdfText(
      SIMULATED_REQUIREMENTS_PDF_TEXT,
      'ClaimCenter_FNOL_Reserve_PRD_v3.2.pdf',
      'Anthropic'
    )
  );
  const [copiedGwt, setCopiedGwt] = useState(false);

  // Client Report state (scoped strictly to selectedSession)
  const [clientName, setClientName] = useState('Apex Mutual Insurance');
  const [preparedFor, setPreparedFor] = useState('Claims Architecture Steering Committee');
  const [reportTone, setReportTone] = useState<'Executive' | 'Technical' | 'Client Brief'>(
    'Executive'
  );
  const [clientReport, setClientReport] = useState<ClientPdfReport | null>(null);
  const [pdfDownloadedName, setPdfDownloadedName] = useState<string | null>(null);

  // Annotated Transcript state (scoped strictly to selectedSession)
  const [tagFilter, setTagFilter] = useState<'ALL' | AnnotationTagType>('ALL');
  const [annotatedEntries, setAnnotatedEntries] = useState<AnnotatedTranscriptEntry[]>([]);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // Re-sync derived artifacts whenever the selected meeting changes
  useEffect(() => {
    if (!selectedSession) {
      setClientReport(null);
      setAnnotatedEntries([]);
      return;
    }
    setClientReport(
      generateClientPdfReport({
        clientName,
        preparedFor,
        tone: reportTone,
        session: selectedSession,
        gwtCount: gwtCriteria.length,
        providerLabel: readiness.ready ? readiness.providerLabel : 'Cloud Studio'
      })
    );
    setAnnotatedEntries(
      generateAnnotatedTranscript(
        selectedSession,
        dictionaryEntries,
        readiness.ready ? readiness.providerLabel : 'Cloud Studio'
      )
    );
    setTagFilter('ALL');
  }, [selectedSession?.id]);

  const filteredMeetings = useMemo(() => {
    const q = meetingSearch.trim().toLowerCase();
    if (!q) return meetingSessions;
    return meetingSessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        `s${s.sessionNumber}`.includes(q)
    );
  }, [meetingSessions, meetingSearch]);

  const handleUploadRequirementsPdf = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const extracted = extractTextFromPdfBytesOrString(new Uint8Array(buffer), file.name);
    const nextText = extracted.trim() || SIMULATED_REQUIREMENTS_PDF_TEXT;
    setReqFileName(file.name);
    setReqText(nextText);
    if (readiness.ready) {
      setGwtCriteria(generateGwtCriteriaFromPdfText(nextText, file.name, readiness.providerLabel));
    }
  };

  const handleSimulateRequirementsPdf = () => {
    const fileName = 'ClaimCenter_FNOL_Reserve_PRD_v3.2.pdf';
    setReqFileName(fileName);
    setReqText(SIMULATED_REQUIREMENTS_PDF_TEXT);
    if (readiness.ready) {
      setGwtCriteria(
        generateGwtCriteriaFromPdfText(
          SIMULATED_REQUIREMENTS_PDF_TEXT,
          fileName,
          readiness.providerLabel
        )
      );
    }
  };

  const handleGenerateGwt = () => {
    if (!readiness.ready) {
      triggerHaptic('warning');
      return;
    }
    setGwtCriteria(generateGwtCriteriaFromPdfText(reqText, reqFileName, readiness.providerLabel));
    triggerHaptic('success');
  };

  const handleCopyGwt = async () => {
    const md = exportGwtCriteriaToMarkdown(gwtCriteria, reqFileName, readiness.providerLabel);
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // Clipboard fallback
    }
    setCopiedGwt(true);
    triggerHaptic('success');
    setTimeout(() => setCopiedGwt(false), 1800);
  };

  const handleGenerateReport = () => {
    if (!selectedSession || !readiness.ready) {
      triggerHaptic('warning');
      return;
    }
    setClientReport(
      generateClientPdfReport({
        clientName,
        preparedFor,
        tone: reportTone,
        session: selectedSession,
        gwtCount: gwtCriteria.length,
        providerLabel: readiness.providerLabel
      })
    );
    triggerHaptic('success');
  };

  const handleDownloadPdf = () => {
    if (!selectedSession || !readiness.ready) return;
    const freshReport = generateClientPdfReport({
      clientName,
      preparedFor,
      tone: reportTone,
      session: selectedSession,
      gwtCount: gwtCriteria.length,
      providerLabel: readiness.providerLabel
    });
    setClientReport(freshReport);

    const bytes = buildClientReportPdfBytes(freshReport);
    const fileSlug = `${freshReport.clientName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')}_claimcenter_report.pdf`;
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileSlug;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setPdfDownloadedName(fileSlug);
    triggerHaptic('success');
    setTimeout(() => setPdfDownloadedName(null), 2600);
  };

  const handleGenerateAnnotated = () => {
    if (!selectedSession || !readiness.ready) {
      triggerHaptic('warning');
      return;
    }
    setAnnotatedEntries(
      generateAnnotatedTranscript(selectedSession, dictionaryEntries, readiness.providerLabel)
    );
    triggerHaptic('success');
  };

  const handleCopyAnnotated = async () => {
    if (!selectedSession) return;
    const md = exportAnnotatedTranscriptToMarkdown(
      annotatedEntries,
      selectedSession.title,
      readiness.providerLabel
    );
    try {
      await navigator.clipboard.writeText(md);
    } catch {
      // Clipboard fallback
    }
    setCopiedTranscript(true);
    triggerHaptic('success');
    setTimeout(() => setCopiedTranscript(false), 1800);
  };

  const filteredTranscript =
    tagFilter === 'ALL'
      ? annotatedEntries
      : annotatedEntries.filter((e) => e.annotations.some((a) => a.type === tagFilter));

  // STAGE 1: Clean Studio Landing — Pull a Meeting into Studio
  if (!selectedSession) {
    return (
      <div className="@container flex flex-col h-full max-w-4xl mx-auto w-full px-3 sm:px-5 py-4 pb-24 overflow-y-auto space-y-4">
        <div className="p-5 rounded-2xl liquid-glass space-y-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#2B98FF] shrink-0" />
            <h2 className="text-base font-semibold text-zinc-100">Pull a Meeting into Studio</h2>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Choose a meeting session to generate slide decks, flashcards, acceptance criteria, audio overviews, ask grounded questions, or save directly to Google Drive.
          </p>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Filter meetings for Studio"
              value={meetingSearch}
              onChange={(e) => setMeetingSearch(e.target.value)}
              placeholder="Search meetings by title or session number…"
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl liquid-glass-subtle text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-[#54B0FF]"
            />
          </div>
        </div>

        {filteredMeetings.length === 0 ? (
          <div className="p-8 rounded-2xl liquid-glass text-center space-y-2">
            <Mic className="w-5 h-5 text-zinc-400 mx-auto" />
            <div className="text-xs font-medium text-zinc-200">
              {meetingSessions.length === 0
                ? 'No meeting sessions yet'
                : 'No matching meetings'}
            </div>
            <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
              {meetingSessions.length === 0
                ? 'Record or import a meeting in the Meetings tab, then pull it into Studio to create deliverables.'
                : 'Try clearing or refining your search filter.'}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
            {filteredMeetings.map((session) => (
              <motion.button
                key={session.id}
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={() => {
                  triggerHaptic('selection');
                  setSelectedSessionId(session.id);
                  setActiveStage(null);
                }}
                className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 hover:bg-white/[0.05] transition-colors"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-zinc-400">
                    <span className="text-[#54B0FF] font-semibold">S{session.sessionNumber}</span>
                    <span>·</span>
                    <span>{session.recordedAt}</span>
                    <span>·</span>
                    <span>{session.audioDurationLabel}</span>
                    <span>·</span>
                    <span>{session.items.length} items</span>
                  </div>
                  <div className="text-sm font-semibold text-zinc-100 truncate">
                    {session.title}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              </motion.button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const activeToolMeta = activeStage
    ? STUDIO_TOOLS.find((t) => t.id === activeStage) || null
    : null;

  const cloudControls = (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        aria-label="Studio Cloud API provider"
        value={readiness.activeProvider || preferredProvider}
        onChange={(e) => setPreferredProvider(e.target.value as StudioProviderId)}
        className="liquid-glass-subtle rounded-full px-3 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-white/30"
      >
        {STUDIO_CLOUD_PROVIDERS.map((p) => {
          const isConfigured = readiness.configuredProviders.includes(p.id);
          return (
            <option key={p.id} value={p.id}>
              {p.name} · {p.modelLabel} {isConfigured ? '✓' : '(Key Required)'}
            </option>
          );
        })}
      </select>

      <motion.button
        type="button"
        data-haptic="selection"
        whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
        transition={MOTION_SPRINGS.interactive}
        onClick={() => onOpenApiKeys(preferredProvider)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 whitespace-nowrap shrink-0"
      >
        <Key className="w-3.5 h-3.5 text-[#2B98FF]" />
        <span>Cloud Keys</span>
      </motion.button>
    </div>
  );

  // STAGE 2: Studio Tool Hub for Selected Meeting
  if (!activeStage) {
    return (
      <div className="@container flex flex-col h-full max-w-5xl mx-auto w-full px-3 sm:px-5 py-3 pb-24 overflow-y-auto space-y-3">
        <div className="p-4 rounded-2xl liquid-glass space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setSelectedSessionId(null);
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change Meeting</span>
            </button>

            {cloudControls}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-[#54B0FF]">
              <span>Session S{selectedSession.sessionNumber}</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400">{selectedSession.recordedAt}</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400">{selectedSession.audioDurationLabel}</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400">{selectedSession.items.length} items</span>
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-zinc-100">
              {selectedSession.title}
            </h2>
          </div>

          {!readiness.ready && (
            <MotionAlertBanner
              shakeKey={`${preferredProvider}-${readiness.reason || 'gate'}`}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs bg-amber-500/12 border-amber-400/35 text-amber-200 backdrop-blur-md"
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-snug">{readiness.reason}</span>
              </div>

              {settings.offlineOnly || settings.localOnly ? (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="px-3 py-1 rounded-full liquid-lens-active text-[11px] font-semibold whitespace-nowrap shrink-0"
                >
                  Open Settings
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenApiKeys(preferredProvider)}
                  className="px-3 py-1 rounded-full liquid-lens-active text-[11px] font-semibold whitespace-nowrap shrink-0"
                >
                  Add Cloud API Key
                </button>
              )}
            </MotionAlertBanner>
          )}
        </div>

        {/* Clean 2-Column Studio Tool Hub Grid */}
        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
          {STUDIO_TOOLS.map((tool, idx) => {
            const Icon = tool.icon;
            return (
              <motion.button
                key={tool.id}
                type="button"
                custom={idx}
                variants={listItemVariants}
                initial="initial"
                animate="animate"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={() => {
                  triggerHaptic('selection');
                  setActiveStage(tool.id);
                }}
                className="p-4 rounded-2xl liquid-glass hover:bg-white/[0.06] text-left flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl liquid-glass-subtle flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-[#54B0FF]" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-xs font-semibold text-zinc-100">{tool.title}</div>
                    <p className="text-[11px] text-zinc-400 leading-snug">{tool.description}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  }

  // STAGE 3: Focused Deliverable Stage Screen
  return (
    <div className="@container flex flex-col h-full max-w-6xl mx-auto w-full px-3 sm:px-5 py-3 pb-24 overflow-y-auto space-y-3">
      <div className="p-3.5 rounded-2xl liquid-glass flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              setActiveStage(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Studio Hub</span>
          </button>

          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-semibold text-zinc-100 truncate">
              {activeToolMeta?.title}
            </h2>
            <div className="text-[10.5px] font-mono text-zinc-400 truncate">
              S{selectedSession.sessionNumber}: {selectedSession.title}
            </div>
          </div>
        </div>

        {(activeStage === 'slides' ||
          activeStage === 'gwt' ||
          activeStage === 'pdf-report' ||
          activeStage === 'annotated-transcript') &&
          cloudControls}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${selectedSession.id}-${activeStage}`}
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -4, transition: MOTION_TRANSITIONS.elementExit }}
          className="space-y-3"
        >
          {activeStage === 'slides' && (
            <SlideDeckView
              settings={settings}
              seedSession={selectedSession}
              documents={workspaceDocuments}
              cloudOnly
              studioProviderLabel={readiness.providerLabel}
              studioModelLabel={readiness.modelLabel}
              studioCloudReady={readiness.ready}
              studioGateReason={readiness.reason}
              onOpenSettings={onOpenSettings}
              onOpenApiKeys={() => onOpenApiKeys(preferredProvider)}
            />
          )}

          {activeStage === 'flashcards' && (
            <StudioFlashcardsStage
              session={selectedSession}
              dictionaryEntries={dictionaryEntries}
              cloudReady={readiness.ready}
              providerLabel={readiness.providerLabel}
            />
          )}

          {activeStage === 'gwt' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl liquid-glass space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-zinc-100">GWT Criteria</h3>
                    <p className="text-[11px] text-zinc-400 font-mono truncate">
                      {reqFileName} · {gwtCriteria.length} stories
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      ref={reqFileRef}
                      type="file"
                      accept=".pdf,.txt,.md"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadRequirementsPdf(file);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => reqFileRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 whitespace-nowrap shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#2B98FF]" />
                      <span>Upload Requirements PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSimulateRequirementsPdf}
                      className="px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-200 whitespace-nowrap shrink-0"
                    >
                      Load ClaimCenter PRD
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateGwt}
                      disabled={!readiness.ready}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full liquid-accent-glass disabled:opacity-40 text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate GWT</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyGwt}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 whitespace-nowrap shrink-0"
                    >
                      {copiedGwt ? (
                        <AnimatedCheckmark className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-zinc-300" />
                      )}
                      <span>{copiedGwt ? 'Copied' : 'Export MD'}</span>
                    </button>
                  </div>
                </div>

                <textarea
                  aria-label="Requirements source text"
                  rows={3}
                  value={reqText}
                  onChange={(e) => setReqText(e.target.value)}
                  className="w-full liquid-glass-subtle rounded-xl px-3 py-2 text-[11px] font-mono text-zinc-200 focus:outline-hidden focus:border-white/30 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-3">
                {gwtCriteria.map((item) => (
                  <div key={item.id} className="p-4 rounded-2xl liquid-glass space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono text-zinc-400">{item.storyCode}</span>
                        <span className="text-zinc-600">·</span>
                        <h4 className="text-xs font-semibold text-zinc-100 truncate">
                          {item.title}
                        </h4>
                      </div>
                      <span
                        className={`text-[10px] font-mono shrink-0 ${
                          item.priority === 'Must' ? 'text-emerald-300' : 'text-zinc-400'
                        }`}
                      >
                        {item.priority}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs leading-relaxed">
                      <div>
                        <span className="font-mono text-[10px] uppercase text-zinc-400 mr-2">
                          Given
                        </span>
                        <span className="text-zinc-300">{item.given}</span>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] uppercase text-zinc-400 mr-2">
                          When
                        </span>
                        <span className="text-zinc-200">{item.when}</span>
                      </div>
                      <div>
                        <span className="font-mono text-[10px] uppercase text-emerald-400 mr-2">
                          Then
                        </span>
                        <span className="text-zinc-100">{item.then}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400">
                      <span>Edge: {item.edgeCase}</span>
                      <span className="font-mono">{item.sourceRef}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeStage === 'pdf-report' && clientReport && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl liquid-glass space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-zinc-100">
                    Client PDF Report · Session S{selectedSession.sessionNumber}
                  </h3>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleGenerateReport}
                      disabled={!readiness.ready}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 disabled:opacity-40 text-xs text-zinc-100 whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#2B98FF]" />
                      <span>Refresh Preview</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      disabled={!readiness.ready}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full liquid-accent-glass disabled:opacity-40 text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Download Shareable PDF</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 @xl:grid-cols-3 gap-2">
                  <input
                    type="text"
                    aria-label="Client name"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Client Name..."
                    className="liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-white/30"
                  />
                  <input
                    type="text"
                    aria-label="Prepared for recipient"
                    value={preparedFor}
                    onChange={(e) => setPreparedFor(e.target.value)}
                    placeholder="Prepared For..."
                    className="liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-white/30"
                  />
                  <select
                    aria-label="Report tone"
                    value={reportTone}
                    onChange={(e) =>
                      setReportTone(e.target.value as 'Executive' | 'Technical' | 'Client Brief')
                    }
                    className="liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-white/30"
                  >
                    <option value="Executive">Executive Tone</option>
                    <option value="Technical">Technical Architecture</option>
                    <option value="Client Brief">Client Brief</option>
                  </select>
                </div>

                {pdfDownloadedName && (
                  <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                    <AnimatedCheckmark className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Exported {pdfDownloadedName}</span>
                  </div>
                )}
              </div>

              <div className="p-2 rounded-[22px] liquid-glass">
                <article
                  aria-label="Client PDF Report Preview"
                  className="rounded-2xl bg-zinc-50 text-zinc-950 p-6 sm:p-8 border border-zinc-300 space-y-5 shadow-lg"
                >
                  <header className="border-b border-zinc-300 pb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                        {clientReport.tone} Deliverable · {clientReport.generatedDate}
                      </div>
                      <h3 className="text-xl font-semibold tracking-tight text-zinc-950 mt-1">
                        {clientReport.title}
                      </h3>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        Prepared for {clientReport.preparedFor}
                      </p>
                    </div>
                    <div className="text-right text-[10px] font-mono text-zinc-500">
                      <div>Verified Cloud Output</div>
                      <div>{clientReport.providerLabel}</div>
                    </div>
                  </header>

                  <section className="space-y-1.5">
                    <h4 className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                      Executive Summary
                    </h4>
                    <p className="text-xs sm:text-sm leading-relaxed text-zinc-800">
                      {clientReport.executiveSummary}
                    </p>
                  </section>

                  <section className="grid grid-cols-2 @xl:grid-cols-4 gap-2.5">
                    {clientReport.keyMetrics.map((m, i) => (
                      <div key={i} className="p-3 rounded-lg bg-zinc-100 border border-zinc-200">
                        <div className="text-[10px] text-zinc-500">{m.label}</div>
                        <div className="text-sm font-semibold font-mono tabular-nums text-zinc-950 mt-0.5">
                          {m.value}
                        </div>
                      </div>
                    ))}
                  </section>

                  <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-5">
                    <section className="space-y-2">
                      <h4 className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                        Key Decisions
                      </h4>
                      <ul className="space-y-1.5 text-xs text-zinc-800">
                        {clientReport.decisions.map((d, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="font-mono text-zinc-400">0{idx + 1}</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section className="space-y-2">
                      <h4 className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                        Action Ownership Matrix
                      </h4>
                      <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-lg text-xs">
                        {clientReport.actionMatrix.map((row, idx) => (
                          <div key={idx} className="p-2 flex items-start justify-between gap-2">
                            <div>
                              <span className="font-semibold text-zinc-900">{row.owner}: </span>
                              <span className="text-zinc-700">{row.deliverable}</span>
                            </div>
                            <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                              {row.target}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <section className="space-y-1.5 pt-2 border-t border-zinc-200">
                    <h4 className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                      Risk &amp; Mitigation Register
                    </h4>
                    {clientReport.risks.map((r, i) => (
                      <div key={i} className="text-xs text-zinc-800">
                        <span className="font-semibold">Risk: </span>
                        <span>{r.risk}</span>
                        <span className="text-zinc-500"> — Mitigation: {r.mitigation}</span>
                      </div>
                    ))}
                  </section>
                </article>
              </div>
            </div>
          )}

          {activeStage === 'annotated-transcript' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl liquid-glass flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#2B98FF] shrink-0" />
                  <h3 className="text-xs font-semibold text-zinc-100">
                    Annotated Transcript · Session S{selectedSession.sessionNumber}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleGenerateAnnotated}
                    disabled={!readiness.ready}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full liquid-accent-glass disabled:opacity-40 text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Annotate Transcript</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyAnnotated}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 whitespace-nowrap shrink-0"
                  >
                    {copiedTranscript ? (
                      <AnimatedCheckmark className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-zinc-300" />
                    )}
                    <span>{copiedTranscript ? 'Copied' : 'Export MD'}</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 rounded-full liquid-glass-subtle w-fit">
                {(['ALL', 'DECISION', 'ACTION', 'RISK', 'RULE', 'ENTITY'] as const).map((tag) => {
                  const active = tagFilter === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTagFilter(tag)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-mono transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'liquid-lens-active text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl liquid-glass divide-y divide-white/10">
                {filteredTranscript.map((entry) => (
                  <div key={entry.id} className="p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono tabular-nums text-[11px] text-[#2B98FF]">
                          {entry.timestamp}
                        </span>
                        {entry.speakerTag && (
                          <>
                            <span className="text-zinc-600">·</span>
                            <span className="font-mono text-[10px] text-zinc-400">
                              {entry.speakerTag}
                            </span>
                          </>
                        )}
                        <span className="text-zinc-600">·</span>
                        <span className="font-medium text-zinc-100">{entry.speaker}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-zinc-400">
                        {entry.annotations.map((ann, i) => (
                          <span key={i} className={TAG_STYLE[ann.type].split(' ')[0]}>
                            {ann.type}: {ann.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed">{entry.text}</p>

                    {entry.linkedDictionaryTerms.length > 0 && (
                      <div className="text-[10px] font-mono text-zinc-400">
                        Dictionary links: {entry.linkedDictionaryTerms.join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeStage === 'audio-overview' && (
            <StudioAudioOverviewStage
              session={selectedSession}
              voiceProfile={settings.voiceProfile}
              ttsEngine={settings.ttsEngine}
            />
          )}

          {activeStage === 'rag-ask' && (
            <StudioRagAskStage
              session={selectedSession}
              coreDataStore={activeStore}
              localModel={activeLocalLlm}
              offlineOnly={Boolean(settings.localOnly || settings.offlineOnly)}
            />
          )}

          {activeStage === 'save-share' && (
            <StudioSaveShareStage
              session={selectedSession}
              settings={settings}
              gwtCriteria={gwtCriteria}
              reqFileName={reqFileName}
              providerLabel={readiness.providerLabel}
              clientName={clientName}
              preparedFor={preparedFor}
              reportTone={reportTone}
              documents={workspaceDocuments}
              localOnly={Boolean(settings.localOnly || settings.offlineOnly)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
