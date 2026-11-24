import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Upload,
  Plus,
  GitCompare,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  FileAudio,
  RotateCcw,
  Sparkles,
  BookOpen,
  Mic,
  Square,
  AlertCircle,
  Settings,
  Radio,
  FileText,
  Download,
  RefreshCw,
  Trash2,
  Archive,
  History,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Square as SquareIcon,
  Clock
} from 'lucide-react';
import {
  AppSettings,
  DictionaryEntry,
  DictionaryTermSource,
  DownloadedMeetingExport,
  DriveAudioFile,
  MeetingSession,
  MeetingItemCategory,
  PaidProviderId,
  ScoutEntryPoint,
  ScoutIntent,
  ScoutLaunchRequest,
  ScoutScope,
  SessionComparison,
  SparkpageData,
  WhisperModelOption
} from '../types/index.ts';
import {
  ScoutInlineTokenChip,
  ScoutOrbTrigger,
  ScoutSelectionToolbar
} from './ScoutTriggers.tsx';
import { detectInlineScoutCommand } from '../utils/scoutAgent.ts';
import {
  INITIAL_MEETING_SESSION,
  buildMeetingSessionFromAudio,
  compareMeetingSessions,
  deleteMeetingSessionFromList,
  formatAudioDuration,
  formatFileSize,
  recordDownloadedExportOnSession,
  retranscribeMeetingSession,
  stripAudioFromMeetingSession
} from '../utils/meetingNotes.ts';
import {
  createDriveAudioFile,
  createSyntheticMeetingWavUrl,
  parseTimestampToSeconds
} from '../utils/audioDrive.ts';
import {
  checkActivityReadiness,
  checkLiveTranscriptionReadiness,
  parseSpeakerLabels
} from '../utils/providerRouting.ts';
import { extractTextFromPdfBytesOrString } from '../utils/dictionaryLearning.ts';
import type { DictationPipelineExecutionResult } from '../utils/localSttEngine.ts';
import type { HubTabId } from './ModelAudioHubView.tsx';
import { LiveTranscriptionStudio, type StudioStreamTurn } from './LiveTranscriptionStudio.tsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  buildListItemVariants
} from '../utils/motion.ts';
import {
  AnimatedCheckmark,
  MotionAlertBanner,
  SkeletonStreamLoader
} from './MotionPrimitives.tsx';
import { InlineAudioPlayer, SeekRequest } from './InlineAudioPlayer.tsx';
import {
  MeetingDeleteSheet,
  MeetingExportSheet,
  MeetingRetranscribeSheet,
  RetranscribeConfirmPayload
} from './MeetingActionSheets.tsx';
import { EXPORT_FORMAT_META, ExportFormatIcon } from './ExportFormatIcon.tsx';
import { ExportJobRequest, ExportProgressModal } from './ExportProgressModal.tsx';
import {
  PrepareExportModal,
  PrepareExportRequest
} from './PrepareExportModal.tsx';
import { BatchExportSheet } from './BatchExportSheet.tsx';

interface MeetingNotesViewProps {
  onSendNotesToVault?: (sparkpage: SparkpageData) => void;
  onOpenInStudio?: (session: MeetingSession) => void;
  onOpenSettings?: () => void;
  onOpenHub?: (tab?: HubTabId) => void;
  onOpenApiKeys?: (focusProvider?: PaidProviderId) => void;
  settings: AppSettings;
  onUpdateSettings?: (patch: Partial<AppSettings>) => void;
  onCompletedDictation?: (result: DictationPipelineExecutionResult) => void;
  onInsertDictatedText?: (text: string) => void;
  driveFiles: DriveAudioFile[];
  onSaveToDrive: (file: DriveAudioFile) => void;
  onDeleteFromDrive?: (id: string) => void;
  dictionaryEntries?: DictionaryEntry[];
  whisperModels?: WhisperModelOption[];
  onLearnTerms?: (payload: {
    text: string;
    source: DictionaryTermSource;
    sourceFile: string;
  }) => { addedCount: number; learnedTerms: string[] };
  sessions?: MeetingSession[];
  onSessionsChange?: React.Dispatch<React.SetStateAction<MeetingSession[]>>;
  baseSessionId?: string;
  onBaseSessionIdChange?: (id: string) => void;
  currentSessionId?: string;
  onCurrentSessionIdChange?: (id: string) => void;
  incomingDriveFile?: DriveAudioFile | null;
  onClearIncomingDriveFile?: () => void;
  enableScoutFeature?: boolean;
  onLaunchScout?: (req: ScoutLaunchRequest) => void;
}

const CATEGORY_LABEL: Record<MeetingItemCategory, string> = {
  decision: 'Decision',
  action: 'Action',
  risk: 'Risk'
};

function readAudioDurationSec(file: File): Promise<{ durationSec: number; url: string }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    let settled = false;

    const finish = (sec: number) => {
      if (settled) return;
      settled = true;
      resolve({ durationSec: sec > 0 ? sec : 380, url });
    };

    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(380);
    setTimeout(() => finish(380), 800);
    audio.src = url;
  });
}

