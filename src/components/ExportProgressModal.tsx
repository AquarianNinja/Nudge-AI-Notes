import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowLeft, Download, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AnyExportFormat,
  DictionaryEntry,
  DownloadedMeetingExport,
  ExportFilterOptions,
  MeetingNotesExportFormat,
  MeetingNotesExportOptions,
  MeetingSession,
  TranscriptExportFormat,
  TranscriptExportOptions
} from '../types/index.ts';
import {
  buildBatchExportZip,
  ExportDocumentPayload,
  exportMeetingNotesDocument,
  exportMeetingTranscript,
  getExportByteLength,
  getExportStageSteps,
  summarizeExportSelection,
  triggerBrowserDownload
} from '../utils/documentExport.ts';
import { formatFileSize } from '../utils/meetingNotes.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  buildListItemVariants
} from '../utils/motion.ts';
import { AnimatedCheckmark, MotionSheet } from './MotionPrimitives.tsx';
import { EXPORT_FORMAT_META, ExportFormatIcon } from './ExportFormatIcon.tsx';

export type ExportJobRequest =
  | {
      mode?: 'single';
      session: MeetingSession;
      kind: 'transcript' | 'notes';
      format: AnyExportFormat;
      filterOptions?: ExportFilterOptions;
      selectionSummary?: string;
    }
  | {
      mode: 'batch-zip';
      sessions: MeetingSession[];
      transcriptFormats: TranscriptExportFormat[];
      notesFormats: MeetingNotesExportFormat[];
    };

interface ExportProgressModalProps {
  job: ExportJobRequest | null;
  dictionaryEntries: DictionaryEntry[];
  onClose: () => void;
  onBackToFormats?: (session: MeetingSession) => void;
  onExportCompleted?: (sessionId: string, record: DownloadedMeetingExport) => void;
  onBatchExportCompleted?: (recordsBySession: Record<string, DownloadedMeetingExport[]>) => void;
}

const STAGE_PROGRESS = [0.34, 0.74, 1] as const;

