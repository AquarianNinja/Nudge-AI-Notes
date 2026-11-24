import type {
  AppSettings,
  LocalDocument,
  PodcastEpisode,
  DictionaryEntry,
  OpenSourceVoiceMod,
  VoiceTrainingPrompt
} from '../types/index.ts';

export const INITIAL_DICTIONARY_ENTRIES: DictionaryEntry[] = [
  {
    id: 'dict-claimcenter',
    term: 'ClaimCenter',
    category: 'ClaimCenter Entity',
    source: 'audio-meeting',
    sourceFile: 'claimcenter_fnol_review_s1.m4a',
    occurrences: 6,
    boostWeight: 4.5,
    aliases: ['CC', 'Guidewire ClaimCenter'],
    definition: 'Guidewire core claims administration and exposure lifecycle system.',
    verifiedByAgent: true,
    learnedAt: '10:00'
  },
  {
    id: 'dict-fnol',
    term: 'FNOL',
    category: 'Claims Operations',
    source: 'audio-meeting',
    sourceFile: 'claimcenter_fnol_review_s1.m4a',
    occurrences: 5,
    boostWeight: 4.2,
    aliases: ['First Notice of Loss', 'Draft Claim'],
    definition: 'Initial claim intake workflow capturing loss details, policy snapshot, and exposures.',
    verifiedByAgent: true,
    learnedAt: '10:00'
  },
  {
    id: 'dict-gosu',
    term: 'Gosu',
    category: 'Gosu & Rules',
    source: 'audio-meeting',
    sourceFile: 'claimcenter_fnol_review_s1.m4a',
    occurrences: 4,
    boostWeight: 4.0,
    aliases: ['Gosu Rules', 'Pre-Update'],
    definition: 'JVM-based statically typed rule and plugin language inside Guidewire.',
    verifiedByAgent: true,
    learnedAt: '10:00'
  },
  {
    id: 'dict-policycenter',
    term: 'PolicyCenter',
    category: 'API & Integration',
    source: 'audio-meeting',
    sourceFile: 'claimcenter_fnol_review_s1.m4a',
    occurrences: 3,
    boostWeight: 3.8,
    aliases: ['PC', 'IPolicySearchAdapter'],
    definition: 'Source of truth for policy effective dates, coverages, and deductible snapshots.',
    verifiedByAgent: true,
    learnedAt: '10:00'
  },
  {
    id: 'dict-subrogation',
    term: 'Subrogation',
    category: 'Claims Operations',
    source: 'seed',
    sourceFile: 'Baseline ClaimCenter Vocabulary',
    occurrences: 2,
    boostWeight: 3.5,
    aliases: ['SubrogationSummary', 'TC_THIRDPARTY'],
    definition: 'Third-party recovery workflow triggered when adverse fault is confirmed.',
    verifiedByAgent: true,
    learnedAt: '09:40'
  },
  {
    id: 'dict-siu',
    term: 'SIU',
    category: 'Claims Operations',
    source: 'seed',
    sourceFile: 'Baseline ClaimCenter Vocabulary',
    occurrences: 2,
    boostWeight: 3.4,
    aliases: ['Special Investigations Unit', 'SIU Score'],
    definition: 'Fraud and anomaly referral workflow scored during FNOL and reserve checks.',
    verifiedByAgent: true,
    learnedAt: '09:40'
  }
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  activeLlmId: 'llama-3.2-3b-q4',
  activeWhisperId: 'whisper-tiny-local',
  activeSttModelId: 'whisper-tiny-local',
  activeTextModelId: 'gemini-4-hydrogen',
  activeDictationModeId: 'clean-dictation',
  translationEnabled: false,
  translationSourceLang: 'Auto-detect',
  translationTargetLang: 'Spanish',
  historyRetention: 'forever',
  overlayStyle: 'capsule',
  dictationHotkey: 'Option+Space',
  translationHotkey: 'Option+Shift+T',
  localServerUrl: 'http://127.0.0.1:11434',
  ttsEngine: 'on-device',
  offlineOnly: false,
  localOnly: false,
  motionIntensity: 'standard',
  hapticFeedback: true,
  haptics: {
    enabled: true,
    profile: 'crisp',
    intensity: 'balanced',
    categories: {
      navigation: true,
      taps: true,
      outcomes: true,
      alerts: true
    }
  },
  diarization: true,
  autoPunctuation: true,
  language: 'English (US)',
  domainTerms: 'ClaimCenter, FNOL, Gosu, PolicyCenter, Subrogation, SIU',
  autoLearnDictionary: true,
  liveProviderId: 'whisperkit-local',
  speakerCount: 'auto',
  speakerLabels: 'Maya (Architect), Alex (Tech Lead), Priya (Claims Ops)',
  apiKeys: {
    openai: '',
    anthropic: '',
    gemini: '',
    deepgram: '',
    assemblyai: '',
    groq: '',
    custom: ''
  },
  customEndpoint: {
    baseUrl: 'https://llm.internal.carrier.local/v1',
    modelId: 'claimcenter-llama-70b',
    transcriptionUrl: 'https://asr.internal.carrier.local/v1/transcribe',
    transcriptionModelId: 'whisperx-large-v3-diarize',
    pipelineNote: 'Local VAD + private vLLM / WhisperX cluster'
  },
  activityRoutes: {
    meetingNotes: {
      approach: 'local',
      modelId: 'llama-3-8b-mlx-notes'
    },
    transcription: {
      approach: 'local',
      modelId: 'whisper-fluidaudio-local'
    },
    slideDeck: {
      approach: 'cloud',
      modelId: 'claude-sonnet-4-slides'
    }
  },
  voiceProfile: {
    activeMode: 'open-source-mod',
    openSourceModId: 'dia-16b',
    cloudInferenceHost: 'modal-serverless',
    customVoiceEndpoint: 'https://tts.internal.carrier.local/v1/synthesize',
    saveSamplesToDrive: true,
    personalProfile: {
      name: 'My Studio Voice',
      samplesCompleted: 0,
      totalSamples: 3,
      sampleDurationsSec: [],
      sampleUrls: [],
      status: 'untrained',
      pitchMultiplier: 1.0,
      rateMultiplier: 1.0
    }
  },
  enableCrewPlanner: false,
  enableOfficeDiary: false,
  enableScoutFeature: false
};

