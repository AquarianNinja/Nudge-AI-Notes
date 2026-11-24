import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckSquare, Download, Eye, Square, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AnyExportFormat,
  DictionaryEntry,
  ExportFilterOptions,
  MeetingItemCategory,
  MeetingNotesExportFormat,
  MeetingNotesExportOptions,
  MeetingSession,
  TranscriptExportFormat,
  TranscriptExportOptions
} from '../types/index.ts';
import {
  buildPreparedExportPreview,
  summarizeExportSelection
} from '../utils/documentExport.ts';
import { formatFileSize } from '../utils/meetingNotes.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS, MOTION_TRANSITIONS } from '../utils/motion.ts';
import { MotionSheet } from './MotionPrimitives.tsx';
import { EXPORT_FORMAT_META, ExportFormatIcon } from './ExportFormatIcon.tsx';

export interface PrepareExportRequest {
  session: MeetingSession;
  kind: 'transcript' | 'notes';
  format: AnyExportFormat;
}

export interface ConfirmPreparedExportPayload {
  session: MeetingSession;
  kind: 'transcript' | 'notes';
  format: AnyExportFormat;
  filterOptions: ExportFilterOptions;
  selectionSummary: string;
}

interface PrepareExportModalProps {
  request: PrepareExportRequest | null;
  dictionaryEntries: DictionaryEntry[];
  onClose: () => void;
  onBackToFormats?: (session: MeetingSession) => void;
  onConfirmExport: (payload: ConfirmPreparedExportPayload) => void;
}

const TRANSCRIPT_FORMAT_OPTIONS: TranscriptExportFormat[] = [
  'markdown',
  'json',
  'docx',
  'pdf',
  'vtt',
  'txt'
];

const NOTES_FORMAT_OPTIONS: MeetingNotesExportFormat[] = ['docx', 'pdf', 'markdown'];

const CATEGORY_LABEL: Record<MeetingItemCategory, string> = {
  decision: 'Decision',
  action: 'Action',
  risk: 'Risk'
};

