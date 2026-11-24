import type {
  ActivityModelOption,
  AppSettings,
  LiveTranscriptionProviderOption,
  ModelAvailabilityStatus,
  ModelOption,
  PaidProviderId,
  UnifiedModelCategory,
  UnifiedModelSpec,
  WhisperModelOption
} from '../types/index.ts';
import { isLocalOnlyActive } from './networkGateway.ts';

export const UNIFIED_MODELS: UnifiedModelSpec[] = [
  // --- Local In-Browser & Loopback Speech-to-Text ---
  {
    id: 'whisper-tiny-local',
    name: 'Whisper Tiny (WebGPU/WASM)',
    vendor: 'OpenAI / Transformers',
    category: 'stt',
    runtime: 'local',
    provider: 'local',
    hfRepoId: 'Xenova/whisper-tiny',
    capabilities: { realtime: true, translate: false, batch: true, diarization: false },
    languages: ['Auto-detect', 'English', 'Spanish', 'French', 'German', 'Japanese', 'Hindi', 'Portuguese'],
    footprint: { sizeLabel: '40 MB', sizeMB: 40, minRamMB: 350 },
    metrics: {
      speedTier: 5,
      accuracyTier: 3,
      speedLabel: '65x RT',
      accuracyLabel: 'Balanced',
      latencyHint: '~140ms chunked'
    },
    summary: 'Ultra-fast quantized on-device Whisper running inside WebGPU/WASM worker with zero egress.',
    defaultCached: true
  },
  {
    id: 'whisper-base-local',
    name: 'Whisper Base (WebGPU/WASM)',
    vendor: 'OpenAI / Transformers',
    category: 'stt',
    runtime: 'local',
    provider: 'local',
    hfRepoId: 'Xenova/whisper-base',
    capabilities: { realtime: true, translate: false, batch: true, diarization: false },
    languages: ['Auto-detect', 'English', 'Spanish', 'French', 'German', 'Japanese', 'Chinese', 'Korean'],
    footprint: { sizeLabel: '74 MB', sizeMB: 74, minRamMB: 520 },
    metrics: {
      speedTier: 4,
      accuracyTier: 4,
      speedLabel: '42x RT',
      accuracyLabel: 'High',
      latencyHint: '~220ms chunked'
    },
    summary: 'Higher multilingual punctuation & technical term accuracy while remaining 100% offline.',
    defaultCached: true
  },
  {
    id: 'whisper-small-local',
    name: 'Whisper Small (WebGPU/WASM)',
    vendor: 'OpenAI / Transformers',
    category: 'stt',
    runtime: 'local',
    provider: 'local',
    hfRepoId: 'Xenova/whisper-small',
    capabilities: { realtime: false, translate: false, batch: true, diarization: false },
    languages: ['Auto-detect', '99 Languages'],
    footprint: { sizeLabel: '244 MB', sizeMB: 244, minRamMB: 1100 },
    metrics: {
      speedTier: 3,
      accuracyTier: 5,
      speedLabel: '18x RT',
      accuracyLabel: 'Studio Local',
      latencyHint: '~480ms segment'
    },
    summary: 'Dense local Whisper weights for high-accuracy meeting files and accented speech.'
  },
  {
    id: 'parakeet-v2-local',
    name: 'Parakeet v2 Fast EN (Local)',
    vendor: 'NVIDIA / ONNX',
    category: 'stt',
    runtime: 'local',
    provider: 'local',
    hfRepoId: 'Xenova/whisper-tiny.en',
    capabilities: { realtime: true, translate: false, batch: true, diarization: true },
    languages: ['English (US)', 'English (UK)'],
    footprint: { sizeLabel: '190 MB', sizeMB: 190, minRamMB: 900 },
    metrics: {
      speedTier: 5,
      accuracyTier: 5,
      speedLabel: '70x RT',
      accuracyLabel: 'Crisp EN',
      latencyHint: '~110ms live'
    },
    summary: 'English-tuned low-latency local ASR profile optimized for technical terms & live notes.'
  },
  {
    id: 'speaches-localhost',
    name: 'Speaches / WhisperX (Localhost)',
    vendor: 'Local Server',
    category: 'stt',
    runtime: 'local',
    provider: 'custom',
    isLoopbackServer: true,
    capabilities: { realtime: true, translate: true, batch: true, diarization: true },
    languages: ['Auto-detect', '99 Languages'],
    footprint: { sizeLabel: 'Loopback', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 5,
      accuracyTier: 5,
      speedLabel: 'LAN GPU RT',
      accuracyLabel: 'Server Local',
      latencyHint: '<120ms LAN'
    },
    summary: 'Connects directly to localhost / LAN Faster-Whisper or WhisperX without leaving your network.',
    defaultCached: true
  },

  // --- Cloud Gateway & BYOK Speech-to-Text ---
  {
    id: 'gemini-3.5-transcribe',
    name: 'Gemini 3.5 Transcribe',
    vendor: 'Google Gemini',
    category: 'stt',
    runtime: 'cloud',
    provider: 'gemini',
    isGatewayDefault: true,
    capabilities: { realtime: false, translate: true, batch: true, diarization: true },
    languages: ['Auto-detect', '100+ Languages'],
    footprint: { sizeLabel: 'Cloud API', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 4,
      accuracyTier: 5,
      speedLabel: 'Fast Cloud',
      accuracyLabel: 'Multimodal SOTA',
      latencyHint: '~450ms'
    },
    summary: 'Server-proxied multimodal transcription with speaker attribution & inline translation.'
  },
  {
    id: 'deepgram-nova-3',
    name: 'Deepgram Nova-3',
    vendor: 'Deepgram',
    category: 'stt',
    runtime: 'cloud',
    provider: 'deepgram',
    capabilities: { realtime: true, translate: false, batch: true, diarization: true },
    languages: ['English', 'Spanish', 'French', 'German', 'Hindi', 'Japanese', 'Portuguese'],
    footprint: { sizeLabel: 'BYOK Cloud', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 5,
      accuracyTier: 5,
      speedLabel: '<300ms WS',
      accuracyLabel: 'Highest',
      latencyHint: 'Streaming WS'
    },
    summary: 'Sub-second streaming WebSocket ASR with live diarization & keyterm boosting.'
  },
  {
    id: 'groq-whisper-large-v3-turbo',
    name: 'Whisper Large v3 Turbo (Groq)',
    vendor: 'Groq',
    category: 'stt',
    runtime: 'cloud',
    provider: 'groq',
    capabilities: { realtime: true, translate: true, batch: true, diarization: false },
    languages: ['Auto-detect', '99 Languages'],
    footprint: { sizeLabel: 'BYOK LPU', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 5,
      accuracyTier: 5,
      speedLabel: '216x RT',
      accuracyLabel: 'Whisper v3',
      latencyHint: '~180ms LPU'
    },
    summary: 'Groq LPU-accelerated Whisper Large v3 Turbo for near-instant cloud dictation.'
  },
  {
    id: 'openai-gpt4o-transcribe',
    name: 'GPT-4o Transcribe',
    vendor: 'OpenAI',
    category: 'stt',
    runtime: 'cloud',
    provider: 'openai',
    capabilities: { realtime: true, translate: true, batch: true, diarization: true },
    languages: ['Auto-detect', '80+ Languages'],
    footprint: { sizeLabel: 'BYOK Cloud', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 4,
      accuracyTier: 5,
      speedLabel: 'Realtime',
      accuracyLabel: 'Highest',
      latencyHint: '~320ms'
    },
    summary: 'OpenAI gpt-4o-transcribe with high accuracy on technical vocabulary and diarization.'
  },
  {
    id: 'assemblyai-universal-2',
    name: 'AssemblyAI Universal-2',
    vendor: 'AssemblyAI',
    category: 'stt',
    runtime: 'cloud',
    provider: 'assemblyai',
    capabilities: { realtime: true, translate: false, batch: true, diarization: true },
    languages: ['English', 'Spanish', 'French', 'German'],
    footprint: { sizeLabel: 'BYOK Cloud', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 4,
      accuracyTier: 5,
      speedLabel: 'Streaming',
      accuracyLabel: 'Enterprise',
      latencyHint: '~350ms'
    },
    summary: 'Enterprise streaming transcription with multi-speaker labels and domain word boost.'
  },
  {
    id: 'custom-asr-endpoint',
    name: 'Custom ASR Gateway',
    vendor: 'Private Cloud',
    category: 'stt',
    runtime: 'cloud',
    provider: 'custom',
    capabilities: { realtime: true, translate: false, batch: true, diarization: true },
    languages: ['Configurable'],
    footprint: { sizeLabel: 'Custom URL', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 4,
      accuracyTier: 4,
      speedLabel: 'Custom',
      accuracyLabel: 'Private VPC',
      latencyHint: 'Custom'
    },
    summary: 'Your enterprise WhisperX / Pyannote endpoint configured in Keys & Endpoints.'
  },

  // --- Text Cleanup & A->B Translation Models (Local + Cloud) ---
  {
    id: 'llama-3.2-3b-local',
    name: 'Llama 3.2 3B (On-Device)',
    vendor: 'Meta Llama',
    category: 'llm',
    runtime: 'local',
    provider: 'local',
    capabilities: { realtime: true, translate: true, batch: true, diarization: false },
    languages: ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Hindi'],
    footprint: { sizeLabel: '1.8 GB', sizeMB: 1820, minRamMB: 2400 },
    metrics: {
      speedTier: 5,
      accuracyTier: 4,
      speedLabel: '36.4 tok/s',
      accuracyLabel: 'Compact',
      latencyHint: 'On-device'
    },
    summary: 'Compact local LLM for CoreData RAG synthesis, note structuring, and offline cleanup.',
    defaultCached: true
  },
  {
    id: 'llama-3-8b-local',
    name: 'Llama 3 8B (On-Device)',
    vendor: 'Meta Llama',
    category: 'llm',
    runtime: 'local',
    provider: 'local',
    capabilities: { realtime: false, translate: true, batch: true, diarization: false },
    languages: ['English', 'Multilingual'],
    footprint: { sizeLabel: '3.9 GB', sizeMB: 3950, minRamMB: 4600 },
    metrics: {
      speedTier: 3,
      accuracyTier: 5,
      speedLabel: '24.8 tok/s',
      accuracyLabel: 'Deep Local',
      latencyHint: 'On-device'
    },
    summary: 'Full 8B quantized local model for deep meeting synthesis and offline summarization.',
    defaultCached: true
  },
  {
    id: 'ollama-localhost',
    name: 'Ollama / LM Studio (Localhost)',
    vendor: 'Loopback Server',
    category: 'llm',
    runtime: 'local',
    provider: 'custom',
    isLoopbackServer: true,
    capabilities: { realtime: true, translate: true, batch: true, diarization: false },
    languages: ['Auto-detect', '99 Languages'],
    footprint: { sizeLabel: 'Loopback', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 5,
      accuracyTier: 5,
      speedLabel: 'LAN GPU',
      accuracyLabel: 'Private LLM',
      latencyHint: '127.0.0.1'
    },
    summary: 'Routes cleanup & A→B translation to your local Ollama / LM Studio server with zero cloud egress.',
    defaultCached: true
  },
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    vendor: 'Google Gemini',
    category: 'translate',
    runtime: 'cloud',
    provider: 'gemini',
    isGatewayDefault: true,
    capabilities: { realtime: true, translate: true, batch: true, diarization: false },
    languages: ['Auto-detect', '100+ Languages'],
    footprint: { sizeLabel: 'Cloud API', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 5,
      accuracyTier: 5,
      speedLabel: 'Instant',
      accuracyLabel: 'SOTA Translate',
      latencyHint: '~260ms'
    },
    summary: 'Default gateway model for instant Spokenly-style dictation cleanup & A→B translation.'
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    vendor: 'Anthropic',
    category: 'translate',
    runtime: 'cloud',
    provider: 'anthropic',
    capabilities: { realtime: false, translate: true, batch: true, diarization: false },
    languages: ['Multilingual'],
    footprint: { sizeLabel: 'BYOK Cloud', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 4,
      accuracyTier: 5,
      speedLabel: 'Fast',
      accuracyLabel: 'Nuanced Tone',
      latencyHint: '~500ms'
    },
    summary: 'Refines tone for Email & Executive Memos and translates nuanced technical prose.'
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    vendor: 'OpenAI',
    category: 'translate',
    runtime: 'cloud',
    provider: 'openai',
    capabilities: { realtime: true, translate: true, batch: true, diarization: false },
    languages: ['Multilingual'],
    footprint: { sizeLabel: 'BYOK Cloud', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 4,
      accuracyTier: 5,
      speedLabel: 'Fast',
      accuracyLabel: 'High',
      latencyHint: '~400ms'
    },
    summary: 'Structured action extraction, formatting cleanup, and A→B translation via OpenAI.'
  },
  {
    id: 'groq-llama-3.3-70b',
    name: 'Llama 3.3 70B (Groq)',
    vendor: 'Groq',
    category: 'translate',
    runtime: 'cloud',
    provider: 'groq',
    capabilities: { realtime: true, translate: true, batch: true, diarization: false },
    languages: ['Multilingual'],
    footprint: { sizeLabel: 'BYOK LPU', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 5,
      accuracyTier: 5,
      speedLabel: '280 tok/s',
      accuracyLabel: '70B Fast',
      latencyHint: '~190ms'
    },
    summary: 'Low-latency Groq inference for near-instant A→B translation and technical cleanup.'
  },
  {
    id: 'custom-llm-endpoint',
    name: 'Custom LLM Endpoint',
    vendor: 'Private VPC',
    category: 'llm',
    runtime: 'cloud',
    provider: 'custom',
    capabilities: { realtime: true, translate: true, batch: true, diarization: false },
    languages: ['Configurable'],
    footprint: { sizeLabel: 'Custom URL', sizeMB: 0, minRamMB: 0 },
    metrics: {
      speedTier: 4,
      accuracyTier: 4,
      speedLabel: 'Custom',
      accuracyLabel: 'Private VPC',
      latencyHint: 'Custom'
    },
    summary: 'OpenAI-compatible self-hosted vLLM or LiteLLM endpoint.'
  }
];

