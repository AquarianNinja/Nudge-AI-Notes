import type { DictationMode } from '../types/index.ts';

export const SUPPORTED_DICTATION_LANGUAGES: readonly string[] = [
  'Auto-detect',
  'English (US)',
  'English (UK)',
  'Spanish',
  'French',
  'German',
  'Japanese',
  'Hindi',
  'Portuguese',
  'Italian',
  'Chinese (Mandarin)',
  'Korean',
  'Arabic'
] as const;

export const DEFAULT_DICTATION_MODES: DictationMode[] = [
  {
    id: 'clean-dictation',
    name: 'Clean Dictation',
    icon: 'sparkles',
    description: 'Removes filler words ("um", "uh"), fixes punctuation & keeps natural voice.',
    instructions:
      'Remove filler hesitations (um, uh, er, like, you know), fix grammar and punctuation, and keep exact meaning concise.',
    sttModelId: 'whisper-tiny-local',
    textModelId: 'gemini-4-hydrogen',
    spokenTrigger: 'clean note',
    stripTrigger: true,
    hotkey: 'Option+Space',
    outputAction: 'insert',
    translateEnabled: false,
    sourceLang: 'Auto-detect',
    targetLang: 'English (US)',
    builtIn: true
  },
  {
    id: 'email-memo',
    name: 'Email & Memo',
    icon: 'mail',
    description: 'Structures spoken thoughts into clean executive memo paragraphs and bullet items.',
    instructions:
      'Format the dictated transcript into a crisp, well-punctuated email or executive memo with clear paragraphs and concise bullet takeaways where appropriate.',
    sttModelId: 'whisper-base-local',
    textModelId: 'gemini-4-hydrogen',
    spokenTrigger: 'email note',
    stripTrigger: true,
    hotkey: 'Option+2',
    outputAction: 'insert',
    translateEnabled: false,
    sourceLang: 'Auto-detect',
    targetLang: 'English (US)',
    builtIn: true
  },
  {
    id: 'translate-ab',
    name: 'Translate A → B',
    icon: 'languages',
    description: 'Speak in Source Language A and immediately output cleaned translation in Target Language B.',
    instructions:
      'Translate the cleaned spoken transcript accurately from Source Language A into Target Language B while preserving technical nouns and tone.',
    sttModelId: 'whisper-base-local',
    textModelId: 'gemini-4-hydrogen',
    spokenTrigger: 'translate',
    stripTrigger: true,
    hotkey: 'Option+Shift+T',
    outputAction: 'insert',
    translateEnabled: true,
    sourceLang: 'Auto-detect',
    targetLang: 'Spanish',
    builtIn: true
  },
  {
    id: 'tech-code',
    name: 'Technical / Code',
    icon: 'code',
    description: 'Preserves camelCase, ClaimCenter/Gosu entities, API endpoints & CLI syntax.',
    instructions:
      'Preserve exact technical identifiers, camelCase, PascalCase, ClaimCenter/PolicyCenter entities, Gosu symbols, and CLI commands without over-correcting jargon.',
    sttModelId: 'parakeet-v2-local',
    textModelId: 'gemini-4-hydrogen',
    spokenTrigger: 'tech note',
    stripTrigger: true,
    hotkey: 'Option+4',
    outputAction: 'insert',
    translateEnabled: false,
    sourceLang: 'English (US)',
    targetLang: 'English (US)',
    builtIn: true
  }
];

const CUSTOM_MODES_STORAGE_KEY = 'nudge_custom_dictation_modes_v1';

export function loadDictationModes(persisted?: DictationMode[]): DictationMode[] {
  if (Array.isArray(persisted) && persisted.length > 0) {
    return persisted;
  }
  if (typeof window === 'undefined') {
    return DEFAULT_DICTATION_MODES;
  }
  try {
    const raw = window.localStorage.getItem(CUSTOM_MODES_STORAGE_KEY);
    if (!raw) return DEFAULT_DICTATION_MODES;
    const custom = JSON.parse(raw) as DictationMode[];
    if (!Array.isArray(custom)) return DEFAULT_DICTATION_MODES;
    const byId = new Map<string, DictationMode>();
    for (const m of DEFAULT_DICTATION_MODES) byId.set(m.id, m);
    for (const m of custom) {
      if (m && m.id && m.name) byId.set(m.id, m);
    }
    return Array.from(byId.values());
  } catch {
    return DEFAULT_DICTATION_MODES;
  }
}

export function saveCustomDictationModes(modes: DictationMode[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOM_MODES_STORAGE_KEY, JSON.stringify(modes));
  } catch {
    // ignore storage quota errors
  }
}

export function resolveActiveDictationMode(
  modes: readonly DictationMode[],
  activeModeId?: string
): DictationMode {
  return modes.find((m) => m.id === activeModeId) || modes[0] || DEFAULT_DICTATION_MODES[0];
}

export function applySpokenTriggerAndFormat(
  rawText: string,
  modes: readonly DictationMode[],
  fallbackMode: DictationMode
): {
  matchedMode: DictationMode;
  cleanedInput: string;
  triggeredByVoice: boolean;
} {
  const trimmed = rawText.trim();
  const lower = trimmed.toLowerCase();

  for (const mode of modes) {
    const trigger = mode.spokenTrigger.trim().toLowerCase();
    if (!trigger) continue;
    const prefixPatterns = [`${trigger}:`, `${trigger},`, `${trigger} `];
    const matchedPrefix = prefixPatterns.find((p) => lower.startsWith(p));
    if (matchedPrefix || lower === trigger) {
      const remainder = mode.stripTrigger
        ? trimmed.slice(trigger.length).replace(/^[\s:,-]+/, '').trim()
        : trimmed;
      return {
        matchedMode: mode,
        cleanedInput: remainder || trimmed,
        triggeredByVoice: true
      };
    }
  }

  return {
    matchedMode: fallbackMode,
    cleanedInput: trimmed,
    triggeredByVoice: false
  };
}

export function applyDeterministicOfflineCleanup(
  rawText: string,
  mode: DictationMode,
  autoPunctuation: boolean = true
): string {
  let text = rawText.trim().replace(/\s+/g, ' ');
  if (!text) return '';

  // Remove spoken hesitation fillers safely
  text = text
    .replace(/\b(um+|uh+|er+|ah+|you know)\b[\s,]*/gi, '')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!text) return rawText.trim();

  if (autoPunctuation) {
    // Capitalize first letter of sentences
    text = text.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
    if (!/[.!?]$/.test(text) && mode.id !== 'tech-code') {
      text += '.';
    }
  }

  if (mode.id === 'email-memo' && text.length > 90 && !text.includes('\n')) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length >= 2) {
      return `${sentences[0]}\n\n${sentences
        .slice(1)
        .map((s) => `• ${s}`)
        .join('\n')}`;
    }
  }

  return text;
}

export function buildOfflineTranslationFallbackNote(params: {
  cleanedText: string;
  sourceLang: string;
  targetLang: string;
  localOnlyBlocked: boolean;
}): string {
  if (!params.cleanedText.trim()) return '';
  if (params.sourceLang === params.targetLang) return params.cleanedText;
  const reason = params.localOnlyBlocked
    ? `Offline raw output (Local-Only blocks cloud A→B translation to ${params.targetLang}; configure loopback Ollama for offline neural translation)`
    : `Direct offline fallback (${params.sourceLang} → ${params.targetLang})`;
  return `${params.cleanedText}\n\n[${reason}]`;
}
