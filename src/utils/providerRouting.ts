import {
  ActivityModelOption,
  ActivityType,
  ApiProviderId,
  AppSettings,
  CloudAgentProviderId,
  ExecutionApproach,
  LiveProviderId,
  LiveTranscriptionProviderOption,
  PaidProviderId
} from '../types/index.ts';
import { LEGACY_ACTIVITY_MODELS, LEGACY_LIVE_PROVIDERS } from './modelRegistry.ts';
import { isLocalOnlyActive } from './networkGateway.ts';

export interface ProviderMetadata {
  id: PaidProviderId;
  name: string;
  placeholder: string;
  activities: string;
  keyPrefixHint?: string;
}

export const PAID_PROVIDERS: ProviderMetadata[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    placeholder: 'sk-proj-...',
    activities: 'Meeting Notes · Transcription (Speaker ID) · Slides',
    keyPrefixHint: 'sk-'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    placeholder: 'sk-ant-...',
    activities: 'Meeting Notes · Slide Deck Prep',
    keyPrefixHint: 'sk-ant-'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    placeholder: 'AIza...',
    activities: 'Meeting Notes · Transcription (Speaker ID) · Slides',
    keyPrefixHint: 'AIza'
  },
  {
    id: 'deepgram',
    name: 'Deepgram',
    placeholder: 'dg_...',
    activities: 'Transcription + Speaker Identification',
    keyPrefixHint: ''
  },
  {
    id: 'assemblyai',
    name: 'AssemblyAI',
    placeholder: 'aai_...',
    activities: 'Transcription + Speaker Identification',
    keyPrefixHint: ''
  },
  {
    id: 'groq',
    name: 'Groq LPU',
    placeholder: 'gsk_...',
    activities: 'Whisper v3 Turbo · Llama 3.3 70B Translation',
    keyPrefixHint: 'gsk_'
  },
  {
    id: 'custom',
    name: 'Custom Bearer Key',
    placeholder: 'Bearer token (optional for private endpoints)',
    activities: 'Custom Endpoints (vLLM / LiteLLM / WhisperX)'
  }
];

export const APPROACH_LABELS: Record<ExecutionApproach, string> = {
  local: 'Local',
  cloud: 'Cloud',
  hybrid: 'Hybrid',
  custom: 'Custom'
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  meetingNotes: 'Meeting Notes',
  transcription: 'Audio Transcription & Speaker ID',
  slideDeck: 'Slide Deck Preparation'
};

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return 'Not set';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function validateApiKeyFormat(provider: PaidProviderId, rawKey: string): {
  valid: boolean;
  message?: string;
} {
  const key = rawKey.trim();
  if (!key) {
    return { valid: false, message: 'Key is empty' };
  }
  if (key.length < 8) {
    return { valid: false, message: 'Key is too short (min 8 chars)' };
  }
  if (provider === 'anthropic' && !key.startsWith('sk-ant-')) {
    return { valid: false, message: 'Anthropic keys start with sk-ant-' };
  }
  if (provider === 'openai' && !key.startsWith('sk-')) {
    return { valid: false, message: 'OpenAI keys start with sk-' };
  }
  if (provider === 'gemini' && !key.startsWith('AIza')) {
    return { valid: false, message: 'Gemini keys start with AIza' };
  }
  return { valid: true };
}

export function getModelsForActivity(
  activity: ActivityType,
  approach?: ExecutionApproach
): ActivityModelOption[] {
  const all = LEGACY_ACTIVITY_MODELS.filter(m => m.activity === activity);
  if (!approach) return all;
  const filtered = all.filter(m => m.supportedApproaches.includes(approach));
  if (approach === 'hybrid') {
    // Prefer cloud/hybrid paid models first, keeping local/custom available
    return [...filtered].sort((a, b) => Number(b.requiresPaidKey) - Number(a.requiresPaidKey));
  }
  return filtered;
}