export const PrepareExportModal: React.FC<PrepareExportModalProps> = ({
  request,
  dictionaryEntries,
  onClose,
  onBackToFormats,
  onConfirmExport
}) => {
  const prefersReduced = Boolean(useReducedMotion());

  const [selectedFormat, setSelectedFormat] = useState<AnyExportFormat>('markdown');

  // Transcript options
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeDictionaryTerms, setIncludeDictionaryTerms] = useState(true);
  const [selectedHighlightIndices, setSelectedHighlightIndices] = useState<number[]>([]);

  // Notes section + item options
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeDecisions, setIncludeDecisions] = useState(true);
  const [includeActions, setIncludeActions] = useState(true);
  const [includeRisks, setIncludeRisks] = useState(true);
  const [includeHighlights, setIncludeHighlights] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  useEffect(() => {
    if (!request) return;
    setSelectedFormat(request.format);
    setIncludeMetadata(true);
    setIncludeDictionaryTerms(true);
    setIncludeSummary(true);
    setIncludeDecisions(true);
    setIncludeActions(true);
    setIncludeRisks(true);
    setIncludeHighlights(true);
    setSelectedHighlightIndices(request.session.highlights.map((_, idx) => idx));
    setSelectedItemIds(request.session.items.map(item => item.id));
  }, [request]);

  const filterOptions: ExportFilterOptions = useMemo(() => {
    if (!request) return {};
    if (request.kind === 'transcript') {
      const opts: TranscriptExportOptions = {
        includeMetadata,
        includeDictionaryTerms,
        includedHighlightIndices: selectedHighlightIndices
      };
      return opts;
    }
    const opts: MeetingNotesExportOptions = {
      includeMetadata,
      includeSummary,
      includeDecisions,
      includeActions,
      includeRisks,
      includeHighlights,
      includedItemIds: selectedItemIds,
      includedHighlightIndices: selectedHighlightIndices
    };
    return opts;
  }, [
    request,
    includeMetadata,
    includeDictionaryTerms,
    selectedHighlightIndices,
    includeSummary,
    includeDecisions,
    includeActions,
    includeRisks,
    includeHighlights,
    selectedItemIds
  ]);

  const preview = useMemo(() => {
    if (!request) return null;
    return buildPreparedExportPreview(
      request.session,
      request.kind,
      selectedFormat,
      dictionaryEntries,
      filterOptions
    );
  }, [request, selectedFormat, dictionaryEntries, filterOptions]);

  const selectionSummary = useMemo(() => {
    if (!request) return '';
    return summarizeExportSelection(request.session, request.kind, filterOptions);
  }, [request, filterOptions]);

  const hasAnyContent = useMemo(() => {
    if (!request) return false;
    if (request.kind === 'transcript') {
      return selectedHighlightIndices.length > 0 || includeMetadata;
    }
    return (
      includeSummary ||
      (includeHighlights && selectedHighlightIndices.length > 0) ||
      ((includeDecisions || includeActions || includeRisks) && selectedItemIds.length > 0)
    );
  }, [
    request,
    selectedHighlightIndices,
    includeMetadata,
    includeSummary,
    includeHighlights,
    includeDecisions,
    includeActions,
    includeRisks,
    selectedItemIds
  ]);

  const toggleHighlightIndex = (idx: number) => {
    triggerHaptic('selection');
    setSelectedHighlightIndices(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx].sort((a, b) => a - b)
    );
  };

  const toggleItemId = (id: string) => {
    triggerHaptic('selection');
    setSelectedItemIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handleSelectAllTurns = () => {
    if (!request) return;
    triggerHaptic('selection');
    setSelectedHighlightIndices(request.session.highlights.map((_, i) => i));
  };

  const handleClearTurns = () => {
    triggerHaptic('selection');
    setSelectedHighlightIndices([]);
  };

  const handleResetAll = () => {
    if (!request) return;
    triggerHaptic('selection');
    setIncludeMetadata(true);
    setIncludeDictionaryTerms(true);
    setIncludeSummary(true);
    setIncludeDecisions(true);
    setIncludeActions(true);
    setIncludeRisks(true);
    setIncludeHighlights(true);
    setSelectedHighlightIndices(request.session.highlights.map((_, i) => i));
    setSelectedItemIds(request.session.items.map(i => i.id));
  };

  const formatList =
    request?.kind === 'notes' ? NOTES_FORMAT_OPTIONS : TRANSCRIPT_FORMAT_OPTIONS;
  const meta = EXPORT_FORMAT_META[selectedFormat];

  return (
    <MotionSheet
      isOpen={Boolean(request)}
      onClose={onClose}
      ariaLabel="Prepare Export"
      maxWidthClass="max-w-3xl"
    >
      {request && preview && (
        <div className="flex flex-col max-h-[86vh]">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <ExportFormatIcon format={selectedFormat} framed />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-100 truncate">
                  Prepare Export · S{request.session.sessionNumber}{' '}
                  {request.kind === 'transcript' ? 'Transcript' : 'Meeting Notes'}
                </div>
                <div className="text-[11px] font-mono text-zinc-400 truncate">
                  {request.session.title} · {preview.fileName}
                </div>
              </div>
            </div>

            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={onClose}
              aria-label="Close Prepare Export modal"
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 shrink-0 transition-colors"
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>

          {/* Format Switcher Bar */}
          <div className="px-4 py-2 border-b border-white/10 bg-white/4 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
            <div className="flex items-center gap-1.5">
              {formatList.map(fmt => {
                const fmtMeta = EXPORT_FORMAT_META[fmt];
                const active = selectedFormat === fmt;
                return (
                  <motion.button
                    key={fmt}
                    type="button"
                    data-haptic="off"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => {
                      triggerHaptic('selection');
                      setSelectedFormat(fmt);
                    }}
                    className={`relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors shrink-0 whitespace-nowrap ${
                      active
                        ? 'text-zinc-950 font-semibold'
                        : 'liquid-glass-subtle hover:bg-white/10 text-zinc-200'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="prepare-export-format-pill"
                        transition={MOTION_SPRINGS.pill}
                        aria-hidden="true"
                        className="absolute inset-0 rounded-full liquid-lens-active"
                      />
                    )}
                    <ExportFormatIcon format={fmt} className="relative z-10 w-3 h-3" />
                    <span className="relative z-10">{fmtMeta.label}</span>
                  </motion.button>
                );
              })}
            </div>

            <motion.button
              type="button"
              data-haptic="off"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={handleResetAll}
              className="text-[11px] font-mono text-zinc-400 hover:text-white px-2.5 py-1 rounded-full hover:bg-white/10 shrink-0 whitespace-nowrap"
            >
              Reset All
            </motion.button>
          </div>

          {/* Split Body: Left Section/Turn Selector | Right Live Preview */}
          <div className="grid grid-cols-1 group-data-[device-frame=false]/app:md:grid-cols-12 flex-1 min-h-0 overflow-y-auto group-data-[device-frame=false]/app:md:overflow-hidden">
            {/* Left Selector Column */}
            <div className="group-data-[device-frame=false]/app:md:col-span-5 border-b group-data-[device-frame=false]/app:md:border-b-0 group-data-[device-frame=false]/app:md:border-r border-white/10 p-4 space-y-4 group-data-[device-frame=false]/app:md:overflow-y-auto">
              {/* Sections */}
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-zinc-400">
                  Sections to Include
                </div>

                <motion.label
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 cursor-pointer hover:bg-white/10"
                >
                  <span>Header & Session Metadata</span>
                  <input
                    type="checkbox"
                    data-haptic="off"
                    checked={includeMetadata}
                    onChange={e => {
                      triggerHaptic('selection');
                      setIncludeMetadata(e.target.checked);
                    }}
                    className="rounded border-white/25 bg-white/10 accent-[#2B98FF]"
                  />
                </motion.label>

                {request.kind === 'transcript' ? (
                  <motion.label
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 cursor-pointer hover:bg-white/10"
                  >
                    <span>Domain Dictionary Terms</span>
                    <input
                      type="checkbox"
                      data-haptic="off"
                      checked={includeDictionaryTerms}
                      onChange={e => {
                        triggerHaptic('selection');
                        setIncludeDictionaryTerms(e.target.checked);
                      }}
                      className="rounded border-white/25 bg-white/10 accent-[#2B98FF]"
                    />
                  </motion.label>
                ) : (
                  <div className="space-y-1.5">
                    <motion.label
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 cursor-pointer hover:bg-white/10"
                    >
                      <span>Executive Summary</span>
                      <input
                        type="checkbox"
                        data-haptic="off"
                        checked={includeSummary}
                        onChange={e => {
                          triggerHaptic('selection');
                          setIncludeSummary(e.target.checked);
                        }}
                        className="rounded border-white/25 bg-white/10 accent-[#2B98FF]"
                      />
                    </motion.label>
                    <motion.label
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 cursor-pointer hover:bg-white/10"
                    >
                      <span>Decisions</span>
                      <input
                        type="checkbox"
                        data-haptic="off"
                        checked={includeDecisions}
                        onChange={e => {
                          triggerHaptic('selection');
                          setIncludeDecisions(e.target.checked);
                        }}
                        className="rounded border-white/25 bg-white/10 accent-[#2B98FF]"
                      />
                    </motion.label>
                    <motion.label
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 cursor-pointer hover:bg-white/10"
                    >
                      <span>Action Items</span>
                      <input
                        type="checkbox"
                        data-haptic="off"
                        checked={includeActions}
                        onChange={e => {
                          triggerHaptic('selection');
                          setIncludeActions(e.target.checked);
                        }}
                        className="rounded border-white/25 bg-white/10 accent-[#2B98FF]"
                      />
                    </motion.label>
                    <motion.label
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 cursor-pointer hover:bg-white/10"
                    >
                      <span>Risks & Blockers</span>
                      <input
                        type="checkbox"
                        data-haptic="off"
                        checked={includeRisks}
                        onChange={e => {
                          triggerHaptic('selection');
                          setIncludeRisks(e.target.checked);
                        }}
                        className="rounded border-white/25 bg-white/10 accent-[#2B98FF]"
                      />
                    </motion.label>
                    <motion.label
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 cursor-pointer hover:bg-white/10"
                    >
                      <span>Timestamped Highlights</span>
                      <input
                        type="checkbox"
                        data-haptic="off"
                        checked={includeHighlights}
                        onChange={e => {
                          triggerHaptic('selection');
                          setIncludeHighlights(e.target.checked);
                        }}
                        className="rounded border-white/25 bg-white/10 accent-[#2B98FF]"
                      />
                    </motion.label>
                  </div>
                )}
              </div>

              {/* Note Items Filter (for notes mode) */}
              {request.kind === 'notes' && request.session.items.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                      Note Items ({selectedItemIds.length}/{request.session.items.length})
                    </span>
                    <motion.button
                      type="button"
                      data-haptic="off"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      onClick={() => {
                        triggerHaptic('selection');
                        setSelectedItemIds(
                          selectedItemIds.length === request.session.items.length
                            ? []
                            : request.session.items.map(i => i.id)
                        );
                      }}
                      className="text-[10px] font-mono text-zinc-300 hover:text-white"
                    >
                      {selectedItemIds.length === request.session.items.length
                        ? 'Uncheck all'
                        : 'Select all'}
                    </motion.button>
                  </div>
                  <div className="space-y-1.5">
                    {request.session.items.map(item => {
                      const checked = selectedItemIds.includes(item.id);
                      return (
                        <motion.label
                          key={item.id}
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          className={`flex items-start gap-2 p-2.5 rounded-xl border text-[11px] cursor-pointer transition-colors ${
                            checked
                              ? 'bg-[#0F7FFF]/14 border-[#2B98FF]/45 text-zinc-100'
                              : 'liquid-glass-subtle border-white/10 text-zinc-400 opacity-75'
                          }`}
                        >
                          <input
                            type="checkbox"
                            data-haptic="off"
                            checked={checked}
                            onChange={() => toggleItemId(item.id)}
                            className="mt-0.5 rounded border-white/25 bg-white/10 accent-[#2B98FF] shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-mono text-[10px] text-zinc-400">
                              {CATEGORY_LABEL[item.category]}
                              {item.owner ? ` · ${item.owner}` : ''}
                            </div>
                            <div className="line-clamp-2 leading-snug">{item.text}</div>
                          </div>
                        </motion.label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Speaker Turns Selection */}
              {(request.kind === 'transcript' || includeHighlights) &&
                request.session.highlights.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                        Speaker Turns ({selectedHighlightIndices.length}/
                        {request.session.highlights.length})
                      </span>
                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <motion.button
                          type="button"
                          data-haptic="off"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={handleSelectAllTurns}
                          className="text-zinc-300 hover:text-white"
                        >
                          All
                        </motion.button>
                        <span className="text-zinc-600">·</span>
                        <motion.button
                          type="button"
                          data-haptic="off"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={handleClearTurns}
                          className="text-zinc-300 hover:text-white"
                        >
                          None
                        </motion.button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {request.session.highlights.map((turn, idx) => {
                        const checked = selectedHighlightIndices.includes(idx);
                        return (
                          <motion.button
                            key={`${turn.timestamp}-${idx}`}
                            type="button"
                            data-haptic="off"
                            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                            transition={MOTION_SPRINGS.interactive}
                            onClick={() => toggleHighlightIndex(idx)}
                            aria-pressed={checked}
                            className={`w-full text-left flex items-start gap-2 p-2.5 rounded-xl border text-[11px] transition-colors ${
                              checked
                                ? 'bg-[#0F7FFF]/14 border-[#2B98FF]/45 text-zinc-100'
                                : 'liquid-glass-subtle border-white/10 text-zinc-400 opacity-75'
                            }`}
                          >
                            {checked ? (
                              <CheckSquare className="w-3.5 h-3.5 text-[#2B98FF] shrink-0 mt-0.5" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                                <span className="text-zinc-400">{turn.timestamp}</span>
                                <span className="text-zinc-600">·</span>
                                <span className="text-zinc-200 font-semibold truncate">
                                  {turn.speaker}
                                </span>
                              </div>
                              <p className="line-clamp-2 leading-snug mt-0.5">{turn.text}</p>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>

            {/* Right Live Formatted Preview Column */}
            <div className="md:col-span-7 p-4 flex flex-col min-h-[260px] md:overflow-y-auto bg-black/20">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
                  <Eye className="w-3.5 h-3.5 text-[#2B98FF]" />
                  <span>Formatted Preview ({meta.ext})</span>
                </div>
                <span className="text-[10px] font-mono tabular-nums text-zinc-400">
                  ~{formatFileSize(preview.byteLength)}
                </span>
              </div>

              {!preview.isTextFormat && (
                <div className="mb-2 px-3 py-1.5 rounded-xl liquid-glass-subtle text-[11px] text-zinc-300">
                  Structured content preview — exported as binary {meta.label} ({meta.ext})
                </div>
              )}

              <motion.pre
                key={`${selectedFormat}-${selectionSummary}-${preview.byteLength}`}
                initial={prefersReduced ? { opacity: 0 } : { opacity: 0.7 }}
                animate={{ opacity: 1 }}
                transition={MOTION_TRANSITIONS.microEnter}
                aria-label="Export document preview"
                className="flex-1 p-3.5 rounded-2xl liquid-glass-subtle text-[11px] font-mono text-zinc-200 leading-relaxed whitespace-pre-wrap break-words overflow-y-auto max-h-[340px]"
              >
                {preview.previewText || 'Select at least one section or speaker turn to preview.'}
              </motion.pre>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {onBackToFormats && (
                <motion.button
                  type="button"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  onClick={() => {
                    const s = request.session;
                    onClose();
                    onBackToFormats(s);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-zinc-300 hover:text-white hover:bg-white/10 transition-colors shrink-0 whitespace-nowrap"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Formats</span>
                </motion.button>
              )}
              <span className="text-[11px] font-mono text-zinc-400 truncate hidden sm:inline">
                {selectionSummary}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
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
                data-haptic="off"
                whileTap={prefersReduced || !hasAnyContent ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                disabled={!hasAnyContent}
                onClick={() => {
                  triggerHaptic('medium');
                  onConfirmExport({
                    session: request.session,
                    kind: request.kind,
                    format: selectedFormat,
                    filterOptions,
                    selectionSummary
                  });
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full liquid-accent-glass text-xs font-semibold disabled:opacity-40 transition-opacity hover:opacity-95 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download {meta.ext}</span>
              </motion.button>
            </div>
          </div>
        </div>
      )}
    </MotionSheet>
  );
};
