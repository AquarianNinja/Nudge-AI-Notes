export type AppMode = 'workspace' | 'meetings' | 'nanoteam' | 'genteam' | 'studio' | 'settings';

export type ExecutionApproach = 'local' | 'cloud' | 'hybrid' | 'custom';

export type ActivityType = 'meetingNotes' | 'transcription' | 'slideDeck';

export type ApiProviderId =
  | 'local'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepgram'
  | 'assemblyai'
  | 'groq'
  | 'custom';

export type PaidProviderId = Exclude<ApiProviderId, 'local'>;

export type PaidApiKeyStore = Record<PaidProviderId, string>;

export interface CustomEndpointConfig {
  baseUrl: string;
  modelId: string;
  transcriptionUrl: string;
  transcriptionModelId: string;
  pipelineNote: string;
}

export interface ActivityModelOption {
  id: string;
  activity: ActivityType;
  provider: ApiProviderId;
  name: string;
  supportedApproaches: ExecutionApproach[];
  requiresPaidKey: boolean;
  summary: string;
  speakerIdCapable?: boolean;
}

export interface ActivityRouteConfig {
  approach: ExecutionApproach;
  modelId: string;
}

export interface WhisperModelOption {
  id: string;
  name: string;
  sizeLabel: string;
  speedLabel: string;
  accuracyLabel: string;
  isDownloaded: boolean;
}

export type LegacySettingsCategoryId = 'models' | 'speech';

export type SettingsCategoryId =
  | 'callsigns'
  | 'hub'
  | 'voice'
  | 'haptics'
  | 'dictionary'
  | 'drive'
  | 'features'
  | 'system';

export type SettingsBucketId = SettingsCategoryId | LegacySettingsCategoryId;

export type LiveProviderId =
  | 'whisperkit-local'
  | 'deepgram-live'
  | 'assemblyai-live'
  | 'openai-realtime'
  | 'gemini-live'
  | 'anthropic-no-live'
  | 'custom-live-ws';

export interface LiveTranscriptionProviderOption {
  id: LiveProviderId;
  provider: ApiProviderId;
  companyName: string;
  modelName: string;
  protocol: string;
  supportsLiveStreaming: boolean;
  requiresPaidKey: boolean;
  paidPlanLabel: string;
  diarizationSupport: boolean;
  keytermBoostSupport: boolean;
  capabilityNote: string;
}

export type DictionaryTermSource =
  | 'seed'
  | 'audio-meeting'
  | 'transcript-pdf'
  | 'live-stream'
  | 'cloud-agent'
  | 'manual';

export type DictionaryCategory =
  | 'ClaimCenter Entity'
  | 'API & Integration'
  | 'Gosu & Rules'
  | 'Claims Operations'
  | 'Speaker / Org';

export type CloudAgentProviderId = 'openai' | 'anthropic' | 'gemini';

export interface DictionaryEntry {
  id: string;
  term: string;
  category: DictionaryCategory;
  source: DictionaryTermSource;
  sourceFile: string;
  occurrences: number;
  boostWeight: number;
  aliases?: string[];
  definition?: string;
  verifiedByAgent: boolean;
  agentProvider?: CloudAgentProviderId;
  learnedAt: string;
}

export type OpenSourceVoiceModId =
  | 'kokoro-82m'
  | 'chatterbox-zero'
  | 'fish-speech-v15'
  | 'orpheus-3b'
  | 'dia-16b';

export type VoiceSourceMode = 'trained-personal' | 'open-source-mod';

export type VoiceInferenceHost = 'modal-serverless' | 'runpod-gpu' | 'fal-cloud' | 'custom-tts';

export interface OpenSourceVoiceMod {
  id: OpenSourceVoiceModId;
  name: string;
  license: string;
  params: string;
  architecture: string;
  bestFor: string;
  coHostPair: string;
  defaultRate: number;
  defaultPitch: number;
  endpointHint: string;
}

export interface VoiceTrainingPrompt {
  id: string;
  stepLabel: string;
  title: string;
  script: string;
  focusPhonetics: string;
}

export interface PersonalVoiceProfile {
  name: string;
  samplesCompleted: number;
  totalSamples: number;
  sampleDurationsSec: number[];
  sampleUrls: string[];
  trainedAt?: string;
  status: 'untrained' | 'recording' | 'ready';
  pitchMultiplier: number;
  rateMultiplier: number;
}

