import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileAudio,
  FileText,
  Key,
  RefreshCw,
  Settings,
  Trash2,
  X
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ActivityModelOption,
  AppSettings,
  DriveAudioFile,
  ExecutionApproach,
  MeetingNotesExportFormat,
  MeetingSession,
  PaidProviderId,
  TranscriptExportFormat,
  WhisperModelOption
} from '../types/index.ts';
import {
  APPROACH_LABELS,
  getModelsForActivity,
  getProviderDisplayName,
  validateApiKeyFormat
} from '../utils/providerRouting.ts';
import { sessionHasPlayableAudio } from '../utils/meetingNotes.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS } from '../utils/motion.ts';
import {
  AnimatedCheckmark,
  MotionAlertBanner,
  MotionSheet
} from './MotionPrimitives.tsx';
import { ExportFormatIcon } from './ExportFormatIcon.tsx';
import { PrepareExportRequest } from './PrepareExportModal.tsx';

/* -------------------------------------------------------------------------- */
/*  1. Multi-Format Export Sheet (Transcript + Meeting Notes)                 */
/* -------------------------------------------------------------------------- */

interface MeetingExportSheetProps {
  session: MeetingSession | null;
  onClose: () => void;
  onPrepareExport: (request: PrepareExportRequest) => void;
}

const TRANSCRIPT_FORMATS: Array<{
  id: TranscriptExportFormat;
  label: string;
  ext: string;
}> = [
  { id: 'markdown', label: 'Markdown', ext: '.md' },
  { id: 'json', label: 'JSON', ext: '.json' },
  { id: 'docx', label: 'Word', ext: '.docx' },
  { id: 'pdf', label: 'PDF', ext: '.pdf' },
  { id: 'vtt', label: 'WebVTT', ext: '.vtt' },
  { id: 'txt', label: 'Plain Text', ext: '.txt' }
];

const NOTES_FORMATS: Array<{
  id: MeetingNotesExportFormat;
  label: string;
  ext: string;
}> = [
  { id: 'docx', label: 'Word', ext: '.docx' },
  { id: 'pdf', label: 'PDF', ext: '.pdf' },
  { id: 'markdown', label: 'Markdown', ext: '.md' }
];

