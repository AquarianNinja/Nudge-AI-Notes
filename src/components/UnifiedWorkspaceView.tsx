import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Edit3,
  ExternalLink,
  FileAudio,
  FileText,
  Globe,
  Image as ImageIcon,
  Layers,
  Mic,
  NotebookPen,
  Paperclip,
  Plus,
  Search,
  Send,
  Square,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AgentStep,
  BackgroundAgentTask,
  CloudSchedulerModelId,
  CoreDataChunkEmbedding,
  CoreDataDocumentFormat,
  CoreDataManagedDocument,
  CoreDataVectorStoreState,
  DriveAudioFile,
  GenTeamAgent,
  GenTeamChannel,
  GenTeamMessage,
  GenTeamTask,
  ModelOption,
  Nanobot,
  NanobotRun,
  NanobotStatus,
  NanobotWizardSeed,
  OfficeDiaryCategory,
  OfficeDiaryEntry,
  RagStrategyId,
  SchedulerIntervalId,
  SparkpageCitation,
  SparkpageData,
  StageTelemetryMap,
  TimelineStageId,
  UploadedAssetKind,
  UserIdentity,
  WorkspaceAttachment,
  WorkspaceSubTab
} from '../types/index.ts';
import type { CreateNanobotPayload } from './CreateNanobotWizard.tsx';
import {
  EMPTY_STAGE_TELEMETRY,
  advancePipelineStep,
  generateResearchPlan,
  getStageForStepIndex,
  initializeAgentSteps
} from '../utils/agentOrchestration.ts';
import {
  createDriveAudioFile,
  createSyntheticMeetingWavUrl
} from '../utils/audioDrive.ts';
import { createInitialCoreDataStore } from '../utils/coreDataVectorDb.ts';
import { buildChunksFromWorkspaceAttachments } from '../utils/ragEngine.ts';
import {
  buildWorkspaceAttachmentFromFile,
  createDiaryEntryRequest,
  createSchedulerTaskRequest,
  deleteDiaryEntryRequest,
  deleteSchedulerTaskRequest,
  executeCloudSearchRequest,
  fetchDiaryEntries,
  fetchSchedulerTasks,
  runSchedulerTaskNowRequest,
  toggleSchedulerTaskRequest,
  updateDiaryEntryRequest
} from '../utils/ragClient.ts';
import {
  formatDiaryDateLabel,
  getCloudSchedulerModelSpec,
  getTodayIsoDate,
  groupDiaryEntriesByDate
} from '../utils/workspaceScheduler.ts';
import {
  searchOfficeDiaryEntries,
  splitHighlightSegments
} from '../utils/diarySearch.ts';
import {
  areAllEntriesCollapsed,
  parseIsoYearMonth,
  toggleEntriesCollapsedState
} from '../utils/diaryCalendar.ts';
import {
  INITIAL_GENTEAM_AGENTS,
  INITIAL_GENTEAM_CHANNELS,
  INITIAL_GENTEAM_MESSAGES,
  INITIAL_GENTEAM_TASKS
} from '../utils/genTeam.ts';
import { mapAgentToCloudModel } from '../utils/crewPlanner.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  buildListItemVariants,
  buildTabVariants,
  getTabTransitionDirection
} from '../utils/motion.ts';
import {
  AnimatedCheckmark,
  MotionSheet
} from './MotionPrimitives.tsx';
import { AgentTaskTimeline } from './AgentTaskTimeline.tsx';
import { OfficeDiaryCalendar } from './OfficeDiaryCalendar.tsx';
import { CrewPlannerSection, CrewPlannerSubView } from './CrewPlannerSection.tsx';
import { useFirebaseAuth } from './FirebaseProvider.tsx';
import {
  deleteDiaryEntryFromFirestore,
  deleteSchedulerTaskFromFirestore,
  saveDiaryEntryToFirestore,
  saveSchedulerTaskToFirestore,
  subscribeDiaryEntries,
  subscribeSchedulerTasks
} from '../utils/firestoreSync.ts';

interface SearchResultEntry {
  id: string;
  query: string;
  timestamp: string;
  attachments?: WorkspaceAttachment[];
  sparkpage: SparkpageData;
  steps: AgentStep[];
  telemetry: StageTelemetryMap;
}

interface UnifiedWorkspaceViewProps {
  selectedModel: ModelOption;
  offlineOnly: boolean;
  coreDataStore?: CoreDataVectorStoreState;
  onToggleOffline: () => void;
  onIngestToNotebook: (sparkpage: SparkpageData) => void;
  onIngestToCoreData?: (input: {
    id?: string;
    title: string;
    format: CoreDataDocumentFormat;
    assetKind: UploadedAssetKind;
    sizeKB: number;
    summary?: string;
    text: string;
    sections?: Array<{ label: string; text: string }>;
    tags?: string[];
    dateAdded?: string;
  }) => Promise<CoreDataManagedDocument>;
  onDeleteFromCoreData?: (docId: string) => Promise<void> | void;
  onSaveToDrive?: (file: DriveAudioFile) => void;
  genTeamAgents?: GenTeamAgent[];
  genTeamChannels?: GenTeamChannel[];
  genTeamMessages?: GenTeamMessage[];
  genTeamTasks?: GenTeamTask[];
  onGenTeamAgentsChange?: React.Dispatch<React.SetStateAction<GenTeamAgent[]>>;
  onGenTeamChannelsChange?: React.Dispatch<React.SetStateAction<GenTeamChannel[]>>;
  onGenTeamMessagesChange?: React.Dispatch<React.SetStateAction<GenTeamMessage[]>>;
  onGenTeamTasksChange?: React.Dispatch<React.SetStateAction<GenTeamTask[]>>;
  identity?: UserIdentity;
  nanobots?: Nanobot[];
  nanobotRuns?: NanobotRun[];
  onReleaseNanobot?: (payload: CreateNanobotPayload) => Promise<Nanobot>;
  onRerunNanobot?: (bot: Nanobot) => Promise<void>;
  onUpdateNanobot?: (
    botId: string,
    patch: {
      name?: string;
      modelId?: string;
      taskPrompt?: string;
      schedule?: Nanobot['schedule'];
      status?: NanobotStatus;
    }
  ) => Promise<void>;
  onDeleteNanobot?: (bot: Nanobot) => Promise<void>;
  nanobotWizardSeed?: NanobotWizardSeed | null;
  onClearNanobotSeed?: () => void;
  enableCrewPlanner?: boolean;
  enableOfficeDiary?: boolean;
  requestedSubTab?: WorkspaceSubTab | null;
  requestedCrewView?: CrewPlannerSubView | null;
  requestedNonce?: number;
}

const WORKSPACE_SUBTABS: readonly WorkspaceSubTab[] = ['deep-search', 'diary', 'scheduler'];

const DIARY_CATEGORIES: readonly OfficeDiaryCategory[] = ['Focus', 'Decision', 'Blocker', 'Note'];

const DIARY_CATEGORY_STYLES: Record<OfficeDiaryCategory, string> = {
  Focus: 'bg-[#0F7FFF]/18 text-[#54B0FF] border-[#54B0FF]/35',
  Decision: 'bg-emerald-500/18 text-emerald-300 border-emerald-400/35',
  Blocker: 'bg-amber-500/18 text-amber-300 border-amber-400/35',
  Note: 'bg-white/10 text-zinc-200 border-white/20'
};

function renderHighlightedText(text: string, keywords: readonly string[]): React.ReactNode {
  if (!text || keywords.length === 0) return text;
  const segments = splitHighlightSegments(text, keywords);
  if (segments.length <= 1 && !segments[0]?.highlighted) return text;
  return segments.map((seg, i) =>
    seg.highlighted ? (
      <mark key={i} className="bg-[#0F7FFF]/35 text-white rounded px-0.5">
        {seg.text}
      </mark>
    ) : (
      <React.Fragment key={i}>{seg.text}</React.Fragment>
    )
  );
}