export interface VoiceProfileConfig {
  activeMode: VoiceSourceMode;
  openSourceModId: OpenSourceVoiceModId;
  cloudInferenceHost: VoiceInferenceHost;
  customVoiceEndpoint: string;
  saveSamplesToDrive: boolean;
  personalProfile: PersonalVoiceProfile;
}

export type HapticProfileId =
  | 'crisp'
  | 'subtle'
  | 'rhythmic'
  | 'mechanical'
  | 'expressive';

export type HapticIntensity = 'gentle' | 'balanced' | 'strong';

export interface HapticCategoriesConfig {
  navigation: boolean;
  taps: boolean;
  outcomes: boolean;
  alerts: boolean;
}

export interface HapticSettingsConfig {
  enabled: boolean;
  profile: HapticProfileId;
  intensity: HapticIntensity;
  categories: HapticCategoriesConfig;
}

export type MotionIntensityPreset = 'reduced' | 'standard' | 'fluid';

export interface AppSettings {
  activeLlmId: string;
  activeWhisperId: string;
  ttsEngine: 'on-device' | 'secure-cloud';
  offlineOnly: boolean;
  localOnly?: boolean;
  activeSttModelId?: string;
  activeTextModelId?: string;
  activeDictationModeId?: string;
  translationEnabled?: boolean;
  translationSourceLang?: string;
  translationTargetLang?: string;
  historyRetention?: DictationHistoryRetention;
  overlayStyle?: DictationOverlayStyle;
  dictationHotkey?: string;
  translationHotkey?: string;
  localServerUrl?: string;
  dictationModes?: DictationMode[];
  motionIntensity: MotionIntensityPreset;
  hapticFeedback: boolean;
  haptics: HapticSettingsConfig;
  diarization: boolean;
  autoPunctuation: boolean;
  language: string;
  domainTerms: string;
  autoLearnDictionary: boolean;
  liveProviderId: LiveProviderId;
  speakerCount: 'auto' | number;
  speakerLabels: string;
  apiKeys: PaidApiKeyStore;
  customEndpoint: CustomEndpointConfig;
  activityRoutes: Record<ActivityType, ActivityRouteConfig>;
  voiceProfile: VoiceProfileConfig;
  enableCrewPlanner?: boolean;
  enableOfficeDiary?: boolean;
  enableScoutFeature?: boolean;
}

export interface ModelOption {
  id: string;
  name: string;
  family: string;
  params: string;
  quantization: 'Q3_K_M' | 'Q4_K_M' | 'Q8_0' | 'FP16';
  ramUsageMB: number;
  engine: 'MLX Swift' | 'CoreML Neural Engine' | 'Metal MPS';
  tokensPerSec: number;
  contextWindow: number;
  recommendedDevice: string;
  isDownloaded?: boolean;
}