export function getDefaultModelForApproach(
  activity: ActivityType,
  approach: ExecutionApproach
): ActivityModelOption {
  const candidates = getModelsForActivity(activity, approach);
  return candidates[0] || LEGACY_ACTIVITY_MODELS.find(m => m.activity === activity)!;
}

export function resolveActivityModel(
  activity: ActivityType,
  modelId: string,
  approach: ExecutionApproach
): ActivityModelOption {
  const match = LEGACY_ACTIVITY_MODELS.find(
    m => m.activity === activity && m.id === modelId && m.supportedApproaches.includes(approach)
  );
  if (match) return match;
  return getDefaultModelForApproach(activity, approach);
}

export interface ActivityReadinessResult {
  ready: boolean;
  approach: ExecutionApproach;
  model: ActivityModelOption;
  missingProvider?: PaidProviderId;
  reason?: string;
  pipelineSummary: string;
}

export function getProviderDisplayName(provider: ApiProviderId): string {
  if (provider === 'local') return 'On-Device';
  const found = PAID_PROVIDERS.find(p => p.id === provider);
  return found ? found.name : provider;
}

export function checkActivityReadiness(
  activity: ActivityType,
  settings: AppSettings
): ActivityReadinessResult {
  const route = settings.activityRoutes[activity];
  const approach = route.approach;
  const model = resolveActivityModel(activity, route.modelId, approach);

  if (isLocalOnlyActive(settings) && (approach === 'cloud' || approach === 'hybrid')) {
    return {
      ready: false,
      approach,
      model,
      reason: `Offline Air-Gap / Local-Only Mode is active — switch ${ACTIVITY_LABELS[activity]} to Local or disable Local-Only Mode.`,
      pipelineSummary: `${APPROACH_LABELS[approach]} · ${model.name} (Paused)`
    };
  }

  if (approach === 'custom') {
    const url =
      activity === 'transcription'
        ? settings.customEndpoint.transcriptionUrl.trim()
        : settings.customEndpoint.baseUrl.trim();
    const customModel =
      activity === 'transcription'
        ? settings.customEndpoint.transcriptionModelId.trim()
        : settings.customEndpoint.modelId.trim();

    if (!url || !customModel) {
      return {
        ready: false,
        approach,
        model,
        missingProvider: 'custom',
        reason: 'Configure custom endpoint URL and model ID in API Keys & Custom Settings.',
        pipelineSummary: 'Custom · Unconfigured'
      };
    }

    return {
      ready: true,
      approach,
      model,
      pipelineSummary: `Custom · ${customModel}`
    };
  }

  if (model.requiresPaidKey && model.provider !== 'local') {
    const paidProvider = model.provider as PaidProviderId;
    const rawKey = settings.apiKeys[paidProvider] || '';
    const validation = validateApiKeyFormat(paidProvider, rawKey);

    if (!validation.valid) {
      const providerName = getProviderDisplayName(paidProvider);
      return {
        ready: false,
        approach,
        model,
        missingProvider: paidProvider,
        reason:
          rawKey.trim().length > 0
            ? `${providerName} key invalid (${validation.message}).`
            : `${providerName} paid API key required for ${model.name}.`,
        pipelineSummary: `${APPROACH_LABELS[approach]} · ${model.name} (Key required)`
      };
    }
  }

  if (approach === 'hybrid') {
    const hybridDetail =
      activity === 'transcription'
        ? `Local Audio + ${model.name}`
        : activity === 'meetingNotes'
        ? `Local Redact + ${model.name}`
        : `Local RAG + ${model.name}`;

    return {
      ready: true,
      approach,
      model,
      pipelineSummary: `Hybrid · ${hybridDetail}`
    };
  }

  return {
    ready: true,
    approach,
    model,
    pipelineSummary: `${APPROACH_LABELS[approach]} · ${model.name}`
  };
}

export function parseSpeakerLabels(csv: string): string[] {
  const parsed = csv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : ['Maya (Architect)', 'Alex (Tech Lead)', 'Priya (Claims Ops)'];
}