export const MeetingExportSheet: React.FC<MeetingExportSheetProps> = ({
  session,
  onClose,
  onPrepareExport
}) => {
  const prefersReduced = Boolean(useReducedMotion());

  const hasDownloaded = (kind: 'transcript' | 'notes', format: string) =>
    Boolean(session?.downloadedExports?.some(e => e.kind === kind && e.format === format));

  const handleSelectFormat = (
    kind: 'transcript' | 'notes',
    format: TranscriptExportFormat | MeetingNotesExportFormat
  ) => {
    if (!session) return;
    triggerHaptic('selection');
    onClose();
    onPrepareExport({ session, kind, format });
  };

  return (
    <MotionSheet
      isOpen={Boolean(session)}
      onClose={onClose}
      ariaLabel="Download transcript and meeting notes"
      maxWidthClass="max-w-md"
    >
      {session && (
        <div className="flex flex-col">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-100 truncate">
                Export · S{session.sessionNumber}
              </div>
              <div className="text-[11px] text-zinc-400 truncate">
                {session.title} · Preview & select sections
              </div>
            </div>
            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={onClose}
              aria-label="Close export dialog"
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto">
            {/* Transcript Formats */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-300">
                  Meeting Transcript
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  {session.highlights.length} segments
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {TRANSCRIPT_FORMATS.map((fmt) => {
                  const downloaded = hasDownloaded('transcript', fmt.id);
                  return (
                    <motion.button
                      key={fmt.id}
                      type="button"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                      onClick={() => handleSelectFormat('transcript', fmt.id)}
                      className={`flex flex-col items-start px-3 py-2 rounded-2xl border text-left transition-colors ${
                        downloaded
                          ? 'bg-emerald-500/12 hover:bg-emerald-500/18 border-emerald-400/35 text-zinc-100'
                          : 'liquid-glass-subtle hover:bg-white/10 text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <ExportFormatIcon format={fmt.id} className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium truncate">{fmt.label}</span>
                        </div>
                        {downloaded ? (
                          <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Download className="w-3 h-3 text-zinc-400 shrink-0" />
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400 mt-1">{fmt.ext}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Meeting Notes Formats */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-300">
                  Meeting Notes
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  {session.items.length} items
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {NOTES_FORMATS.map((fmt) => {
                  const downloaded = hasDownloaded('notes', fmt.id);
                  return (
                    <motion.button
                      key={fmt.id}
                      type="button"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                      onClick={() => handleSelectFormat('notes', fmt.id)}
                      className={`flex flex-col items-start px-3 py-2 rounded-2xl border text-left transition-colors ${
                        downloaded
                          ? 'bg-emerald-500/12 hover:bg-emerald-500/18 border-emerald-400/35 text-zinc-100'
                          : 'liquid-glass-subtle hover:bg-white/10 text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <ExportFormatIcon format={fmt.id} className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium truncate">{fmt.label}</span>
                        </div>
                        {downloaded ? (
                          <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Download className="w-3 h-3 text-zinc-400 shrink-0" />
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400 mt-1">{fmt.ext}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </MotionSheet>
  );
};

/* -------------------------------------------------------------------------- */
/*  2. Re-Transcribe Any Meeting Using Any Model Sheet                        */
/* -------------------------------------------------------------------------- */

export interface RetranscribeConfirmPayload {
  sessionId: string;
  transcriptionModel: ActivityModelOption;
  approach: ExecutionApproach;
  localWhisperName?: string;
  notesModel?: ActivityModelOption;
  notesApproach?: ExecutionApproach;
  regenerateNotes: boolean;
  speakerIdEnabled: boolean;
}

interface MeetingRetranscribeSheetProps {
  session: MeetingSession | null;
  settings: AppSettings;
  driveFiles: DriveAudioFile[];
  whisperModels: WhisperModelOption[];
  onClose: () => void;
  onConfirm: (payload: RetranscribeConfirmPayload) => void;
  onOpenApiKeys?: (focusProvider?: PaidProviderId) => void;
  onOpenSettings?: () => void;
}

export const MeetingRetranscribeSheet: React.FC<MeetingRetranscribeSheetProps> = ({
  session,
  settings,
  driveFiles,
  whisperModels,
  onClose,
  onConfirm,
  onOpenApiKeys,
  onOpenSettings
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const allAsrModels = useMemo(() => getModelsForActivity('transcription'), []);
  const allNotesModels = useMemo(() => getModelsForActivity('meetingNotes'), []);

  const [selectedAsrId, setSelectedAsrId] = useState<string>(settings.activityRoutes.transcription.modelId);
  const [selectedApproach, setSelectedApproach] = useState<ExecutionApproach>(
    settings.activityRoutes.transcription.approach
  );
  const [selectedWhisperId, setSelectedWhisperId] = useState<string>(settings.activeWhisperId);
  const [speakerIdEnabled, setSpeakerIdEnabled] = useState<boolean>(settings.diarization);
  const [regenerateNotes, setRegenerateNotes] = useState<boolean>(true);
  const [selectedNotesId, setSelectedNotesId] = useState<string>(settings.activityRoutes.meetingNotes.modelId);

  useEffect(() => {
    if (!session) return;
    setSelectedAsrId(settings.activityRoutes.transcription.modelId);
    setSelectedApproach(settings.activityRoutes.transcription.approach);
    setSelectedWhisperId(settings.activeWhisperId);
    setSpeakerIdEnabled(session.generatedBy?.speakerIdEnabled ?? settings.diarization);
    setRegenerateNotes(true);
    setSelectedNotesId(settings.activityRoutes.meetingNotes.modelId);
  }, [session?.id, settings]);

  const chosenAsrModel = useMemo(
    () => allAsrModels.find(m => m.id === selectedAsrId) || allAsrModels[0],
    [allAsrModels, selectedAsrId]
  );

  const chosenNotesModel = useMemo(
    () => allNotesModels.find(m => m.id === selectedNotesId) || allNotesModels[0],
    [allNotesModels, selectedNotesId]
  );

  const chosenWhisperModel = useMemo(
    () => whisperModels.find(w => w.id === selectedWhisperId) || whisperModels[0],
    [whisperModels, selectedWhisperId]
  );

  useEffect(() => {
    if (!chosenAsrModel.supportedApproaches.includes(selectedApproach)) {
      setSelectedApproach(chosenAsrModel.supportedApproaches[0]);
    }
  }, [chosenAsrModel, selectedApproach]);

  const hasAudio = session ? sessionHasPlayableAudio(session, driveFiles) : false;

  const readiness = useMemo(() => {
    if (!hasAudio) {
      return {
        ready: false,
        reason: 'Audio recording unavailable for this session. Only sessions with audio can be re-transcribed.'
      };
    }

    if (
      settings.offlineOnly &&
      (selectedApproach === 'cloud' || selectedApproach === 'hybrid' || chosenAsrModel.requiresPaidKey)
    ) {
      return {
        ready: false,
        reason: 'Offline Air-Gap Mode blocks cloud models. Select WhisperKit Local or disable Offline Mode.',
        needsSettings: true
      };
    }

    if (selectedApproach === 'custom') {
      if (!settings.customEndpoint.transcriptionUrl.trim() || !settings.customEndpoint.transcriptionModelId.trim()) {
        return {
          ready: false,
          missingProvider: 'custom' as PaidProviderId,
          reason: 'Configure custom ASR endpoint URL and model ID in API Keys & Custom Settings.'
        };
      }
    }

    if (chosenAsrModel.requiresPaidKey && chosenAsrModel.provider !== 'local') {
      const pid = chosenAsrModel.provider as PaidProviderId;
      const check = validateApiKeyFormat(pid, settings.apiKeys[pid] || '');
      if (!check.valid) {
        return {
          ready: false,
          missingProvider: pid,
          reason: `${getProviderDisplayName(pid)} paid API key required for ${chosenAsrModel.name}.`
        };
      }
    }

    if (regenerateNotes && chosenNotesModel.requiresPaidKey && chosenNotesModel.provider !== 'local') {
      if (settings.offlineOnly) {
        return {
          ready: false,
          reason: `Offline Mode blocks ${chosenNotesModel.name} for notes regeneration. Pick Llama 3 8B Local or uncheck Notes refresh.`,
          needsSettings: true
        };
      }
      const pid = chosenNotesModel.provider as PaidProviderId;
      const check = validateApiKeyFormat(pid, settings.apiKeys[pid] || '');
      if (!check.valid) {
        return {
          ready: false,
          missingProvider: pid,
          reason: `${getProviderDisplayName(pid)} paid API key required for ${chosenNotesModel.name}.`
        };
      }
    }

    return { ready: true as const };
  }, [hasAudio, settings, selectedApproach, chosenAsrModel, regenerateNotes, chosenNotesModel]);

  const handleSubmit = () => {
    if (!session || !readiness.ready) {
      triggerHaptic('warning');
      return;
    }
    const notesApproach: ExecutionApproach = chosenNotesModel.supportedApproaches.includes(selectedApproach)
      ? selectedApproach
      : chosenNotesModel.supportedApproaches[0];

    onConfirm({
      sessionId: session.id,
      transcriptionModel: chosenAsrModel,
      approach: selectedApproach,
      localWhisperName: chosenAsrModel.provider === 'local' ? chosenWhisperModel?.name : undefined,
      notesModel: chosenNotesModel,
      notesApproach,
      regenerateNotes,
      speakerIdEnabled
    });
    onClose();
  };

  return (
    <MotionSheet
      isOpen={Boolean(session)}
      onClose={onClose}
      ariaLabel="Re-transcribe meeting with any model"
      maxWidthClass="max-w-lg"
    >
      {session && (
        <div className="flex flex-col max-h-[82vh]">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-100 truncate">
                Re-transcribe · S{session.sessionNumber}
              </div>
              <div className="text-[11px] font-mono text-zinc-400 truncate">
                {session.audioFileName} · {session.audioDurationLabel}
              </div>
            </div>
            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={onClose}
              aria-label="Close re-transcribe dialog"
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto">
            {!readiness.ready && (
              <MotionAlertBanner
                shakeKey={readiness.reason || 'blocked'}
                className="p-3 rounded-2xl bg-amber-500/12 border border-amber-400/35 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2"
              >
                <span className="flex-1 min-w-[200px]">{readiness.reason}</span>
                {readiness.missingProvider && onOpenApiKeys && (
                  <motion.button
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => onOpenApiKeys(readiness.missingProvider)}
                    className="flex items-center gap-1 px-3 py-1 rounded-full liquid-lens-active text-[11px] font-semibold shrink-0 whitespace-nowrap"
                  >
                    <Key className="w-3 h-3" />
                    <span>Enter Key</span>
                  </motion.button>
                )}
                {readiness.needsSettings && onOpenSettings && (
                  <motion.button
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => {
                      onClose();
                      onOpenSettings();
                    }}
                    className="flex items-center gap-1 px-3 py-1 rounded-full liquid-lens-active text-[11px] font-semibold shrink-0 whitespace-nowrap"
                  >
                    <Settings className="w-3 h-3" />
                    <span>Settings</span>
                  </motion.button>
                )}
              </MotionAlertBanner>
            )}

            {/* Transcription Model Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-300">
                  Transcription Model
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  {allAsrModels.length} available
                </span>
              </div>

              <div className="space-y-1.5">
                {allAsrModels.map((model) => {
                  const selected = model.id === chosenAsrModel.id;
                  const paidOk =
                    !model.requiresPaidKey ||
                    model.provider === 'local' ||
                    validateApiKeyFormat(
                      model.provider as PaidProviderId,
                      settings.apiKeys[model.provider as PaidProviderId] || ''
                    ).valid;

                  return (
                    <motion.button
                      key={model.id}
                      type="button"
                      data-haptic="off"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      onClick={() => {
                        triggerHaptic('selection');
                        setSelectedAsrId(model.id);
                      }}
                      className={`w-full text-left p-3 rounded-2xl transition-colors ${
                        selected
                          ? 'liquid-glass border-[#2B98FF]/45 bg-[#0F7FFF]/12'
                          : 'liquid-glass-subtle hover:bg-white/8'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-medium text-zinc-100 truncate">
                            {model.name}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            {getProviderDisplayName(model.provider)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {model.requiresPaidKey && (
                            <span
                              className={`text-[10px] font-mono ${
                                paidOk ? 'text-emerald-400' : 'text-amber-300'
                              }`}
                            >
                              {paidOk ? 'Key Ready' : 'Key Needed'}
                            </span>
                          )}
                          {selected && (
                            <AnimatedCheckmark className="w-3.5 h-3.5 text-[#2B98FF]" />
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{model.summary}</p>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Execution Approach & Local Whisper Engine */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-300 block">
                  Approach
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {chosenAsrModel.supportedApproaches.map((app) => {
                    const active = selectedApproach === app;
                    return (
                      <motion.button
                        key={app}
                        type="button"
                        data-haptic="off"
                        whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                        transition={MOTION_SPRINGS.interactive}
                        onClick={() => {
                          triggerHaptic('selection');
                          setSelectedApproach(app);
                        }}
                        className={`relative px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'text-zinc-950 font-semibold'
                            : 'liquid-glass-subtle text-zinc-300 hover:text-white'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="retranscribe-approach-pill"
                            transition={MOTION_SPRINGS.pill}
                            aria-hidden="true"
                            className="absolute inset-0 rounded-full liquid-lens-active"
                          />
                        )}
                        <span className="relative z-10">{APPROACH_LABELS[app]}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {chosenAsrModel.provider === 'local' && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="retranscribe-whisper-select"
                    className="text-[11px] font-medium text-zinc-300 block"
                  >
                    Whisper Engine
                  </label>
                  <select
                    id="retranscribe-whisper-select"
                    value={selectedWhisperId}
                    onChange={(e) => setSelectedWhisperId(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 focus:outline-hidden focus:border-white/30"
                  >
                    {whisperModels.map((wm) => (
                      <option key={wm.id} value={wm.id}>
                        {wm.name} ({wm.speedLabel})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Toggles + Notes Model */}
            <div className="p-3.5 rounded-2xl liquid-glass-subtle space-y-2.5">
              <label className="flex items-center justify-between gap-2 text-xs text-zinc-100 cursor-pointer">
                <span>Speaker Identification (Diarization)</span>
                <input
                  type="checkbox"
                  data-haptic="off"
                  checked={speakerIdEnabled}
                  onChange={(e) => {
                    triggerHaptic('selection');
                    setSpeakerIdEnabled(e.target.checked);
                  }}
                  className="rounded border-white/25 bg-white/10 accent-[#2B98FF]"
                />
              </label>

              <label className="flex items-center justify-between gap-2 text-xs text-zinc-100 cursor-pointer">
                <span>Regenerate Meeting Notes</span>
                <input
                  type="checkbox"
                  data-haptic="off"
                  checked={regenerateNotes}
                  onChange={(e) => {
                    triggerHaptic('selection');
                    setRegenerateNotes(e.target.checked);
                  }}
                  className="rounded border-white/25 bg-white/10 accent-[#2B98FF]"
                />
              </label>

              {regenerateNotes && (
                <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-300 shrink-0">Notes Model</span>
                  <select
                    aria-label="Notes regeneration model"
                    value={selectedNotesId}
                    onChange={(e) => setSelectedNotesId(e.target.value)}
                    className="px-2.5 py-1 rounded-xl liquid-glass-subtle text-[11px] text-zinc-100 max-w-[220px] focus:outline-hidden"
                  >
                    {allNotesModels.map((nm) => (
                      <option key={nm.id} value={nm.id}>
                        {nm.name} ({getProviderDisplayName(nm.provider)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2 shrink-0">
            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-full text-xs text-zinc-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap"
            >
              Cancel
            </motion.button>
            <motion.button
              type="button"
              data-haptic="medium"
              whileTap={prefersReduced || !readiness.ready ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              disabled={!readiness.ready}
              onClick={handleSubmit}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full liquid-accent-glass text-xs font-semibold disabled:opacity-40 transition-opacity hover:opacity-95 whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Re-transcribe</span>
            </motion.button>
          </div>
        </div>
      )}
    </MotionSheet>
  );
};

/* -------------------------------------------------------------------------- */
/*  3. Delete Meeting or Audio Recording Only Sheet                           */
/* -------------------------------------------------------------------------- */

interface MeetingDeleteSheetProps {
  session: MeetingSession | null;
  driveFiles: DriveAudioFile[];
  onClose: () => void;
  onDeleteAudioOnly: (session: MeetingSession) => void;
  onDeleteEntireMeeting: (session: MeetingSession, alsoDeleteDriveAudio: boolean) => void;
}

export const MeetingDeleteSheet: React.FC<MeetingDeleteSheetProps> = ({
  session,
  driveFiles,
  onClose,
  onDeleteAudioOnly,
  onDeleteEntireMeeting
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [alsoDeleteDriveAudio, setAlsoDeleteDriveAudio] = useState(true);

  useEffect(() => {
    setAlsoDeleteDriveAudio(true);
  }, [session?.id]);

  const hasAudio = session ? sessionHasPlayableAudio(session, driveFiles) : false;

  return (
    <MotionSheet
      isOpen={Boolean(session)}
      onClose={onClose}
      ariaLabel="Delete meeting or audio recording"
      maxWidthClass="max-w-md"
    >
      {session && (
        <div className="flex flex-col">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-100 truncate">
                Delete · S{session.sessionNumber}
              </div>
              <div className="text-[11px] text-zinc-400 truncate">{session.title}</div>
            </div>
            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={onClose}
              aria-label="Close delete dialog"
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          <div className="p-4 space-y-3">
            {/* Option 1: Audio Recording Only */}
            <div className="p-3.5 rounded-2xl liquid-glass-subtle flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-100">
                  <FileAudio className="w-3.5 h-3.5 text-[#2B98FF] shrink-0" />
                  <span>Delete Audio Only</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {hasAudio
                    ? 'Removes audio & Drive file while keeping transcript and meeting notes.'
                    : 'No audio recording attached to this session.'}
                </p>
              </div>
              <motion.button
                type="button"
                data-haptic="warning"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                disabled={!hasAudio}
                onClick={() => {
                  onDeleteAudioOnly(session);
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded-full liquid-glass hover:bg-white/15 text-xs font-medium text-zinc-100 disabled:opacity-40 shrink-0 transition-colors whitespace-nowrap"
              >
                Remove Audio
              </motion.button>
            </div>

            {/* Option 2: Entire Meeting */}
            <div className="p-3.5 rounded-2xl bg-red-500/12 border border-red-400/35 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-red-200">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span>Delete Entire Meeting</span>
                  </div>
                  <p className="text-[11px] text-zinc-300 mt-0.5">
                    Permanently deletes transcript, notes, and highlights for Session {session.sessionNumber}.
                  </p>
                </div>
                <motion.button
                  type="button"
                  data-haptic="warning"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  onClick={() => {
                    onDeleteEntireMeeting(session, alsoDeleteDriveAudio);
                    onClose();
                  }}
                  className="flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-red-500 hover:bg-red-400 text-xs font-semibold text-white shrink-0 transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Meeting</span>
                </motion.button>
              </div>

              {session.driveFileId && (
                <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer pt-2 border-t border-red-400/20">
                  <input
                    type="checkbox"
                    data-haptic="off"
                    checked={alsoDeleteDriveAudio}
                    onChange={(e) => {
                      triggerHaptic('selection');
                      setAlsoDeleteDriveAudio(e.target.checked);
                    }}
                    className="rounded border-red-300/40 bg-white/10 accent-red-500"
                  />
                  <span>Also remove audio file from Settings Drive</span>
                </label>
              )}
            </div>
          </div>
        </div>
      )}
    </MotionSheet>
  );
};