export interface ChatAudioAttachment {
  driveFileId?: string;
  fileName: string;
  durationSec: number;
  durationLabel: string;
  audioUrl: string;
  highlights?: MeetingTranscriptHighlight[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  audioAttachment?: ChatAudioAttachment;
  attachments?: WorkspaceAttachment[];
  ragSynthesis?: RagSynthesisResult;
  metadata?: {
    tokensPerSec?: number;
    ramMB?: number;
    latencyMs?: number;
    isPrivate?: boolean;
    citations?: number[];
  };
}

export type AgentRole = 'planner' | 'scout' | 'reader' | 'verifier' | 'synthesizer';

export interface AgentStep {
  id: string;
  role: AgentRole;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail: string;
  dataOutput?: string[];
  latencyMs?: number;
}

export type TimelineStageId = 'search' | 'synthesis' | 'drafting';

export type TimelineStageStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TimelineStageTelemetry {
  elapsedMs: number;
  sourceCount: number;
  sourceLabel: string;
}

export interface TimelineStage {
  id: TimelineStageId;
  indexLabel: string;
  label: 'Search' | 'Synthesis' | 'Drafting';
  description: string;
  status: TimelineStageStatus;
  telemetry: TimelineStageTelemetry;
  subSteps: AgentStep[];
}

export type StageTelemetryMap = Record<TimelineStageId, TimelineStageTelemetry>;

export interface SparkpageCitation {
  id: number;
  title: string;
  url: string;
  snippet: string;
  domain: string;
  crawlTimestamp: string;
  reliabilityScore: number; // 0 to 100
  authorOrSource?: string;
}

export interface SparkpageSection {
  id: string;
  title: string;
  summary: string;
  content: string;
  bullets?: string[];
  citations: number[];
  metrics?: { label: string; value: string; badge?: string }[];
}

export interface SparkpageData {
  id: string;
  query: string;
  title: string;
  subtitle: string;
  generatedDate: string;
  consensusScore: number; // percentage
  agentExecutionTimeSec: number;
  sourcesScannedCount: number;
  sections: SparkpageSection[];
  citations: SparkpageCitation[];
  comparisonTable?: {
    headers: string[];
    rows: { entity: string; values: string[] }[];
  };
  keyTakeaways: string[];
}

export interface LocalDocument {
  id: string;
  title: string;
  format: 'PDF' | 'TXT' | 'EPUB' | 'Markdown' | 'Note' | 'Image' | 'Audio';
  sizeKB: number;
  chunkCount: number;
  dateAdded: string;
  summary: string;
  contentExcerpt: string;
  tags: string[];
  coreDataRecordId?: string;
  embeddingDim?: number;
  syncStatus?: 'synced' | 'indexing' | 'local';
}

export interface PodcastDialogueTurn {
  id: string;
  speaker: 'Alex' | 'Maya';
  speakerRole: 'Deep Tech Host' | 'Practical Synthesizer';
  text: string;
  durationSec: number;
  citations?: number[];
}

export interface PodcastEpisode {
  id: string;
  title: string;
  subtitle: string;
  topic: string;
  durationMinutes: number;
  hosts: {
    alex: { name: string; voice: string; tone: string };
    maya: { name: string; voice: string; tone: string };
  };
  coverGradient: string;
  dialogue: PodcastDialogueTurn[];
  sourceDocumentIds: string[];
}

export interface DeviceMemoryProfile {
  name: string;
  totalRAM_GB: number;
  osOverhead_GB: number;
  jetsamLimit_GB: number; // The point where iOS violently kills the app
  chipset: string;
}

export type MeetingItemCategory = 'decision' | 'action' | 'risk';

export type MeetingDiffChangeType = 'added' | 'updated' | 'resolved' | 'unchanged';

export interface MeetingNoteItem {
  id: string;
  topicKey: string;
  category: MeetingItemCategory;
  text: string;
  owner?: string;
}

export interface MeetingTranscriptHighlight {
  timestamp: string;
  speaker: string;
  speakerTag?: string;
  text: string;
}

export type AudioOrigin = 'imported' | 'recorded' | 'sample';

export interface DriveAudioFile {
  id: string;
  fileName: string;
  origin: AudioOrigin;
  durationSec: number;
  durationLabel: string;
  sizeBytes: number;
  sizeLabel: string;
  createdAt: string;
  audioUrl: string;
  mimeType: string;
  linkedSessionTitle?: string;
}

export type TranscriptExportFormat = 'markdown' | 'json' | 'docx' | 'pdf' | 'vtt' | 'txt';

export type MeetingNotesExportFormat = 'docx' | 'pdf' | 'markdown';

export type AnyExportFormat = TranscriptExportFormat | MeetingNotesExportFormat;

export interface TranscriptExportOptions {
  includeMetadata?: boolean;
  includeDictionaryTerms?: boolean;
  includedHighlightIndices?: number[];
}

export interface MeetingNotesExportOptions {
  includeMetadata?: boolean;
  includeSummary?: boolean;
  includeDecisions?: boolean;
  includeActions?: boolean;
  includeRisks?: boolean;
  includeHighlights?: boolean;
  includedItemIds?: string[];
  includedHighlightIndices?: number[];
}

export type ExportFilterOptions = TranscriptExportOptions | MeetingNotesExportOptions;

export interface DownloadedMeetingExport {
  id: string;
  kind: 'transcript' | 'notes';
  format: AnyExportFormat;
  fileName: string;
  exportedAt: string;
  exportedIso?: string;
  sizeBytes?: number;
  sourceMode?: 'single' | 'batch-zip';
  selectionSummary?: string;
  filterOptions?: ExportFilterOptions;
}

export interface MeetingSession {
  id: string;
  sessionNumber: number;
  parentSessionId?: string;
  title: string;
  audioFileName: string;
  audioDurationLabel: string;
  audioDurationSec?: number;
  audioSizeLabel: string;
  audioUrl?: string;
  driveFileId?: string;
  audioDeleted?: boolean;
  recordedAt: string;
  summary: string;
  items: MeetingNoteItem[];
  highlights: MeetingTranscriptHighlight[];
  downloadedExports?: DownloadedMeetingExport[];
  exportHistory?: DownloadedMeetingExport[];
  generatedBy?: {
    transcriptionSummary: string;
    notesSummary: string;
    speakerIdEnabled: boolean;
  };
}

export interface SessionDiffItem {
  topicKey: string;
  category: MeetingItemCategory;
  changeType: MeetingDiffChangeType;
  previousText?: string;
  currentText?: string;
  previousOwner?: string;
  currentOwner?: string;
}

export interface SessionComparison {
  baseSessionId: string;
  continuationSessionId: string;
  addedCount: number;
  updatedCount: number;
  resolvedCount: number;
  unchangedCount: number;
  diffs: SessionDiffItem[];
}

export type SlideLayoutType = 'title' | 'bullets' | 'metrics' | 'comparison' | 'roadmap';

export type SlideAudience = 'Executive Brief' | 'Architecture Review' | 'Sprint Readout';

export interface SlideItem {
  id: string;
  index: number;
  kicker: string;
  title: string;
  layout: SlideLayoutType;
  bullets: string[];
  metrics?: { label: string; value: string }[];
  speakerNotes: string;
}

export interface SlideDeck {
  id: string;
  title: string;
  subtitle: string;
  audience: SlideAudience;
  sourceLabel: string;
  approach: ExecutionApproach;
  modelName: string;
  providerLabel: string;
  generatedAt: string;
  slides: SlideItem[];
}

export type StudioProviderId = 'openai' | 'anthropic' | 'gemini';

export type StudioDeliverableTab =
  | 'slides'
  | 'flashcards'
  | 'gwt'
  | 'pdf-report'
  | 'annotated-transcript'
  | 'audio-overview'
  | 'rag-ask'
  | 'save-share';

export interface GwtCriterion {
  id: string;
  storyCode: string;
  title: string;
  priority: 'Must' | 'Should';
  given: string;
  when: string;
  then: string;
  edgeCase: string;
  sourceRef: string;
}

export interface ClientPdfReport {
  id: string;
  title: string;
  clientName: string;
  preparedFor: string;
  tone: 'Executive' | 'Technical' | 'Client Brief';
  providerLabel: string;
  generatedDate: string;
  executiveSummary: string;
  keyMetrics: { label: string; value: string }[];
  decisions: string[];
  actionMatrix: { owner: string; deliverable: string; target: string }[];
  risks: { risk: string; mitigation: string }[];
}

export type AnnotationTagType = 'DECISION' | 'ACTION' | 'RISK' | 'ENTITY' | 'RULE';

export interface AnnotatedTranscriptEntry {
  id: string;
  timestamp: string;
  speaker: string;
  speakerTag?: string;
  text: string;
  annotations: { type: AnnotationTagType; label: string }[];
  linkedDictionaryTerms: string[];
}

export type GenTeamAgentVendor =
  | 'claude'
  | 'gemini'
  | 'wisprflow'
  | 'grok'
  | 'openai'
  | 'custom';

export type GenTeamAccentColor =
  | 'blue'
  | 'amber'
  | 'teal'
  | 'zinc'
  | 'emerald'
  | 'violet';

export type GenTeamExecutionMode = 'cloud-sandbox' | 'local-cli' | 'voice-stream';

export type GenTeamAgentStatus = 'online' | 'thinking' | 'idle';

export interface GenTeamAgent {
  id: string;
  name: string;
  handle: string;
  vendor: GenTeamAgentVendor;
  modelName: string;
  roleTitle: string;
  specialty: string;
  accent: GenTeamAccentColor;
  executionMode: GenTeamExecutionMode;
  status: GenTeamAgentStatus;
  systemPrompt: string;
  skills: string[];
  activeTasksCount: number;
  taskCapacity?: number;
  isBuiltIn?: boolean;
}

export interface GenTeamChannel {
  id: string;
  name: string;
  kind: 'channel' | 'dm';
  dmAgentId?: string;
  description: string;
  memberAgentIds: string[];
}

export interface GenTeamMessage {
  id: string;
  channelId: string;
  senderType: 'human' | 'agent';
  agentId?: string;
  senderName: string;
  handle: string;
  content: string;
  timestamp: string;
  mentions?: string[];
  handoffToAgentId?: string;
  taskRefTitle?: string;
}

export type GenTeamTaskStatus = 'todo' | 'in-progress' | 'in-review' | 'done';

export interface GenTeamTask {
  id: string;
  title: string;
  description: string;
  status: GenTeamTaskStatus;
  assigneeAgentId: string;
  channelId: string;
  priority: 'Normal' | 'High';
  updatedAt: string;
  deadlineIso?: string;
}

export type RagStrategyId =
  | 'hybrid-rrf'
  | 'agentic'
  | 'graph-rag'
  | 'corrective'
  | 'multimodal';

export type UploadedAssetKind = 'document' | 'image' | 'audio';

export type CoreDataDocumentFormat =
  | 'PDF'
  | 'TXT'
  | 'EPUB'
  | 'Markdown'
  | 'Image'
  | 'Audio'
  | 'Note';

export interface WorkspaceAttachment {
  id: string;
  kind: UploadedAssetKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sizeLabel: string;
  formatLabel: string;
  previewUrl?: string;
  extractedText?: string;
  imageMeta?: {
    width: number;
    height: number;
    visualSummary: string;
  };
  audioMeta?: {
    durationSec: number;
    durationLabel: string;
    driveFileId?: string;
    highlights?: MeetingTranscriptHighlight[];
  };
  chunkCount?: number;
  vectorDocId?: string;
}

export interface CoreDataManagedDocument {
  managedObjectId: string;
  cloudKitRecordName: string;
  entityName: 'CDDocument';
  id: string;
  title: string;
  format: CoreDataDocumentFormat;
  assetKind: UploadedAssetKind;
  sizeKB: number;
  chunkCount: number;
  embeddingDim: number;
  dateAdded: string;
  updatedIso: string;
  summary: string;
  contentExcerpt: string;
  tags: string[];
  syncState: 'synced' | 'local';
}

export interface CoreDataChunkEmbedding {
  managedObjectId: string;
  entityName: 'CDChunkEmbedding';
  documentId: string;
  documentTitle: string;
  documentFormat: CoreDataDocumentFormat;
  assetKind: UploadedAssetKind;
  chunkIndex: number;
  sectionLabel: string;
  text: string;
  keywords: string[];
  entities: string[];
  embedding: number[];
}

export interface CoreDataVectorStoreState {
  containerId: string;
  zoneName: string;
  embeddingDim: number;
  lastSyncedIso: string;
  documents: CoreDataManagedDocument[];
  chunks: CoreDataChunkEmbedding[];
}

export interface RagRetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentFormat: CoreDataDocumentFormat;
  assetKind: UploadedAssetKind;
  sectionLabel: string;
  text: string;
  vectorScore: number;
  lexicalScore: number;
  fusedScore: number;
  matchedTerms: string[];
  graphHops?: string[];
}

