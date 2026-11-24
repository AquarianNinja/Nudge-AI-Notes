import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, FileAudio, Loader2, X, AlertCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AUDIO_EXPORT_FORMATS,
  AudioExportFormat,
  convertAndDownloadAudioFile
} from '../utils/audioConversion.ts';
import { formatFileSize } from '../utils/meetingNotes.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS } from '../utils/motion.ts';
import { MotionSheet } from './MotionPrimitives.tsx';

export interface AudioDownloadSource {
  title: string;
  subtitle?: string;
  baseName: string;
  sourceExt: string;
  getSourceBytes: () => Promise<Uint8Array>;
}

interface AudioFormatDownloadModalProps {
  source: AudioDownloadSource | null;
  onClose: () => void;
}

export const AudioFormatDownloadModal: React.FC<AudioFormatDownloadModalProps> = ({
  source,
  onClose
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [convertingFormat, setConvertingFormat] = useState<AudioExportFormat | null>(null);
  const [downloadedInfo, setDownloadedInfo] = useState<{
    format: AudioExportFormat;
    fileName: string;
    sizeBytes: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setConvertingFormat(null);
    setDownloadedInfo(null);
    setErrorMsg(null);
  }, [source]);

  const handleConvertAndDownload = async (format: AudioExportFormat) => {
    if (!source || convertingFormat) return;
    setErrorMsg(null);
    setConvertingFormat(format);
    triggerHaptic('selection');

    try {
      const sourceBytes = await source.getSourceBytes();
      const res = await convertAndDownloadAudioFile({
        sourceBytes,
        sourceExt: source.sourceExt,
        baseName: source.baseName,
        targetFormat: format
      });
      setDownloadedInfo({
        format: res.format,
        fileName: res.fileName,
        sizeBytes: res.sizeBytes
      });
      triggerHaptic('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to convert audio file.');
      triggerHaptic('warning');
    } finally {
      setConvertingFormat(null);
    }
  };

  return (
    <MotionSheet
      isOpen={Boolean(source)}
      onClose={onClose}
      ariaLabel="Download audio in multiple formats"
      maxWidthClass="max-w-md"
    >
      {source && (
        <div className="flex flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-3.5 border-b border-white/10">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-[#0F7FFF]/18 border border-[#2B98FF]/30 text-[#54B0FF] flex items-center justify-center shrink-0">
                <FileAudio className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-50 truncate">
                  Export Audio Format
                </h3>
                <p className="text-xs text-zinc-400 truncate mt-0.5">{source.title}</p>
                {source.subtitle && (
                  <p className="text-[11px] font-mono text-zinc-500 truncate">{source.subtitle}</p>
                )}
              </div>
            </div>

            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={onClose}
              aria-label="Close export format dialog"
              className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          <div className="p-4 space-y-2.5 overflow-y-auto">
            <div className="text-[11px] text-zinc-400 px-1">
              Converted on the server via FFmpeg before download
            </div>

            <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
              {AUDIO_EXPORT_FORMATS.map((fmt) => {
                const isBusy = convertingFormat === fmt.id;
                const isDone = downloadedInfo?.format === fmt.id;
                return (
                  <motion.button
                    key={fmt.id}
                    type="button"
                    data-haptic="selection"
                    disabled={Boolean(convertingFormat)}
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => handleConvertAndDownload(fmt.id)}
                    aria-label={`Convert and download as ${fmt.label}`}
                    className="w-full min-h-[56px] flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.06] disabled:opacity-60 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-100">{fmt.label}</span>
                        <span className="text-[11px] font-mono text-zinc-500">.{fmt.extension}</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {fmt.codecLabel}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isBusy ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-mono text-[#54B0FF] whitespace-nowrap">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Converting...</span>
                        </span>
                      ) : isDone ? (
                        <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 whitespace-nowrap">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{formatFileSize(downloadedInfo.sizeBytes)}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-200 whitespace-nowrap">
                          <Download className="w-3.5 h-3.5 text-[#2B98FF]" />
                          <span>Download</span>
                        </span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {downloadedInfo && (
              <div
                role="status"
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-xs text-emerald-200"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate font-mono text-[11px]">
                  Saved {downloadedInfo.fileName} ({formatFileSize(downloadedInfo.sizeBytes)})
                </span>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-400/35 text-xs text-red-200"
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </MotionSheet>
  );
};