export const OPEN_SOURCE_VOICE_MODS: OpenSourceVoiceMod[] = [
  {
    id: 'dia-16b',
    name: 'Dia 1.6B (Nari Labs)',
    license: 'Apache 2.0',
    params: '1.6B',
    architecture: 'Multi-speaker dialogue transformer',
    bestFor: 'Two-host podcast conversations with natural turn-taking & laughs',
    coHostPair: 'Alex (Host A) · Maya (Host B)',
    defaultRate: 1.04,
    defaultPitch: 0.98,
    endpointHint: 'modal.run/nari-labs/dia-1.6b'
  },
  {
    id: 'chatterbox-zero',
    name: 'Chatterbox (Resemble AI)',
    license: 'MIT',
    params: '500M',
    architecture: 'Zero-shot voice cloning + emotion exaggeration',
    bestFor: 'Instant personal voice cloning from 5–10s calibration samples',
    coHostPair: 'Cloned Primary · Neutral Architect',
    defaultRate: 1.0,
    defaultPitch: 1.0,
    endpointHint: 'fal.run/resemble-ai/chatterbox'
  },
  {
    id: 'kokoro-82m',
    name: 'Kokoro-82M',
    license: 'Apache 2.0',
    params: '82M',
    architecture: 'StyleTTS2 compact acoustic decoder',
    bestFor: 'Ultra-low-latency CPU/serverless podcast narration (50+ presets)',
    coHostPair: 'af_bella · am_michael',
    defaultRate: 1.08,
    defaultPitch: 0.96,
    endpointHint: 'modal.run/hexgrad/kokoro-82m'
  },
  {
    id: 'fish-speech-v15',
    name: 'Fish Speech v1.5',
    license: 'BSD-3-Clause',
    params: '500M',
    architecture: 'Dual-AR acoustic LLM + VQGAN vocoder',
    bestFor: 'Expressive technical reads & multilingual ClaimCenter glossaries',
    coHostPair: 'Studio Narrator · Technical Co-Host',
    defaultRate: 1.02,
    defaultPitch: 1.02,
    endpointHint: 'runpod.io/fishaudio/fish-speech-1.5'
  },
  {
    id: 'orpheus-3b',
    name: 'Orpheus 3B',
    license: 'Apache 2.0',
    params: '3.0B',
    architecture: 'Llama-3B speech token autoregressive LLM',
    bestFor: 'Richly modulated executive briefings ([calm], [excited], [emphatic])',
    coHostPair: 'Tara · Leo',
    defaultRate: 0.98,
    defaultPitch: 0.94,
    endpointHint: 'modal.run/canopylabs/orpheus-3b'
  }
];

