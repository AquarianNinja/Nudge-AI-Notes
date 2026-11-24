import React from 'react';
import {
  AlignLeft,
  Captions,
  FileCode,
  FileJson,
  FileText,
  FileType
} from 'lucide-react';
import { AnyExportFormat } from '../types/index.ts';

export interface ExportFormatVisualMeta {
  label: string;
  shortTag: string;
  ext: string;
  iconClass: string;
  badgeClass: string;
}

export const EXPORT_FORMAT_META: Record<AnyExportFormat, ExportFormatVisualMeta> = {
  markdown: {
    label: 'Markdown',
    shortTag: 'MD',
    ext: '.md',
    iconClass: 'text-sky-400',
    badgeClass: 'bg-sky-950/60 border-sky-800/60 text-sky-300'
  },
  json: {
    label: 'JSON',
    shortTag: 'JSON',
    ext: '.json',
    iconClass: 'text-amber-400',
    badgeClass: 'bg-amber-950/60 border-amber-800/60 text-amber-300'
  },
  docx: {
    label: 'Word',
    shortTag: 'DOCX',
    ext: '.docx',
    iconClass: 'text-blue-400',
    badgeClass: 'bg-blue-950/60 border-blue-800/60 text-blue-300'
  },
  pdf: {
    label: 'PDF',
    shortTag: 'PDF',
    ext: '.pdf',
    iconClass: 'text-rose-400',
    badgeClass: 'bg-rose-950/60 border-rose-800/60 text-rose-300'
  },
  vtt: {
    label: 'WebVTT',
    shortTag: 'VTT',
    ext: '.vtt',
    iconClass: 'text-emerald-400',
    badgeClass: 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
  },
  txt: {
    label: 'Plain Text',
    shortTag: 'TXT',
    ext: '.txt',
    iconClass: 'text-zinc-300',
    badgeClass: 'bg-white/[0.08] border-white/15 text-zinc-200'
  }
};

interface ExportFormatIconProps {
  format: AnyExportFormat;
  className?: string;
  framed?: boolean;
}

export const ExportFormatIcon: React.FC<ExportFormatIconProps> = ({
  format,
  className = 'w-3.5 h-3.5',
  framed = false
}) => {
  const meta = EXPORT_FORMAT_META[format];

  const renderGlyph = () => {
    switch (format) {
      case 'markdown':
        return <FileCode className={`${className} ${meta.iconClass} shrink-0`} aria-hidden="true" />;
      case 'json':
        return <FileJson className={`${className} ${meta.iconClass} shrink-0`} aria-hidden="true" />;
      case 'docx':
        return <FileText className={`${className} ${meta.iconClass} shrink-0`} aria-hidden="true" />;
      case 'pdf':
        return <FileType className={`${className} ${meta.iconClass} shrink-0`} aria-hidden="true" />;
      case 'vtt':
        return <Captions className={`${className} ${meta.iconClass} shrink-0`} aria-hidden="true" />;
      case 'txt':
      default:
        return <AlignLeft className={`${className} ${meta.iconClass} shrink-0`} aria-hidden="true" />;
    }
  };

  if (!framed) {
    return renderGlyph();
  }

  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border shrink-0 ${meta.badgeClass}`}
    >
      {renderGlyph()}
    </span>
  );
};
