import type {
  DictationHistoryEntry,
  DictationHistoryRetention
} from '../types/index.ts';

const DICTATION_HISTORY_KEY = 'nudge_dictation_history_v1';

export function pruneDictationHistoryByRetention(
  entries: readonly DictationHistoryEntry[],
  retention: DictationHistoryRetention,
  nowMs: number = Date.now()
): DictationHistoryEntry[] {
  if (retention === 'none') return [];
  if (retention === '30d') {
    const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
    return entries.filter((e) => {
      const t = Date.parse(e.createdIso);
      return Number.isNaN(t) || t >= cutoff;
    });
  }
  return [...entries];
}

export function loadDictationHistory(
  retention: DictationHistoryRetention = 'forever'
): DictationHistoryEntry[] {
  if (retention === 'none' || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DICTATION_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DictationHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    const pruned = pruneDictationHistoryByRetention(parsed, retention);
    if (pruned.length !== parsed.length) {
      saveDictationHistory(pruned);
    }
    return pruned;
  } catch {
    return [];
  }
}

export function saveDictationHistory(entries: readonly DictationHistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Strip transient blob URLs if needed or keep up to 150 latest entries
    window.localStorage.setItem(DICTATION_HISTORY_KEY, JSON.stringify(entries.slice(0, 150)));
  } catch {
    // ignore quota limits
  }
}

export function createDictationHistoryEntry(input: {
  modeId: string;
  modeName: string;
  sttModelId: string;
  sttModelName: string;
  textModelId?: string;
  rawText: string;
  finalText: string;
  translatedText?: string;
  detectedLang?: string;
  sourceLang: string;
  targetLang: string;
  durationSec: number;
  audioDriveId?: string;
  audioMimeType?: string;
  insertedTarget?: DictationHistoryEntry['insertedTarget'];
  localOnlyUsed: boolean;
}): DictationHistoryEntry {
  const effectiveText = (input.translatedText || input.finalText || input.rawText).trim();
  const wordCount = effectiveText ? effectiveText.split(/\s+/).filter(Boolean).length : 0;
  return {
    id: `dict-hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdIso: new Date().toISOString(),
    modeId: input.modeId,
    modeName: input.modeName,
    sttModelId: input.sttModelId,
    sttModelName: input.sttModelName,
    textModelId: input.textModelId,
    rawText: input.rawText.trim(),
    finalText: input.finalText.trim(),
    translatedText: input.translatedText?.trim() || undefined,
    detectedLang: input.detectedLang || input.sourceLang,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    durationSec: Math.max(1, Math.round(input.durationSec || 1)),
    wordCount,
    audioDriveId: input.audioDriveId,
    audioMimeType: input.audioMimeType,
    insertedTarget: input.insertedTarget || 'history',
    localOnlyUsed: Boolean(input.localOnlyUsed)
  };
}

export function addDictationHistoryEntry(
  entries: readonly DictationHistoryEntry[],
  newEntry: DictationHistoryEntry,
  retention: DictationHistoryRetention
): DictationHistoryEntry[] {
  if (retention === 'none') {
    saveDictationHistory([]);
    return [];
  }
  const next = pruneDictationHistoryByRetention([newEntry, ...entries], retention).slice(0, 150);
  saveDictationHistory(next);
  return next;
}

export function removeDictationHistoryEntry(
  entries: readonly DictationHistoryEntry[],
  entryId: string
): DictationHistoryEntry[] {
  const next = entries.filter((e) => e.id !== entryId);
  saveDictationHistory(next);
  return next;
}

export function wipeDictationHistory(): DictationHistoryEntry[] {
  saveDictationHistory([]);
  return [];
}

export function searchDictationHistory(
  entries: readonly DictationHistoryEntry[],
  query: string
): DictationHistoryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter((e) =>
    `${e.finalText} ${e.translatedText || ''} ${e.rawText} ${e.modeName} ${e.sttModelName}`
      .toLowerCase()
      .includes(q)
  );
}

function formatSubtitleTimestamp(totalSec: number, vtt: boolean): string {
  const clamped = Math.max(0, totalSec);
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const sep = vtt ? '.' : ',';
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}${sep}000`;
}

export function formatHistoryEntryAsMarkdown(entry: DictationHistoryEntry): string {
  const lines = [
    `# Dictation Note — ${entry.modeName}`,
    '',
    `- **Date**: ${entry.createdIso}`,
    `- **Speech Model**: ${entry.sttModelName}`,
    `- **Languages**: ${entry.sourceLang}${entry.translatedText ? ` → ${entry.targetLang}` : ''}`,
    `- **Mode / Shield**: ${entry.localOnlyUsed ? 'Local-Only (Zero Egress)' : 'Hybrid Gateway'}`,
    '',
    '## Output',
    '',
    entry.translatedText || entry.finalText,
    ''
  ];
  if (entry.translatedText && entry.finalText && entry.translatedText !== entry.finalText) {
    lines.push(`## Source Transcript (${entry.sourceLang})`, '', entry.finalText, '');
  }
  return lines.join('\n');
}

export function formatHistoryEntryAsTxt(entry: DictationHistoryEntry): string {
  const primary = entry.translatedText || entry.finalText;
  if (entry.translatedText && entry.finalText && entry.translatedText !== entry.finalText) {
    return `${primary}\n\n--- Source (${entry.sourceLang}) ---\n${entry.finalText}`;
  }
  return primary;
}

export function formatHistoryEntryAsSrt(entry: DictationHistoryEntry): string {
  const text = entry.translatedText || entry.finalText || entry.rawText;
  const end = formatSubtitleTimestamp(Math.max(2, entry.durationSec), false);
  return `1\n00:00:00,000 --> ${end}\n${text}\n`;
}

export function formatHistoryEntryAsVtt(entry: DictationHistoryEntry): string {
  const text = entry.translatedText || entry.finalText || entry.rawText;
  const end = formatSubtitleTimestamp(Math.max(2, entry.durationSec), true);
  return `WEBVTT\n\n00:00:00.000 --> ${end}\n${text}\n`;
}