export const VOICE_TRAINING_PROMPTS: VoiceTrainingPrompt[] = [
  {
    id: 'vp-1',
    stepLabel: 'Card 1 of 3',
    title: 'Baseline Cadence & Vowel Range',
    script:
      'ClaimCenter processes each First Notice of Loss cleanly, verifying policy coverages before posting initial reserves.',
    focusPhonetics: 'Fricatives, nasals & crisp plosives'
  },
  {
    id: 'vp-2',
    stepLabel: 'Card 2 of 3',
    title: 'Technical Terms & Pause Timing',
    script:
      'When Gosu pre-update rules evaluate TransactionSet authority limits, PolicyCenter snapshots keep latency under four hundred milliseconds.',
    focusPhonetics: 'Acronyms, compound nouns & mid-sentence pacing'
  },
  {
    id: 'vp-3',
    stepLabel: 'Card 3 of 3',
    title: 'Conversational Podcast Intonation',
    script:
      'Wait—so if third-party FaultRating is confirmed at intake, SubrogationSummary routes the recovery referral automatically?',
    focusPhonetics: 'Upward inflection, rhetorical pause & warmth'
  }
];



export const SAMPLE_DOCUMENTS: LocalDocument[] = [
  {
    id: 'doc-cc-cloud-api',
    title: 'ClaimCenter_Cloud_API_v10_Spec.pdf',
    format: 'PDF',
    sizeKB: 3120,
    chunkCount: 148,
    dateAdded: '2026-11-04',
    summary: 'REST endpoints for FNOL intake, exposure patching, reserve transactions, and JWT scope mapping.',
    contentExcerpt:
      'POST /claim/v1/claims creates draft FNOL payloads with verified policy snapshots, incident vehicles, and exposure mappings...',
    tags: ['ClaimCenter', 'Cloud API']
  },
  {
    id: 'doc-cc-gosu-rules',
    title: 'Gosu_Subrogation_Rules_Guide.md',
    format: 'Markdown',
    sizeKB: 940,
    chunkCount: 64,
    dateAdded: '2026-11-02',
    summary: 'Pre-update Gosu rules for adverse party recovery, fault thresholds, and SIU referral scoring.',
    contentExcerpt:
      'When claim.FaultRating == FaultRating.TC_THIRDPARTY and SubrogationSummary.Status == TC_OPEN, auto-assign recovery owner...',
    tags: ['Gosu', 'Subrogation']
  },
  {
    id: 'doc-pc-cc-sync',
    title: 'PolicyCenter_ClaimCenter_Integration.pdf',
    format: 'PDF',
    sizeKB: 1840,
    chunkCount: 92,
    dateAdded: '2026-10-28',
    summary: 'Coverage verification contracts, unverified policy handling, and BillingCenter check reconciliation.',
    contentExcerpt:
      'ClaimCenter invokes IPolicySearchAdapter to retrieve point-in-time endorsements and deductible schedules on date of loss...',
    tags: ['PolicyCenter', 'Integration']
  }
];