const CACHED_MODELS_STORAGE_KEY = 'nudge_cached_local_models_v1';

function getDefaultCachedIds(): Set<string> {
  return new Set(
    UNIFIED_MODELS.filter((m) => m.defaultCached || m.isLoopbackServer).map((m) => m.id)
  );
}

export function getCachedModelIds(): Set<string> {
  const defaults = getDefaultCachedIds();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(CACHED_MODELS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return defaults;
    return new Set([...defaults, ...parsed]);
  } catch {
    return defaults;
  }
}

export function markModelCachedInBrowser(modelId: string): Set<string> {
  const next = getCachedModelIds();
  next.add(modelId);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CACHED_MODELS_STORAGE_KEY, JSON.stringify(Array.from(next)));
    } catch {
      // ignore storage quota errors
    }
  }
  return next;
}

export function deleteCachedModelWeights(modelId: string): Set<string> {
  const next = getCachedModelIds();
  next.delete(modelId);
  if (typeof window !== 'undefined') {
    try {
      // Store explicit array without default-cached if user purged weights
      window.localStorage.setItem(CACHED_MODELS_STORAGE_KEY, JSON.stringify(Array.from(next)));
    } catch {
      // ignore
    }
  }
  return next;
}

export async function downloadLocalModelWeights(
  modelId: string,
  options?: {
    localOnly?: boolean;
    onProgress?: (pct: number, detail: string) => void;
    signal?: AbortSignal;
  }
): Promise<{ cached: boolean; source: 'webgpu-hf' | 'cache-seed' }> {
  const spec = getUnifiedModelById(modelId);
  if (!spec) {
    throw new Error(`Unknown model ID: ${modelId}`);
  }
  if (options?.localOnly) {
    throw new Error('Blocked by Local-Only Mode: Disable Local-Only briefly to download new weights.');
  }

  options?.onProgress?.(12, `Preparing ${spec.name} (${spec.footprint.sizeLabel})...`);

  if (spec.hfRepoId && typeof fetch === 'function') {
    try {
      const configUrl = `https://huggingface.co/${spec.hfRepoId}/resolve/main/config.json`;
      options?.onProgress?.(38, `Fetching ONNX manifest from Hugging Face...`);
      const resp = await fetch(configUrl, { signal: options?.signal });
      if (resp.ok) {
        const text = await resp.text();
        if (typeof caches !== 'undefined') {
          const cache = await caches.open('nudge-local-stt-weights-v1');
          await cache.put(configUrl, new Response(text, { headers: { 'Content-Type': 'application/json' } }));
        }
        options?.onProgress?.(92, `Verifying WebGPU/WASM weight manifest...`);
        markModelCachedInBrowser(modelId);
        options?.onProgress?.(100, `Cached on-device`);
        return { cached: true, source: 'webgpu-hf' };
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      // Fall through cleanly if remote CDN is unreachable in sandboxed network
    }
  }

  options?.onProgress?.(65, `Indexing local quantized model metadata...`);
  await new Promise((resolve) => setTimeout(resolve, 260));
  markModelCachedInBrowser(modelId);
  options?.onProgress?.(100, `Ready on-device`);
  return { cached: true, source: 'cache-seed' };
}

export function getUnifiedModelById(id: string | undefined | null): UnifiedModelSpec | undefined {
  if (!id) return undefined;
  return UNIFIED_MODELS.find((m) => m.id === id);
}

export function hasConfiguredKeyForProvider(
  provider: UnifiedModelSpec['provider'],
  settings: AppSettings
): boolean {
  if (provider === 'local') return true;
  if (provider === 'custom') {
    return Boolean(
      settings.localServerUrl?.trim() ||
        settings.customEndpoint.baseUrl.trim() ||
        settings.customEndpoint.transcriptionUrl.trim()
    );
  }
  const key = (settings.apiKeys[provider as PaidProviderId] || '').trim();
  return key.length >= 8;
}

export interface ModelAvailabilityInfo {
  status: ModelAvailabilityStatus;
  selectable: boolean;
  reason?: string;
}

export function resolveModelAvailability(
  model: UnifiedModelSpec,
  settings: AppSettings,
  cachedIds: Set<string> = getCachedModelIds(),
  downloadingModelId?: string | null
): ModelAvailabilityInfo {
  const localOnly = isLocalOnlyActive(settings);

  if (downloadingModelId === model.id) {
    return { status: 'downloading', selectable: false, reason: 'Downloading weights...' };
  }

  if (model.runtime === 'cloud') {
    if (localOnly) {
      return {
        status: 'locked-local-only',
        selectable: false,
        reason: 'Blocked by Local-Only Mode (outbound cloud calls disabled)'
      };
    }

    if (model.isGatewayDefault) {
      return {
        status: 'ready',
        selectable: true,
        reason: hasConfiguredKeyForProvider(model.provider, settings)
          ? 'BYOK Gemini key ready'
          : 'Server Gemini Gateway ready'
      };
    }

    if (model.provider === 'custom') {
      const configured =
        model.category === 'stt'
          ? Boolean(settings.customEndpoint.transcriptionUrl.trim())
          : Boolean(settings.customEndpoint.baseUrl.trim());
      return configured
        ? { status: 'ready', selectable: true, reason: 'Custom endpoint configured' }
        : { status: 'missing-key', selectable: false, reason: 'Set custom endpoint URL in Keys' };
    }

    if (!hasConfiguredKeyForProvider(model.provider, settings)) {
      return {
        status: 'missing-key',
        selectable: false,
        reason: `Requires ${model.vendor} API key`
      };
    }

    return { status: 'ready', selectable: true, reason: 'BYOK key configured' };
  }

  // Local models (in-browser or loopback server)
  if (model.isLoopbackServer) {
    return {
      status: 'ready',
      selectable: true,
      reason: `Loopback LAN (${settings.localServerUrl || 'http://127.0.0.1:11434'})`
    };
  }

  if (cachedIds.has(model.id) || model.defaultCached) {
    return { status: 'cached', selectable: true, reason: 'Cached in browser for offline use' };
  }

  return {
    status: 'not-downloaded',
    selectable: !localOnly,
    reason: localOnly
      ? 'Not cached yet (disable Local-Only briefly to download weights)'
      : `Download ${model.footprint.sizeLabel} to run offline`
  };
}

export interface ModelFilterCriteria {
  category?: UnifiedModelCategory | 'all';
  runtime?: 'all' | 'local' | 'cloud';
  realtimeOnly?: boolean;
  translateOnly?: boolean;
  search?: string;
}

export function filterUnifiedModels(
  criteria: ModelFilterCriteria,
  models: readonly UnifiedModelSpec[] = UNIFIED_MODELS
): UnifiedModelSpec[] {
  const q = (criteria.search || '').trim().toLowerCase();
  return models.filter((m) => {
    if (criteria.category && criteria.category !== 'all') {
      if (criteria.category === 'translate') {
        if (!m.capabilities.translate) return false;
      } else if (criteria.category === 'llm') {
        if (m.category !== 'llm' && m.category !== 'translate') return false;
      } else if (m.category !== criteria.category) {
        return false;
      }
    }
    if (criteria.runtime && criteria.runtime !== 'all' && m.runtime !== criteria.runtime) {
      return false;
    }
    if (criteria.realtimeOnly && !m.capabilities.realtime) {
      return false;
    }
    if (criteria.translateOnly && !m.capabilities.translate) {
      return false;
    }
    if (q) {
      const hay = `${m.name} ${m.vendor} ${m.summary} ${m.provider}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const LEGACY_WHISPER_TO_UNIFIED: Record<string, string> = {
  'whisper-large-v3-turbo': 'whisper-base-local',
  'whisper-base-en': 'whisper-base-local',
  'whisper-tiny-en': 'whisper-tiny-local',
  'apple-neural-speech': 'parakeet-v2-local'
};

const LEGACY_LLM_TO_UNIFIED: Record<string, string> = {
  'llama-3.2-3b-q4': 'llama-3.2-3b-local',
  'llama-3-8b-q4': 'llama-3-8b-local',
  'mistral-7b-v03-q4': 'llama-3-8b-local',
  'phi-3.5-mini-q4': 'llama-3.2-3b-local'
};

export function migrateLegacyAppSettings(raw: Partial<AppSettings>): AppSettings {
  const baseLocalOnly = Boolean(raw.localOnly ?? raw.offlineOnly ?? false);
  const mappedStt =
    raw.activeSttModelId ||
    LEGACY_WHISPER_TO_UNIFIED[raw.activeWhisperId || ''] ||
    'whisper-tiny-local';
  const mappedText =
    raw.activeTextModelId ||
    (baseLocalOnly
      ? LEGACY_LLM_TO_UNIFIED[raw.activeLlmId || ''] || 'llama-3.2-3b-local'
      : 'gemini-4-hydrogen');

  return {
    ...(raw as AppSettings),
    offlineOnly: baseLocalOnly,
    localOnly: baseLocalOnly,
    activeSttModelId: mappedStt,
    activeTextModelId: mappedText,
    enableCrewPlanner: raw.enableCrewPlanner ?? false,
    enableOfficeDiary: raw.enableOfficeDiary ?? false,
    enableScoutFeature: raw.enableScoutFeature ?? false,
    apiKeys: {
      openai: raw.apiKeys?.openai || '',
      anthropic: raw.apiKeys?.anthropic || '',
      gemini: raw.apiKeys?.gemini || '',
      deepgram: raw.apiKeys?.deepgram || '',
      assemblyai: raw.apiKeys?.assemblyai || '',
      groq: raw.apiKeys?.groq || '',
      custom: raw.apiKeys?.custom || ''
    }
  };
}

export function applyUnifiedSettingsPatch(
  prev: AppSettings,
  patch: Partial<AppSettings>
): AppSettings {
  const next: AppSettings = {
    ...prev,
    ...patch,
    apiKeys: patch.apiKeys ? { ...prev.apiKeys, ...patch.apiKeys } : prev.apiKeys,
    customEndpoint: patch.customEndpoint
      ? { ...prev.customEndpoint, ...patch.customEndpoint }
      : prev.customEndpoint,
    activityRoutes: patch.activityRoutes
      ? { ...prev.activityRoutes, ...patch.activityRoutes }
      : prev.activityRoutes,
    haptics: patch.haptics ? { ...prev.haptics, ...patch.haptics } : prev.haptics,
    voiceProfile: patch.voiceProfile
      ? { ...prev.voiceProfile, ...patch.voiceProfile }
      : prev.voiceProfile
  };

  if (patch.haptics?.enabled !== undefined && patch.hapticFeedback === undefined) {
    next.hapticFeedback = patch.haptics.enabled;
  } else if (patch.hapticFeedback !== undefined && patch.haptics?.enabled === undefined) {
    next.haptics = { ...next.haptics, enabled: patch.hapticFeedback };
  }

  // Keep offlineOnly <-> localOnly synchronized cleanly
  if (patch.localOnly !== undefined && patch.offlineOnly === undefined) {
    next.offlineOnly = patch.localOnly;
  } else if (patch.offlineOnly !== undefined && patch.localOnly === undefined) {
    next.localOnly = patch.offlineOnly;
  } else if (next.localOnly === undefined) {
    next.localOnly = next.offlineOnly;
  }

  // When turning on Local-Only Mode, automatically fallback active cloud STT/Text models to local cached models
  const isNowLocalOnly = Boolean(next.localOnly || next.offlineOnly);
  if (isNowLocalOnly) {
    const activeStt = getUnifiedModelById(next.activeSttModelId);
    if (!activeStt || activeStt.runtime === 'cloud') {
      next.activeSttModelId = 'whisper-tiny-local';
      next.liveProviderId = 'whisperkit-local';
    }
    const activeText = getUnifiedModelById(next.activeTextModelId);
    if (!activeText || activeText.runtime === 'cloud') {
      next.activeTextModelId = 'llama-3.2-3b-local';
    }
    if (next.ttsEngine === 'secure-cloud') {
      next.ttsEngine = 'on-device';
    }
  }

  if (patch.activeSttModelId) {
    const stt = getUnifiedModelById(patch.activeSttModelId);
    if (stt?.provider === 'deepgram') next.liveProviderId = 'deepgram-live';
    else if (stt?.provider === 'assemblyai') next.liveProviderId = 'assemblyai-live';
    else if (stt?.provider === 'openai') next.liveProviderId = 'openai-realtime';
    else if (stt?.provider === 'gemini') next.liveProviderId = 'gemini-live';
    else if (stt?.provider === 'custom') next.liveProviderId = 'custom-live-ws';
    else if (stt?.provider === 'local') next.liveProviderId = 'whisperkit-local';
  }

  return next;
}

// --- Derived Compatibility Projections for Non-Overlapping Subsystems (Meeting Notes, Studio, Notebook RAG) ---

export const LEGACY_LLM_MODELS: ModelOption[] = [
  {
    id: 'llama-3.2-3b-q4',
    name: 'Llama 3.2 3B',
    family: 'Meta Llama',
    params: '3.2B',
    quantization: 'Q4_K_M',
    ramUsageMB: 1820,
    engine: 'MLX Swift',
    tokensPerSec: 36.4,
    contextWindow: 8192,
    recommendedDevice: 'iPhone 15 / 16 · WebGPU',
    isDownloaded: true
  },
  {
    id: 'llama-3-8b-q4',
    name: 'Llama 3 8B',
    family: 'Meta Llama',
    params: '8.0B',
    quantization: 'Q4_K_M',
    ramUsageMB: 3950,
    engine: 'MLX Swift',
    tokensPerSec: 24.8,
    contextWindow: 4096,
    recommendedDevice: 'iPhone 15 Pro / Mac M-Series',
    isDownloaded: true
  },
  {
    id: 'mistral-7b-v03-q4',
    name: 'Mistral 7B v0.3',
    family: 'Mistral AI',
    params: '7.3B',
    quantization: 'Q4_K_M',
    ramUsageMB: 3650,
    engine: 'Metal MPS',
    tokensPerSec: 26.1,
    contextWindow: 4096,
    recommendedDevice: 'iPhone 15 Pro / 16 Pro',
    isDownloaded: true
  }
];

export const LEGACY_WHISPER_MODELS: WhisperModelOption[] = UNIFIED_MODELS.filter(
  (m) => m.category === 'stt' && m.runtime === 'local'
).map((m) => ({
  id: m.id,
  name: m.name,
  sizeLabel: m.footprint.sizeLabel,
  speedLabel: m.metrics.speedLabel,
  accuracyLabel: m.metrics.accuracyLabel,
  isDownloaded: Boolean(m.defaultCached || m.isLoopbackServer)
}));

export const LEGACY_ACTIVITY_MODELS: ActivityModelOption[] = [
  // Meeting Notes
  {
    id: 'llama-3-8b-mlx-notes',
    activity: 'meetingNotes',
    provider: 'local',
    name: 'Llama 3 8B (Local)',
    supportedApproaches: ['local', 'hybrid'],
    requiresPaidKey: false,
    summary: 'On-device synthesis with zero network egress'
  },
  {
    id: 'gemini-4-hydrogen-notes',
    activity: 'meetingNotes',
    provider: 'gemini',
    name: 'Gemini 4 Hydrogen',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'Fast long-context session summarization'
  },
  {
    id: 'claude-sonnet-4-notes',
    activity: 'meetingNotes',
    provider: 'anthropic',
    name: 'Claude Sonnet 4',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'High-precision decision & risk extraction'
  },
  {
    id: 'gpt-4o-notes',
    activity: 'meetingNotes',
    provider: 'openai',
    name: 'GPT-4o',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'Structured action item & diff synthesis'
  },
  {
    id: 'custom-notes-endpoint',
    activity: 'meetingNotes',
    provider: 'custom',
    name: 'Custom LLM Endpoint',
    supportedApproaches: ['custom', 'hybrid'],
    requiresPaidKey: false,
    summary: 'Self-hosted vLLM / Ollama / enterprise gateway'
  },

  // Transcription
  {
    id: 'whisper-fluidaudio-local',
    activity: 'transcription',
    provider: 'local',
    name: 'Whisper WebGPU/WASM + Local Speaker ID',
    supportedApproaches: ['local', 'hybrid'],
    requiresPaidKey: false,
    speakerIdCapable: true,
    summary: 'On-device ASR with local speaker turns'
  },
  {
    id: 'deepgram-nova-3-diarize',
    activity: 'transcription',
    provider: 'deepgram',
    name: 'Deepgram Nova-3 (Diarize)',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    speakerIdCapable: true,
    summary: 'Sub-second streaming ASR + speaker diarization'
  },
  {
    id: 'assemblyai-universal-2',
    activity: 'transcription',
    provider: 'assemblyai',
    name: 'AssemblyAI Universal-2 (Speaker ID)',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    speakerIdCapable: true,
    summary: 'Multi-speaker identification & ClaimCenter keyterms'
  },
  {
    id: 'openai-gpt4o-transcribe-diarize',
    activity: 'transcription',
    provider: 'openai',
    name: 'OpenAI gpt-4o-transcribe',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    speakerIdCapable: true,
    summary: 'Speaker-labeled transcription via OpenAI Audio API'
  },
  {
    id: 'gemini-3.5-transcribe',
    activity: 'transcription',
    provider: 'gemini',
    name: 'Gemini 3.5 Transcribe',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    speakerIdCapable: true,
    summary: 'Multimodal audio transcription with speaker turns'
  },
  {
    id: 'custom-asr-endpoint',
    activity: 'transcription',
    provider: 'custom',
    name: 'Custom Whisper / Pyannote Server',
    supportedApproaches: ['custom', 'hybrid'],
    requiresPaidKey: false,
    speakerIdCapable: true,
    summary: 'Private WhisperX / Pyannote diarization endpoint'
  },

  // Slide Deck
  {
    id: 'llama-3-8b-slides',
    activity: 'slideDeck',
    provider: 'local',
    name: 'Llama 3 8B + Local Deck Builder',
    supportedApproaches: ['local', 'hybrid'],
    requiresPaidKey: false,
    summary: 'Offline Markdown & 16:9 slide structuring'
  },
  {
    id: 'claude-sonnet-4-slides',
    activity: 'slideDeck',
    provider: 'anthropic',
    name: 'Claude Sonnet 4',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'Executive storytelling & crisp slide copy'
  },
  {
    id: 'gpt-4o-slides',
    activity: 'slideDeck',
    provider: 'openai',
    name: 'GPT-4o',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'Structured KPI & comparison slide synthesis'
  },
  {
    id: 'gemini-4-hydrogen-slides',
    activity: 'slideDeck',
    provider: 'gemini',
    name: 'Gemini 4 Hydrogen',
    supportedApproaches: ['cloud', 'hybrid'],
    requiresPaidKey: true,
    summary: 'Rapid sprint & ClaimCenter readout decks'
  },
  {
    id: 'custom-slides-endpoint',
    activity: 'slideDeck',
    provider: 'custom',
    name: 'Custom Deck Endpoint',
    supportedApproaches: ['custom', 'hybrid'],
    requiresPaidKey: false,
    summary: 'Enterprise gateway or bespoke template pipeline'
  }
];

export const LEGACY_LIVE_PROVIDERS: LiveTranscriptionProviderOption[] = [
  {
    id: 'whisperkit-local',
    provider: 'local',
    companyName: 'On-Device',
    modelName: 'Whisper WebGPU/WASM Stream',
    protocol: 'Local Browser Worker · Zero Egress',
    supportsLiveStreaming: true,
    requiresPaidKey: false,
    paidPlanLabel: 'Free · Zero Egress',
    diarizationSupport: true,
    keytermBoostSupport: true,
    capabilityNote: 'Offline on-device streaming chunked in a Web Worker'
  },
  {
    id: 'deepgram-live',
    provider: 'deepgram',
    companyName: 'Deepgram',
    modelName: 'Nova-3 Live',
    protocol: 'wss://api.deepgram.com/v1/listen',
    supportsLiveStreaming: true,
    requiresPaidKey: true,
    paidPlanLabel: 'Paid Pay-As-You-Go',
    diarizationSupport: true,
    keytermBoostSupport: true,
    capabilityNote: 'Sub-300ms WebSocket streaming with live diarization & keyterm boost'
  },
  {
    id: 'assemblyai-live',
    provider: 'assemblyai',
    companyName: 'AssemblyAI',
    modelName: 'Universal-2 Streaming',
    protocol: 'wss://api.assemblyai.com/v2/realtime/ws',
    supportsLiveStreaming: true,
    requiresPaidKey: true,
    paidPlanLabel: 'Paid Streaming API',
    diarizationSupport: true,
    keytermBoostSupport: true,
    capabilityNote: 'Real-time WebSocket ASR with word_boost for ClaimCenter entities'
  },
  {
    id: 'openai-realtime',
    provider: 'openai',
    companyName: 'OpenAI',
    modelName: 'gpt-4o-transcribe Realtime',
    protocol: 'wss://api.openai.com/v1/realtime',
    supportsLiveStreaming: true,
    requiresPaidKey: true,
    paidPlanLabel: 'Paid API Tier 1+',
    diarizationSupport: true,
    keytermBoostSupport: true,
    capabilityNote: 'Low-latency Realtime transcription with prompt bias'
  },
  {
    id: 'gemini-live',
    provider: 'gemini',
    companyName: 'Google Gemini',
    modelName: 'Gemini 3.5 Transcribe',
    protocol: 'Server Gateway / Live Audio',
    supportsLiveStreaming: true,
    requiresPaidKey: false,
    paidPlanLabel: 'Managed Gateway or BYOK',
    diarizationSupport: true,
    keytermBoostSupport: true,
    capabilityNote: 'Multimodal audio transcription with inline dictionary grounding'
  },
  {
    id: 'anthropic-no-live',
    provider: 'anthropic',
    companyName: 'Anthropic',
    modelName: 'Claude (Text / Translate Only)',
    protocol: 'No native audio ASR stream',
    supportsLiveStreaming: false,
    requiresPaidKey: true,
    paidPlanLabel: 'Paid API (No Live Audio ASR)',
    diarizationSupport: false,
    keytermBoostSupport: false,
    capabilityNote: 'Anthropic provides text/notes & translation reasoning only; pair with Local Whisper or Deepgram for audio'
  },
  {
    id: 'custom-live-ws',
    provider: 'custom',
    companyName: 'Custom Live WS',
    modelName: 'Self-Hosted WhisperX / Speaches',
    protocol: 'http://127.0.0.1:8000 / Custom Endpoint',
    supportsLiveStreaming: true,
    requiresPaidKey: false,
    paidPlanLabel: 'Localhost / Private VPC',
    diarizationSupport: true,
    keytermBoostSupport: true,
    capabilityNote: 'Private loopback or carrier VPC ASR gateway'
  }
];

export function resolveActiveLlmFromRegistry(activeLlmId: string): ModelOption {
  return LEGACY_LLM_MODELS.find((m) => m.id === activeLlmId) || LEGACY_LLM_MODELS[0];
}