export const ExportProgressModal: React.FC<ExportProgressModalProps> = ({
  job,
  dictionaryEntries,
  onClose,
  onBackToFormats,
  onExportCompleted,
  onBatchExportCompleted
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const listItemVariants = buildListItemVariants(prefersReduced);

  // stageIndex: 0 = collecting, 1 = formatting/compiling, 2 = completed & saved
  const [stageIndex, setStageIndex] = useState<0 | 1 | 2>(0);
  const [compiledPayload, setCompiledPayload] = useState<ExportDocumentPayload | null>(null);
  const [byteSize, setByteSize] = useState<number>(0);
  const [batchMetaLabel, setBatchMetaLabel] = useState<string>('');

  const onCompletedRef = useRef(onExportCompleted);
  onCompletedRef.current = onExportCompleted;

  const onBatchCompletedRef = useRef(onBatchExportCompleted);
  onBatchCompletedRef.current = onBatchExportCompleted;

  const dictionaryRef = useRef(dictionaryEntries);
  dictionaryRef.current = dictionaryEntries;

  const isBatch = job?.mode === 'batch-zip';

  const stageSteps = useMemo(() => {
    if (!job) return ['', '', ''] as [string, string, string];
    if (job.mode === 'batch-zip') {
      const formatCount = job.transcriptFormats.length + job.notesFormats.length;
      return getExportStageSteps('batch-zip', 'zip', job.sessions.length, formatCount);
    }
    const count =
      job.kind === 'transcript' ? job.session.highlights.length : job.session.items.length;
    return getExportStageSteps(job.kind, job.format, count);
  }, [job]);

  useEffect(() => {
    if (!job) {
      setStageIndex(0);
      setCompiledPayload(null);
      setByteSize(0);
      setBatchMetaLabel('');
      return;
    }

    let cancelled = false;
    setStageIndex(0);
    setCompiledPayload(null);
    setByteSize(0);
    setBatchMetaLabel('');

    const t1 = setTimeout(() => {
      if (cancelled) return;
      setStageIndex(1);
    }, 180);

    const t2 = setTimeout(async () => {
      if (cancelled) return;

      if (job.mode === 'batch-zip') {
        const result = await buildBatchExportZip({
          sessions: job.sessions,
          transcriptFormats: job.transcriptFormats,
          notesFormats: job.notesFormats,
          dictionaryEntries: dictionaryRef.current
        });
        if (cancelled) return;

        triggerBrowserDownload(result.payload);
        setCompiledPayload(result.payload);
        setByteSize(result.compressedByteLength);
        setBatchMetaLabel(
          `${result.fileCount} files${result.compressedEntryCount > 0 ? ' · DEFLATE' : ''}`
        );
        setStageIndex(2);
        triggerHaptic('success');
        onBatchCompletedRef.current?.(result.fileRecordsBySession);
        return;
      }

      const payload =
        job.kind === 'transcript'
          ? exportMeetingTranscript(
              job.session,
              job.format as TranscriptExportFormat,
              dictionaryRef.current,
              (job.filterOptions || {}) as TranscriptExportOptions
            )
          : exportMeetingNotesDocument(
              job.session,
              job.format as MeetingNotesExportFormat,
              (job.filterOptions || {}) as MeetingNotesExportOptions
            );

      const size = getExportByteLength(payload.data);
      triggerBrowserDownload(payload);

      if (cancelled) return;
      setCompiledPayload(payload);
      setByteSize(size);
      setStageIndex(2);
      triggerHaptic('success');

      const summaryLabel =
        job.selectionSummary || summarizeExportSelection(job.session, job.kind, job.filterOptions);

      onCompletedRef.current?.(job.session.id, {
        id: `exp-${job.session.id}-${job.kind}-${job.format}`,
        kind: job.kind,
        format: job.format,
        fileName: payload.fileName,
        exportedAt: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        }),
        exportedIso: new Date().toISOString(),
        sizeBytes: size,
        sourceMode: 'single',
        selectionSummary: summaryLabel,
        filterOptions: job.filterOptions
      });
    }, 440);

    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [job]);

  const singleMeta = job && job.mode !== 'batch-zip' ? EXPORT_FORMAT_META[job.format] : null;
  const isDone = stageIndex === 2;
  const progressRatio = STAGE_PROGRESS[stageIndex];

  return (
    <MotionSheet
      isOpen={Boolean(job)}
      onClose={onClose}
      ariaLabel="File export progress"
      maxWidthClass="max-w-md"
    >
      {job && (
        <div className="flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {job.mode === 'batch-zip' ? (
                <div className="w-8 h-8 rounded-xl liquid-glass-subtle flex items-center justify-center shrink-0">
                  <Archive className="w-4 h-4 text-emerald-400" />
                </div>
              ) : (
                <ExportFormatIcon format={job.format} framed />
              )}

              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-100 truncate">
                  {isDone
                    ? isBatch
                      ? 'ZIP Archive Ready'
                      : 'Export Complete'
                    : isBatch
                    ? `Packaging ${job.sessions.length} ${
                        job.sessions.length === 1 ? 'Session' : 'Sessions'
                      } (.zip)`
                    : `Generating ${singleMeta?.label} (${singleMeta?.ext})`}
                </div>
                <div className="text-[11px] font-mono text-zinc-400 truncate">
                  {compiledPayload?.fileName ||
                    (job.mode === 'batch-zip'
                      ? `${
                          job.sessions.length *
                          (job.transcriptFormats.length + job.notesFormats.length)
                        } documents · Compressed ZIP`
                      : `S${job.session.sessionNumber} · ${
                          job.kind === 'transcript' ? 'Meeting Transcript' : 'Meeting Notes'
                        }`)}
                </div>
              </div>
            </div>

            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={onClose}
              aria-label="Close export progress"
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 shrink-0 transition-colors"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Progress Body */}
          <div className="p-4 space-y-4">
            {/* GPU-composited scaleX progress meter */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className={isDone ? 'text-emerald-400' : 'text-zinc-200'}>
                  {isDone
                    ? `Ready · ${formatFileSize(byteSize)}${
                        batchMetaLabel ? ` · ${batchMetaLabel}` : ''
                      }`
                    : `Stage ${stageIndex + 1} of 3`}
                </span>
                <span className="tabular-nums text-zinc-400">
                  {Math.round(progressRatio * 100)}%
                </span>
              </div>

              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressRatio * 100)}
                aria-label="Export file generation progress"
                className="h-1.5 w-full rounded-full liquid-glass-subtle overflow-hidden"
              >
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: progressRatio }}
                  transition={MOTION_TRANSITIONS.elementEnter}
                  style={{ transformOrigin: 'left' }}
                  className={`h-full w-full rounded-full ${
                    isDone ? 'bg-emerald-400' : 'bg-[#2B98FF]'
                  }`}
                />
              </div>
            </div>

            {/* Stage Step List */}
            <div className="space-y-2">
              {stageSteps.map((label, idx) => {
                const completed = isDone || idx < stageIndex;
                const active = !isDone && idx === stageIndex;

                return (
                  <motion.div
                    key={label}
                    custom={idx}
                    variants={listItemVariants}
                    initial="initial"
                    animate="animate"
                    className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-2xl border text-xs transition-colors ${
                      completed
                        ? 'bg-emerald-500/12 border-emerald-400/35 text-emerald-100'
                        : active
                        ? 'liquid-glass border-[#2B98FF]/40 text-zinc-100'
                        : 'liquid-glass-subtle text-zinc-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {completed ? (
                        <AnimatedCheckmark className="w-3.5 h-3.5 text-emerald-400" />
                      ) : active ? (
                        <span
                          aria-hidden="true"
                          className="w-2 h-2 rounded-full bg-[#2B98FF] shrink-0"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="w-2 h-2 rounded-full bg-white/25 shrink-0"
                        />
                      )}
                      <span className="truncate">{label}</span>
                    </div>

                    {active && !prefersReduced && (
                      <span
                        aria-hidden="true"
                        className="w-12 h-1.5 rounded-full bg-white/15 motion-shimmer shrink-0"
                      />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Footer Controls */}
          <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-2">
            {onBackToFormats && job.mode !== 'batch-zip' ? (
              <motion.button
                type="button"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                onClick={() => {
                  const targetSession = job.session;
                  onClose();
                  onBackToFormats(targetSession);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-zinc-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Formats</span>
              </motion.button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              {isDone && compiledPayload && (
                <motion.button
                  type="button"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  onClick={() => {
                    triggerBrowserDownload(compiledPayload);
                    triggerHaptic('success');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-100 transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-[#2B98FF]" />
                  <span>Save Again</span>
                </motion.button>
              )}

              <motion.button
                type="button"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                onClick={onClose}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                  isDone
                    ? 'liquid-accent-glass hover:opacity-95'
                    : 'liquid-glass-subtle hover:bg-white/10 text-zinc-200'
                }`}
              >
                {isDone ? 'Done' : 'Cancel'}
              </motion.button>
            </div>
          </div>
        </div>
      )}
    </MotionSheet>
  );
};
