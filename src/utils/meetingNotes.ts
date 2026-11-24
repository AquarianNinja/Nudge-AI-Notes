import {
  ActivityModelOption,
  DictionaryEntry,
  DownloadedMeetingExport,
  DriveAudioFile,
  ExecutionApproach,
  MeetingNoteItem,
  MeetingSession,
  MeetingTranscriptHighlight,
  SessionComparison,
  SessionDiffItem
} from '../types/index.ts';
import { APPROACH_LABELS } from './providerRouting.ts';

export function formatAudioDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '00:00';
  const rounded = Math.round(totalSeconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function computeBoundedTimestamp(durationSec: number, fraction: number): string {
  const safeDur = Math.max(4, Math.round(durationSec || 60));
  const target = Math.max(1, Math.min(safeDur - 1, Math.round(safeDur * fraction)));
  return formatAudioDuration(target);
}

export const INITIAL_MEETING_SESSION: MeetingSession = {
  id: 'mtg-session-1',
  sessionNumber: 1,
  title: 'ClaimCenter FNOL & Reserve Triage',
  audioFileName: 'claimcenter_fnol_review_s1.m4a',
  audioDurationLabel: '12:40',
  audioDurationSec: 760,
  audioSizeLabel: '6.4 MB',
  driveFileId: 'drive-sample-fnol-s1',
  recordedAt: '10:00',
  summary:
    'Aligned on routing mobile FNOL through ClaimCenter Cloud API while keeping InitialReserve rules in Gosu. Pending PolicyCenter snapshot timeout SLA.',
  items: [
    {
      id: 's1-item-1',
      topicKey: 'fnol-intake-channel',
      category: 'decision',
      text: 'Route Jutro mobile FNOL submissions through ClaimCenter Cloud API v10.',
      owner: 'Maya'
    },
    {
      id: 's1-item-2',
      topicKey: 'reserve-authority',
      category: 'decision',
      text: 'Keep InitialReserve authority limits in Gosu pre-update rules.',
      owner: 'Alex'
    },
    {
      id: 's1-item-3',
      topicKey: 'policycenter-timeout',
      category: 'action',
      text: 'Benchmark PolicyCenter coverage snapshot SLA under 800ms.',
      owner: 'Priya'
    },
    {
      id: 's1-item-4',
      topicKey: 'subrogation-referral',
      category: 'risk',
      text: 'Third-party fault flag relies on manual adjuster review at intake.',
      owner: 'Alex'
    }
  ],
  highlights: [
    {
      timestamp: '02:14',
      speaker: 'Maya',
      text: 'Composite /claim/v1/claims payload handles vehicle + exposure creation in one call.'
    },
    {
      timestamp: '07:48',
      speaker: 'Priya',
      text: 'PolicyCenter endorsement lookup spikes above 1.2s during batch FNOL loads.'
    }
  ],
  downloadedExports: [
    {
      id: 'exp-s1-tr-docx',
      kind: 'transcript',
      format: 'docx',
      fileName: 'claimcenter_fnol_reserve_triage_s1_transcript.docx',
      exportedAt: '10:04',
      sizeBytes: 3420,
      sourceMode: 'single',
      selectionSummary: 'All 2 speaker turns'
    },
    {
      id: 'exp-s1-tr-json',
      kind: 'transcript',
      format: 'json',
      fileName: 'claimcenter_fnol_reserve_triage_s1_transcript.json',
      exportedAt: '10:03',
      sizeBytes: 845,
      sourceMode: 'single',
      selectionSummary: 'All 2 speaker turns'
    },
    {
      id: 'exp-s1-tr-markdown',
      kind: 'transcript',
      format: 'markdown',
      fileName: 'claimcenter_fnol_reserve_triage_s1_transcript.md',
      exportedAt: '10:02',
      sizeBytes: 492,
      sourceMode: 'single',
      selectionSummary: 'All 2 speaker turns'
    }
  ],
  exportHistory: [
    {
      id: 'hist-s1-tr-docx-1',
      kind: 'transcript',
      format: 'docx',
      fileName: 'claimcenter_fnol_reserve_triage_s1_transcript.docx',
      exportedAt: '10:04',
      sizeBytes: 3420,
      sourceMode: 'single',
      selectionSummary: 'All 2 speaker turns'
    },
    {
      id: 'hist-s1-tr-json-1',
      kind: 'transcript',
      format: 'json',
      fileName: 'claimcenter_fnol_reserve_triage_s1_transcript.json',
      exportedAt: '10:03',
      sizeBytes: 845,
      sourceMode: 'single',
      selectionSummary: 'All 2 speaker turns'
    },
    {
      id: 'hist-s1-tr-markdown-1',
      kind: 'transcript',
      format: 'markdown',
      fileName: 'claimcenter_fnol_reserve_triage_s1_transcript.md',
      exportedAt: '10:02',
      sizeBytes: 492,
      sourceMode: 'single',
      selectionSummary: 'All 2 speaker turns'
    }
  ]
};

export interface CreateMeetingSessionInput {
  fileName: string;
  fileSizeBytes: number;
  durationSec: number;
  audioUrl?: string;
  driveFileId?: string;
  previousSession?: MeetingSession;
  focusNote?: string;
  sessionNumber: number;
  recordedAt?: string;
  speakerLabels?: string[];
  speakerIdEnabled?: boolean;
  transcriptionSummary?: string;
  notesSummary?: string;
  transcriptText?: string;
  sourceKind?: 'audio' | 'pdf' | 'live';
}

export function buildMeetingSessionFromAudio(input: CreateMeetingSessionInput): MeetingSession {
  const {
    fileName,
    fileSizeBytes,
    durationSec,
    audioUrl,
    driveFileId,
    previousSession,
    focusNote,
    sessionNumber,
    recordedAt,
    speakerLabels = ['Maya (Architect)', 'Alex (Tech Lead)', 'Priya (Claims Ops)'],
    speakerIdEnabled = true,
    transcriptionSummary = 'Local · WhisperKit + FluidAudio Speaker ID',
    notesSummary = 'Local · Llama 3 8B (MLX Local)',
    transcriptText,
    sourceKind = 'audio'
  } = input;

  const s1Speaker = speakerIdEnabled ? speakerLabels[0] || 'Speaker 1' : 'Transcript';
  const s2Speaker = speakerIdEnabled ? speakerLabels[1] || 'Speaker 2' : 'Transcript';
  const s3Speaker = speakerIdEnabled ? speakerLabels[2] || 'Speaker 3' : 'Transcript';

  const durationLabel = sourceKind === 'pdf' ? 'PDF Transcript' : formatAudioDuration(durationSec);
  const sizeLabel = formatFileSize(fileSizeBytes);
  const noteHint = (focusNote || '').trim();
  const lowerCombined = `${fileName} ${noteHint} ${transcriptText || ''}`.toLowerCase();
  const timestamp =
    recordedAt ||
    new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

  if (!previousSession) {
    const isSubro = lowerCombined.includes('subro');
    const items: MeetingNoteItem[] = isSubro
      ? [
          {
            id: `s${sessionNumber}-1`,
            topicKey: 'subrogation-eligibility',
            category: 'decision',
            text: 'Auto-open SubrogationSummary when FaultRating equals TC_THIRDPARTY.',
            owner: 'Alex'
          },
          {
            id: `s${sessionNumber}-2`,
            topicKey: 'demand-package-sync',
            category: 'action',
            text: 'Export exposure payment ledger to recovery demand template.',
            owner: 'Maya'
          },
          {
            id: `s${sessionNumber}-3`,
            topicKey: 'deductible-waiver',
            category: 'risk',
            text: 'State-specific deductible recovery rules need verification.',
            owner: 'Priya'
          }
        ]
      : [
          {
            id: `s${sessionNumber}-1`,
            topicKey: 'fnol-intake-channel',
            category: 'decision',
            text: noteHint
              ? `FNOL intake scope: ${noteHint}.`
              : 'Use composite Cloud API v10 payload for digital FNOL intake.',
            owner: 'Maya'
          },
          {
            id: `s${sessionNumber}-2`,
            topicKey: 'reserve-authority',
            category: 'decision',
            text: 'Enforce adjuster reserve caps inside Gosu TransactionSet pre-update rules.',
            owner: 'Alex'
          },
          {
            id: `s${sessionNumber}-3`,
            topicKey: 'policycenter-timeout',
            category: 'action',
            text: 'Measure PolicyCenter coverage lookup latency during peak FNOL.',
            owner: 'Priya'
          }
        ];

    return {
      id: `mtg-session-${Date.now()}-${sessionNumber}`,
      sessionNumber,
      title: isSubro ? 'ClaimCenter Subrogation Review' : 'ClaimCenter FNOL Intake Session',
      audioFileName: fileName,
      audioDurationLabel: durationLabel,
      audioDurationSec: Math.max(4, Math.round(durationSec)),
      audioSizeLabel: sizeLabel,
      audioUrl,
      driveFileId,
      recordedAt: timestamp,
      summary: noteHint
        ? `Synthesized from ${fileName} (${durationLabel}). Focus: ${noteHint}.`
        : sourceKind === 'pdf'
        ? `Synthesized from transcript PDF ${fileName}. Extracted ClaimCenter API, Gosu reserve, and integration decisions & learned domain vocabulary.`
        : sourceKind === 'live'
        ? `Captured via live transcription (${durationLabel}). Extracted ClaimCenter decisions, actions, and learned domain vocabulary.`
        : `Synthesized from ${fileName} (${durationLabel}). Captured ClaimCenter API, Gosu reserve, and integration items.`,
      items,
      highlights: [
        {
          timestamp: computeBoundedTimestamp(durationSec, 0.22),
          speaker: s2Speaker,
          speakerTag: speakerIdEnabled ? 'Speaker 2' : undefined,
          text: transcriptText
            ? transcriptText.slice(0, 140).trim() + (transcriptText.length > 140 ? '...' : '')
            : `Reviewed ${fileName} baseline ClaimCenter architecture and exposure mapping.`
        },
        {
          timestamp: computeBoundedTimestamp(durationSec, 0.68),
          speaker: s1Speaker,
          speakerTag: speakerIdEnabled ? 'Speaker 1' : undefined,
          text: 'Confirmed owner assignments and open validation dependencies.'
        }
      ],
      generatedBy: {
        transcriptionSummary,
        notesSummary,
        speakerIdEnabled
      }
    };
  }

  // Continuation session: mutate/carry/resolve/add relative to previousSession
  const prevItems = previousSession.items;
  const nextItems: MeetingNoteItem[] = [];

  prevItems.forEach((item, index) => {
    if (index === 0) {
      // Unchanged foundational decision
      nextItems.push({ ...item, id: `s${sessionNumber}-keep-${index}` });
    } else if (index === 1) {
      // Updated item showing concrete evolution from previous session
      nextItems.push({
        ...item,
        id: `s${sessionNumber}-upd-${index}`,
        text: item.text.includes('25,000')
          ? `${item.text} (Confirmed via BillingCenter check audit)`
          : `${item.text.replace(/\.$/, '')} + cap automated reserves at $25,000.`,
        owner: item.owner
      });
    } else if (index === 2) {
      // Updated action item with concrete metric/progress
      nextItems.push({
        ...item,
        id: `s${sessionNumber}-upd-${index}`,
        text: noteHint
          ? `${item.text.replace(/\.$/, '')} — Follow-up: ${noteHint}`
          : 'PolicyCenter coverage snapshot cached locally; p95 latency cut to 340ms.',
        owner: item.owner
      });
    }
    // Index >= 3 is omitted (resolved since last session) so diff highlights resolved items!
  });

  // Add new item(s) introduced in the continuation session
  nextItems.push({
    id: `s${sessionNumber}-new-1`,
    topicKey: `app-events-webhook-s${sessionNumber}`,
    category: 'decision',
    text: noteHint
      ? `Follow-up decision: ${noteHint}`
      : 'Publish App Events webhooks on reserve-approved and subrogation-opened.',
    owner: 'Priya'
  });

  nextItems.push({
    id: `s${sessionNumber}-new-2`,
    topicKey: `siu-triage-s${sessionNumber}`,
    category: 'action',
    text: 'Wire SIU referral threshold >= 70 into FNOL post-setup Gosu rule.',
    owner: 'Maya'
  });

  return {
    id: `mtg-session-${Date.now()}-${sessionNumber}`,
    sessionNumber,
    parentSessionId: previousSession.id,
    title: `${previousSession.title} · Part ${sessionNumber}`,
    audioFileName: fileName,
    audioDurationLabel: durationLabel,
    audioDurationSec: Math.max(4, Math.round(durationSec)),
    audioSizeLabel: sizeLabel,
    audioUrl,
    driveFileId,
    recordedAt: timestamp,
    summary: noteHint
      ? `Continuation from Session ${previousSession.sessionNumber}. Focused on ${noteHint}; resolved prior bottleneck and added App Events & SIU scope.`
      : `Continuation from Session ${previousSession.sessionNumber}. Updated reserve cap to $25k, resolved PolicyCenter latency risk, and added App Events + SIU referral rules.`,
    items: nextItems,
    highlights: [
      {
        timestamp: computeBoundedTimestamp(durationSec, 0.18),
        speaker: s3Speaker,
        speakerTag: speakerIdEnabled ? 'Speaker 3' : undefined,
        text: 'Local coverage snapshot dropped PolicyCenter sync p95 from 1.2s to 340ms.'
      },
      {
        timestamp: computeBoundedTimestamp(durationSec, 0.62),
        speaker: s2Speaker,
        speakerTag: speakerIdEnabled ? 'Speaker 2' : undefined,
        text: 'Added $25k automated reserve ceiling and App Events webhook triggers.'
      }
    ],
    generatedBy: {
      transcriptionSummary,
      notesSummary,
      speakerIdEnabled
    }
  };
}

export function compareMeetingSessions(
  previousSession: MeetingSession,
  currentSession: MeetingSession
): SessionComparison {
  const prevByKey = new Map<string, MeetingNoteItem>();
  previousSession.items.forEach(item => prevByKey.set(item.topicKey, item));

  const currByKey = new Map<string, MeetingNoteItem>();
  currentSession.items.forEach(item => currByKey.set(item.topicKey, item));

  const diffs: SessionDiffItem[] = [];

  // Added or updated or unchanged in current
  currentSession.items.forEach(curr => {
    const prev = prevByKey.get(curr.topicKey);
    if (!prev) {
      diffs.push({
        topicKey: curr.topicKey,
        category: curr.category,
        changeType: 'added',
        currentText: curr.text,
        currentOwner: curr.owner
      });
    } else if (prev.text.trim() !== curr.text.trim() || prev.owner !== curr.owner) {
      diffs.push({
        topicKey: curr.topicKey,
        category: curr.category,
        changeType: 'updated',
        previousText: prev.text,
        currentText: curr.text,
        previousOwner: prev.owner,
        currentOwner: curr.owner
      });
    } else {
      diffs.push({
        topicKey: curr.topicKey,
        category: curr.category,
        changeType: 'unchanged',
        previousText: prev.text,
        currentText: curr.text,
        previousOwner: prev.owner,
        currentOwner: curr.owner
      });
    }
  });

  // Resolved items (present in previous, closed/removed in current)
  previousSession.items.forEach(prev => {
    if (!currByKey.has(prev.topicKey)) {
      diffs.push({
        topicKey: prev.topicKey,
        category: prev.category,
        changeType: 'resolved',
        previousText: prev.text,
        previousOwner: prev.owner
      });
    }
  });

  return {
    baseSessionId: previousSession.id,
    continuationSessionId: currentSession.id,
    addedCount: diffs.filter(d => d.changeType === 'added').length,
    updatedCount: diffs.filter(d => d.changeType === 'updated').length,
    resolvedCount: diffs.filter(d => d.changeType === 'resolved').length,
    unchangedCount: diffs.filter(d => d.changeType === 'unchanged').length,
    diffs
  };
}

export function sessionHasPlayableAudio(
  session: MeetingSession,
  driveFiles: DriveAudioFile[] = []
): boolean {
  if (session.audioDeleted) return false;
  if (session.audioUrl) return true;
  if (session.driveFileId && driveFiles.some(f => f.id === session.driveFileId && Boolean(f.audioUrl))) {
    return true;
  }
  const lower = session.audioFileName.toLowerCase();
  if (
    session.audioDurationLabel === 'PDF Transcript' ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.md')
  ) {
    return false;
  }
  return Boolean(session.driveFileId);
}

export function stripAudioFromMeetingSession(session: MeetingSession): MeetingSession {
  return {
    ...session,
    audioUrl: undefined,
    driveFileId: undefined,
    audioDeleted: true,
    audioSizeLabel: 'Audio deleted'
  };
}

export function deleteMeetingSessionFromList(
  sessions: MeetingSession[],
  targetId: string,
  currentBaseId?: string,
  currentActiveId?: string
): {
  sessions: MeetingSession[];
  nextBaseId: string;
  nextCurrentId: string;
} {
  const nextSessions = sessions.filter(s => s.id !== targetId);
  if (nextSessions.length === 0) {
    return { sessions: [], nextBaseId: '', nextCurrentId: '' };
  }

  const stillHasActive = nextSessions.some(s => s.id === currentActiveId);
  const nextCurrentId = stillHasActive
    ? (currentActiveId as string)
    : nextSessions[nextSessions.length - 1].id;

  const stillHasBase =
    currentBaseId &&
    currentBaseId !== nextCurrentId &&
    nextSessions.some(s => s.id === currentBaseId);

  const fallbackBase =
    nextSessions.length >= 2
      ? nextSessions.find(s => s.id !== nextCurrentId)?.id || nextSessions[0].id
      : nextSessions[0].id;

  return {
    sessions: nextSessions,
    nextBaseId: stillHasBase ? (currentBaseId as string) : fallbackBase,
    nextCurrentId
  };
}

export interface RetranscribeMeetingInput {
  session: MeetingSession;
  transcriptionModel: ActivityModelOption;
  approach: ExecutionApproach;
  localWhisperName?: string;
  customAsrModelId?: string;
  notesModel?: ActivityModelOption;
  notesApproach?: ExecutionApproach;
  regenerateNotes?: boolean;
  speakerIdEnabled: boolean;
  speakerLabels?: string[];
  dictionaryEntries?: DictionaryEntry[];
}

export function retranscribeMeetingSession(input: RetranscribeMeetingInput): MeetingSession {
  const {
    session,
    transcriptionModel,
    approach,
    localWhisperName,
    customAsrModelId,
    notesModel,
    notesApproach = 'local',
    regenerateNotes = true,
    speakerIdEnabled,
    speakerLabels = ['Maya (Architect)', 'Alex (Tech Lead)', 'Priya (Claims Ops)'],
    dictionaryEntries = []
  } = input;

  const dur = Math.max(8, session.audioDurationSec || 620);
  const approachLabel = APPROACH_LABELS[approach];
  const asrSummary =
    approach === 'custom' && customAsrModelId?.trim()
      ? `Custom · ${customAsrModelId.trim()}`
      : transcriptionModel.provider === 'local' && localWhisperName
      ? `${approachLabel} · ${localWhisperName}${speakerIdEnabled ? ' + Speaker ID' : ''}`
      : `${approachLabel} · ${transcriptionModel.name}`;

  const notesSummary =
    regenerateNotes && notesModel
      ? `${APPROACH_LABELS[notesApproach]} · ${notesModel.name}`
      : session.generatedBy?.notesSummary || 'Retained prior notes';

  const topTerms = dictionaryEntries.slice(0, 4).map(d => d.term);
  const boostPhrase =
    topTerms.length > 0 ? ` (${topTerms.slice(0, 3).join(', ')} boosted)` : '';

  const s1 = speakerIdEnabled ? speakerLabels[0] || 'Speaker 1' : 'Transcript';
  const s2 = speakerIdEnabled ? speakerLabels[1] || 'Speaker 2' : 'Transcript';
  const s3 = speakerIdEnabled ? speakerLabels[2] || 'Speaker 3' : 'Transcript';

  // Refine existing highlights with chosen model diarization & domain term precision, plus add a fresh segment if sparse
  const baseHighlights: MeetingTranscriptHighlight[] = session.highlights.map((h, idx) => {
    const resolvedSpeaker = speakerIdEnabled
      ? idx % 3 === 0
        ? s1
        : idx % 3 === 1
        ? s2
        : s3
      : 'Transcript';
    return {
      timestamp: h.timestamp,
      speaker: resolvedSpeaker,
      speakerTag: speakerIdEnabled ? `Speaker ${(idx % 3) + 1}` : undefined,
      text: h.text
    };
  });

  if (baseHighlights.length < 3) {
    baseHighlights.push({
      timestamp: computeBoundedTimestamp(dur, 0.84),
      speaker: s3,
      speakerTag: speakerIdEnabled ? 'Speaker 3' : undefined,
      text: `Re-transcribed via ${transcriptionModel.name}${boostPhrase}; confirmed ClaimCenter reserve limits, SubrogationSummary rules, and PolicyCenter SLA targets.`
    });
  }

  let nextItems = session.items;
  let nextSummary = session.summary;

  if (regenerateNotes && notesModel) {
    const cleanBaseSummary = session.summary.replace(/\s*\[Re-transcribed[^\]]*\]/g, '').trim();
    nextSummary = `${cleanBaseSummary} [Re-transcribed via ${transcriptionModel.name}; notes refreshed by ${notesModel.name}]`;
    nextItems = session.items.map((item, idx) =>
      idx === 0 && !item.text.includes('verified')
        ? { ...item, text: item.text }
        : item
    );
  }

  return {
    ...session,
    summary: nextSummary,
    items: nextItems,
    highlights: baseHighlights,
    generatedBy: {
      transcriptionSummary: asrSummary,
      notesSummary,
      speakerIdEnabled
    }
  };
}

export function recordDownloadedExportOnSession(
  session: MeetingSession,
  entry: DownloadedMeetingExport
): MeetingSession {
  const existingQuick = session.downloadedExports || [];
  const dedupedQuick = existingQuick.filter(
    item => !(item.kind === entry.kind && item.format === entry.format)
  );
  const existingHistory = session.exportHistory ?? existingQuick;
  const historyEntry: DownloadedMeetingExport = {
    ...entry,
    id: `hist-${entry.id}-${Date.now()}-${existingHistory.length + 1}`
  };
  return {
    ...session,
    downloadedExports: [entry, ...dedupedQuick],
    exportHistory: [historyEntry, ...existingHistory]
  };
}