export const MeetingNotesView: React.FC<MeetingNotesViewProps> = ({
  onSendNotesToVault,
  onOpenInStudio,
  onOpenSettings,
  onOpenHub,
  onOpenApiKeys,
  settings,
  onUpdateSettings,
  onCompletedDictation,
  onInsertDictatedText,
  driveFiles,
  onSaveToDrive,
  onDeleteFromDrive,
  dictionaryEntries = [],
  whisperModels = [],
  onLearnTerms,
  sessions: controlledSessions,
  onSessionsChange,
  baseSessionId: controlledBaseId,
  onBaseSessionIdChange,
  currentSessionId: controlledCurrentId,
  onCurrentSessionIdChange,
  incomingDriveFile,
  onClearIncomingDriveFile,
  enableScoutFeature = true,
  onLaunchScout
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const listItemVariants = buildListItemVariants(prefersReduced);
  const [localSessions, setLocalSessions] = useState<MeetingSession[]>([INITIAL_MEETING_SESSION]);
  const [localBaseId, setLocalBaseId] = useState<string>(INITIAL_MEETING_SESSION.id);
  const [localCurrentId, setLocalCurrentId] = useState<string>(INITIAL_MEETING_SESSION.id);

  const sessions = controlledSessions ?? localSessions;
  const setSessions = onSessionsChange ?? setLocalSessions;
  const baseSessionId = controlledBaseId ?? localBaseId;
  const setBaseSessionId = onBaseSessionIdChange ?? setLocalBaseId;
  const currentSessionId = controlledCurrentId ?? localCurrentId;
  const setCurrentSessionId = onCurrentSessionIdChange ?? setLocalCurrentId;
  const [meetingSubView, setMeetingSubView] = useState<'sessions' | 'live-studio'>('sessions');
  const [openedDetailSessionId, setOpenedDetailSessionId] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState<boolean>(() => sessions.length === 0);
  const [composerTarget, setComposerTarget] = useState<'continuation' | 'new'>('continuation');
  const [focusNote, setFocusNote] = useState<string>('');
  const [detailScoutQuery, setDetailScoutQuery] = useState<string>('');
  const [meetingSelectedText, setMeetingSelectedText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingLabel, setProcessingLabel] = useState<string>(
    'Structuring session notes & speaker highlights...'
  );
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [liveErrorMessage, setLiveErrorMessage] = useState<string | null>(null);
  const [learnedBanner, setLearnedBanner] = useState<string | null>(null);
  const [recordingSec, setRecordingSec] = useState<number>(0);
  const [showChangesOnly, setShowChangesOnly] = useState<boolean>(false);
  const [savedToVault, setSavedToVault] = useState<boolean>(false);
  const [seekBySessionId, setSeekBySessionId] = useState<Record<string, SeekRequest>>({});
  const [activeTimestampKey, setActiveTimestampKey] = useState<string | null>(null);

  const [exportSession, setExportSession] = useState<MeetingSession | null>(null);
  const [prepareExportRequest, setPrepareExportRequest] = useState<PrepareExportRequest | null>(null);
  const [activeExportJob, setActiveExportJob] = useState<ExportJobRequest | null>(null);
  const [retranscribeSession, setRetranscribeSession] = useState<MeetingSession | null>(null);
  const [deleteSession, setDeleteSession] = useState<MeetingSession | null>(null);

  // Bulk selection & batch ZIP export state
  const [isBulkSelectMode, setIsBulkSelectMode] = useState<boolean>(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [isBatchExportOpen, setIsBatchExportOpen] = useState<boolean>(false);

  // Meeting Details active tab ('details' | 'history') per session
  const [sessionTabById, setSessionTabById] = useState<Record<string, 'details' | 'history'>>({});
  // Collapsible Transcript Highlights per session (collapsed by default)
  const [expandedTranscriptBySessionId, setExpandedTranscriptBySessionId] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    setSelectedSessionIds(prev => prev.filter(id => sessions.some(s => s.id === id)));
    if (sessions.length === 0) {
      setIsBulkSelectMode(false);
    }
    if (openedDetailSessionId && !sessions.some(s => s.id === openedDetailSessionId)) {
      setOpenedDetailSessionId(null);
    }
  }, [sessions, openedDetailSessionId]);

  const openedDetailSession = useMemo(
    () => (openedDetailSessionId ? sessions.find(s => s.id === openedDetailSessionId) || null : null),
    [sessions, openedDetailSessionId]
  );

  // Scoped Scout keyboard shortcut (Cmd+K / Ctrl+K / Cmd+/) active ONLY inside an opened Meeting Detail view
  useEffect(() => {
    if (
      meetingSubView !== 'sessions' ||
      !openedDetailSession ||
      !enableScoutFeature ||
      !onLaunchScout
    ) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const selection =
          typeof window !== 'undefined' ? window.getSelection()?.toString().trim() || '' : '';
        onLaunchScout({
          query: selection || detailScoutQuery.trim() || openedDetailSession.title,
          noteContext: [openedDetailSession.title, openedDetailSession.summary]
            .filter(Boolean)
            .join('\n')
            .slice(0, 1200),
          entryPoint: 'keyboard_shortcut',
          surface: 'meetings',
          autoRun: Boolean(selection || detailScoutQuery.trim()),
          onInsert: (text) =>
            setDetailScoutQuery((prev) => (prev.trim() ? `${prev.trimEnd()}\n${text}` : text))
        });
      } else if ((e.metaKey || e.ctrlKey) && e.key === '/' && !isInput) {
        e.preventDefault();
        onLaunchScout({
          query: detailScoutQuery.trim() || openedDetailSession.title,
          noteContext: [openedDetailSession.title, openedDetailSession.summary]
            .filter(Boolean)
            .join('\n')
            .slice(0, 1200),
          entryPoint: 'keyboard_shortcut',
          surface: 'meetings',
          autoRun: false,
          onInsert: (text) =>
            setDetailScoutQuery((prev) => (prev.trim() ? `${prev.trimEnd()}\n${text}` : text))
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [meetingSubView, openedDetailSession, enableScoutFeature, onLaunchScout, detailScoutQuery]);

  const selectedSessions = useMemo(
    () => sessions.filter(s => selectedSessionIds.includes(s.id)),
    [sessions, selectedSessionIds]
  );

  const toggleBulkSelectMode = () => {
    triggerHaptic('selection');
    setIsBulkSelectMode(prev => {
      const next = !prev;
      if (next && selectedSessionIds.length === 0) {
        setSelectedSessionIds(sessions.map(s => s.id));
      } else if (!next) {
        setSelectedSessionIds([]);
      }
      return next;
    });
  };

  const toggleSessionSelection = (sessionId: string) => {
    triggerHaptic('selection');
    setSelectedSessionIds(prev =>
      prev.includes(sessionId) ? prev.filter(id => id !== sessionId) : [...prev, sessionId]
    );
  };

  const handleExportCompleted = (sessionId: string, record: DownloadedMeetingExport) => {
    setSessions(old =>
      old.map(s => (s.id === sessionId ? recordDownloadedExportOnSession(s, record) : s))
    );
  };

  const handleBatchExportCompleted = (
    recordsBySession: Record<string, DownloadedMeetingExport[]>
  ) => {
    setSessions(old =>
      old.map(s => {
        const records = recordsBySession[s.id];
        if (!records || records.length === 0) return s;
        return records.reduce((acc, rec) => recordDownloadedExportOnSession(acc, rec), s);
      })
    );
    setIsBulkSelectMode(false);
    setSelectedSessionIds([]);
  };

  const transcriptionReadiness = checkActivityReadiness('transcription', settings);
  const notesReadiness = checkActivityReadiness('meetingNotes', settings);
  const liveReadiness = checkLiveTranscriptionReadiness(settings);
  const pipelinesReady = transcriptionReadiness.ready && notesReadiness.ready;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const latestSession = sessions.length > 0 ? sessions[sessions.length - 1] : undefined;
  const hasMultipleSessions = sessions.length >= 2;

  const baseSession = useMemo(() => {
    if (sessions.length === 0) return undefined;
    if (!hasMultipleSessions) return sessions[0];
    return sessions.find(s => s.id === baseSessionId) || sessions[sessions.length - 2];
  }, [sessions, baseSessionId, hasMultipleSessions]);

  const activeSession = useMemo(() => {
    if (sessions.length === 0) return undefined;
    if (!hasMultipleSessions) return sessions[0];
    return sessions.find(s => s.id === currentSessionId) || latestSession;
  }, [sessions, currentSessionId, latestSession, hasMultipleSessions]);

  const comparison: SessionComparison | null = useMemo(() => {
    if (!hasMultipleSessions || !baseSession || !activeSession || baseSession.id === activeSession.id) {
      return null;
    }
    return compareMeetingSessions(baseSession, activeSession);
  }, [hasMultipleSessions, baseSession, activeSession]);

  const diffByTopicKey = useMemo(() => {
    const map = new Map<string, SessionComparison['diffs'][number]>();
    comparison?.diffs.forEach(d => map.set(d.topicKey, d));
    return map;
  }, [comparison]);

  const triggerDictionaryLearn = (
    corpusText: string,
    source: DictionaryTermSource,
    sourceFile: string
  ) => {
    if (!settings.autoLearnDictionary || !onLearnTerms) return;
    const result = onLearnTerms({ text: corpusText, source, sourceFile });
    if (result.learnedTerms.length > 0) {
      setLearnedBanner(
        `Dictionary learned ${result.learnedTerms.length} ${
          result.learnedTerms.length === 1 ? 'term' : 'terms'
        } (${result.learnedTerms.slice(0, 4).join(', ')}${
          result.learnedTerms.length > 4 ? '...' : ''
        }) from ${sourceFile}`
      );
    }
  };

  const startSessionFromAudio = (
    fileName: string,
    fileSizeBytes: number,
    durationSec: number,
    audioUrl: string,
    origin: 'imported' | 'recorded' | 'sample',
    existingDriveId?: string,
    options?: { transcriptText?: string; sourceKind?: 'audio' | 'live' }
  ) => {
    if (!pipelinesReady && options?.sourceKind !== 'live') return;

    setProcessingLabel('Structuring session notes & speaker highlights...');
    setIsProcessing(true);
    setSavedToVault(false);
    setLiveErrorMessage(null);

    const effectiveTarget = sessions.length === 0 ? 'new' : composerTarget;
    const speakerList = parseSpeakerLabels(settings.speakerLabels);
    const titleHint =
      effectiveTarget === 'new' || !latestSession
        ? 'New Meeting Session'
        : `${latestSession.title} · Part ${sessions.length + 1}`;

    let resolvedDriveId = existingDriveId;
    if (!existingDriveId) {
      const driveEntry = createDriveAudioFile({
        fileName,
        origin,
        durationSec,
        sizeBytes: fileSizeBytes,
        audioUrl,
        linkedSessionTitle: focusNote.trim() || titleHint
      });
      resolvedDriveId = driveEntry.id;
      onSaveToDrive(driveEntry);
    }

    const activeAsrSummary =
      options?.sourceKind === 'live'
        ? liveReadiness.pipelineSummary
        : transcriptionReadiness.pipelineSummary;

    setTimeout(() => {
      let created: MeetingSession;
      if (effectiveTarget === 'new' || !latestSession) {
        created = buildMeetingSessionFromAudio({
          fileName,
          fileSizeBytes,
          durationSec,
          audioUrl,
          driveFileId: resolvedDriveId,
          focusNote,
          sessionNumber: 1,
          speakerLabels: speakerList,
          speakerIdEnabled: settings.diarization,
          transcriptionSummary: activeAsrSummary,
          notesSummary: notesReadiness.pipelineSummary,
          transcriptText: options?.transcriptText,
          sourceKind: options?.sourceKind || 'audio'
        });
        setSessions([created]);
        setBaseSessionId(created.id);
        setCurrentSessionId(created.id);
        setComposerTarget('continuation');
        setIsComposerOpen(true);
      } else {
        const prev = latestSession;
        const nextNum = sessions.length + 1;
        created = buildMeetingSessionFromAudio({
          fileName,
          fileSizeBytes,
          durationSec,
          audioUrl,
          driveFileId: resolvedDriveId,
          previousSession: prev,
          focusNote,
          sessionNumber: nextNum,
          speakerLabels: speakerList,
          speakerIdEnabled: settings.diarization,
          transcriptionSummary: activeAsrSummary,
          notesSummary: notesReadiness.pipelineSummary,
          transcriptText: options?.transcriptText,
          sourceKind: options?.sourceKind || 'audio'
        });
        setSessions(old => [...old, created]);
        setBaseSessionId(prev.id);
        setCurrentSessionId(created.id);
        setIsComposerOpen(false);
      }

      const learnCorpus = [
        created.title,
        created.summary,
        options?.transcriptText || '',
        ...created.items.map(i => i.text),
        ...created.highlights.map(h => h.text)
      ].join(' ');
      triggerDictionaryLearn(
        learnCorpus,
        options?.sourceKind === 'live' ? 'live-stream' : 'audio-meeting',
        fileName
      );

      setFocusNote('');
      setIsProcessing(false);
      triggerHaptic('success');
    }, 300);
  };

  const startSessionFromTranscriptPdf = (
    fileName: string,
    fileSizeBytes: number,
    extractedText: string
  ) => {
    if (!notesReadiness.ready) return;

    setProcessingLabel('Structuring session notes & speaker highlights...');
    setIsProcessing(true);
    setSavedToVault(false);
    setLiveErrorMessage(null);

    const effectiveTarget = sessions.length === 0 ? 'new' : composerTarget;
    const speakerList = parseSpeakerLabels(settings.speakerLabels);
    const estDurationSec = 480;

    setTimeout(() => {
      let created: MeetingSession;
      if (effectiveTarget === 'new' || !latestSession) {
        created = buildMeetingSessionFromAudio({
          fileName,
          fileSizeBytes,
          durationSec: estDurationSec,
          focusNote,
          sessionNumber: 1,
          speakerLabels: speakerList,
          speakerIdEnabled: settings.diarization,
          transcriptionSummary: 'Transcript PDF · Parsed Local',
          notesSummary: notesReadiness.pipelineSummary,
          transcriptText: extractedText,
          sourceKind: 'pdf'
        });
        setSessions([created]);
        setBaseSessionId(created.id);
        setCurrentSessionId(created.id);
        setComposerTarget('continuation');
        setIsComposerOpen(true);
      } else {
        const prev = latestSession;
        const nextNum = sessions.length + 1;
        created = buildMeetingSessionFromAudio({
          fileName,
          fileSizeBytes,
          durationSec: estDurationSec,
          previousSession: prev,
          focusNote,
          sessionNumber: nextNum,
          speakerLabels: speakerList,
          speakerIdEnabled: settings.diarization,
          transcriptionSummary: 'Transcript PDF · Parsed Local',
          notesSummary: notesReadiness.pipelineSummary,
          transcriptText: extractedText,
          sourceKind: 'pdf'
        });
        setSessions(old => [...old, created]);
        setBaseSessionId(prev.id);
        setCurrentSessionId(created.id);
        setIsComposerOpen(false);
      }

      const learnCorpus = `${extractedText} ${created.summary} ${created.items.map(i => i.text).join(' ')}`;
      triggerDictionaryLearn(learnCorpus, 'transcript-pdf', fileName);

      setFocusNote('');
      setIsProcessing(false);
      triggerHaptic('success');
    }, 280);
  };

  useEffect(() => {
    if (!incomingDriveFile) return;
    const existing = sessions.find(s => s.driveFileId === incomingDriveFile.id);
    if (existing) {
      setCurrentSessionId(existing.id);
    } else if (pipelinesReady) {
      startSessionFromAudio(
        incomingDriveFile.fileName,
        incomingDriveFile.sizeBytes,
        incomingDriveFile.durationSec,
        incomingDriveFile.audioUrl,
        incomingDriveFile.origin,
        incomingDriveFile.id
      );
    }
    onClearIncomingDriveFile?.();
  }, [incomingDriveFile]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const isPdfOrText =
      lowerName.endsWith('.pdf') ||
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.md') ||
      file.type === 'application/pdf' ||
      file.type.startsWith('text/');

    if (isPdfOrText) {
      const buffer = await file.arrayBuffer();
      const extracted = extractTextFromPdfBytesOrString(new Uint8Array(buffer), file.name);
      startSessionFromTranscriptPdf(file.name, file.size || 64000, extracted);
    } else {
      const { durationSec, url } = await readAudioDurationSec(file);
      startSessionFromAudio(file.name, file.size, durationSec, url, 'imported');
    }
    e.target.value = '';
  };

  const handleLoadSampleAudio = () => {
    const nextNum = composerTarget === 'new' ? 1 : sessions.length + 1;
    const fileName =
      composerTarget === 'new'
        ? 'claimcenter_subrogation_s1.m4a'
        : `claimcenter_fnol_continuation_s${nextNum}.m4a`;
    const dur = composerTarget === 'new' ? 620 : 545;
    const size = composerTarget === 'new' ? 4800000 : 3600000;
    const wavUrl = createSyntheticMeetingWavUrl(dur, nextNum + 2);
    startSessionFromAudio(fileName, size, dur, wavUrl, 'sample');
  };

  const handleLoadSamplePdf = () => {
    if (!notesReadiness.ready) return;
    const nextNum = composerTarget === 'new' ? 1 : sessions.length + 1;
    const pdfName = `claimcenter_billing_subro_transcript_s${nextNum}.pdf`;
    const samplePdfCorpus =
      'Maya: Jutro digital portal invokes ClaimCenter Composite API to open FNOL claims and BillingCenter ledger sync. ' +
      'Alex: TransactionSet Gosu pre-update rules cap automated indemnity reserves and evaluate FaultRating TC_THIRDPARTY for SubrogationSummary. ' +
      'Priya: IPolicySearchAdapter caches PolicyCenter endorsements so SIU referral scoring completes under SLA.';
    startSessionFromTranscriptPdf(pdfName, 184000, samplePdfCorpus);
  };

  const handleCreateSessionFromLiveStudio = (payload: {
    turns: StudioStreamTurn[];
    combinedSourceText: string;
    combinedTranslatedText: string;
    totalDurationSec: number;
    latestAudioUrl?: string;
  }) => {
    const speakers = parseSpeakerLabels(settings.speakerLabels);
    const nextNum = composerTarget === 'new' ? 1 : sessions.length + 1;
    const formattedLines = payload.turns
      .map((turn, idx) => {
        const speaker = speakers[idx % speakers.length] || 'Speaker 1';
        return turn.translatedText
          ? `${speaker}: ${turn.sourceText} [Translated → ${turn.targetLang}: ${turn.translatedText}]`
          : `${speaker}: ${turn.sourceText}`;
      })
      .join('\n');

    const audioUrl =
      payload.latestAudioUrl ||
      createSyntheticMeetingWavUrl(Math.max(10, payload.totalDurationSec), nextNum + 3);
    const fileName = `live_studio_${liveReadiness.option.provider}_s${nextNum}.webm`;
    const estBytes = Math.max(4096, formattedLines.length * 128);

    setMeetingSubView('sessions');
    startSessionFromAudio(
      fileName,
      estBytes,
      Math.max(10, payload.totalDurationSec),
      audioUrl,
      'recorded',
      undefined,
      {
        transcriptText: formattedLines,
        sourceKind: 'live'
      }
    );
  };

  const handleToggleRecord = async () => {
    if (!pipelinesReady) return;

    if (isRecording) {
      if (timerRef.current) clearInterval(timerRef.current);
      const elapsed = Math.max(8, Math.round((Date.now() - recordingStartRef.current) / 1000));
      setIsRecording(false);
      setRecordingSec(0);

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      } else {
        const nextNum = composerTarget === 'new' ? 1 : sessions.length + 1;
        const wavUrl = createSyntheticMeetingWavUrl(elapsed, nextNum + 5);
        startSessionFromAudio(
          `claimcenter_live_s${nextNum}.wav`,
          4000 * elapsed + 44,
          elapsed,
          wavUrl,
          'recorded'
        );
      }
      return;
    }

    recordingStartRef.current = Date.now();
    setRecordingSec(0);
    setIsRecording(true);
    timerRef.current = setInterval(() => {
      setRecordingSec(Math.round((Date.now() - recordingStartRef.current) / 1000));
    }, 500);

    try {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          const elapsed = Math.max(6, Math.round((Date.now() - recordingStartRef.current) / 1000));
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const nextNum = composerTarget === 'new' ? 1 : sessions.length + 1;
          const url = blob.size > 0 ? URL.createObjectURL(blob) : createSyntheticMeetingWavUrl(elapsed, nextNum);
          startSessionFromAudio(
            `claimcenter_live_s${nextNum}.webm`,
            blob.size || 4000 * elapsed,
            elapsed,
            url,
            'recorded'
          );
          mediaRecorderRef.current = null;
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
      }
    } catch {
      mediaRecorderRef.current = null;
    }
  };

  const handleJumpTimestamp = (sessionId: string, timestamp: string, key: string) => {
    triggerHaptic('selection');
    const seconds = parseTimestampToSeconds(timestamp);
    setActiveTimestampKey(key);
    setSeekBySessionId(prev => ({
      ...prev,
      [sessionId]: { seconds, nonce: Date.now() }
    }));
  };

  const handleSendToVault = (targetSession?: MeetingSession) => {
    const target = targetSession || openedDetailSession || activeSession;
    if (!onSendNotesToVault || !target) return;
    setSavedToVault(true);
    triggerHaptic('success');
    const summaryText =
      comparison && baseSession
        ? `${comparison.addedCount} added, ${comparison.updatedCount} updated, ${comparison.resolvedCount} resolved between Session ${baseSession.sessionNumber} and Session ${target.sessionNumber}.`
        : target.summary;

    onSendNotesToVault({
      id: `mtg-${target.id}`,
      query: target.title,
      title: `${target.title} Notes`,
      subtitle: summaryText,
      generatedDate: 'Just now',
      consensusScore: 98,
      agentExecutionTimeSec: 0.4,
      sourcesScannedCount: sessions.length,
      sections: [
        {
          id: 'mtg-sec-1',
          title: 'Session Notes',
          summary: target.summary,
          content: target.items.map(i => `• [${CATEGORY_LABEL[i.category]}] ${i.text}`).join('\n'),
          citations: [1]
        }
      ],
      citations: [
        {
          id: 1,
          title: target.audioFileName,
          url: 'local://meeting-audio',
          snippet: target.summary,
          domain: 'local-audio',
          crawlTimestamp: target.recordedAt,
          reliabilityScore: 100
        }
      ],
      keyTakeaways: target.items.slice(0, 3).map(i => i.text)
    });
  };

  const handleConfirmRetranscribe = (payload: RetranscribeConfirmPayload) => {
    const target = sessions.find(s => s.id === payload.sessionId);
    if (!target) return;
    setProcessingLabel(`Re-transcribing S${target.sessionNumber} with ${payload.transcriptionModel.name}...`);
    setIsProcessing(true);
    setSavedToVault(false);

    setTimeout(() => {
      const updated = retranscribeMeetingSession({
        session: target,
        transcriptionModel: payload.transcriptionModel,
        approach: payload.approach,
        localWhisperName: payload.localWhisperName,
        customAsrModelId: settings.customEndpoint.transcriptionModelId,
        notesModel: payload.notesModel,
        notesApproach: payload.notesApproach,
        regenerateNotes: payload.regenerateNotes,
        speakerIdEnabled: payload.speakerIdEnabled,
        speakerLabels: parseSpeakerLabels(settings.speakerLabels),
        dictionaryEntries
      });

      setSessions(old => old.map(s => (s.id === updated.id ? updated : s)));
      const learnCorpus = [
        updated.summary,
        ...updated.items.map(i => i.text),
        ...updated.highlights.map(h => h.text)
      ].join(' ');
      triggerDictionaryLearn(learnCorpus, 'audio-meeting', updated.audioFileName);
      setIsProcessing(false);
      triggerHaptic('success');
    }, 280);
  };

  const handleDeleteAudioOnly = (session: MeetingSession) => {
    const driveId = session.driveFileId;
    const sharedByOther = driveId
      ? sessions.some(s => s.id !== session.id && s.driveFileId === driveId)
      : false;
    if (driveId && onDeleteFromDrive && !sharedByOther) {
      onDeleteFromDrive(driveId);
    }
    setSessions(old => old.map(s => (s.id === session.id ? stripAudioFromMeetingSession(s) : s)));
    if (activeTimestampKey?.startsWith(`${session.id}-`)) {
      setActiveTimestampKey(null);
    }
    triggerHaptic('warning');
  };

  const handleDeleteEntireMeeting = (session: MeetingSession, alsoDeleteDriveAudio: boolean) => {
    const driveId = session.driveFileId;
    const sharedByOther = driveId
      ? sessions.some(s => s.id !== session.id && s.driveFileId === driveId)
      : false;
    if (alsoDeleteDriveAudio && driveId && onDeleteFromDrive && !sharedByOther) {
      onDeleteFromDrive(driveId);
    }
    const nextState = deleteMeetingSessionFromList(
      sessions,
      session.id,
      baseSessionId,
      currentSessionId
    );
    setSessions(nextState.sessions);
    setBaseSessionId(nextState.nextBaseId);
    setCurrentSessionId(nextState.nextCurrentId);
    if (openedDetailSessionId === session.id) {
      setOpenedDetailSessionId(null);
    }
    if (nextState.sessions.length === 0) {
      setComposerTarget('new');
      setIsComposerOpen(true);
    }
    setSavedToVault(false);
    triggerHaptic('warning');
  };

  const renderMeetingDetailView = (session: MeetingSession) => {
    const role: 'base' | 'current' =
      hasMultipleSessions && baseSession && session.id === baseSession.id ? 'base' : 'current';
    const visibleItems = session.items.filter(item => {
      if (!showChangesOnly || !comparison || session.id !== activeSession?.id && session.id !== baseSession?.id) {
        return true;
      }
      const diff = diffByTopicKey.get(item.topicKey);
      return diff && diff.changeType !== 'unchanged';
    });

    const linkedDrive = session.driveFileId
      ? driveFiles.find(f => f.id === session.driveFileId)
      : undefined;
    const resolvedAudioUrl = session.audioDeleted
      ? undefined
      : session.audioUrl || linkedDrive?.audioUrl;
    const resolvedDurationSec = session.audioDurationSec || linkedDrive?.durationSec || 760;
    const isPdfSession =
      !resolvedAudioUrl &&
      !session.audioDeleted &&
      (session.audioDurationLabel === 'PDF Transcript' ||
        session.audioFileName.toLowerCase().endsWith('.pdf'));

    const activeCardTab = sessionTabById[session.id] || 'details';
    const historyEntries = session.exportHistory ?? session.downloadedExports ?? [];
    const inlineScoutCmd = enableScoutFeature ? detectInlineScoutCommand(detailScoutQuery) : null;

    const handleCaptureDetailSelection = () => {
      if (!enableScoutFeature || !onLaunchScout || typeof window === 'undefined') return;
      const sel = window.getSelection()?.toString().trim() || '';
      if (sel.length >= 2 && sel.length <= 240) {
        setMeetingSelectedText(sel);
      }
    };

    const launchScopedScout = (
      query: string,
      entryPoint: ScoutEntryPoint,
      intent?: ScoutIntent,
      scope?: ScoutScope
    ) => {
      if (!enableScoutFeature || !onLaunchScout) return;
      onLaunchScout({
        query: query.trim() || session.title,
        noteContext: [session.title, session.summary].filter(Boolean).join('\n').slice(0, 1200),
        entryPoint,
        intent,
        scope,
        surface: 'meetings',
        autoRun: Boolean(query.trim()) || Boolean(intent && intent !== 'custom'),
        onInsert: (text) =>
          setDetailScoutQuery((prev) => (prev.trim() ? `${prev.trimEnd()}\n${text}` : text))
      });
    };

    return (
      <motion.section
        key={`detail-${session.id}`}
        initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: MOTION_OFFSETS.listItemSlidePx }}
        animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
        aria-label={`Session ${session.sessionNumber} meeting detail`}
        className="rounded-2xl liquid-glass border border-white/12 p-4 flex flex-col gap-3 min-w-0"
      >
        {/* Detail Navigation & Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
          <motion.button
            type="button"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={() => {
              setOpenedDetailSessionId(null);
              setMeetingSelectedText('');
              setDetailScoutQuery('');
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Meetings</span>
          </motion.button>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {onOpenInStudio && (
              <motion.button
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                onClick={() => onOpenInStudio(session)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full liquid-accent-glass text-[10.5px] font-semibold transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                <span>Open in Studio</span>
              </motion.button>
            )}

            {onSendNotesToVault && (
              <motion.button
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                onClick={() => handleSendToVault(session)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/[0.1] text-[10.5px] font-medium text-zinc-200 transition-colors"
              >
                {savedToVault ? (
                  <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                ) : (
                  <BookOpen className="w-3 h-3 text-[#54B0FF]" />
                )}
                <span>{savedToVault ? 'Saved to Sources' : 'Save to Sources'}</span>
              </motion.button>
            )}

            {enableScoutFeature && onLaunchScout && (
              <ScoutOrbTrigger
                compact
                label="Scout"
                onLaunch={({ intent, scope, entryPoint }) =>
                  launchScopedScout(detailScoutQuery || session.title, entryPoint, intent, scope)
                }
              />
            )}

            <motion.button
              type="button"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              onClick={() => setExportSession(session)}
              aria-label={`Download transcript or notes for Session ${session.sessionNumber}`}
              title="Download Transcript / Notes"
              className="flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/[0.1] text-[10.5px] font-medium text-zinc-200 transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>Export</span>
            </motion.button>

            <motion.button
              type="button"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              onClick={() => setRetranscribeSession(session)}
              aria-label={`Re-transcribe Session ${session.sessionNumber}`}
              title="Re-transcribe with any model"
              className="flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/[0.1] text-[10.5px] font-medium text-zinc-200 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span className="hidden sm:inline">Re-transcribe</span>
            </motion.button>

            <motion.button
              type="button"
              data-haptic="warning"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              onClick={() => setDeleteSession(session)}
              aria-label={`Delete Session ${session.sessionNumber} or audio`}
              title="Delete meeting or audio"
              className="p-1.5 rounded-full liquid-glass-subtle hover:bg-red-500/20 hover:border-red-400/45 text-zinc-300 hover:text-red-300 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </motion.button>
          </div>
        </div>

        {/* Session Title, Metadata & Audio Player */}
        <div className="border-b border-white/10 pb-3 space-y-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums text-zinc-400">
              <span className="text-[#54B0FF] font-semibold">Session {session.sessionNumber}</span>
              <span>·</span>
              <span>{session.recordedAt}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-zinc-300 truncate">
                {isPdfSession ? (
                  <FileText className="w-3 h-3 shrink-0 text-[#2B98FF]" />
                ) : (
                  <FileAudio className="w-3 h-3 shrink-0 text-[#2B98FF]" />
                )}
                {session.audioFileName}
              </span>
              <span>·</span>
              <span>{session.audioDurationLabel}</span>
              <span>·</span>
              <span>{session.audioSizeLabel}</span>
            </div>
            <h3 className="text-base font-semibold text-zinc-50 mt-1">{session.title}</h3>
          </div>

          {resolvedAudioUrl ? (
            <InlineAudioPlayer
              compact
              audioUrl={resolvedAudioUrl}
              durationSec={resolvedDurationSec}
              fileName={session.audioFileName}
              seekRequest={seekBySessionId[session.id] || null}
            />
          ) : session.audioDeleted ? (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl liquid-glass-subtle text-[11px] font-mono text-zinc-300">
              <span>Audio Recording Deleted</span>
              <span className="text-zinc-400">Notes & transcript retained</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl liquid-glass-subtle text-[11px] font-mono text-zinc-300">
              <span>PDF Transcript</span>
              <span className="text-zinc-400">Parsed</span>
            </div>
          )}

          {/* Meeting Details Inner Tabs: Details | Export History */}
          <div
            role="tablist"
            aria-label={`Session ${session.sessionNumber} views`}
            className="inline-flex items-center gap-1 p-1 rounded-full liquid-glass-subtle mt-1 w-fit"
          >
            <motion.button
              type="button"
              role="tab"
              data-haptic="off"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              aria-selected={activeCardTab === 'details'}
              onClick={() => {
                triggerHaptic('selection');
                setSessionTabById(prev => ({ ...prev, [session.id]: 'details' }));
              }}
              className={`relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                activeCardTab === 'details'
                  ? 'text-zinc-950'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              {activeCardTab === 'details' && (
                <motion.span
                  layoutId={`session-tab-pill-${session.id}`}
                  transition={MOTION_SPRINGS.pill}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full liquid-lens-active"
                />
              )}
              <FileText className="relative z-10 w-3 h-3" />
              <span className="relative z-10">Details</span>
            </motion.button>

            <motion.button
              type="button"
              role="tab"
              data-haptic="off"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              aria-selected={activeCardTab === 'history'}
              onClick={() => {
                triggerHaptic('selection');
                setSessionTabById(prev => ({ ...prev, [session.id]: 'history' }));
              }}
              className={`relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                activeCardTab === 'history'
                  ? 'text-zinc-950'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              {activeCardTab === 'history' && (
                <motion.span
                  layoutId={`session-tab-pill-${session.id}`}
                  transition={MOTION_SPRINGS.pill}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full liquid-lens-active"
                />
              )}
              <History className="relative z-10 w-3 h-3" />
              <span className="relative z-10">Export History</span>
              <span
                className={`relative z-10 font-mono text-[10px] tabular-nums ${
                  activeCardTab === 'history' ? 'text-zinc-700' : 'text-zinc-400'
                }`}
              >
                {historyEntries.length}
              </span>
            </motion.button>
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {activeCardTab === 'history' ? (
            <motion.div
              key={`${session.id}-history`}
              initial={prefersReduced ? { opacity: 0 } : { opacity: 0, x: MOTION_OFFSETS.tabSlidePx }}
              animate={{ opacity: 1, x: 0, transition: MOTION_TRANSITIONS.elementEnter }}
              exit={prefersReduced ? { opacity: 0 } : { opacity: 0, x: -Math.round(MOTION_OFFSETS.tabSlidePx * 0.6), transition: MOTION_TRANSITIONS.elementExit }}
              aria-label={`Export history for Session ${session.sessionNumber}`}
              className="space-y-2"
            >
              {historyEntries.length === 0 ? (
                <div className="p-4 rounded-2xl liquid-glass-subtle text-center space-y-2.5">
                  <p className="text-xs text-zinc-300">
                    No exports recorded yet for Session {session.sessionNumber}.
                  </p>
                  <motion.button
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => setExportSession(session)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full liquid-accent-glass text-[11px] font-semibold transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>Prepare Export</span>
                  </motion.button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {historyEntries.map((entry, hIdx) => {
                    const meta = EXPORT_FORMAT_META[entry.format];
                    return (
                      <motion.div
                        key={entry.id}
                        custom={hIdx}
                        variants={listItemVariants}
                        initial="initial"
                        animate="animate"
                        className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 rounded-2xl liquid-glass-subtle"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <ExportFormatIcon format={entry.format} framed />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-100 truncate">
                              <span className="truncate">{entry.fileName}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-zinc-400 mt-0.5">
                              <span className="text-zinc-300">
                                {entry.kind === 'transcript' ? 'Transcript' : 'Notes'} · {meta.label}
                              </span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {entry.exportedAt}
                              </span>
                              {entry.sizeBytes ? (
                                <>
                                  <span>·</span>
                                  <span>{formatFileSize(entry.sizeBytes)}</span>
                                </>
                              ) : null}
                              {entry.sourceMode === 'batch-zip' && (
                                <>
                                  <span>·</span>
                                  <span className="text-emerald-400">ZIP Bundle</span>
                                </>
                              )}
                              {entry.selectionSummary && (
                                <>
                                  <span>·</span>
                                  <span className="text-zinc-300">{entry.selectionSummary}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <motion.button
                          type="button"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                          onClick={() => {
                            triggerHaptic('selection');
                            setActiveExportJob({
                              mode: 'single',
                              session,
                              kind: entry.kind,
                              format: entry.format,
                              filterOptions: entry.filterOptions,
                              selectionSummary: entry.selectionSummary
                            });
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/[0.12] text-[11px] font-medium text-zinc-100 shrink-0 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download Again</span>
                        </motion.button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={`${session.id}-details`}
              initial={prefersReduced ? { opacity: 0 } : { opacity: 0, x: -MOTION_OFFSETS.tabSlidePx }}
              animate={{ opacity: 1, x: 0, transition: MOTION_TRANSITIONS.elementEnter }}
              exit={prefersReduced ? { opacity: 0 } : { opacity: 0, x: Math.round(MOTION_OFFSETS.tabSlidePx * 0.6), transition: MOTION_TRANSITIONS.elementExit }}
              onMouseUp={handleCaptureDetailSelection}
              onKeyUp={handleCaptureDetailSelection}
              className="flex flex-col gap-3"
            >
              {/* Scoped Diff Comparison Controls when multiple sessions exist */}
              {hasMultipleSessions && baseSession && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl liquid-glass-subtle text-[11px]">
                  <div className="flex flex-wrap items-center gap-2 text-zinc-300">
                    <GitCompare className="w-3.5 h-3.5 text-[#54B0FF] shrink-0" />
                    <span className="text-zinc-400">Compare vs</span>
                    <select
                      aria-label="Baseline session for diff comparison"
                      value={baseSession.id}
                      onChange={(e) => setBaseSessionId(e.target.value)}
                      className="liquid-glass rounded-lg px-2 py-1 text-[11px] text-zinc-100 bg-transparent"
                    >
                      {sessions
                        .filter(s => s.id !== session.id)
                        .map(s => (
                          <option key={s.id} value={s.id} className="bg-zinc-900 text-zinc-100">
                            S{s.sessionNumber} · {s.title}
                          </option>
                        ))}
                    </select>
                    {comparison && (
                      <span className="font-mono tabular-nums text-[10px] text-zinc-400">
                        <span className="text-emerald-400">+{comparison.addedCount}</span> ·{' '}
                        <span className="text-amber-300">{comparison.updatedCount} changed</span> ·{' '}
                        <span className="text-zinc-300">{comparison.resolvedCount} resolved</span>
                      </span>
                    )}
                  </div>
                  {comparison && (
                    <button
                      type="button"
                      onClick={() => setShowChangesOnly(prev => !prev)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                        showChangesOnly
                          ? 'liquid-lens-active text-zinc-950 font-semibold'
                          : 'liquid-glass text-zinc-300 hover:text-white'
                      }`}
                    >
                      {showChangesOnly ? 'Changes Only' : 'Show All Items'}
                    </button>
                  )}
                </div>
              )}

              <p className="text-xs text-zinc-300 leading-relaxed select-text">
                {session.summary}
              </p>

              {/* Strictly Scoped Scout Web Research Bar (Rendered ONLY inside opened meeting details when enabled) */}
              {enableScoutFeature && onLaunchScout && (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      aria-label="Meeting Scout query or /web command"
                      value={detailScoutQuery}
                      onChange={(e) => setDetailScoutQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          launchScopedScout(
                            inlineScoutCmd ? inlineScoutCmd.query : detailScoutQuery || session.title,
                            inlineScoutCmd ? 'slash_chip' : 'unified_search'
                          );
                        }
                      }}
                      placeholder="Ask Scout or type /web <topic> about this meeting (Cmd+K)..."
                      className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-[#54B0FF]"
                    />
                    {inlineScoutCmd && (
                      <ScoutInlineTokenChip
                        text={detailScoutQuery}
                        onTrigger={(q) => launchScopedScout(q || session.title, 'slash_chip')}
                        onClearToken={(cleaned) => setDetailScoutQuery(cleaned)}
                      />
                    )}
                  </div>

                  {meetingSelectedText && (
                    <ScoutSelectionToolbar
                      selectedText={meetingSelectedText}
                      onScoutSelection={(entryPoint) => {
                        const q = meetingSelectedText;
                        setMeetingSelectedText('');
                        launchScopedScout(q, entryPoint);
                      }}
                      onDismiss={() => setMeetingSelectedText('')}
                    />
                  )}
                </div>
              )}

              {/* Structured Meeting Note Items */}
              <div className="space-y-2">
                {visibleItems.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-2">No changed items in this filter.</p>
                ) : (
                  <AnimatePresence initial={false}>
                    {visibleItems.map((item, idx) => {
                      const diff = comparison ? diffByTopicKey.get(item.topicKey) : undefined;
                      const isAdded = role === 'current' && diff?.changeType === 'added';
                      const isUpdatedInCurrent = role === 'current' && diff?.changeType === 'updated';
                      const isUpdatedInBase = role === 'base' && diff?.changeType === 'updated';
                      const isResolvedInBase = role === 'base' && diff?.changeType === 'resolved';

                      return (
                        <motion.div
                          key={item.id}
                          custom={idx}
                          variants={listItemVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className={`p-3 rounded-xl border text-xs ${
                            isAdded
                              ? 'bg-emerald-500/[0.09] border-emerald-400/35'
                              : isUpdatedInCurrent
                              ? 'bg-amber-500/[0.09] border-amber-400/35'
                              : isResolvedInBase
                              ? 'liquid-glass-subtle border-white/10 opacity-75'
                              : 'liquid-glass-subtle border-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wide">
                              <span className="text-zinc-400">{CATEGORY_LABEL[item.category]}</span>
                              {item.owner && (
                                <>
                                  <span className="text-zinc-600">·</span>
                                  <span className="text-zinc-300">{item.owner}</span>
                                </>
                              )}
                            </div>

                            {isAdded && (
                              <span className="text-[10px] font-mono text-emerald-400">New</span>
                            )}
                            {isUpdatedInCurrent && (
                              <span className="text-[10px] font-mono text-amber-400">Changed</span>
                            )}
                            {isUpdatedInBase && activeSession && (
                              <span className="text-[10px] font-mono text-amber-400/80">
                                Updated in S{activeSession.sessionNumber}
                              </span>
                            )}
                            {isResolvedInBase && (
                              <span className="text-[10px] font-mono text-emerald-400/90">Resolved</span>
                            )}
                          </div>

                          <p
                            className={`leading-relaxed select-text ${
                              isResolvedInBase ? 'line-through text-zinc-500' : 'text-zinc-100'
                            }`}
                          >
                            {item.text}
                          </p>

                          {isUpdatedInCurrent && diff?.previousText && (
                            <p className="mt-1.5 pt-1.5 border-t border-amber-400/20 text-[11px] text-zinc-300">
                              <span className="text-zinc-400">Was: </span>
                              <span className="line-through">{diff.previousText}</span>
                            </p>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>

              {/* Collapsible Transcript Section (Collapsed by Default) */}
              {session.highlights.length > 0 && (() => {
                const isTranscriptOpen = expandedTranscriptBySessionId[session.id] ?? false;
                return (
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <button
                      type="button"
                      aria-expanded={isTranscriptOpen}
                      onClick={() => {
                        triggerHaptic('selection');
                        setExpandedTranscriptBySessionId((prev) => ({
                          ...prev,
                          [session.id]: !isTranscriptOpen
                        }));
                      }}
                      className="w-full flex items-center justify-between gap-2 py-1 text-[11px] font-mono text-zinc-300 hover:text-white transition-colors"
                    >
                      <span className="uppercase tracking-wide">
                        Transcript ({session.highlights.length})
                      </span>
                      <span className="flex items-center gap-1 text-[#54B0FF]">
                        <span>{isTranscriptOpen ? 'Hide' : 'Show'}</span>
                        {isTranscriptOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </span>
                    </button>

                    {isTranscriptOpen && (
                      <div className="space-y-1.5">
                        {session.highlights.map((h, i) => {
                          const key = `${session.id}-${i}`;
                          const isActive = activeTimestampKey === key;
                          return (
                            <div
                              key={key}
                              className={`flex items-baseline gap-2 text-[11px] leading-relaxed rounded-xl px-2 py-1 transition-colors ${
                                isActive ? 'bg-white/[0.08] text-zinc-100' : 'text-zinc-300'
                              }`}
                            >
                              {resolvedAudioUrl ? (
                                <motion.button
                                  type="button"
                                  data-haptic="off"
                                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                                  transition={MOTION_SPRINGS.interactive}
                                  onClick={() => handleJumpTimestamp(session.id, h.timestamp, key)}
                                  aria-label={`Jump to audio at ${h.timestamp}`}
                                  className={`font-mono tabular-nums px-2 py-0.5 rounded-full text-[10px] transition-colors shrink-0 ${
                                    isActive
                                      ? 'liquid-lens-active font-semibold'
                                      : 'liquid-glass-subtle hover:bg-white/[0.1] text-zinc-200'
                                  }`}
                                >
                                  {h.timestamp}
                                </motion.button>
                              ) : (
                                <span className="font-mono tabular-nums px-2 py-0.5 rounded-full liquid-glass-subtle text-zinc-400 text-[10px] shrink-0">
                                  {h.timestamp}
                                </span>
                              )}
                              <div className="min-w-0 select-text">
                                {h.speakerTag && (
                                  <span className="font-mono text-zinc-400 mr-1">[{h.speakerTag}]</span>
                                )}
                                <span className="text-zinc-100 font-medium mr-1">{h.speaker}:</span>
                                <span>{h.text}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Downloaded Transcripts & Notes with Distinct File-Type Icons */}
              {session.downloadedExports && session.downloadedExports.length > 0 && (
                <div
                  aria-label={`Downloaded transcripts and exports for Session ${session.sessionNumber}`}
                  className="pt-2 border-t border-white/10 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase text-zinc-400">
                    <span>Downloaded Files</span>
                    <span>{session.downloadedExports.length} saved</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <AnimatePresence initial={false}>
                      {session.downloadedExports.map((exp, expIdx) => {
                        const meta = EXPORT_FORMAT_META[exp.format];
                        return (
                          <motion.button
                            key={exp.id}
                            type="button"
                            custom={expIdx}
                            variants={listItemVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                            onClick={() =>
                              setActiveExportJob({
                                mode: 'single',
                                session,
                                kind: exp.kind,
                                format: exp.format
                              })
                            }
                            title={`Re-download ${exp.fileName}`}
                            aria-label={`Download ${meta.label} ${exp.kind} (${exp.fileName})`}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full liquid-glass-subtle hover:bg-white/[0.1] text-[11px] text-zinc-200 transition-colors max-w-full"
                          >
                            <ExportFormatIcon format={exp.format} className="w-3.5 h-3.5" />
                            <span className="font-mono text-[10px] text-zinc-200 shrink-0">
                              {meta.shortTag}
                            </span>
                            <span className="text-zinc-500 text-[10px] shrink-0">·</span>
                            <span className="truncate text-[11px] text-zinc-300 max-w-[140px]">
                              {exp.kind === 'transcript' ? 'Transcript' : 'Notes'}
                            </span>
                            <Download className="w-3 h-3 text-zinc-400 shrink-0" />
                          </motion.button>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {session.generatedBy && (
                <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-2 text-[10px] font-mono text-zinc-400">
                  <span>ASR: {session.generatedBy.transcriptionSummary}</span>
                  <span>·</span>
                  <span>Notes: {session.generatedBy.notesSummary}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    );
  };

  return (
    <div className="@container flex flex-col h-full max-w-5xl mx-auto w-full px-3 sm:px-5 py-3 pb-24 overflow-y-auto">
      {/* Ultra Clean Meeting Notes Header Bar */}
      <div className="px-4 py-3 mb-3 rounded-2xl liquid-glass space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100 truncate">Meeting Notes</h2>
            <span className="text-[11px] font-mono tabular-nums text-zinc-400">
              {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
            </span>
          </div>

          {/* Integrated Meeting Notes Workspace Switcher: Sessions & Diff vs Live Transcription Studio */}
          <div
            role="tablist"
            aria-label="Meeting Notes workspace mode"
            className="flex items-center gap-1 p-0.5 rounded-xl liquid-glass-subtle"
          >
            <button
              type="button"
              role="tab"
              data-testid="meetings-tab-sessions"
              aria-selected={meetingSubView === 'sessions'}
              onClick={() => {
                triggerHaptic('selection');
                setMeetingSubView('sessions');
              }}
              className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${
                meetingSubView === 'sessions'
                  ? 'bg-white/16 border border-white/25 text-white font-semibold shadow-sm'
                  : 'text-zinc-300 hover:text-white border border-transparent'
              }`}
            >
              Sessions
            </button>
            <button
              type="button"
              role="tab"
              data-testid="meetings-tab-live-studio"
              aria-selected={meetingSubView === 'live-studio'}
              onClick={() => {
                triggerHaptic('selection');
                setMeetingSubView('live-studio');
              }}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${
                meetingSubView === 'live-studio'
                  ? 'liquid-accent-glass text-white font-semibold'
                  : 'text-zinc-300 hover:text-white border border-transparent'
              }`}
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              <span>Live Studio</span>
            </button>
          </div>
        </div>

        {meetingSubView === 'sessions' && !openedDetailSession && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/10">
          {sessions.length > 0 && (
            <motion.button
              type="button"
              data-haptic="off"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={toggleBulkSelectMode}
              aria-pressed={isBulkSelectMode}
              aria-label={isBulkSelectMode ? 'Exit session selection' : 'Toggle session selection checkboxes'}
              title={isBulkSelectMode ? 'Done selecting' : 'Select sessions'}
              className={`flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${
                isBulkSelectMode
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                  : 'liquid-glass-subtle hover:bg-white/[0.1] border-white/12 text-zinc-200'
              }`}
            >
              {isBulkSelectMode ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <SquareIcon className="w-4 h-4" />
              )}
            </motion.button>
          )}

          {sessions.length > 0 && (
            <motion.button
              type="button"
              data-haptic="medium"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={() => {
                setComposerTarget('continuation');
                setIsComposerOpen(prev => (composerTarget === 'continuation' ? !prev : true));
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full liquid-accent-glass text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Continue Session</span>
            </motion.button>
          )}

          <motion.button
            type="button"
            data-haptic="medium"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={() => {
              setComposerTarget('new');
              setIsComposerOpen(prev => (composerTarget === 'new' ? !prev : true));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/[0.1] text-zinc-200 text-xs font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Session</span>
          </motion.button>
        </div>
        )}
      </div>

      {meetingSubView === 'live-studio' ? (
        <LiveTranscriptionStudio
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          onOpenHub={onOpenHub}
          onOpenSettings={onOpenSettings}
          onCompletedDictation={onCompletedDictation}
          onInsertDictatedText={onInsertDictatedText}
          onLearnTerms={(text, sourceFile) =>
            triggerDictionaryLearn(text, 'live-stream', sourceFile)
          }
          onCreateSessionFromStream={handleCreateSessionFromLiveStudio}
        />
      ) : openedDetailSession ? (
        renderMeetingDetailView(openedDetailSession)
      ) : (
        <>
          {/* Settings-only Model / API Key Readiness Notice */}
          <AnimatePresence>
            {(!pipelinesReady || liveErrorMessage) && (
              <MotionAlertBanner
                shakeKey={liveErrorMessage || (!transcriptionReadiness.ready ? transcriptionReadiness.reason : notesReadiness.reason) || 'gate'}
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl liquid-glass border-amber-400/35 mb-3 text-xs"
              >
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {liveErrorMessage ||
                      (!transcriptionReadiness.ready
                        ? transcriptionReadiness.reason
                        : notesReadiness.reason)}
                  </span>
                </div>
                {onOpenSettings && (
                  <motion.button
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={onOpenSettings}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full liquid-lens-active text-[11px] font-semibold transition-colors shrink-0"
                  >
                    <Settings className="w-3 h-3" />
                    <span>Open Settings</span>
                  </motion.button>
                )}
              </MotionAlertBanner>
            )}
          </AnimatePresence>

          {/* Learned Dictionary Feedback */}
          <AnimatePresence>
            {learnedBanner && (
              <motion.div
                initial={{ opacity: 0, y: prefersReduced ? 0 : -6 }}
                animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
                exit={{ opacity: 0, y: prefersReduced ? 0 : -6, transition: MOTION_TRANSITIONS.elementExit }}
                className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl liquid-glass mb-3 text-[11px] text-zinc-200"
              >
                <span className="font-mono">{learnedBanner}</span>
                {onOpenSettings && (
                  <motion.button
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={onOpenSettings}
                    className="text-[#2B98FF] hover:text-white underline underline-offset-2 shrink-0"
                  >
                    View Dictionary
                  </motion.button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline Audio / PDF / Live Stream / Continuation Panel */}
          <AnimatePresence initial={false}>
            {isComposerOpen && (
              <motion.div
                initial={{ opacity: 0, y: prefersReduced ? 0 : -8 }}
                animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
                exit={{ opacity: 0, y: prefersReduced ? 0 : -8, transition: MOTION_TRANSITIONS.elementExit }}
                className="p-4 rounded-2xl liquid-glass-elevated mb-3 space-y-3"
              >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-zinc-100">
                  {composerTarget === 'continuation' && latestSession
                    ? `Continue S${latestSession.sessionNumber}`
                    : 'New Session'}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-zinc-400">
                    {liveReadiness.pipelineSummary}
                  </span>
                  {sessions.length > 0 && (
                    <motion.button
                      type="button"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      onClick={() => setIsComposerOpen(false)}
                      className="text-[11px] text-zinc-300 hover:text-white px-2.5 py-0.5 rounded-full liquid-glass-subtle"
                    >
                      Close
                    </motion.button>
                  )}
                </div>
              </div>

              <input
                type="text"
                aria-label="Continuation session focus note"
                value={focusNote}
                onChange={(e) => setFocusNote(e.target.value)}
                placeholder={
                  composerTarget === 'continuation'
                    ? 'Optional continuation focus...'
                    : 'Optional session focus...'
                }
                className="w-full px-3.5 py-2 rounded-xl liquid-glass-subtle text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-white/30"
              />

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.pdf,.txt,.md,application/pdf"
                aria-label="Upload meeting audio or transcript PDF"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="flex flex-wrap items-center gap-2">
                <motion.button
                  type="button"
                  data-haptic="heavy"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={handleToggleRecord}
                  disabled={isProcessing || !pipelinesReady}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold transition-colors disabled:opacity-40 ${
                    isRecording
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'liquid-accent-glass'
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Square className="w-3 h-3 fill-current" />
                      <span>Stop & Transcribe ({formatAudioDuration(recordingSec)})</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5" />
                      <span>Record Audio</span>
                    </>
                  )}
                </motion.button>

                <motion.button
                  type="button"
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => setMeetingSubView('live-studio')}
                  disabled={isProcessing || isRecording}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full liquid-glass-subtle hover:bg-white/[0.1] border border-white/12 text-zinc-100 text-xs font-medium transition-colors disabled:opacity-40"
                >
                  <Radio className="w-3.5 h-3.5 text-[#2B98FF]" />
                  <span>Open Live Studio (A→B)</span>
                </motion.button>

                <motion.button
                  type="button"
                  data-haptic="medium"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing || !notesReadiness.ready || isRecording}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full liquid-glass-subtle hover:bg-white/[0.1] text-zinc-100 text-xs font-medium transition-colors disabled:opacity-40"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>
                    {isProcessing ? 'Processing...' : 'Upload Audio / PDF'}
                  </span>
                </motion.button>

                <motion.button
                  type="button"
                  data-haptic="medium"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={handleLoadSampleAudio}
                  disabled={isProcessing || !pipelinesReady || isRecording}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full liquid-glass-subtle hover:bg-white/[0.1] text-zinc-200 text-xs font-medium transition-colors disabled:opacity-40"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#2B98FF]" />
                  <span>
                    {composerTarget === 'continuation'
                      ? `Simulate Continuation (Session ${sessions.length + 1})`
                      : 'Use Sample Audio'}
                  </span>
                </motion.button>

                <motion.button
                  type="button"
                  data-haptic="medium"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={handleLoadSamplePdf}
                  disabled={isProcessing || !notesReadiness.ready || isRecording}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full liquid-glass-subtle hover:bg-white/[0.1] text-zinc-200 text-xs font-medium transition-colors disabled:opacity-40"
                >
                  <FileText className="w-3.5 h-3.5 text-zinc-300" />
                  <span>Simulate Transcript PDF</span>
                </motion.button>
              </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Processing Skeleton Shimmer */}
          <AnimatePresence>
            {isProcessing && (
              <div className="mb-3">
                <SkeletonStreamLoader
                  key="meeting-processing-skeleton"
                  label={processingLabel}
                  lines={3}
                />
              </div>
            )}
          </AnimatePresence>

          {/* Bulk Selection Action Bar */}
          <AnimatePresence>
            {isBulkSelectMode && sessions.length > 0 && (
              <motion.div
                initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
                exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -6, transition: MOTION_TRANSITIONS.elementExit }}
                aria-label="Bulk selection controls"
                className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl liquid-glass border-emerald-400/35 mb-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-emerald-300 font-mono tabular-nums">
                    {selectedSessions.length} of {sessions.length} selected
                  </span>
                  <motion.button
                    type="button"
                    data-haptic="off"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => {
                      triggerHaptic('selection');
                      setSelectedSessionIds(
                        selectedSessions.length === sessions.length ? [] : sessions.map(s => s.id)
                      );
                    }}
                    className="px-3 py-1 rounded-full liquid-glass-subtle text-[11px] text-zinc-200 hover:text-white transition-colors"
                  >
                    {selectedSessions.length === sessions.length ? 'Clear All' : 'Select All'}
                  </motion.button>
                </div>

                <motion.button
                  type="button"
                  data-haptic="off"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  disabled={selectedSessions.length === 0}
                  onClick={() => {
                    triggerHaptic('medium');
                    setIsBatchExportOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full liquid-accent-glass text-xs font-semibold disabled:opacity-40 transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Batch Export (.zip)</span>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Clean Clickable Sessions List (details & export history moved to opened Detail screen) */}
          {sessions.length === 0 ? (
            <div className="rounded-2xl liquid-glass p-8 text-center space-y-2">
              <div className="text-sm font-medium text-zinc-100">No meetings yet</div>
              <p className="text-xs text-zinc-400">
                Record audio, stream live transcription, upload a file, or load a sample session above.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
              {sessions.map((session) => {
                const isSelectedForBulk = selectedSessionIds.includes(session.id);
                return (
                  <div
                    key={session.id}
                    className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${
                      isBulkSelectMode && isSelectedForBulk
                        ? 'bg-emerald-500/[0.08]'
                        : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    {isBulkSelectMode && (
                      <button
                        type="button"
                        onClick={() => toggleSessionSelection(session.id)}
                        aria-label={
                          isSelectedForBulk
                            ? `Deselect Session ${session.sessionNumber}`
                            : `Select Session ${session.sessionNumber}`
                        }
                        aria-pressed={isSelectedForBulk}
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-lg border transition-colors shrink-0 ${
                          isSelectedForBulk
                            ? 'bg-emerald-500/20 border-emerald-400/55 text-emerald-200'
                            : 'liquid-glass-subtle border-white/15 text-zinc-300 hover:text-white'
                        }`}
                      >
                        {isSelectedForBulk ? (
                          <CheckSquare className="w-3.5 h-3.5" />
                        ) : (
                          <SquareIcon className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        if (isBulkSelectMode) {
                          toggleSessionSelection(session.id);
                        } else {
                          setCurrentSessionId(session.id);
                          setOpenedDetailSessionId(session.id);
                        }
                      }}
                      className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums text-zinc-400">
                          <span className="text-[#54B0FF] font-semibold">
                            S{session.sessionNumber}
                          </span>
                          <span>·</span>
                          <span>{session.recordedAt}</span>
                          <span>·</span>
                          <span className="truncate max-w-[180px]">{session.audioFileName}</span>
                          <span>·</span>
                          <span>{session.audioDurationLabel}</span>
                          <span>·</span>
                          <span>{session.items.length} items</span>
                        </div>
                        <div className="text-sm font-semibold text-zinc-100 truncate">
                          {session.title}
                        </div>
                      </div>
                      {!isBulkSelectMode && (
                        <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Action Sheets: Export, Prepare Export, Batch ZIP, Progress, Re-transcribe, Delete */}
      <MeetingExportSheet
        session={exportSession}
        onClose={() => setExportSession(null)}
        onPrepareExport={(req) => setPrepareExportRequest(req)}
      />

      <PrepareExportModal
        request={prepareExportRequest}
        dictionaryEntries={dictionaryEntries}
        onClose={() => setPrepareExportRequest(null)}
        onBackToFormats={(targetSession) => setExportSession(targetSession)}
        onConfirmExport={(payload) =>
          setActiveExportJob({
            mode: 'single',
            session: payload.session,
            kind: payload.kind,
            format: payload.format,
            filterOptions: payload.filterOptions,
            selectionSummary: payload.selectionSummary
          })
        }
      />

      <BatchExportSheet
        isOpen={isBatchExportOpen}
        selectedSessions={selectedSessions}
        onClose={() => setIsBatchExportOpen(false)}
        onStartBatchExport={(payload) =>
          setActiveExportJob({
            mode: 'batch-zip',
            sessions: payload.sessions,
            transcriptFormats: payload.transcriptFormats,
            notesFormats: payload.notesFormats
          })
        }
      />

      <ExportProgressModal
        job={activeExportJob}
        dictionaryEntries={dictionaryEntries}
        onClose={() => setActiveExportJob(null)}
        onBackToFormats={(targetSession) => setExportSession(targetSession)}
        onExportCompleted={handleExportCompleted}
        onBatchExportCompleted={handleBatchExportCompleted}
      />

      <MeetingRetranscribeSheet
        session={retranscribeSession}
        settings={settings}
        driveFiles={driveFiles}
        whisperModels={whisperModels}
        onClose={() => setRetranscribeSession(null)}
        onConfirm={handleConfirmRetranscribe}
        onOpenApiKeys={onOpenApiKeys}
        onOpenSettings={onOpenSettings}
      />

      <MeetingDeleteSheet
        session={deleteSession}
        driveFiles={driveFiles}
        onClose={() => setDeleteSession(null)}
        onDeleteAudioOnly={handleDeleteAudioOnly}
        onDeleteEntireMeeting={handleDeleteEntireMeeting}
      />
    </div>
  );
};
