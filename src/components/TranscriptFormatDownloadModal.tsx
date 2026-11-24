import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, FileText, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { PodcastEpisode, TranscriptExportFormat } from '../types/index.ts';
import {
  exportPodcastEpisodeTranscript,
  getExportByteLength,
  TRANSCRIPT_EXPORT_FORMATS,
  triggerBrowserDownload
} from '../utils/documentExport.ts';
import { formatFileSize } from '../utils/meetingNotes.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS } from '../utils/motion.ts';
import { ExportFormatIcon } from './ExportFormatIcon.tsx';
import { MotionSheet } from './MotionPrimitives.tsx';

interface TranscriptFormatDownloadModalProps {
  episode: PodcastEpisode | null;
  engineLabel?: string;
  filteredTurnIndices?: number[] | null;
  onClose: () => void;
}

export const TranscriptFormatDownloadModal: React.FC<TranscriptFormatDownloadModalProps> = ({
  episode,
  engineLabel,
  filteredTurnIndices,
  onClose
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [scope, setScope] = useState<'all' | 'filtered'>('all');
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [downloadedByFormat, setDownloadedByFormat] = useState<
    Partial<Record<TranscriptExportFormat, { fileName: string; sizeBytes: number }>>
  >({});
  const [lastSaved, setLastSaved] = useState<{
    format: TranscriptExportFormat;
    fileName: string;
    sizeBytes: number;
  } | null>(null);

  const hasActiveFilter =
    Boolean(episode) &&
    Array.isArray(filteredTurnIndices) &&
    filteredTurnIndices.length > 0 &&
    filteredTurnIndices.length < (episode?.dialogue.length ?? 0);

  useEffect(() => {
    setScope(hasActiveFilter ? 'filtered' : 'all');
    setDownloadedByFormat({});
    setLastSaved(null);
  }, [episode, hasActiveFilter]);

  const handleDownloadFormat = (format: TranscriptExportFormat) => {
    if (!episode) return;
    triggerHaptic('selection');

    const payload = exportPodcastEpisodeTranscript(episode, format, {
      engineLabel,
      includeMetadata,
      includedHighlightIndices:
        scope === 'filtered' && hasActiveFilter && filteredTurnIndices
          ? filteredTurnIndices
          : undefined
    });

    triggerBrowserDownload(payload);
    const sizeBytes = getExportByteLength(payload.data);
    setDownloadedByFormat((prev) => ({
      ...prev,
      [format]: { fileName: payload.fileName, sizeBytes }
    }));
    setLastSaved({
      format,
      fileName: payload.fileName,
      sizeBytes
    });
    triggerHaptic('success');
  };

  const turnCount =
    scope === 'filtered' && hasActiveFilter && filteredTurnIndices
      ? filteredTurnIndices.length
      : episode?.dialogue.length ?? 0;

  return (
    <MotionSheet
      isOpen={Boolean(episode)}
      onClose={onClose}
      ariaLabel="Download transcript in multiple formats"
      maxWidthClass="max-w-md"
    >
      {episode && (
        <div className="flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-3.5 border-b border-white/10">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-[#0F7FFF]/18 border border-[#2B98FF]/30 text-[#54B0FF] flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-50 truncate">
                  Download Transcript
                </h3>
                <p className="text-xs text-zinc-400 truncate mt-0.5">{episode.title}</p>
                <p className="text-[11px] font-mono tabular-nums text-zinc-500 truncate">
                  {episode.topic} · {turnCount} {turnCount === 1 ? 'turn' : 'turns'}
                </p>
              </div>
            </div>

            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={onClose}
              aria-label="Close transcript download dialog"
              className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Options & Formats */}
          <div className="p-4 space-y-3 overflow-y-auto">
            {hasActiveFilter && filteredTurnIndices && (
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] text-zinc-400">Turns to export</span>
                <div
                  role="group"
                  aria-label="Transcript export scope"
                  className="flex items-center gap-0.5 p-1 rounded-full liquid-glass-subtle text-[11px]"
                >
                  <button
                    type="button"
                    onClick={() => setScope('filtered')}
                    className={`px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                      scope === 'filtered'
                        ? 'liquid-lens-active text-zinc-950 font-semibold'
                        : 'text-zinc-300 hover:text-zinc-100'
                    }`}
                  >
                    Filtered ({filteredTurnIndices.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className={`px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                      scope === 'all'
                        ? 'liquid-lens-active text-zinc-950 font-semibold'
                        : 'text-zinc-300 hover:text-zinc-100'
                    }`}
                  >
                    All ({episode.dialogue.length})
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-[11px] text-zinc-400">
                Choose a document format to export locally
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={includeMetadata}
                onClick={() => setIncludeMetadata((prev) => !prev)}
                className="text-[11px] font-medium text-[#54B0FF] hover:text-sky-300 transition-colors whitespace-nowrap"
              >
                {includeMetadata ? 'Header: On' : 'Header: Off'}
              </button>
            </div>

            <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
              {TRANSCRIPT_EXPORT_FORMATS.map((fmt) => {
                const savedItem = downloadedByFormat[fmt.id];
                return (
                  <motion.button
                    key={fmt.id}
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => handleDownloadFormat(fmt.id)}
                    aria-label={`Download transcript as ${fmt.label} (${fmt.ext})`}
                    className="w-full min-h-[56px] flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ExportFormatIcon format={fmt.id} framed />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-100">
                            {fmt.label}
                          </span>
                          <span className="text-[11px] font-mono text-zinc-500">{fmt.ext}</span>
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {fmt.description}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {savedItem ? (
                        <span className="flex items-center gap-1 text-[11px] font-mono tabular-nums text-emerald-400 whitespace-nowrap">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{formatFileSize(savedItem.sizeBytes)}</span>
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

            {lastSaved && (
              <div
                role="status"
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-xs text-emerald-200"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate font-mono text-[11px]">
                  Saved {lastSaved.fileName} ({formatFileSize(lastSaved.sizeBytes)})
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </MotionSheet>
  );
};
