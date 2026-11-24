import React, { useEffect, useState } from 'react';
import { Archive, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  MeetingNotesExportFormat,
  MeetingSession,
  TranscriptExportFormat
} from '../types/index.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS, buildListItemVariants } from '../utils/motion.ts';
import { AnimatedCheckmark, MotionSheet } from './MotionPrimitives.tsx';
import { ExportFormatIcon } from './ExportFormatIcon.tsx';

export interface BatchExportConfirmPayload {
  sessions: MeetingSession[];
  transcriptFormats: TranscriptExportFormat[];
  notesFormats: MeetingNotesExportFormat[];
}

interface BatchExportSheetProps {
  isOpen: boolean;
  selectedSessions: MeetingSession[];
  onClose: () => void;
  onStartBatchExport: (payload: BatchExportConfirmPayload) => void;
}

const TRANSCRIPT_OPTIONS: Array<{ id: TranscriptExportFormat; label: string; ext: string }> = [
  { id: 'markdown', label: 'Markdown', ext: '.md' },
  { id: 'json', label: 'JSON', ext: '.json' },
  { id: 'docx', label: 'Word', ext: '.docx' },
  { id: 'pdf', label: 'PDF', ext: '.pdf' },
  { id: 'vtt', label: 'WebVTT', ext: '.vtt' },
  { id: 'txt', label: 'Plain Text', ext: '.txt' }
];

const NOTES_OPTIONS: Array<{ id: MeetingNotesExportFormat; label: string; ext: string }> = [
  { id: 'docx', label: 'Word', ext: '.docx' },
  { id: 'pdf', label: 'PDF', ext: '.pdf' },
  { id: 'markdown', label: 'Markdown', ext: '.md' }
];

export const BatchExportSheet: React.FC<BatchExportSheetProps> = ({
  isOpen,
  selectedSessions,
  onClose,
  onStartBatchExport
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const listItemVariants = buildListItemVariants(prefersReduced);
  const [transcriptFormats, setTranscriptFormats] = useState<TranscriptExportFormat[]>([
    'markdown',
    'json'
  ]);
  const [notesFormats, setNotesFormats] = useState<MeetingNotesExportFormat[]>(['markdown', 'pdf']);

  useEffect(() => {
    if (!isOpen) return;
    setTranscriptFormats(['markdown', 'json']);
    setNotesFormats(['markdown', 'pdf']);
  }, [isOpen]);

  const toggleTranscriptFormat = (fmt: TranscriptExportFormat) => {
    triggerHaptic('selection');
    setTranscriptFormats(prev =>
      prev.includes(fmt) ? prev.filter(f => f !== fmt) : [...prev, fmt]
    );
  };

  const toggleNotesFormat = (fmt: MeetingNotesExportFormat) => {
    triggerHaptic('selection');
    setNotesFormats(prev => (prev.includes(fmt) ? prev.filter(f => f !== fmt) : [...prev, fmt]));
  };

  const totalFormats = transcriptFormats.length + notesFormats.length;
  const totalFiles = selectedSessions.length * totalFormats;

  return (
    <MotionSheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Batch export selected meetings to ZIP"
      maxWidthClass="max-w-md"
    >
      <div className="flex flex-col">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-white/12 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl liquid-glass-subtle flex items-center justify-center shrink-0">
              <Archive className="w-4 h-4 text-[#2B98FF]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-100 truncate">
                Batch ZIP Export
              </div>
              <div className="text-[11px] font-mono text-zinc-400 truncate">
                {selectedSessions.length}{' '}
                {selectedSessions.length === 1 ? 'session' : 'sessions'} · {totalFiles}{' '}
                {totalFiles === 1 ? 'document' : 'documents'} + manifest.json
              </div>
            </div>
          </div>
          <motion.button
            type="button"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={onClose}
            aria-label="Close batch export dialog"
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[68vh]">
          {/* Selected Sessions Strip */}
          <div className="flex flex-wrap gap-1.5">
            {selectedSessions.map((s, idx) => (
              <motion.span
                key={s.id}
                custom={idx}
                variants={listItemVariants}
                initial="initial"
                animate="animate"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full liquid-glass-subtle text-[11px] text-zinc-200"
              >
                <span className="font-mono text-[#2B98FF]">S{s.sessionNumber}</span>
                <span className="truncate max-w-[160px]">{s.title}</span>
              </motion.span>
            ))}
          </div>

          {/* Transcript Formats */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wide text-zinc-400">
                Transcript Formats
              </span>
              <span className="text-[10px] font-mono text-zinc-400">
                {transcriptFormats.length} selected
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TRANSCRIPT_OPTIONS.map(fmt => {
                const active = transcriptFormats.includes(fmt.id);
                return (
                  <motion.button
                    key={fmt.id}
                    type="button"
                    aria-pressed={active}
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    onClick={() => toggleTranscriptFormat(fmt.id)}
                    className={`flex flex-col items-start px-3 py-2 rounded-2xl border text-left transition-colors ${
                      active
                        ? 'bg-[#0F7FFF]/18 border-[#2B98FF]/55 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
                        : 'liquid-glass-subtle hover:bg-white/[0.08] border-white/10 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ExportFormatIcon format={fmt.id} className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium truncate">{fmt.label}</span>
                      </div>
                      {active && <AnimatedCheckmark className="w-3 h-3 text-[#2B98FF]" />}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 mt-1">{fmt.ext}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Notes Formats */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wide text-zinc-400">
                Meeting Notes Formats
              </span>
              <span className="text-[10px] font-mono text-zinc-400">
                {notesFormats.length} selected
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {NOTES_OPTIONS.map(fmt => {
                const active = notesFormats.includes(fmt.id);
                return (
                  <motion.button
                    key={fmt.id}
                    type="button"
                    aria-pressed={active}
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    onClick={() => toggleNotesFormat(fmt.id)}
                    className={`flex flex-col items-start px-3 py-2 rounded-2xl border text-left transition-colors ${
                      active
                        ? 'bg-[#0F7FFF]/18 border-[#2B98FF]/55 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
                        : 'liquid-glass-subtle hover:bg-white/[0.08] border-white/10 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ExportFormatIcon format={fmt.id} className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium truncate">{fmt.label}</span>
                      </div>
                      {active && <AnimatedCheckmark className="w-3 h-3 text-[#2B98FF]" />}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 mt-1">{fmt.ext}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/12 flex items-center justify-between gap-2 bg-black/25">
          <motion.button
            type="button"
            data-haptic="off"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={() => {
              triggerHaptic('selection');
              setTranscriptFormats(['markdown', 'json', 'docx', 'pdf', 'vtt', 'txt']);
              setNotesFormats(['docx', 'pdf', 'markdown']);
            }}
            className="text-[11px] font-mono text-zinc-300 hover:text-white transition-colors"
          >
            Select All Formats
          </motion.button>

          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-full liquid-glass-subtle text-xs text-zinc-300 hover:text-white transition-colors"
            >
              Cancel
            </motion.button>
            <motion.button
              type="button"
              data-haptic="off"
              whileTap={prefersReduced || selectedSessions.length === 0 || totalFormats === 0 ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              disabled={selectedSessions.length === 0 || totalFormats === 0}
              onClick={() => {
                triggerHaptic('medium');
                onClose();
                onStartBatchExport({
                  sessions: selectedSessions,
                  transcriptFormats,
                  notesFormats
                });
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full liquid-accent-glass text-xs font-semibold disabled:opacity-40 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Export ZIP ({totalFiles})</span>
            </motion.button>
          </div>
        </div>
      </div>
    </MotionSheet>
  );
};