export function countConfiguredApiKeys(settings: AppSettings): number {
  return (Object.keys(settings.apiKeys) as PaidProviderId[]).filter(
    k => validateApiKeyFormat(k, settings.apiKeys[k] || '').valid
  ).length;
}

export interface LiveTranscriptionReadiness {
  ready: boolean;
  option: LiveTranscriptionProviderOption;
  missingProvider?: PaidProviderId;
  reason?: string;
  pipelineSummary: string;
}

export function getLiveProviderOption(id: LiveProviderId): LiveTranscriptionProviderOption {
  return (
    LEGACY_LIVE_PROVIDERS.find(p => p.id === id) ||
    LEGACY_LIVE_PROVIDERS[0]
  );
}

export function checkLiveTranscriptionReadiness(settings: AppSettings): LiveTranscriptionReadiness {
  const option = getLiveProviderOption(settings.liveProviderId);

  if (!option.supportsLiveStreaming) {
    return {
      ready: false,
      option,
      reason: `${option.companyName} (${option.modelName}) does not provide a native live audio ASR endpoint on paid plans. Select Deepgram, AssemblyAI, OpenAI, Gemini, Custom WS, or On-Device.`,
      pipelineSummary: `${option.companyName} · Unsupported for Live Audio`
    };
  }

  if (isLocalOnlyActive(settings) && option.provider !== 'local' && option.provider !== 'custom') {
    return {
      ready: false,
      option,
      reason: `Offline Air-Gap / Local-Only Mode is active — switch Live Transcription to On-Device or disable Local-Only Mode.`,
      pipelineSummary: `${option.companyName} · ${option.modelName} (Paused)`
    };
  }

  if (option.provider === 'custom') {
    const url = settings.customEndpoint.transcriptionUrl.trim();
    if (!url) {
      return {
        ready: false,
        option,
        missingProvider: 'custom',
        reason: 'Configure your custom ASR WebSocket / HTTP URL in Keys & System settings.',
        pipelineSummary: 'Custom Live WS · Unconfigured'
      };
    }
    return {
      ready: true,
      option,
      pipelineSummary: `Live · ${option.modelName}`
    };
  }

  if (option.requiresPaidKey && option.provider !== 'local') {
    const paidProvider = option.provider as PaidProviderId;
    const rawKey = settings.apiKeys[paidProvider] || '';
    const validation = validateApiKeyFormat(paidProvider, rawKey);
    if (!validation.valid) {
      return {
        ready: false,
        option,
        missingProvider: paidProvider,
        reason:
          rawKey.trim().length > 0
            ? `${option.companyName} paid API key invalid (${validation.message}).`
            : `${option.companyName} paid API key required for ${option.modelName} live streaming.`,
        pipelineSummary: `${option.companyName} · ${option.modelName} (Key required)`
      };
    }
  }

  return {
    ready: true,
    option,
    pipelineSummary: `Live · ${option.companyName} ${option.modelName}`
  };
}

export function checkCloudAgentReadiness(
  provider: CloudAgentProviderId,
  settings: AppSettings
): { ready: boolean; reason?: string; providerName: string } {
  const providerName = getProviderDisplayName(provider);
  if (isLocalOnlyActive(settings)) {
    return {
      ready: false,
      providerName,
      reason: 'Offline Air-Gap / Local-Only Mode blocks Cloud AI Agent dictionary synthesis. Disable Local-Only Mode to run cloud agents.'
    };
  }
  const rawKey = settings.apiKeys[provider] || '';
  const validation = validateApiKeyFormat(provider, rawKey);
  if (!validation.valid) {
    return {
      ready: false,
      providerName,
      reason:
        rawKey.trim().length > 0
          ? `${providerName} paid API key invalid (${validation.message}).`
          : `${providerName} paid API key required to run Cloud AI Dictionary Agents.`
    };
  }
  return { ready: true, providerName };
}