export const UnifiedWorkspaceView: React.FC<UnifiedWorkspaceViewProps> = ({
  coreDataStore,
  onIngestToNotebook,
  onIngestToCoreData,
  onDeleteFromCoreData,
  onSaveToDrive,
  genTeamAgents,
  genTeamChannels,
  genTeamMessages,
  genTeamTasks,
  onGenTeamAgentsChange,
  onGenTeamChannelsChange,
  onGenTeamMessagesChange,
  onGenTeamTasksChange,
  identity,
  nanobots,
  nanobotRuns,
  onReleaseNanobot,
  onRerunNanobot,
  onUpdateNanobot,
  onDeleteNanobot,
  nanobotWizardSeed,
  onClearNanobotSeed,
  enableCrewPlanner = false,
  enableOfficeDiary = false,
  requestedSubTab,
  requestedCrewView,
  requestedNonce
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const { user, authReady, workspaceRootReady } = useFirebaseAuth();
  const isCloudSynced = Boolean(authReady && user && user.emailVerified && workspaceRootReady);
  const listItemVariants = buildListItemVariants(prefersReduced);
  const tabVariants = buildTabVariants(prefersReduced);

  const activeStore = useMemo(
    () => coreDataStore || createInitialCoreDataStore(),
    [coreDataStore]
  );

  const enabledSubTabs = useMemo(() => {
    const list: Array<{
      id: WorkspaceSubTab;
      label: string;
      icon: React.FC<{ className?: string }>;
    }> = [{ id: 'deep-search', label: 'Deep Search', icon: Globe }];
    if (enableOfficeDiary) {
      list.push({ id: 'diary', label: 'Office Diary', icon: NotebookPen });
    }
    if (enableCrewPlanner) {
      list.push({ id: 'scheduler', label: 'Crew Planner', icon: Layers });
    }
    return list;
  }, [enableOfficeDiary, enableCrewPlanner]);

  // Segmented Sub-Tab Navigation
  const [[activeSubTab, subTabDir], setSubTabState] = useState<[WorkspaceSubTab, 1 | -1]>([
    'deep-search',
    1
  ]);
  const handleChangeSubTab = (next: WorkspaceSubTab) => {
    setSubTabState(([prev]) => {
      if (prev === next) return [prev, 1];
      return [next, getTabTransitionDirection(WORKSPACE_SUBTABS, prev, next)];
    });
  };

  useEffect(() => {
    if (!enabledSubTabs.some((t) => t.id === activeSubTab)) {
      handleChangeSubTab('deep-search');
    }
  }, [enabledSubTabs, activeSubTab]);

  // --- DEEP SEARCH STATE (Starts completely empty - zero seeded sample items) ---
  const [searchResults, setSearchResults] = useState<SearchResultEntry[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [pendingSearchAttachments, setPendingSearchAttachments] = useState<WorkspaceAttachment[]>([]);
  const [sessionAttachments, setSessionAttachments] = useState<WorkspaceAttachment[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [liveResearchSteps, setLiveResearchSteps] = useState<AgentStep[]>([]);
  const [liveTelemetry, setLiveTelemetry] = useState<StageTelemetryMap>(EMPTY_STAGE_TELEMETRY);
  const [liveSelectedStageId, setLiveSelectedStageId] = useState<TimelineStageId | null>('search');
  const [selectedStageBySparkpageId, setSelectedStageBySparkpageId] = useState<
    Record<string, TimelineStageId | null>
  >({});
  const [expandedSparkpages, setExpandedSparkpages] = useState<Record<string, boolean>>({});
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [selectedCitation, setSelectedCitation] = useState<SparkpageCitation | null>(null);
  const [previewImageAttachment, setPreviewImageAttachment] =
    useState<WorkspaceAttachment | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isIngestingFiles, setIsIngestingFiles] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSourcesSheetOpen, setIsSourcesSheetOpen] = useState(false);
  const [sourceNoteTitle, setSourceNoteTitle] = useState('');
  const [sourceNoteText, setSourceNoteText] = useState('');
  const [isSavingSourceNote, setIsSavingSourceNote] = useState(false);
  const sourcesFileInputRef = useRef<HTMLInputElement>(null);

  const [localGenTeamAgents, setLocalGenTeamAgents] = useState<GenTeamAgent[]>(INITIAL_GENTEAM_AGENTS);
  const [localGenTeamChannels, setLocalGenTeamChannels] =
    useState<GenTeamChannel[]>(INITIAL_GENTEAM_CHANNELS);
  const [localGenTeamMessages, setLocalGenTeamMessages] =
    useState<GenTeamMessage[]>(INITIAL_GENTEAM_MESSAGES);
  const [localGenTeamTasks, setLocalGenTeamTasks] = useState<GenTeamTask[]>(INITIAL_GENTEAM_TASKS);

  const effectiveAgents = genTeamAgents ?? localGenTeamAgents;
  const effectiveChannels = genTeamChannels ?? localGenTeamChannels;
  const effectiveMessages = genTeamMessages ?? localGenTeamMessages;
  const effectiveGenTeamTasks = genTeamTasks ?? localGenTeamTasks;
  const setEffectiveAgents = onGenTeamAgentsChange ?? setLocalGenTeamAgents;
  const setEffectiveChannels = onGenTeamChannelsChange ?? setLocalGenTeamChannels;
  const setEffectiveMessages = onGenTeamMessagesChange ?? setLocalGenTeamMessages;
  const setEffectiveGenTeamTasks = onGenTeamTasksChange ?? setLocalGenTeamTasks;

  useEffect(() => {
    if (requestedSubTab && enabledSubTabs.some((t) => t.id === requestedSubTab)) {
      handleChangeSubTab(requestedSubTab);
    }
  }, [requestedSubTab, requestedNonce, enabledSubTabs]);

  // --- DAILY OFFICE DIARY STATE ---
  const [diaryEntries, setDiaryEntries] = useState<OfficeDiaryEntry[]>([]);
  const [isDiaryLoading, setIsDiaryLoading] = useState(false);
  const [isDiaryComposerOpen, setIsDiaryComposerOpen] = useState(false);
  const [isDiaryCalendarOpen, setIsDiaryCalendarOpen] = useState(true);
  const [selectedDiaryDateIso, setSelectedDiaryDateIso] = useState<string | null>(null);
  const [diaryCalendarMonth, setDiaryCalendarMonth] = useState<{
    year: number;
    monthIndex: number;
  }>(() => parseIsoYearMonth(getTodayIsoDate()));
  const [collapsedDiaryEntryIds, setCollapsedDiaryEntryIds] = useState<Record<string, boolean>>({});
  const [editingDiaryId, setEditingDiaryId] = useState<string | null>(null);
  const [diaryTitle, setDiaryTitle] = useState('');
  const [diaryContent, setDiaryContent] = useState('');
  const [diaryDateIso, setDiaryDateIso] = useState<string>(() => getTodayIsoDate());
  const [diaryCategory, setDiaryCategory] = useState<OfficeDiaryCategory>('Focus');
  const [diaryTagsText, setDiaryTagsText] = useState('');
  const [diarySearchFilter, setDiarySearchFilter] = useState('');
  const [debouncedDiaryQuery, setDebouncedDiaryQuery] = useState('');
  const [isDiarySearching, setIsDiarySearching] = useState(false);
  const [diaryCategoryFilter, setDiaryCategoryFilter] = useState<OfficeDiaryCategory | 'All'>('All');
  const [isSavingDiary, setIsSavingDiary] = useState(false);
  const diaryTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSaveQuickSourceNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onIngestToCoreData || (!sourceNoteTitle.trim() && !sourceNoteText.trim()) || isSavingSourceNote) {
      return;
    }
    setIsSavingSourceNote(true);
    triggerHaptic('medium');
    try {
      const title = sourceNoteTitle.trim() || 'Workspace Note';
      const body = sourceNoteText.trim() || title;
      await onIngestToCoreData({
        title,
        format: 'Note',
        assetKind: 'document',
        sizeKB: Math.max(1, Math.round(body.length / 1024)),
        summary: body.slice(0, 140),
        text: `${title}\n\n${body}`,
        tags: ['Workspace Note', 'Sources']
      });
      setSourceNoteTitle('');
      setSourceNoteText('');
      triggerHaptic('success');
    } finally {
      setIsSavingSourceNote(false);
    }
  };

  // --- BACKGROUND TASK SCHEDULER + CREW PLANNER STATE ---
  const [schedulerTasks, setSchedulerTasks] = useState<BackgroundAgentTask[]>([]);
  const [isSchedulerLoading, setIsSchedulerLoading] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [cloudModelId, setCloudModelId] = useState<CloudSchedulerModelId>('claude-3-7-sonnet');
  const [intervalId, setIntervalId] = useState<SchedulerIntervalId>('15s');
  const [assignedAgentId, setAssignedAgentId] = useState<string>(
    effectiveAgents[0]?.id || 'agent-claude'
  );
  const [scheduledSlotIso, setScheduledSlotIso] = useState<string | null>(null);
  const [ragEnabled, setRagEnabled] = useState<boolean>(true);
  const [ragStrategyId, setRagStrategyId] = useState<RagStrategyId>('hybrid-rrf');
  const [schedulerAttachments, setSchedulerAttachments] = useState<WorkspaceAttachment[]>([]);
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const searchScrollRef = useRef<HTMLDivElement>(null);
  const searchFileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordStartRef = useRef<number>(0);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const trimmed = diarySearchFilter.trim();
    if (!trimmed) {
      setDebouncedDiaryQuery('');
      setIsDiarySearching(false);
      return;
    }
    setIsDiarySearching(true);
    const timer = setTimeout(() => {
      setDebouncedDiaryQuery(trimmed);
      setIsDiarySearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [diarySearchFilter]);

  useEffect(() => {
    return () => {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, []);

  // Load Office Diary and Scheduler Tasks on mount
  useEffect(() => {
    let active = true;
    setIsDiaryLoading(true);
    fetchDiaryEntries()
      .then((entries) => {
        if (active) setDiaryEntries(entries);
      })
      .finally(() => {
        if (active) setIsDiaryLoading(false);
      });

    setIsSchedulerLoading(true);
    fetchSchedulerTasks()
      .then((tasks) => {
        if (active) setSchedulerTasks(tasks);
      })
      .finally(() => {
        if (active) setIsSchedulerLoading(false);
      });

    const handleDiaryRefresh = (ev: Event) => {
      const custom = ev as CustomEvent<OfficeDiaryEntry[]>;
      if (Array.isArray(custom.detail)) {
        setDiaryEntries(custom.detail);
      } else {
        void fetchDiaryEntries().then((entries) => {
          if (active) setDiaryEntries(entries);
        });
      }
    };
    window.addEventListener('nudge-diary-refresh', handleDiaryRefresh);

    return () => {
      active = false;
      window.removeEventListener('nudge-diary-refresh', handleDiaryRefresh);
    };
  }, []);

  // Firestore real-time listeners for Office Diary & Scheduler Tasks when authenticated
  useEffect(() => {
    if (!isCloudSynced || !user) return;
    const unsubDiary = subscribeDiaryEntries(user.uid, (cloudEntries) => {
      setDiaryEntries((localEntries) => {
        if (cloudEntries.length === 0 && localEntries.length > 0) {
          // Seed local backend entries upward on initial cloud sign-in
          for (const item of localEntries) {
            void saveDiaryEntryToFirestore(user.uid, item).catch(() => undefined);
          }
          return localEntries;
        }
        const byId = new Map<string, OfficeDiaryEntry>();
        for (const item of localEntries) byId.set(item.id, item);
        for (const item of cloudEntries) byId.set(item.id, item);
        return Array.from(byId.values()).sort((a, b) =>
          b.createdIso.localeCompare(a.createdIso)
        );
      });
    });

    const unsubTasks = subscribeSchedulerTasks(user.uid, (cloudTasks) => {
      setSchedulerTasks((localTasks) => {
        if (cloudTasks.length === 0 && localTasks.length > 0) {
          for (const t of localTasks) {
            void saveSchedulerTaskToFirestore(user.uid, t).catch(() => undefined);
          }
          return localTasks;
        }
        const byId = new Map<string, BackgroundAgentTask>();
        for (const t of localTasks) byId.set(t.id, t);
        for (const t of cloudTasks) {
          const prev = byId.get(t.id);
          byId.set(t.id, prev ? { ...prev, ...t, runHistory: prev.runHistory } : t);
        }
        return Array.from(byId.values()).sort((a, b) =>
          b.createdAtIso.localeCompare(a.createdAtIso)
        );
      });
    });

    return () => {
      unsubDiary();
      unsubTasks();
    };
  }, [isCloudSynced, user]);

  // Live poll Scheduler when user is viewing Scheduler sub-tab so continuous runs update automatically
  useEffect(() => {
    if (activeSubTab !== 'scheduler') return;
    let cancelled = false;
    const refresh = async () => {
      const tasks = await fetchSchedulerTasks();
      if (!cancelled) {
        setSchedulerTasks(tasks);
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeSubTab]);

  const ingestUploadedFiles = async (
    fileList: FileList | File[],
    destination: 'deep-search' | 'scheduler'
  ) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setIsIngestingFiles(true);
    triggerHaptic('selection');

    try {
      const builtAttachments: WorkspaceAttachment[] = [];
      let hasMultimodal = false;

      for (const file of files) {
        const result = await buildWorkspaceAttachmentFromFile(file);
        const att = result.attachment;

        if (att.kind === 'image' || att.kind === 'audio') {
          hasMultimodal = true;
        }
        if (result.driveAudioFile) {
          onSaveToDrive?.(result.driveAudioFile);
        }

        if (onIngestToCoreData) {
          const format: CoreDataDocumentFormat =
            att.kind === 'image'
              ? 'Image'
              : att.kind === 'audio'
              ? 'Audio'
              : result.parsedDocument?.format || 'TXT';

          const managed = await onIngestToCoreData({
            title: file.name,
            format,
            assetKind: att.kind,
            sizeKB: Math.max(1, Math.round(att.sizeBytes / 1024)),
            summary:
              att.kind === 'image'
                ? att.imageMeta?.visualSummary
                : att.kind === 'audio'
                ? `Uploaded audio (${att.audioMeta?.durationLabel || 'clip'})`
                : undefined,
            text:
              result.parsedDocument?.extractedText ||
              att.extractedText ||
              `Uploaded ${file.name}`,
            sections: result.parsedDocument?.sections,
            tags: result.parsedDocument?.tags || [format, 'Workspace Upload']
          });
          if (managed?.id) {
            att.vectorDocId = managed.id;
            att.chunkCount = managed.chunkCount;
          }
        }
        builtAttachments.push(att);
      }

      if (destination === 'scheduler') {
        setSchedulerAttachments((prev) => [...prev, ...builtAttachments]);
        if (hasMultimodal && ragStrategyId === 'hybrid-rrf') {
          setRagStrategyId('multimodal');
        }
      } else {
        setPendingSearchAttachments((prev) => [...prev, ...builtAttachments]);
      }
      setSessionAttachments((prev) => [...prev, ...builtAttachments]);
      triggerHaptic('success');
    } finally {
      setIsIngestingFiles(false);
    }
  };

  const appendRecordedAudioAttachment = async (driveFile: DriveAudioFile) => {
    onSaveToDrive?.(driveFile);
    const t1 = '00:02';
    const t2 = `00:${Math.max(4, Math.min(59, Math.round(driveFile.durationSec * 0.65)))
      .toString()
      .padStart(2, '0')}`;

    const att: WorkspaceAttachment = {
      id: `att-rec-${Date.now()}`,
      kind: 'audio',
      fileName: driveFile.fileName,
      mimeType: driveFile.mimeType,
      sizeBytes: driveFile.sizeBytes,
      sizeLabel: driveFile.sizeLabel,
      formatLabel: 'AUDIO',
      previewUrl: driveFile.audioUrl,
      extractedText: `[${t1}] Voice Note: Recorded workspace query context. [${t2}] Indexed into CoreData.`,
      audioMeta: {
        durationSec: driveFile.durationSec,
        durationLabel: driveFile.durationLabel,
        driveFileId: driveFile.id,
        highlights: [
          { timestamp: t1, speaker: 'Voice Note', text: 'Recorded audio context queued for search.' },
          { timestamp: t2, speaker: 'CoreData', text: 'Audio note indexed into vector database.' }
        ]
      },
      chunkCount: 1
    };

    if (onIngestToCoreData) {
      const doc = await onIngestToCoreData({
        title: driveFile.fileName,
        format: 'Audio',
        assetKind: 'audio',
        sizeKB: Math.max(1, Math.round(driveFile.sizeBytes / 1024)),
        summary: `Recorded Workspace audio (${driveFile.durationLabel})`,
        text: att.extractedText || driveFile.fileName,
        tags: ['Audio', 'Voice Note']
      });
      if (doc?.id) att.vectorDocId = doc.id;
    }

    setPendingSearchAttachments((prev) => [...prev, att]);
    setSessionAttachments((prev) => [...prev, att]);
    triggerHaptic('success');
  };

  const handleToggleRecord = async () => {
    if (isRecording) {
      triggerHaptic('medium');
      setIsRecording(false);
      const elapsed = Math.max(8, Math.round((Date.now() - recordStartRef.current) / 1000));
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      } else {
        const url = createSyntheticMeetingWavUrl(elapsed, searchResults.length + 7);
        const driveFile = createDriveAudioFile({
          fileName: `workspace_clip_${searchResults.length + 1}.wav`,
          origin: 'recorded',
          durationSec: elapsed,
          sizeBytes: 4000 * elapsed + 44,
          audioUrl: url,
          mimeType: 'audio/wav',
          linkedSessionTitle: 'Workspace Audio'
        });
        await appendRecordedAudioAttachment(driveFile);
      }
      return;
    }

    triggerHaptic('heavy');
    recordStartRef.current = Date.now();
    setIsRecording(true);
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const streamMic = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(streamMic);
        chunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          streamMic.getTracks().forEach((t) => t.stop());
          const elapsed = Math.max(6, Math.round((Date.now() - recordStartRef.current) / 1000));
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const url =
            blob.size > 0 ? URL.createObjectURL(blob) : createSyntheticMeetingWavUrl(elapsed, 4);
          const driveFile = createDriveAudioFile({
            fileName: `workspace_clip_${searchResults.length + 1}.webm`,
            origin: 'recorded',
            durationSec: elapsed,
            sizeBytes: blob.size || 4000 * elapsed,
            audioUrl: url,
            mimeType: blob.type || 'audio/webm',
            linkedSessionTitle: 'Workspace Audio'
          });
          void appendRecordedAudioAttachment(driveFile);
          mediaRecorderRef.current = null;
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
      }
    } catch {
      mediaRecorderRef.current = null;
    }
  };

  // --- SUBMIT AGENTIC DEEP SEARCH ---
  const handleRunDeepSearch = async () => {
    const rawText = searchInput.trim();
    const attached = [...pendingSearchAttachments];
    if ((!rawText && attached.length === 0) || isSearching) return;

    const queryText =
      rawText || `Analyze uploaded assets: ${attached.map((a) => a.fileName).join(', ')}`;

    triggerHaptic('medium');
    setSearchInput('');
    setPendingSearchAttachments([]);
    setIsSearching(true);

    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);

    const activeAttachmentChunks: CoreDataChunkEmbedding[] = buildChunksFromWorkspaceAttachments(
      sessionAttachments.length > 0 ? sessionAttachments : attached
    );

    const plan = generateResearchPlan(queryText);
    const stepLatenciesMs = [0, 0, 0, 0, 0];
    let currentStepIdx = 0;
    let currentSteps = advancePipelineStep(initializeAgentSteps(plan), 0, 260);
    let latestTelemetry: StageTelemetryMap = {
      search: { ...EMPTY_STAGE_TELEMETRY.search },
      synthesis: { ...EMPTY_STAGE_TELEMETRY.synthesis },
      drafting: { ...EMPTY_STAGE_TELEMETRY.drafting }
    };

    setLiveSelectedStageId('search');
    setLiveResearchSteps(currentSteps);
    setLiveTelemetry(latestTelemetry);

    const cloudSearchPromise = executeCloudSearchRequest({
      store: activeStore,
      query: queryText,
      strategyId: ragStrategyId,
      attachmentChunks: activeAttachmentChunks
    });

    clockIntervalRef.current = setInterval(() => {
      const stageId = getStageForStepIndex(currentStepIdx);
      stepLatenciesMs[currentStepIdx] = (stepLatenciesMs[currentStepIdx] || 0) + 100;
      const cur = latestTelemetry[stageId];
      latestTelemetry = {
        ...latestTelemetry,
        [stageId]: {
          ...cur,
          elapsedMs: cur.elapsedMs + 100,
          sourceCount:
            stageId === 'search'
              ? Math.min(24, cur.sourceCount + 3)
              : stageId === 'synthesis'
              ? Math.min(18, cur.sourceCount + 2)
              : Math.min(6, cur.sourceCount + 1)
        }
      };
      setLiveTelemetry(latestTelemetry);
    }, 100);

    stepIntervalRef.current = setInterval(async () => {
      currentStepIdx += 1;

      if (currentStepIdx < currentSteps.length) {
        const nextStage = getStageForStepIndex(currentStepIdx);
        setLiveSelectedStageId(nextStage);
        currentSteps = advancePipelineStep(currentSteps, currentStepIdx, 260).map((s, idx) =>
          idx < currentStepIdx ? { ...s, latencyMs: stepLatenciesMs[idx] || 260 } : s
        );
        setLiveResearchSteps(currentSteps);
        return;
      }

      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
      stepIntervalRef.current = null;
      clockIntervalRef.current = null;

      const { sparkpage } = await cloudSearchPromise;

      const finalSteps: AgentStep[] = currentSteps.map((s, idx) => ({
        ...s,
        status: 'completed',
        latencyMs: stepLatenciesMs[idx] || 260
      }));

      const finalTelemetry: StageTelemetryMap = {
        search: { ...latestTelemetry.search, sourceCount: sparkpage.sourcesScannedCount },
        synthesis: {
          ...latestTelemetry.synthesis,
          sourceCount: Math.max(4, activeStore.documents.length)
        },
        drafting: { ...latestTelemetry.drafting, sourceCount: sparkpage.citations.length }
      };

      const entryId = sparkpage.id;
      setSearchResults((prev) => [
        {
          id: entryId,
          query: queryText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          attachments: attached.length > 0 ? attached : undefined,
          sparkpage,
          steps: finalSteps,
          telemetry: finalTelemetry
        },
        ...prev
      ]);
      setExpandedSparkpages((prev) => ({ ...prev, [entryId]: true }));
      setIsSearching(false);
      triggerHaptic('success');
      if (searchScrollRef.current) {
        searchScrollRef.current.scrollTop = 0;
      }
    }, 260);
  };

  // --- DIARY ACTIONS ---
  const handleSaveDiaryEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!diaryTitle.trim() && !diaryContent.trim()) || isSavingDiary) return;

    setIsSavingDiary(true);
    triggerHaptic('medium');
    const tags = diaryTagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editingDiaryId) {
        const updated = await updateDiaryEntryRequest(editingDiaryId, {
          dateIso: diaryDateIso,
          title: diaryTitle.trim() || 'Daily Office Note',
          content: diaryContent.trim(),
          category: diaryCategory,
          tags
        });
        if (updated) {
          setDiaryEntries(updated);
          if (isCloudSynced && user) {
            const target = updated.find((item) => item.id === editingDiaryId);
            if (target) {
              void saveDiaryEntryToFirestore(user.uid, target).catch((err) => {
                console.error('Diary update Firestore sync error:', err);
              });
            }
          }
        }
        setEditingDiaryId(null);
      } else {
        const nextEntries = await createDiaryEntryRequest({
          dateIso: diaryDateIso,
          title: diaryTitle.trim() || 'Daily Office Note',
          content: diaryContent.trim(),
          category: diaryCategory,
          tags
        });
        if (nextEntries) {
          setDiaryEntries(nextEntries);
          const createdEntry = nextEntries[0];
          if (createdEntry) {
            if (isCloudSynced && user) {
              void saveDiaryEntryToFirestore(user.uid, createdEntry).catch((err) => {
                console.error('Diary create Firestore sync error:', err);
              });
            }
            if (onIngestToCoreData) {
              void onIngestToCoreData({
                id: createdEntry.id,
                title: createdEntry.title,
                format: 'Note',
                assetKind: 'document',
                sizeKB: Math.max(1, Math.round((createdEntry.title.length + createdEntry.content.length) / 512)),
                summary: `${createdEntry.category} · ${createdEntry.dateLabel}`,
                text: `${createdEntry.title}\n${createdEntry.content}\n${createdEntry.tags.join(' ')}`,
                tags: ['Office Diary', createdEntry.category, ...createdEntry.tags],
                dateAdded: createdEntry.dateIso
              }).catch(() => undefined);
            }
          }
        }
      }
      if (selectedDiaryDateIso && selectedDiaryDateIso !== diaryDateIso) {
        setSelectedDiaryDateIso(diaryDateIso);
      }
      setDiaryCalendarMonth(parseIsoYearMonth(diaryDateIso));
      setDiaryTitle('');
      setDiaryContent('');
      setDiaryTagsText('');
      setDiaryCategory('Focus');
      setIsDiaryComposerOpen(false);
      triggerHaptic('success');
    } finally {
      setIsSavingDiary(false);
    }
  };

  const handleStartEditDiary = (entry: OfficeDiaryEntry) => {
    setEditingDiaryId(entry.id);
    setDiaryTitle(entry.title);
    setDiaryContent(entry.content);
    setDiaryDateIso(entry.dateIso);
    setDiaryCategory(entry.category);
    setDiaryTagsText(entry.tags.join(', '));
    setIsDiaryComposerOpen(true);
    triggerHaptic('selection');
  };

  const handleDeleteDiary = async (id: string) => {
    triggerHaptic('warning');
    const next = await deleteDiaryEntryRequest(id);
    if (next) setDiaryEntries(next);
    if (isCloudSynced && user) {
      void deleteDiaryEntryFromFirestore(user.uid, id).catch((err) => {
        console.error('Diary delete Firestore sync error:', err);
      });
    }
    if (editingDiaryId === id) {
      setEditingDiaryId(null);
      setDiaryTitle('');
      setDiaryContent('');
    }
  };

  const handleSelectDiaryCalendarDate = (dateIso: string | null) => {
    setSelectedDiaryDateIso(dateIso);
    if (dateIso) {
      setDiaryCalendarMonth(parseIsoYearMonth(dateIso));
      if (!editingDiaryId) {
        setDiaryDateIso(dateIso);
      }
      setCollapsedDiaryEntryIds((prev) => {
        const next = { ...prev };
        for (const entry of diaryEntries) {
          if (entry.dateIso === dateIso) {
            next[entry.id] = false;
          }
        }
        return next;
      });
    }
  };

  const handleCreateNoteForDate = (dateIso: string) => {
    setEditingDiaryId(null);
    setDiaryTitle('');
    setDiaryContent('');
    setDiaryTagsText('');
    setDiaryCategory('Focus');
    setDiaryDateIso(dateIso);
    setSelectedDiaryDateIso(dateIso);
    setDiaryCalendarMonth(parseIsoYearMonth(dateIso));
    setIsDiaryComposerOpen(true);
  };

  const handleToggleDiaryEntryCollapsed = (entryId: string) => {
    triggerHaptic('selection');
    setCollapsedDiaryEntryIds((prev) => ({
      ...prev,
      [entryId]: !prev[entryId]
    }));
  };

  const handleToggleEntriesGroupCollapsed = (entriesInGroup: OfficeDiaryEntry[]) => {
    triggerHaptic('selection');
    setCollapsedDiaryEntryIds((prev) => toggleEntriesCollapsedState(entriesInGroup, prev));
  };

  const calendarScopeSearchResult = useMemo(
    () =>
      searchOfficeDiaryEntries(diaryEntries, activeStore, {
        query: debouncedDiaryQuery,
        category: diaryCategoryFilter
      }),
    [diaryEntries, activeStore, debouncedDiaryQuery, diaryCategoryFilter]
  );

  const diarySearchResult = useMemo(
    () =>
      searchOfficeDiaryEntries(diaryEntries, activeStore, {
        query: debouncedDiaryQuery,
        category: diaryCategoryFilter,
        dateIso: selectedDiaryDateIso || undefined
      }),
    [diaryEntries, activeStore, debouncedDiaryQuery, diaryCategoryFilter, selectedDiaryDateIso]
  );

  const calendarScopeDiaryEntries = calendarScopeSearchResult.entries;
  const filteredDiaryEntries = diarySearchResult.entries;
  const activeDiaryHighlightKeywords = diarySearchResult.matchedKeywords;

  const groupedDiaryDays = useMemo(
    () => groupDiaryEntriesByDate(filteredDiaryEntries),
    [filteredDiaryEntries]
  );

  const allFilteredDateEntriesCollapsed = useMemo(
    () => areAllEntriesCollapsed(filteredDiaryEntries, collapsedDiaryEntryIds),
    [filteredDiaryEntries, collapsedDiaryEntryIds]
  );

  // --- SCHEDULER + CREW PLANNER ACTIONS ---
  const handleCreateScheduledTask = async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    if (!taskPrompt.trim() || isCreatingTask) return false;
    setIsCreatingTask(true);
    triggerHaptic('medium');

    try {
      const next = await createSchedulerTaskRequest({
        title: taskTitle.trim(),
        prompt: taskPrompt.trim(),
        cloudModelId,
        intervalId,
        ragEnabled,
        ragStrategyId,
        attachmentNames: schedulerAttachments.map((a) => a.fileName),
        assignedAgentId,
        scheduledSlotIso: scheduledSlotIso || undefined
      });
      if (next) {
        setSchedulerTasks(next);
        if (isCloudSynced && user && next[0]) {
          void saveSchedulerTaskToFirestore(user.uid, next[0]).catch((err) => {
            console.error('Task create Firestore sync error:', err);
          });
        }
        setTaskTitle('');
        setTaskPrompt('');
        setSchedulerAttachments([]);
        setScheduledSlotIso(null);
        triggerHaptic('success');
        return true;
      }
      return false;
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleToggleTaskStatus = async (task: BackgroundAgentTask) => {
    triggerHaptic('selection');
    const nextStatus = task.status === 'running' ? 'paused' : 'running';
    const next = await toggleSchedulerTaskRequest(task.id, { status: nextStatus });
    if (next) {
      setSchedulerTasks(next);
      if (isCloudSynced && user) {
        const updated = next.find((t) => t.id === task.id);
        if (updated) {
          void saveSchedulerTaskToFirestore(user.uid, updated).catch((err) => {
            console.error('Task toggle Firestore sync error:', err);
          });
        }
      }
    }
  };

  const handleRunTaskNow = async (taskId: string) => {
    triggerHaptic('medium');
    const next = await runSchedulerTaskNowRequest(taskId);
    if (next) {
      setSchedulerTasks(next);
      if (isCloudSynced && user) {
        const updated = next.find((t) => t.id === taskId);
        if (updated) {
          void saveSchedulerTaskToFirestore(user.uid, updated).catch((err) => {
            console.error('Task run Firestore sync error:', err);
          });
        }
      }
      triggerHaptic('success');
    }
  };

  const handleDeleteScheduledTask = async (taskId: string) => {
    triggerHaptic('warning');
    const next = await deleteSchedulerTaskRequest(taskId);
    if (next) setSchedulerTasks(next);
    if (isCloudSynced && user) {
      void deleteSchedulerTaskFromFirestore(user.uid, taskId).catch((err) => {
        console.error('Task delete Firestore sync error:', err);
      });
    }
  };

  const handleReassignScheduledTask = async (
    taskId: string,
    targetAgentId: string,
    targetSlotIso?: string
  ) => {
    const existingTask = schedulerTasks.find((t) => t.id === taskId);
    if (!existingTask) return;
    const targetAgent = effectiveAgents.find((a) => a.id === targetAgentId);
    const nextModelId = mapAgentToCloudModel(targetAgent, existingTask.cloudModelId);
    const nextModelSpec = getCloudSchedulerModelSpec(nextModelId);

    // Optimistic local state update for responsive drag-and-drop & move menu
    setSchedulerTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              assignedAgentId: targetAgentId,
              ...(targetSlotIso ? { scheduledSlotIso: targetSlotIso } : {}),
              cloudModelId: nextModelSpec.id,
              cloudModelLabel: nextModelSpec.label,
              cloudProviderLabel: nextModelSpec.provider
            }
          : t
      )
    );

    const next = await toggleSchedulerTaskRequest(taskId, {
      assignedAgentId: targetAgentId,
      cloudModelId: nextModelId,
      ...(targetSlotIso ? { scheduledSlotIso: targetSlotIso } : {})
    });
    if (next) {
      setSchedulerTasks(next);
      if (isCloudSynced && user) {
        const updated = next.find((t) => t.id === taskId);
        if (updated) {
          void saveSchedulerTaskToFirestore(user.uid, updated).catch((err) => {
            console.error('Task reassign Firestore sync error:', err);
          });
        }
      }
    }
  };

  const runningTasksCount = schedulerTasks.filter((t) => t.status === 'running').length;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingFiles) setIsDraggingFiles(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsDraggingFiles(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFiles(false);
        if (e.dataTransfer.files?.length) {
          void ingestUploadedFiles(
            e.dataTransfer.files,
            activeSubTab === 'scheduler' ? 'scheduler' : 'deep-search'
          );
        }
      }}
      className="relative flex flex-col h-full max-w-4xl mx-auto w-full px-3 @xl:px-5 pt-2.5 pb-24 overflow-hidden"
    >
      {/* Drag-and-Drop Overlay */}
      <AnimatePresence>
        {isDraggingFiles && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-3 z-40 rounded-3xl liquid-glass-elevated border-2 border-dashed border-[#54B0FF]/70 flex flex-col items-center justify-center gap-2 text-center p-6 pointer-events-none"
          >
            <Upload className="w-8 h-8 text-[#54B0FF]" />
            <p className="text-sm font-semibold text-zinc-100">
              Drop Documents, Images, or Audio
            </p>
            <p className="text-xs text-zinc-300">
              PDF · TXT · EPUB · Markdown · Image · Audio
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Show segmented mode bar only when Office Diary or Crew Planner is enabled */}
      {enabledSubTabs.length > 1 && (
        <div className="p-1.5 rounded-2xl liquid-glass mb-2.5 shrink-0">
          <div
            role="tablist"
            aria-label="Workspace modes"
            className={`grid gap-1 p-1 rounded-xl liquid-glass-subtle ${
              enabledSubTabs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
            }`}
          >
            {enabledSubTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeSubTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => handleChangeSubTab(tab.id)}
                  className={`relative min-h-[36px] min-w-0 flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-lg text-[10.5px] @[360px]:text-[11px] font-medium transition-colors whitespace-nowrap ${
                    active ? 'text-zinc-950 font-semibold' : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="workspace-segmented-pill"
                      transition={MOTION_SPRINGS.pill}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-lg liquid-lens-active"
                    />
                  )}
                  <Icon className="relative z-10 w-3 h-3 @[360px]:w-3.5 @[360px]:h-3.5 shrink-0" />
                  <span className="relative z-10 truncate">{tab.label}</span>
                  {tab.id === 'scheduler' && runningTasksCount > 0 && (
                    <span
                      aria-label={`${runningTasksCount} running background tasks`}
                      className={`relative z-10 w-1.5 h-1.5 rounded-full shrink-0 ${
                        active ? 'bg-emerald-700' : 'bg-emerald-400'
                      }`}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-tab Body */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={subTabDir}>
          {/* ==================== SUB-TAB 1: AGENTIC DEEP SEARCH ==================== */}
          {activeSubTab === 'deep-search' && (
            <motion.div
              key="workspace-deep-search"
              custom={subTabDir}
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex-1 min-h-0 flex flex-col overflow-hidden"
            >
              {/* Deep Search Top Bar + Embedded Workspace Sources Trigger */}
              <div className="flex items-center justify-between gap-2 pb-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="w-4 h-4 text-[#54B0FF] shrink-0" />
                  <h2 className="text-xs font-semibold text-zinc-100 truncate">
                    Agentic Deep Search
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setIsSourcesSheetOpen(true);
                  }}
                  className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-100 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Database className="w-3.5 h-3.5 text-[#54B0FF]" />
                  <span>Sources ({activeStore.documents.length})</span>
                </button>
              </div>

              <div ref={searchScrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5 pb-3">
                {/* Live Pipeline Progress */}
                <AnimatePresence>
                  {isSearching && (
                    <motion.div
                      key="deep-search-live"
                      initial={{ opacity: 0, y: prefersReduced ? 0 : 8 }}
                      animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
                      exit={{ opacity: 0, transition: MOTION_TRANSITIONS.elementExit }}
                      className="rounded-2xl liquid-glass p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center gap-2 text-xs font-medium text-[#54B0FF]">
                        <Globe className="w-3.5 h-3.5 animate-pulse" />
                        <span>Running Agentic Deep Search...</span>
                      </div>
                      <AgentTaskTimeline
                        steps={liveResearchSteps}
                        telemetry={liveTelemetry}
                        isResearching={true}
                        selectedStageId={liveSelectedStageId}
                        onSelectStage={(stageId) =>
                          setLiveSelectedStageId((prev) => (prev === stageId ? null : stageId))
                        }
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Clean Empty State when No Search Has Run Yet */}
                {!isSearching && searchResults.length === 0 && (
                  <div className="rounded-2xl liquid-glass p-6 text-center space-y-2.5 mt-2">
                    <div className="w-10 h-10 rounded-2xl liquid-glass-subtle flex items-center justify-center mx-auto text-[#54B0FF]">
                      <Globe className="w-5 h-5" />
                    </div>
                    <h2 className="text-sm font-semibold text-zinc-100">Agentic Deep Search</h2>
                    <p className="text-xs text-zinc-400 leading-relaxed max-w-xs mx-auto">
                      Enter a question or upload context below to synthesize live cloud web sources with your indexed files.
                    </p>
                  </div>
                )}

                {/* User-Triggered Deep Search Results */}
                <AnimatePresence initial={false}>
                  {searchResults.map((entry, idx) => {
                    const sp = entry.sparkpage;
                    const isExpanded = expandedSparkpages[sp.id] ?? true;
                    const isSaved = Boolean(savedIds[sp.id]);

                    return (
                      <motion.article
                        key={entry.id}
                        custom={idx}
                        variants={listItemVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="rounded-2xl liquid-glass p-3.5 space-y-2.5"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-zinc-400 min-w-0">
                              <Globe className="w-3 h-3 text-[#2B98FF] shrink-0" />
                              <span>{entry.timestamp}</span>
                              <span>·</span>
                              <span>{sp.sourcesScannedCount} sources</span>
                              <span>·</span>
                              <span className="text-emerald-400 tabular-nums">
                                {sp.consensusScore}%
                              </span>
                            </div>

                            {/* Save to Vault + Fixed Reliable Collapse Button */}
                            <div className="flex items-center gap-1.5 shrink-0 relative z-10">
                              <motion.button
                                type="button"
                                data-haptic="success"
                                whileTap={
                                  prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }
                                }
                                transition={MOTION_SPRINGS.interactive}
                                onClick={() => {
                                  setSavedIds((prev) => ({ ...prev, [sp.id]: true }));
                                  onIngestToNotebook(sp);
                                }}
                                disabled={isSaved}
                                className={`min-h-[32px] flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                                  isSaved
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                                    : 'liquid-glass-subtle hover:bg-white/10 text-zinc-100'
                                }`}
                              >
                                {isSaved ? (
                                  <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <BookOpen className="w-3 h-3 text-[#2B98FF]" />
                                )}
                                <span>{isSaved ? 'Saved to Sources' : 'Save to Sources'}</span>
                              </motion.button>

                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? `Collapse ${sp.title}` : `Expand ${sp.title}`}
                                title={isExpanded ? 'Collapse insight' : 'Expand insight'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerHaptic('selection');
                                  setExpandedSparkpages((prev) => {
                                    const current = prev[sp.id] ?? true;
                                    return { ...prev, [sp.id]: !current };
                                  });
                                }}
                                className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-full liquid-glass-subtle text-zinc-200 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          <h2 className="text-sm font-semibold text-zinc-50 tracking-tight leading-snug">
                            {sp.title}
                          </h2>
                        </div>

                        <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2">
                          {sp.subtitle || sp.sections[0]?.summary}
                        </p>

                        {/* Collapsible Insight Body */}
                        {isExpanded && (
                          <div className="pt-2.5 border-t border-white/10 space-y-3">
                            <AgentTaskTimeline
                              steps={entry.steps}
                              telemetry={entry.telemetry}
                              isResearching={false}
                              selectedStageId={selectedStageBySparkpageId[entry.id] ?? null}
                              onSelectStage={(stageId) =>
                                setSelectedStageBySparkpageId((prev) => ({
                                  ...prev,
                                  [entry.id]: prev[entry.id] === stageId ? null : stageId
                                }))
                              }
                            />

                            {entry.attachments && entry.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {entry.attachments.map((att) =>
                                  att.kind === 'image' && att.previewUrl ? (
                                    <button
                                      key={att.id}
                                      type="button"
                                      onClick={() => setPreviewImageAttachment(att)}
                                      className="flex items-center gap-1.5 px-2 py-1 rounded-xl liquid-glass-subtle text-[11px] text-zinc-100"
                                    >
                                      <ImageIcon className="w-3 h-3 text-[#54B0FF]" />
                                      <span className="truncate max-w-[140px]">{att.fileName}</span>
                                    </button>
                                  ) : (
                                    <span
                                      key={att.id}
                                      className="flex items-center gap-1.5 px-2 py-1 rounded-xl liquid-glass-subtle text-[11px] text-zinc-200"
                                    >
                                      <FileText className="w-3 h-3 text-[#54B0FF]" />
                                      <span className="truncate max-w-[140px]">{att.fileName}</span>
                                    </span>
                                  )
                                )}
                              </div>
                            )}

                            {sp.sections.map((sec) => (
                              <div key={sec.id} className="space-y-1.5">
                                <h3 className="text-xs font-medium text-zinc-100">{sec.title}</h3>
                                <p className="text-xs text-zinc-300 leading-relaxed">{sec.content}</p>
                                {sec.bullets && (
                                  <ul className="space-y-1 pl-4 list-disc text-xs text-zinc-300">
                                    {sec.bullets.map((b, bIdx) => (
                                      <li key={bIdx}>{b}</li>
                                    ))}
                                  </ul>
                                )}
                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                  {sec.citations.map((cId) => {
                                    const cit = sp.citations.find((c) => c.id === cId);
                                    return (
                                      <button
                                        key={cId}
                                        type="button"
                                        onClick={() => setSelectedCitation(cit || null)}
                                        className="text-[11px] font-mono px-2.5 py-0.5 rounded-full liquid-glass-subtle hover:bg-white/15 text-zinc-200 transition-colors"
                                      >
                                        [{cId}] {cit?.domain}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}

                            {sp.keyTakeaways.length > 0 && (
                              <div className="pt-2 border-t border-white/10 space-y-1">
                                {sp.keyTakeaways.map((t, tIdx) => (
                                  <div
                                    key={tIdx}
                                    className="flex items-start gap-2 text-xs text-zinc-200"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                    <span>{t}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </motion.article>
                    );
                  })}
                </AnimatePresence>
              </div>

              {/* Pending Attachments Strip */}
              <AnimatePresence>
                {pendingSearchAttachments.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="flex flex-wrap items-center gap-1.5 pb-2 shrink-0"
                  >
                    {pendingSearchAttachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-2xl liquid-glass text-[11px] text-zinc-100"
                      >
                        {att.kind === 'audio' ? (
                          <FileAudio className="w-3.5 h-3.5 text-[#54B0FF] shrink-0" />
                        ) : att.kind === 'image' ? (
                          <ImageIcon className="w-3.5 h-3.5 text-[#54B0FF] shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-[#54B0FF] shrink-0" />
                        )}
                        <span className="truncate max-w-[130px]">{att.fileName}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingSearchAttachments((prev) =>
                              prev.filter((item) => item.id !== att.id)
                            )
                          }
                          aria-label={`Remove ${att.fileName}`}
                          className="p-0.5 rounded-full text-zinc-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Clean Phone Deep Search Composer */}
              <div className="relative z-20 flex items-center gap-1.5 p-1.5 rounded-[24px] liquid-glass-elevated shrink-0">
                <input
                  ref={searchFileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.txt,.epub,.md,.csv,.json,application/pdf,text/plain,application/epub+zip,image/*,audio/*"
                  aria-label="Attach documents, images, or audio to deep search"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      void ingestUploadedFiles(e.target.files, 'deep-search');
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => searchFileInputRef.current?.click()}
                  aria-label="Attach files to deep search"
                  title="Upload PDF, TXT, EPUB, Image, or Audio"
                  className="flex items-center justify-center w-9 h-9 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleToggleRecord}
                  aria-label={isRecording ? 'Stop audio recording' : 'Record voice note'}
                  className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors shrink-0 ${
                    isRecording
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'text-zinc-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {isRecording ? (
                    <Square className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>

                <input
                  type="text"
                  aria-label="Agentic deep search query"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleRunDeepSearch();
                    }
                  }}
                  placeholder={
                    isIngestingFiles ? 'Indexing file...' : 'Run Agentic Deep Search...'
                  }
                  className="flex-1 min-w-0 bg-transparent px-2 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden"
                />

                <motion.button
                  type="button"
                  data-haptic="off"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => void handleRunDeepSearch()}
                  disabled={
                    (!searchInput.trim() && pendingSearchAttachments.length === 0) || isSearching
                  }
                  aria-label="Start Deep Search"
                  className="flex items-center justify-center w-9 h-9 rounded-full liquid-accent-glass disabled:opacity-35 transition-opacity shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ==================== SUB-TAB 2: DAILY OFFICE DIARY ==================== */}
          {activeSubTab === 'diary' && (
            <motion.div
              key="workspace-diary"
              custom={subTabDir}
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-0.5 pb-4"
            >
              {/* Diary Header + Search & New Entry Trigger */}
              <div className="p-3 rounded-2xl liquid-glass space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <NotebookPen className="w-4 h-4 text-[#54B0FF] shrink-0" />
                    <span className="text-xs font-semibold text-zinc-100 truncate">
                      Office Diary
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-zinc-400">
                      ({diaryEntries.length})
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (editingDiaryId) {
                          setEditingDiaryId(null);
                          setDiaryTitle('');
                          setDiaryContent('');
                        }
                        setIsDiaryComposerOpen((prev) => !prev);
                      }}
                      className="min-h-[34px] flex items-center gap-1 px-3 py-1 rounded-full liquid-accent-glass text-[11px] font-semibold whitespace-nowrap shrink-0"
                    >
                      {isDiaryComposerOpen ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>Hide Form</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>New Note</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Local Office Diary Search & Category Filter */}
                <div className="flex flex-col gap-2">
                  <div className="relative flex items-center">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 pointer-events-none" />
                    <input
                      type="text"
                      aria-label="Search office diary notes"
                      value={diarySearchFilter}
                      onChange={(e) => setDiarySearchFilter(e.target.value)}
                      placeholder="Search office diary entries or tags..."
                      className="w-full min-h-[38px] pl-9 pr-8 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#54B0FF]"
                    />
                    {diarySearchFilter && (
                      <button
                        type="button"
                        onClick={() => {
                          setDiarySearchFilter('');
                          setDebouncedDiaryQuery('');
                          setIsDiarySearching(false);
                        }}
                        aria-label="Clear diary search"
                        className="absolute right-2.5 p-1 rounded-full text-zinc-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    {(['All', ...DIARY_CATEGORIES] as const).map((cat) => {
                      const active = diaryCategoryFilter === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setDiaryCategoryFilter(cat)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                            active
                              ? 'liquid-lens-active text-zinc-950 font-semibold'
                              : 'liquid-glass-subtle text-zinc-300 hover:text-white'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Collapsible Monthly Calendar Grid */}
              <OfficeDiaryCalendar
                entries={calendarScopeDiaryEntries}
                selectedDateIso={selectedDiaryDateIso}
                onSelectDate={handleSelectDiaryCalendarDate}
                viewYear={diaryCalendarMonth.year}
                viewMonthIndex={diaryCalendarMonth.monthIndex}
                onChangeMonth={(year, monthIndex) =>
                  setDiaryCalendarMonth({ year, monthIndex })
                }
                isOpen={isDiaryCalendarOpen}
                onToggleOpen={() => setIsDiaryCalendarOpen((prev) => !prev)}
                selectedDateEntryCount={filteredDiaryEntries.length}
                allSelectedEntriesCollapsed={allFilteredDateEntriesCollapsed}
                onToggleSelectedEntriesExpanded={() =>
                  handleToggleEntriesGroupCollapsed(filteredDiaryEntries)
                }
                onCreateNoteForDate={handleCreateNoteForDate}
              />

              {/* Quick Entry / Edit Form */}
              <AnimatePresence initial={false}>
                {isDiaryComposerOpen && (
                  <motion.form
                    initial={{ opacity: 0, y: prefersReduced ? 0 : -6 }}
                    animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
                    exit={{ opacity: 0, y: prefersReduced ? 0 : -6, transition: MOTION_TRANSITIONS.elementExit }}
                    onSubmit={handleSaveDiaryEntry}
                    className="p-3.5 rounded-2xl liquid-glass space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-100">
                        {editingDiaryId ? 'Edit Office Log' : 'Log Today’s Entry'}
                      </span>
                      <input
                        type="date"
                        aria-label="Diary entry date"
                        value={diaryDateIso}
                        onChange={(e) => setDiaryDateIso(e.target.value)}
                        className="liquid-glass-subtle rounded-lg px-2 py-1 text-[11px] font-mono text-zinc-100 focus:outline-hidden"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                      {DIARY_CATEGORIES.map((cat) => {
                        const selected = diaryCategory === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setDiaryCategory(cat)}
                            className={`px-2.5 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                              selected
                                ? DIARY_CATEGORY_STYLES[cat]
                                : 'liquid-glass-subtle text-zinc-400 border-white/10'
                            }`}
                          >
                            {cat}
                          </button>
                        );
                      })}
                    </div>

                    <input
                      type="text"
                      aria-label="Diary entry title"
                      value={diaryTitle}
                      onChange={(e) => setDiaryTitle(e.target.value)}
                      placeholder="Headline (e.g., ClaimCenter FNOL sprint sign-off)..."
                      className="w-full liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#54B0FF]"
                    />

                    <textarea
                      ref={diaryTextareaRef}
                      aria-label="Diary entry notes"
                      rows={3}
                      value={diaryContent}
                      onChange={(e) => setDiaryContent(e.target.value)}
                      placeholder="Write daily progress, decisions, or notes..."
                      className="w-full liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#54B0FF] resize-none"
                    />

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        aria-label="Diary tags"
                        value={diaryTagsText}
                        onChange={(e) => setDiaryTagsText(e.target.value)}
                        placeholder="Tags (comma separated, optional)"
                        className="flex-1 min-w-0 liquid-glass-subtle rounded-xl px-3 py-1.5 text-[11px] text-zinc-100 placeholder-zinc-500 focus:outline-hidden"
                      />

                      <button
                        type="submit"
                        disabled={(!diaryTitle.trim() && !diaryContent.trim()) || isSavingDiary}
                        className="min-h-[36px] px-4 py-1.5 rounded-full liquid-accent-glass text-xs font-semibold disabled:opacity-40 whitespace-nowrap shrink-0"
                      >
                        {isSavingDiary ? 'Saving...' : editingDiaryId ? 'Update' : 'Save Note'}
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              {/* Chronological Date-Grouped Diary Entries / Search Results */}
              {isDiaryLoading && diaryEntries.length === 0 ? (
                <div className="p-5 rounded-2xl liquid-glass text-center text-xs text-zinc-400">
                  Loading office diary...
                </div>
              ) : isDiarySearching && filteredDiaryEntries.length === 0 ? (
                <div className="p-5 rounded-2xl liquid-glass text-center text-xs text-zinc-300">
                  Searching office diary entries...
                </div>
              ) : debouncedDiaryQuery.trim().length > 0 && groupedDiaryDays.length === 0 ? (
                <div className="p-5 rounded-2xl liquid-glass text-center space-y-2.5">
                  <Search className="w-7 h-7 text-zinc-400 mx-auto" />
                  <p className="text-xs font-medium text-zinc-200">No matching entries</p>
                  <p className="text-[11px] text-zinc-400">
                    Try another keyword or clear your search to view all diary notes.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        setDiarySearchFilter('');
                        setDebouncedDiaryQuery('');
                        setIsDiarySearching(false);
                      }}
                      className="min-h-[34px] px-3.5 py-1.5 rounded-full liquid-accent-glass text-[11px] font-semibold"
                    >
                      Clear Search
                    </button>
                  </div>
                </div>
              ) : groupedDiaryDays.length === 0 ? (
                <div className="p-5 rounded-2xl liquid-glass text-center space-y-2.5">
                  <Calendar className="w-7 h-7 text-[#54B0FF] mx-auto" />
                  <p className="text-xs font-medium text-zinc-200">
                    {selectedDiaryDateIso
                      ? `No entries logged for ${formatDiaryDateLabel(selectedDiaryDateIso)}`
                      : 'No office diary entries yet'}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {selectedDiaryDateIso
                      ? 'Add a note for this date or clear the date filter to view all logs.'
                      : 'Capture daily priorities, decisions, and blockers or select any calendar day.'}
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleCreateNoteForDate(selectedDiaryDateIso || getTodayIsoDate())
                      }
                      className="min-h-[34px] inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full liquid-accent-glass text-[11px] font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        {selectedDiaryDateIso
                          ? `Log ${formatDiaryDateLabel(selectedDiaryDateIso)}`
                          : 'Write First Note'}
                      </span>
                    </button>
                    {selectedDiaryDateIso && (
                      <button
                        type="button"
                        onClick={() => handleSelectDiaryCalendarDate(null)}
                        className="min-h-[34px] px-3 py-1.5 rounded-full liquid-glass-subtle text-[11px] text-zinc-200 hover:text-white"
                      >
                        Show All Dates
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {groupedDiaryDays.map((group) => {
                    const groupCollapsed = areAllEntriesCollapsed(
                      group.entries,
                      collapsedDiaryEntryIds
                    );
                    return (
                      <section key={group.dateIso} className="space-y-2">
                        {!selectedDiaryDateIso && (
                          <div className="flex items-center justify-between px-1 text-[11px] font-mono text-zinc-400">
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-200 font-medium">{group.dateLabel}</span>
                              <span className="tabular-nums">· {group.entries.length} logs</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleEntriesGroupCollapsed(group.entries)}
                              className="text-[11px] font-sans font-medium text-[#54B0FF] hover:text-white transition-colors"
                            >
                              {groupCollapsed ? 'Expand All' : 'Collapse All'}
                            </button>
                          </div>
                        )}

                        <div className="space-y-2">
                          {group.entries.map((entry) => {
                            const isEntryCollapsed = Boolean(collapsedDiaryEntryIds[entry.id]);
                            return (
                              <article
                                key={entry.id}
                                className="p-3.5 rounded-2xl liquid-glass space-y-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <button
                                    type="button"
                                    aria-expanded={!isEntryCollapsed}
                                    onClick={() => handleToggleDiaryEntryCollapsed(entry.id)}
                                    className="min-w-0 flex-1 text-left cursor-pointer group"
                                  >
                                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                                      <span
                                        className={`px-2 py-0.5 rounded-full border font-sans font-medium ${
                                          DIARY_CATEGORY_STYLES[entry.category]
                                        }`}
                                      >
                                        {entry.category}
                                      </span>
                                      <span className="text-zinc-400 tabular-nums">
                                        {entry.timeLabel}
                                      </span>
                                    </div>
                                    <h3 className="text-xs font-semibold text-zinc-100 group-hover:text-white mt-1 leading-snug">
                                      {renderHighlightedText(
                                        entry.title,
                                        activeDiaryHighlightKeywords
                                      )}
                                    </h3>
                                  </button>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      aria-expanded={!isEntryCollapsed}
                                      aria-label={
                                        isEntryCollapsed
                                          ? `Expand ${entry.title}`
                                          : `Collapse ${entry.title}`
                                      }
                                      onClick={() => handleToggleDiaryEntryCollapsed(entry.id)}
                                      className="p-1.5 rounded-full liquid-glass-subtle text-zinc-300 hover:text-white"
                                    >
                                      {isEntryCollapsed ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronUp className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditDiary(entry)}
                                      aria-label={`Edit ${entry.title}`}
                                      className="p-1.5 rounded-full liquid-glass-subtle text-zinc-300 hover:text-white"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteDiary(entry.id)}
                                      aria-label={`Delete ${entry.title}`}
                                      className="p-1.5 rounded-full liquid-glass-subtle text-zinc-400 hover:text-red-300"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {!isEntryCollapsed && (
                                  <>
                                    {entry.content && (
                                      <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                                        {renderHighlightedText(
                                          entry.content,
                                          activeDiaryHighlightKeywords
                                        )}
                                      </p>
                                    )}

                                    {entry.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1 pt-0.5">
                                        {entry.tags.map((tag) => (
                                          <span
                                            key={tag}
                                            className="px-2 py-0.5 rounded-full liquid-glass-subtle text-[10px] font-mono text-zinc-300"
                                          >
                                            #
                                            {renderHighlightedText(
                                              tag,
                                              activeDiaryHighlightKeywords
                                            )}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ==================== SUB-TAB 3: CREW PLANNER (NANOTEAM + SCHEDULER + RAG PICKER) ==================== */}
          {activeSubTab === 'scheduler' && (
            <motion.div
              key="workspace-scheduler"
              custom={subTabDir}
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex-1 min-h-0 flex flex-col overflow-hidden"
            >
              <CrewPlannerSection
                schedulerTasks={schedulerTasks}
                isSchedulerLoading={isSchedulerLoading}
                activeStore={activeStore}
                ragEnabled={ragEnabled}
                onToggleRagEnabled={() => setRagEnabled((prev) => !prev)}
                ragStrategyId={ragStrategyId}
                onChangeRagStrategyId={setRagStrategyId}
                taskTitle={taskTitle}
                onChangeTaskTitle={setTaskTitle}
                taskPrompt={taskPrompt}
                onChangeTaskPrompt={setTaskPrompt}
                cloudModelId={cloudModelId}
                onChangeCloudModelId={setCloudModelId}
                intervalId={intervalId}
                onChangeIntervalId={setIntervalId}
                assignedAgentId={assignedAgentId}
                onChangeAssignedAgentId={setAssignedAgentId}
                scheduledSlotIso={scheduledSlotIso}
                onChangeScheduledSlotIso={setScheduledSlotIso}
                schedulerAttachments={schedulerAttachments}
                onRemoveAttachment={(attId) =>
                  setSchedulerAttachments((prev) => prev.filter((item) => item.id !== attId))
                }
                onUploadFiles={(files) => void ingestUploadedFiles(files, 'scheduler')}
                isIngestingFiles={isIngestingFiles}
                isCreatingTask={isCreatingTask}
                onCreateTask={(e) => handleCreateScheduledTask(e)}
                onRunTaskNow={(taskId) => handleRunTaskNow(taskId)}
                onToggleTaskStatus={(task) => void handleToggleTaskStatus(task)}
                onDeleteTask={(taskId) => void handleDeleteScheduledTask(taskId)}
                onReassignTask={(taskId, targetAgentId, targetSlotIso) =>
                  void handleReassignScheduledTask(taskId, targetAgentId, targetSlotIso)
                }
                agents={effectiveAgents}
                channels={effectiveChannels}
                messages={effectiveMessages}
                genTeamTasks={effectiveGenTeamTasks}
                onAgentsChange={setEffectiveAgents}
                onChannelsChange={setEffectiveChannels}
                onMessagesChange={setEffectiveMessages}
                onGenTeamTasksChange={setEffectiveGenTeamTasks}
                identity={identity}
                nanobots={nanobots}
                nanobotRuns={nanobotRuns}
                onReleaseNanobot={onReleaseNanobot}
                onRerunNanobot={onRerunNanobot}
                onUpdateNanobot={onUpdateNanobot}
                onDeleteNanobot={onDeleteNanobot}
                nanobotWizardSeed={nanobotWizardSeed}
                onClearNanobotSeed={onClearNanobotSeed}
                requestedView={requestedCrewView}
                requestedViewNonce={requestedNonce}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Citation Detail Sheet */}
      <MotionSheet
        isOpen={Boolean(selectedCitation)}
        onClose={() => setSelectedCitation(null)}
        ariaLabel={selectedCitation ? `Citation ${selectedCitation.domain}` : 'Citation'}
        maxWidthClass="max-w-md"
      >
        {selectedCitation && (
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5">
              <div>
                <div className="text-[11px] font-mono text-zinc-400">
                  Source {selectedCitation.id} · {selectedCitation.domain}
                </div>
                <h4 className="text-sm font-semibold text-zinc-100 mt-0.5">
                  {selectedCitation.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCitation(null)}
                aria-label="Close citation"
                className="text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded-full hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <p className="p-3 rounded-xl liquid-glass-subtle text-xs text-zinc-200 leading-relaxed">
              "{selectedCitation.snippet}"
            </p>

            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-300">
              <span className="text-emerald-400">{selectedCitation.reliabilityScore}% trust</span>
              <a
                href={selectedCitation.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-zinc-100 hover:text-white"
              >
                <span>Open</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </MotionSheet>

      {/* Image Preview Sheet */}
      <MotionSheet
        isOpen={Boolean(previewImageAttachment)}
        onClose={() => setPreviewImageAttachment(null)}
        ariaLabel={previewImageAttachment?.fileName || 'Image preview'}
        maxWidthClass="max-w-lg"
      >
        {previewImageAttachment && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <div className="min-w-0">
                <div className="text-[11px] font-mono text-zinc-400">
                  Multimodal Image ·{' '}
                  {previewImageAttachment.imageMeta
                    ? `${previewImageAttachment.imageMeta.width}×${previewImageAttachment.imageMeta.height}px`
                    : previewImageAttachment.formatLabel}
                </div>
                <h4 className="text-sm font-semibold text-zinc-100 truncate">
                  {previewImageAttachment.fileName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImageAttachment(null)}
                aria-label="Close image preview"
                className="text-zinc-400 hover:text-white px-2 py-1 rounded-full hover:bg-white/10"
              >
                ✕
              </button>
            </div>
            {previewImageAttachment.previewUrl && (
              <img
                src={previewImageAttachment.previewUrl}
                alt={previewImageAttachment.fileName}
                className="w-full max-h-[320px] object-contain rounded-xl bg-black/40 border border-white/10"
              />
            )}
            <p className="text-xs text-zinc-300 leading-relaxed">
              {previewImageAttachment.imageMeta?.visualSummary ||
                previewImageAttachment.extractedText}
            </p>
          </div>
        )}
      </MotionSheet>

      {/* Embedded Workspace Sources Sheet (replaces Notebook tab) */}
      <MotionSheet
        isOpen={isSourcesSheetOpen}
        onClose={() => setIsSourcesSheetOpen(false)}
        ariaLabel="Workspace Sources"
        maxWidthClass="max-w-lg"
      >
        <div className="p-4 space-y-3 max-h-[82vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5">
            <div>
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#54B0FF]" />
                <h4 className="text-sm font-semibold text-zinc-100">Workspace Sources</h4>
              </div>
              <p className="text-[11px] font-mono tabular-nums text-zinc-400 mt-0.5">
                {activeStore.documents.length} indexed docs · {activeStore.chunks.length} vector chunks
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsSourcesSheetOpen(false)}
              aria-label="Close workspace sources"
              className="text-zinc-400 hover:text-white px-2 py-1 rounded-full hover:bg-white/10"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={sourcesFileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.epub,.md,.csv,.json,application/pdf,text/plain,application/epub+zip,image/*,audio/*"
              aria-label="Upload files to Workspace Sources"
              onChange={(e) => {
                if (e.target.files?.length) {
                  void ingestUploadedFiles(e.target.files, 'deep-search');
                }
                e.target.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              disabled={isIngestingFiles}
              onClick={() => sourcesFileInputRef.current?.click()}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full liquid-accent-glass text-xs font-semibold disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isIngestingFiles ? 'Indexing…' : 'Upload PDF / Doc / Audio'}</span>
            </button>
          </div>

          {/* Quick Source Note Capture */}
          {onIngestToCoreData && (
            <form
              onSubmit={(e) => void handleSaveQuickSourceNote(e)}
              className="p-3 rounded-xl liquid-glass-subtle border border-white/10 space-y-2"
            >
              <div className="text-[11px] font-medium text-zinc-300">Add Quick Source Note</div>
              <input
                type="text"
                aria-label="Source note title"
                value={sourceNoteTitle}
                onChange={(e) => setSourceNoteTitle(e.target.value)}
                placeholder="Note title..."
                className="w-full rounded-lg bg-white/[0.04] border border-white/10 px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-[#54B0FF]"
              />
              <textarea
                aria-label="Source note content"
                rows={2}
                value={sourceNoteText}
                onChange={(e) => setSourceNoteText(e.target.value)}
                placeholder="Paste reference notes or specs to index into Workspace Sources..."
                className="w-full rounded-lg bg-white/[0.04] border border-white/10 px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-[#54B0FF] resize-none"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={(!sourceNoteTitle.trim() && !sourceNoteText.trim()) || isSavingSourceNote}
                  className="px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] font-semibold text-zinc-100 disabled:opacity-40"
                >
                  {isSavingSourceNote ? 'Saving…' : 'Save Note to Sources'}
                </button>
              </div>
            </form>
          )}

          {/* Indexed Documents List */}
          {activeStore.documents.length === 0 ? (
            <div className="p-5 rounded-xl liquid-glass-subtle text-center text-xs text-zinc-400">
              No Workspace Sources indexed yet. Upload documents or save notes from Deep Search or Meetings.
            </div>
          ) : (
            <div className="rounded-xl liquid-glass-subtle divide-y divide-white/10 overflow-hidden">
              {activeStore.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="px-3 py-2.5 flex items-start justify-between gap-2.5"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#54B0FF]">
                      <span>{doc.format}</span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-400">{doc.chunkCount} chunks</span>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-400">{doc.sizeKB} KB</span>
                    </div>
                    <div className="text-xs font-medium text-zinc-100 truncate">{doc.title}</div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2">{doc.summary}</p>
                  </div>
                  {onDeleteFromCoreData && (
                    <button
                      type="button"
                      onClick={() => void onDeleteFromCoreData(doc.id)}
                      aria-label={`Delete ${doc.title} from Sources`}
                      className="p-1.5 rounded-full text-zinc-400 hover:text-red-300 hover:bg-white/10 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </MotionSheet>
    </div>
  );
};