export interface RagSynthesisResult {
  query: string;
  strategyId: RagStrategyId;
  strategyLabel: string;
  answer: string;
  localLlmName: string;
  cloudVectorUsed: boolean;
  cloudSearchTriggered: boolean;
  confidenceScore: number;
  latencyMs: number;
  pipelineSteps: string[];
  retrievedChunks: RagRetrievedChunk[];
  cloudSearchCitations?: SparkpageCitation[];
}

export type WorkspaceSubTab = 'deep-search' | 'diary' | 'scheduler';

export type OfficeDiaryCategory = 'Focus' | 'Decision' | 'Blocker' | 'Note';

export interface OfficeDiaryEntry {
  id: string;
  dateIso: string; // YYYY-MM-DD
  dateLabel: string;
  timeLabel: string;
  title: string;
  content: string;
  category: OfficeDiaryCategory;
  tags: string[];
  attachmentNames?: string[];
  createdIso: string;
  updatedIso: string;
}

export type CloudSchedulerModelId =
  | 'claude-3-7-sonnet'
  | 'gemini-2-5-pro'
  | 'gpt-4o'
  | 'grok-3';

export type SchedulerIntervalId = '15s' | '1m' | '5m' | 'hourly';

export interface BackgroundTaskRunLog {
  runNumber: number;
  executedAtIso: string;
  executedAtLabel: string;
  summary: string;
  ragStrategyId?: RagStrategyId;
  chunksUsedCount: number;
  cloudCitationsCount: number;
  durationMs: number;
}

