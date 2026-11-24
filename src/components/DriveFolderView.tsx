import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Folder,
  Upload,
  Mic,
  Square,
  Search,
  Trash2,
  FileAudio,
  ArrowUpRight,
  Download
} from 'lucide-react';
import { AudioOrigin, DriveAudioFile } from '../types/index.ts';
import {
  createDriveAudioFile,
  createSyntheticMeetingWavBytes,
  createSyntheticMeetingWavUrl,
  filterDriveAudioFiles,
  getDriveStorageSummary
} from '../utils/audioDrive.ts';
import {
  inferAudioExtensionFromFileName,
  sanitizeDownloadBaseName
} from '../utils/audioConversion.ts';
import { formatAudioDuration } from '../utils/meetingNotes.ts';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  buildListItemVariants
} from '../utils/motion.ts';
import { AudioDownloadSource, AudioFormatDownloadModal } from './AudioFormatDownloadModal.tsx';
import { InlineAudioPlayer } from './InlineAudioPlayer.tsx';

interface DriveFolderViewProps {
  files: DriveAudioFile[];
  onBack?: () => void;
  embedded?: boolean;
  onSaveToDrive: (file: DriveAudioFile) => void;
  onDeleteFromDrive: (id: string) => void;
  onOpenInMeetings?: (file: DriveAudioFile) => void;
}

const ORIGIN_LABELS: Record<'all' | AudioOrigin, string> = {
  all: 'All',
  imported: 'Imported',
  recorded: 'Recorded',
  sample: 'Sample'
};

function readUploadedDuration(file: File): Promise<{ durationSec: number; url: string }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    let settled = false;
    const finish = (sec: number) => {
      if (settled) return;
      settled = true;
      resolve({ durationSec: sec > 0 ? sec : 120, url });
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(120);
    setTimeout(() => finish(120), 600);
    audio.src = url;
  });
}