export const SAMPLE_PODCAST_EPISODES: PodcastEpisode[] = [
  {
    id: 'ep-cc-deepdive',
    title: 'ClaimCenter FNOL & Subrogation Triage',
    subtitle: '3 local ClaimCenter specs',
    topic: 'Guidewire ClaimCenter',
    durationMinutes: 2.1,
    hosts: {
      alex: { name: 'Alex', voice: 'Evan', tone: 'Architect' },
      maya: { name: 'Maya', voice: 'Zoe', tone: 'Lead Dev' }
    },
    coverGradient: 'from-zinc-800 to-zinc-900',
    sourceDocumentIds: ['doc-cc-cloud-api', 'doc-cc-gosu-rules', 'doc-pc-cc-sync'],
    dialogue: [
      {
        id: 'turn-1',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'Let us walk through how Guidewire ClaimCenter handles an auto FNOL from mobile intake all the way to initial reserves.',
        durationSec: 7.4,
        citations: [1]
      },
      {
        id: 'turn-2',
        speaker: 'Maya',
        speakerRole: 'Practical Synthesizer',
        text: 'First, the Jutro portal sends a composite Cloud API request to create the claim and snapshot coverages directly from PolicyCenter.',
        durationSec: 7.8,
        citations: [1, 3]
      },
      {
        id: 'turn-3',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'Right, and once the exposures are mapped, Gosu pre-update rules verify adjuster authority and post the initial indemnity reserve.',
        durationSec: 8.1,
        citations: [2]
      },
      {
        id: 'turn-4',
        speaker: 'Maya',
        speakerRole: 'Practical Synthesizer',
        text: 'If third-party fault is flagged, the subrogation rule set opens a recovery referral automatically without manual triage.',
        durationSec: 7.2,
        citations: [2]
      },
      {
        id: 'turn-5',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'Clean split: Cloud API for external submission, Gosu for transactional integrity, and zero data leaving this device.',
        durationSec: 6.9,
        citations: [1, 2]
      }
    ]
  },
  {
    id: 'ep-cloud-api-gosu',
    title: 'Cloud API vs. Gosu Plugin Boundaries',
    subtitle: 'Integration architecture briefing',
    topic: 'Cloud API & Gosu',
    durationMinutes: 1.8,
    hosts: {
      alex: { name: 'Alex', voice: 'Evan', tone: 'Architect' },
      maya: { name: 'Maya', voice: 'Zoe', tone: 'Lead Dev' }
    },
    coverGradient: 'from-slate-800 to-zinc-900',
    sourceDocumentIds: ['doc-cc-cloud-api', 'doc-cc-gosu-rules'],
    dialogue: [
      {
        id: 'api-turn-1',
        speaker: 'Maya',
        speakerRole: 'Practical Synthesizer',
        text: 'Teams often ask when to expose a new Cloud API endpoint versus keeping logic inside Gosu pre-update rules.',
        durationSec: 6.8,
        citations: [1]
      },
      {
        id: 'api-turn-2',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'External consumer orchestration belongs in Cloud API schemas and handlers, where JSON:API versioning protects upstream mobile and portal clients.',
        durationSec: 7.5,
        citations: [1, 2]
      },
      {
        id: 'api-turn-3',
        speaker: 'Maya',
        speakerRole: 'Practical Synthesizer',
        text: 'Meanwhile, invariant checks like exposure reserve limits and cross-entity bundle validation stay atomic inside Gosu transaction hooks.',
        durationSec: 7.2,
        citations: [2]
      },
      {
        id: 'api-turn-4',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'Keeping that boundary crisp avoids brittle plugins during InsuranceSuite cloud upgrades.',
        durationSec: 5.9,
        citations: [1]
      }
    ]
  },
  {
    id: 'ep-reserve-authority',
    title: 'PolicyCenter Sync & Reserve Authority',
    subtitle: 'Coverage verification & limits',
    topic: 'Claims Operations',
    durationMinutes: 1.6,
    hosts: {
      alex: { name: 'Alex', voice: 'Evan', tone: 'Architect' },
      maya: { name: 'Maya', voice: 'Zoe', tone: 'Lead Dev' }
    },
    coverGradient: 'from-zinc-800 to-slate-900',
    sourceDocumentIds: ['doc-pc-cc-sync', 'doc-cc-gosu-rules'],
    dialogue: [
      {
        id: 'res-turn-1',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'Before any adjuster approves an indemnity reserve, ClaimCenter reconciles policy effective dates and deductible overrides with PolicyCenter.',
        durationSec: 7.1,
        citations: [3]
      },
      {
        id: 'res-turn-2',
        speaker: 'Maya',
        speakerRole: 'Practical Synthesizer',
        text: 'If the verified exposure crosses the adjuster authority limit, the approval routing activity escalates straight to a claims supervisor queue.',
        durationSec: 7.4,
        citations: [2, 3]
      },
      {
        id: 'res-turn-3',
        speaker: 'Alex',
        speakerRole: 'Deep Tech Host',
        text: 'And every coverage snapshot is persisted locally for auditability even when external gateway latency spikes.',
        durationSec: 6.4,
        citations: [3]
      }
    ]
  }
];