export interface BackgroundAgentTask {
  id: string;
  title: string;
  prompt: string;
  cloudModelId: CloudSchedulerModelId;
  cloudModelLabel: string;
  cloudProviderLabel: string;
  intervalId: SchedulerIntervalId;
  intervalLabel: string;
  intervalMs: number;
  status: 'running' | 'paused';
  ragEnabled: boolean;
  ragStrategyId: RagStrategyId;
  attachmentNames: string[];
  runCount: number;
  createdAtIso: string;
  lastRunIso: string | null;
  nextRunIso: string;
  latestOutput: string;
  latestChunks: RagRetrievedChunk[];
  latestCitations: SparkpageCitation[];
  runHistory: BackgroundTaskRunLog[];
  assignedAgentId?: string;
  scheduledSlotIso?: string;
}

export interface UserIdentity {
  userId: string;
  createdAt: string;
  authUid?: string;
  linkedProvider: 'google' | 'guest';
}

export interface Callsign {
  id: string;
  userId: string;
  displayName: string;
  avatar: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NanobotEngineId = 'pulse' | 'atlas' | 'nova';

export type NanobotStyleId =
  | 'researcher'
  | 'analyst'
  | 'scheduler'
  | 'writer'
  | 'inbox-admin'
  | 'developer';

export type NanobotScheduleCadence = 'once' | 'daily' | 'weekly' | 'custom';

export interface NanobotSchedule {
  cadence: NanobotScheduleCadence;
  startTime: string; // HH:mm
  customIntervalMinutes?: number;
  notificationsEnabled: boolean;
  nextRunIso?: string;
}

export type NanobotStatus =
  | 'idle'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed';

export interface Nanobot {
  id: string;
  userId: string;
  name: string;
  engine: NanobotEngineId;
  styleId: NanobotStyleId;
  modelId: string;
  taskPrompt: string;
  schedule: NanobotSchedule;
  status: NanobotStatus;
  sandboxId: string;
  consentTimestampIso: string;
  createdAt: string;
  updatedAt: string;
}

export type NanobotRunStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface NanobotRun {
  id: string;
  botId: string;
  userId: string;
  startedAt: string;
  endedAt?: string;
  status: NanobotRunStatus;
  output: string;
}

export interface NanobotSandboxState {
  sandboxId: string;
  botId: string;
  userId: string;
  storagePath: string;
  networkScope: string;
  credentialScope: string;
  memoryEntries: Array<{
    id: string;
    timestamp: string;
    summary: string;
  }>;
  updatedAt: string;
}

export type ScoutScope = 'web' | 'web+note' | 'news';

export type ScoutIntent = 'facts' | 'compare' | 'news' | 'define' | 'custom';

export type ScoutStage = 'searching' | 'reading' | 'synthesizing' | 'complete';

export type ScoutEntryPoint =
  | 'orb'
  | 'hold_menu'
  | 'slash_chip'
  | 'selection_bar'
  | 'swipe_up'
  | 'unified_search'
  | 'keyboard_shortcut';

export type ScoutSurface = 'diary' | 'meetings' | 'studio';

export type ScoutErrorCode =
  | 'OFFLINE_BLOCKED'
  | 'CONSENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'VALIDATION_ERROR'
  | 'CANCELLED';

export interface ScoutCitation {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  faviconText: string;
  publishedLabel?: string;
}

export interface ScoutResult {
  query: string;
  redactedQuery: string;
  scope: ScoutScope;
  engine: NanobotEngineId;
  summary: string;
  citations: ScoutCitation[];
  durationMs: number;
  provider: 'gemini-grounding' | 'wikipedia-fallback';
  cached?: boolean;
}

export type ScoutStreamEvent =
  | { type: 'stage'; stage: ScoutStage; detail: string; count?: number }
  | { type: 'delta'; text: string }
  | { type: 'citation'; citation: ScoutCitation }
  | {
      type: 'complete';
      summary: string;
      citations: ScoutCitation[];
      durationMs: number;
      provider: 'gemini-grounding' | 'wikipedia-fallback';
    }
  | { type: 'error'; code: ScoutErrorCode; message: string; retryAfterSec?: number };

export interface ScoutLaunchRequest {
  query: string;
  noteContext?: string;
  scope?: ScoutScope;
  intent?: ScoutIntent;
  engine?: NanobotEngineId;
  entryPoint: ScoutEntryPoint;
  surface: ScoutSurface;
  autoRun?: boolean;
  onInsert?: (text: string) => void;
}

export interface NanobotWizardSeed {
  engine: NanobotEngineId;
  styleId: NanobotStyleId;
  taskPrompt: string;
  name?: string;
  consentTimestampIso?: string;
  nonce: number;
}

// --- Unified Spokenly-Inspired Model Registry, Dictation Modes & History ---

export type UnifiedModelCategory = 'stt' | 'llm' | 'translate';

export type ModelRuntimeKind = 'local' | 'cloud';

export type ModelAvailabilityStatus =
  | 'cached'
  | 'not-downloaded'
  | 'downloading'
  | 'ready'
  | 'locked-local-only'
  | 'missing-key';

export interface UnifiedModelSpec {
  id: string;
  name: string;
  vendor: string;
  category: UnifiedModelCategory;
  runtime: ModelRuntimeKind;
  provider: ApiProviderId;
  hfRepoId?: string;
  isGatewayDefault?: boolean;
  isLoopbackServer?: boolean;
  capabilities: {
    realtime: boolean;
    translate: boolean;
    batch: boolean;
    diarization: boolean;
  };
  languages: string[];
  footprint: {
    sizeLabel: string;
    sizeMB: number;
    minRamMB: number;
  };
  metrics: {
    speedTier: 1 | 2 | 3 | 4 | 5;
    accuracyTier: 1 | 2 | 3 | 4 | 5;
    speedLabel: string;
    accuracyLabel: string;
    latencyHint: string;
  };
  summary: string;
  defaultCached?: boolean;
}

export type DictationOutputAction = 'insert' | 'copy' | 'history-only';

export type DictationOverlayStyle = 'capsule' | 'panel';

export type DictationHistoryRetention = 'forever' | '30d' | 'none';

export interface DictationMode {
  id: string;
  name: string;
  icon: 'sparkles' | 'mail' | 'languages' | 'code';
  description: string;
  instructions: string;
  sttModelId: string;
  textModelId: string;
  spokenTrigger: string;
  stripTrigger: boolean;
  hotkey: string;
  outputAction: DictationOutputAction;
  translateEnabled: boolean;
  sourceLang: string;
  targetLang: string;
  builtIn?: boolean;
}

export interface DictationHistoryEntry {
  id: string;
  createdIso: string;
  modeId: string;
  modeName: string;
  sttModelId: string;
  sttModelName: string;
  textModelId?: string;
  rawText: string;
  finalText: string;
  translatedText?: string;
  detectedLang: string;
  sourceLang: string;
  targetLang: string;
  durationSec: number;
  wordCount: number;
  audioDriveId?: string;
  audioMimeType?: string;
  insertedTarget?: 'diary' | 'meetings' | 'studio' | 'clipboard' | 'history';
  localOnlyUsed: boolean;
}

export type DictationPipelineState =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'ready'
  | 'mic-denied'
  | 'error';

export type LocalSttBackendKind = 'webgpu' | 'wasm' | 'gateway' | 'loopback' | 'fallback-audio';

export type StudioFlashcardCategory = 'Decision' | 'Action' | 'Risk' | 'Key Term' | 'Highlight';

export interface StudioFlashcard {
  id: string;
  deckCategory: StudioFlashcardCategory;
  front: string;
  back: string;
  sourceRef: string;
  tags?: string[];
}

export interface GoogleDriveUploadResult {
  id: string;
  name: string;
  webViewLink?: string;
  mimeType: string;
  uploadedAtIso: string;
}