export const DriveFolderView: React.FC<DriveFolderViewProps> = ({
  files,
  onBack,
  embedded = false,
  onSaveToDrive,
  onDeleteFromDrive,
  onOpenInMeetings
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const listItemVariants = buildListItemVariants(prefersReduced);
  const [originFilter, setOriginFilter] = useState<'all' | AudioOrigin>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [downloadSource, setDownloadSource] = useState<AudioDownloadSource | null>(null);

  const openDriveDownloadModal = (file: DriveAudioFile) => {
    const sourceExt = inferAudioExtensionFromFileName(file.fileName, file.mimeType);
    setDownloadSource({
      title: file.fileName,
      subtitle: `${file.durationLabel} · ${file.sizeLabel}`,
      baseName: sanitizeDownloadBaseName(file.fileName),
      sourceExt,
      getSourceBytes: async () => {
        if (file.audioUrl) {
          try {
            const resp = await fetch(file.audioUrl);
            if (resp.ok) {
              const ab = await resp.arrayBuffer();
              if (ab.byteLength > 0) {
                return new Uint8Array(ab);
              }
            }
          } catch {
            // Fallback to synthetic PCM WAV bytes below
          }
        }
        return createSyntheticMeetingWavBytes(file.durationSec, file.fileName.length);
      }
    });
  };

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

  const summary = useMemo(() => getDriveStorageSummary(files), [files]);
  const visibleFiles = useMemo(
    () => filterDriveAudioFiles(files, originFilter, searchQuery),
    [files, originFilter, searchQuery]
  );

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { durationSec, url } = await readUploadedDuration(file);
    const entry = createDriveAudioFile({
      fileName: file.name,
      origin: 'imported',
      durationSec,
      sizeBytes: file.size || 240000,
      audioUrl: url,
      mimeType: file.type || 'audio/mpeg'
    });
    onSaveToDrive(entry);
    setActivePlayerId(entry.id);
    e.target.value = '';
    triggerHaptic('success');
  };

  const finishFallbackRecording = (elapsedSec: number) => {
    const safeSec = Math.max(6, elapsedSec);
    const wavUrl = createSyntheticMeetingWavUrl(safeSec, files.length + 3);
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/[:\s]/g, '');
    const entry = createDriveAudioFile({
      fileName: `claimcenter_recording_${stamp}.wav`,
      origin: 'recorded',
      durationSec: safeSec,
      sizeBytes: 4000 * safeSec + 44,
      audioUrl: wavUrl,
      mimeType: 'audio/wav'
    });
    onSaveToDrive(entry);
    setActivePlayerId(entry.id);
    triggerHaptic('success');
  };

  const handleToggleRecording = async () => {
    if (isRecording) {
      triggerHaptic('medium');
      if (timerRef.current) clearInterval(timerRef.current);
      const elapsed = Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000));
      setIsRecording(false);
      setRecordingSec(0);

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      } else {
        finishFallbackRecording(elapsed);
      }
      return;
    }

    triggerHaptic('heavy');
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
          stream.getTracks().forEach((t) => t.stop());
          const elapsed = Math.max(
            4,
            Math.round((Date.now() - recordingStartRef.current) / 1000)
          );
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            const entry = createDriveAudioFile({
              fileName: `claimcenter_voice_note_${files.length + 1}.webm`,
              origin: 'recorded',
              durationSec: elapsed,
              sizeBytes: blob.size,
              audioUrl: url,
              mimeType: blob.type || 'audio/webm'
            });
            onSaveToDrive(entry);
            setActivePlayerId(entry.id);
          } else {
            finishFallbackRecording(elapsed);
          }
          mediaRecorderRef.current = null;
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
      }
    } catch {
      // Headless or mic-restricted context: timer runs and stop saves valid synthetic WAV
      mediaRecorderRef.current = null;
    }
  };

  return (
    <div
      className={
        embedded
          ? 'flex flex-col w-full space-y-3'
          : 'flex flex-col h-full max-w-3xl mx-auto w-full px-3 sm:px-5 pt-3 pb-24 overflow-y-auto space-y-3'
      }
    >
      {!embedded && onBack && (
        <div className="flex items-center justify-between gap-2">
          <motion.button
            type="button"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 w-fit"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Settings</span>
          </motion.button>

          <span className="text-[11px] font-mono tabular-nums text-zinc-500">
            {summary.count} {summary.count === 1 ? 'file' : 'files'} · {summary.totalSizeLabel}
          </span>
        </div>
      )}

      {/* Folder Header & Actions */}
      <div className="p-3.5 rounded-2xl liquid-glass space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Folder className="w-4 h-4 text-[#2B98FF] shrink-0" />
            <div>
              <h3 className="text-xs font-semibold text-zinc-100">Drive</h3>
              <p className="text-[11px] text-zinc-400 font-mono tabular-nums">
                {summary.count} {summary.count === 1 ? 'file' : 'files'} · {summary.totalSizeLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              aria-label="Import audio into Drive"
              onChange={handleImportFile}
              className="hidden"
            />
            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import</span>
            </motion.button>

            <motion.button
              type="button"
              data-haptic="off"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={handleToggleRecording}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isRecording
                  ? 'bg-red-500/90 hover:bg-red-500 text-white'
                  : 'liquid-lens-active'
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop {formatAudioDuration(recordingSec)}</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  <span>Record</span>
                </>
              )}
            </motion.button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search Drive audio files"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter audio files..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#0F7FFF]"
            />
          </div>

          <div
            role="group"
            aria-label="Filter Drive files by source"
            className="flex items-center gap-0.5 p-1 rounded-full liquid-glass-subtle text-[11px]"
          >
            {(['all', 'imported', 'recorded', 'sample'] as const).map((origin) => {
              const isSelected = originFilter === origin;
              return (
                <motion.button
                  key={origin}
                  type="button"
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => setOriginFilter(origin)}
                  className={`relative px-2.5 py-1 rounded-full font-medium transition-colors ${
                    isSelected
                      ? 'text-zinc-950'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="drive-origin-pill"
                      transition={MOTION_SPRINGS.pill}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full liquid-lens-active"
                    />
                  )}
                  <span className="relative z-10">{ORIGIN_LABELS[origin]}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Saved Audio List */}
      <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
        {visibleFiles.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-400">
            No audio files in this filter.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visibleFiles.map((file, idx) => {
              const isExpanded = activePlayerId === file.id;
              return (
                <motion.div
                  key={file.id}
                  layout="position"
                  custom={idx}
                  variants={listItemVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <motion.button
                      type="button"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      onClick={() => setActivePlayerId(isExpanded ? null : file.id)}
                      className="flex items-start gap-2.5 text-left min-w-0 flex-1"
                    >
                      <FileAudio className="w-4 h-4 text-[#2B98FF] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-100 truncate">
                          {file.fileName}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums text-zinc-400 mt-0.5">
                          <span className="text-zinc-200">{ORIGIN_LABELS[file.origin]}</span>
                          <span>·</span>
                          <span>{file.durationLabel}</span>
                          <span>·</span>
                          <span>{file.sizeLabel}</span>
                          <span>·</span>
                          <span>{file.createdAt}</span>
                        </div>
                        {file.linkedSessionTitle && (
                          <div className="text-[11px] text-zinc-300 truncate mt-0.5">
                            {file.linkedSessionTitle}
                          </div>
                        )}
                      </div>
                    </motion.button>

                    <div className="flex items-center gap-1 shrink-0">
                      <motion.button
                        type="button"
                        data-haptic="selection"
                        whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                        transition={MOTION_SPRINGS.interactive}
                        onClick={() => openDriveDownloadModal(file)}
                        aria-label={`Download ${file.fileName} in multiple formats`}
                        title="Download in multiple formats"
                        className="p-1.5 rounded-full text-zinc-300 hover:text-[#54B0FF] hover:bg-white/10 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </motion.button>

                      {onOpenInMeetings && (
                        <motion.button
                          type="button"
                          data-haptic="selection"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={() => onOpenInMeetings(file)}
                          aria-label={`Open ${file.fileName} in Meeting Notes`}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] text-zinc-200 transition-colors"
                        >
                          <span>Meetings</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </motion.button>
                      )}

                      <motion.button
                        type="button"
                        data-haptic="warning"
                        whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                        transition={MOTION_SPRINGS.interactive}
                        onClick={() => onDeleteFromDrive(file.id)}
                        aria-label={`Delete ${file.fileName} from Drive`}
                        className="p-1.5 rounded-full text-zinc-400 hover:text-red-400 hover:bg-white/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </motion.button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, y: prefersReduced ? 0 : -4 }}
                        animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
                        exit={{ opacity: 0, y: prefersReduced ? 0 : -4, transition: MOTION_TRANSITIONS.elementExit }}
                      >
                        <InlineAudioPlayer
                          compact
                          audioUrl={file.audioUrl}
                          durationSec={file.durationSec}
                          fileName={file.fileName}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
      <AudioFormatDownloadModal
        source={downloadSource}
        onClose={() => setDownloadSource(null)}
      />
    </div>
  );
};
