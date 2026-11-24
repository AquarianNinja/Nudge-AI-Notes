# Phase 2: Nudge-AI Overlap Audit, Deletion Map & Migration Plan

> **GATE NOTICE**: This document completes Phase 2. **No destructive deletions or Phase 3 code changes have been executed yet.** Review and approve the deletions and consolidation plan below before Phase 3 begins.

---

## 1. Exhaustive Nudge-AI Feature & Codebase Inventory

| Domain | Current Implementation (File Paths) | Current Behavior & Gaps |
| :--- | :--- | :--- |
| **UI Shell & Navigation** | `src/App.tsx`, `src/components/TabBar.tsx`, `src/components/OnboardingFlow.tsx`, `src/components/MotionPrimitives.tsx` | 5-tab floating pill `TabBar` (`Workspace`, `Meetings`, `Studio`, `Notebook`, `Settings`) + iOS Device Frame toggle + 6-slide `OnboardingFlow` with Google Sign-In & Guest Skip. Lacks any global floating dictation HUD/overlay or global dictation hotkeys. |
| **Model Catalogs & Pickers** | `src/data/mockData.ts` (`WHISPER_MODELS`, `AVAILABLE_MODELS`, `ACTIVITY_MODELS`, `LIVE_TRANSCRIPTION_PROVIDERS`), `src/utils/modelCatalog.ts`, `src/components/ModelPickerModal.tsx`, `src/components/ActivityPipelineBar.tsx` | **Highly fragmented across 4 separate systems**: `AVAILABLE_MODELS` (static MLX specs), `WHISPER_MODELS` (4 mock Whisper items), `ACTIVITY_MODELS` (18 items split across 3 activities), and `LIVE_TRANSCRIPTION_PROVIDERS` (7 live WS items). Separate modal (`ModelPickerModal`) only simulates downloads with timeouts and does not track capabilities (`translate`, `languages`, `speedScore`, `accuracyScore`) consistently. |
| **Settings Structure** | `src/components/SettingsView.tsx`, `src/utils/settingsCategories.ts`, `src/components/HapticsBucketView.tsx`, `src/components/DictionaryBucketView.tsx`, `src/components/HardwareLabView.tsx`, `src/components/WhitepaperView.tsx` | Splits audio/AI controls across 3 disconnected Settings categories: `models` (`Models & Routing`), `speech` (`Speech & Live`), `voice` (`Voice Profile` — podcast TTS mods), plus `system` (`Keys & System` housing the `offlineOnly` toggle, `ApiKeysModal` launcher, and `HardwareLabView` / `WhitepaperView` diagnostics). |
| **Audio Capture & Storage** | `src/components/DriveFolderView.tsx`, `src/utils/audioDrive.ts`, `src/utils/audioConversion.ts`, `src/components/AudioFormatDownloadModal.tsx`, `src/components/InlineAudioPlayer.tsx`, `server.ts` (`/api/audio/formats`, `/api/audio/convert`) | Real `MediaRecorder` capture + synthetic WAV fallback + real `ffmpeg` server transcoding (`mp3`, `wav`, `m4a`, `ogg`, `flac`, `aac`). Currently tied only to Drive folder or Meeting Notes rather than feeding a real browser STT worker + global HUD. |
| **Transcription & Live ASR** | `src/components/MeetingNotesView.tsx` (`handleToggleLiveTranscribe`, `handleToggleRecord`), `src/components/MeetingActionSheets.tsx` (`MeetingRetranscribeSheet`), `src/utils/meetingNotes.ts`, `src/components/TranscriptFormatDownloadModal.tsx` | `handleToggleLiveTranscribe` runs a **hardcoded 3-turn ClaimCenter timer script** instead of real speech-to-text, while `MeetingRetranscribeSheet` pulls from *both* `ACTIVITY_MODELS` and `WHISPER_MODELS` separately. Real browser WebGPU/WASM Whisper/ONNX execution is absent. No A→B live dictation translation or standalone dictation history exists. |
| **Voice Synthesis & Podcast** | `src/components/VoiceProfileBucketView.tsx`, `src/utils/audioSynthesis.ts`, `src/components/NotebookLMView.tsx`, `src/components/TranscriptDetailView.tsx` | Distinct feature: generates 2-host NotebookLM podcast episodes (Alex & Maya) with Web Speech synthesis or open-source TTS mod metadata + 3-clip calibration. Minimal overlap with STT dictation; keep Voice Profile strictly scoped to Podcast/TTS synthesis. |
| **API-Key & Custom Endpoints** | `src/components/ApiKeysModal.tsx`, `src/utils/providerRouting.ts` (`PAID_PROVIDERS`, `validateApiKeyFormat`), `src/data/mockData.ts` (`customEndpoint`), `server.ts` (`process.env.GEMINI_API_KEY`) | Separate `ApiKeysModal` collects 6 client-side BYOK keys (`openai`, `anthropic`, `gemini`, `deepgram`, `assemblyai`, `custom`) + `customEndpoint` URLs in `AppSettings`. Note: Gemini server proxy (`server.ts`) uses `process.env.GEMINI_API_KEY` cleanly server-side; however `providerRouting.ts` / `ApiKeysModal.tsx` sits detached from the model picker and needs consolidation into the single Model & Audio Hub (plus Groq/local endpoint presets). |
| **Local-Only / Offline Policy** | `src/types/index.ts` (`offlineOnly`), `src/utils/providerRouting.ts`, `src/components/ScoutSheet.tsx`, `src/components/StudioView.tsx`, `src/utils/ragEngine.ts`, `server.ts` (`/api/vector-db/query`, `/api/scout/stream`) | **Soft UI flag only**: `offlineOnly` displays warning banners in UI readiness helpers and passes booleans to two endpoints, **but** there is no central network gateway! Client `fetch(...)` calls (`nanobotClient.ts`, `ragClient.ts`, Firebase Firestore SDK writes, `scoutAgent.ts`) and `/api/search/cloud` / `server.ts` Wikipedia fetches are not universally intercepted/blocked, and cloud models lack inline disabled reasons in pickers. |
| **Orphaned / Dead Legacy Views** | `src/components/AgentResearchView.tsx`, `src/components/OnDeviceChat.tsx`, `src/data/mockData.ts` (`INITIAL_CHAT_MESSAGES`, `SAMPLE_SPARKPAGES`) | **Dead code**: Neither `AgentResearchView.tsx` nor `OnDeviceChat.tsx` is imported anywhere in `src/`! `AgentResearchView` was superseded by `UnifiedWorkspaceView` + `AgentTaskTimeline` + `ScoutSheet`; `OnDeviceChat` is a static mock chat. `SAMPLE_SPARKPAGES` / `INITIAL_CHAT_MESSAGES` exist only for these orphans. |
| **Identity, Callsigns & NanoTeam / Nanobots** | `src/components/CallsignIdentitySection.tsx`, `src/utils/identityCallsigns.ts`, `src/components/CrewPlannerSection.tsx`, `src/components/CreateNanobotWizard.tsx`, `src/components/NanobotDetailView.tsx`, `src/components/GenTeamView.tsx`, `src/components/AddGenTeamAgentModal.tsx`, `src/components/AgentTaskSummaryDashboard.tsx`, `src/utils/nanobotCatalog.ts`, `src/utils/nanobotClient.ts`, `src/utils/nanobotSandbox.ts`, `src/utils/genTeam.ts`, `src/utils/crewPlanner.ts`, `server.ts` (`/api/identity/init`, `/api/callsigns*`, `/api/nanobots*`) | Immutable `NB-XXXX-XXXX` User IDs, multi-callsigns, NanoTeam workspace, 6-step Nanobot wizard (`Pulse`/`Atlas`/`Nova`), per-bot filesystem sandboxes, and run logs. **Non-overlapping** with Spokenly dictation — **preserve intact**, only gating external network runs through the new central Local-Only gateway when `localOnly` is active. |
| **Scout, Diary, Studio & Notebook** | `src/components/ScoutSheet.tsx`, `src/components/ScoutTriggers.tsx`, `src/utils/scoutAgent.ts`, `src/components/UnifiedWorkspaceView.tsx`, `src/components/OfficeDiaryCalendar.tsx`, `src/components/StudioView.tsx`, `src/components/SlideDeckView.tsx`, `src/components/NotebookLMView.tsx`, `src/utils/coreDataVectorDb.ts`, `src/utils/ragEngine.ts`, `src/utils/studioEngine.ts`, `src/utils/slideDeck.ts` | Core Nudge-AI value (`Notes | Web` search, Scout sheet, Daily Office Diary, ClaimCenter PRD/GWT/Slides/PDF Studio, CoreData Vector DB + Notebook RAG). **Preserve intact**, adding Dictation HUD `"Insert into Note"` integration cleanly across Diary, Studio, and Meetings. |
| **Firebase Persistence & Rules** | `firebase-blueprint.json`, `firestore.rules`, `src/firebase.ts`, `src/components/FirebaseProvider.tsx`, `src/utils/firestoreSync.ts`, `.env.example`, `server.ts` | Syncs `/users/{uid}`, `diaryEntries`, `schedulerTasks`, `coreDataDocuments`, `preferences/app`, `identity/account`, `callsigns`, `nanobots`, and `runs`. `preferences/app` currently validates `activeLlmId`, `activeWhisperId`, `ttsEngine`, `offlineOnly`, `liveProviderId`. |

---

## 2. Spokenly vs. Nudge-AI Overlap Matrix

| Spokenly Capability | Nudge-AI Equivalent (File Paths) | Overlap | Action | Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Global Floating Overlay (Capsule / Notch / Panel)** | None (inline Mic buttons in `MeetingNotesView.tsx`, `DriveFolderView.tsx`, and dead `OnDeviceChat.tsx`) | **Partial** | **Add** global Liquid Glass Dynamic-Island HUD (`DictationHud.tsx`) at app shell root + **Remove** simulated live ticker & dead `OnDeviceChat.tsx`. | **Low** — New top-center portal/overlay must avoid colliding with iPhone frame notch (`App.tsx:909`) and `botNotificationToast` (`App.tsx:928`). |
| **Real-Time Partial Dictation** | `MeetingNotesView.tsx` (`handleToggleLiveTranscribe` lines 589–669 hardcoded ClaimCenter script) | **Full (Simulated)** | **Redesign** into real WebGPU/WASM Whisper Worker (`localSttWorker.ts`) + cloud gateway streaming (`POST /api/dictation/transcribe`), replacing hardcoded timer loop in `MeetingNotesView.tsx` while keeping fallback tests clean. | **Medium** — Headless test browsers lack mic hardware/WebGPU; must preserve graceful Web Audio fallback + deterministic test hooks. |
| **Provider-Agnostic Model Registry & Unified Picker** | `src/data/mockData.ts` (`WHISPER_MODELS`, `AVAILABLE_MODELS`, `ACTIVITY_MODELS`, `LIVE_TRANSCRIPTION_PROVIDERS`), `src/utils/modelCatalog.ts`, `src/utils/providerRouting.ts`, `src/components/ModelPickerModal.tsx`, `src/components/ActivityPipelineBar.tsx`, `src/components/SettingsView.tsx` (`models` + `speech` buckets), `src/components/MeetingActionSheets.tsx` | **Full (Fragmented)** | **Remove** separate `ModelPickerModal.tsx`, `ActivityPipelineBar.tsx`, `modelCatalog.ts`, and split Whisper/Live provider pickers; **Redesign** into one `modelRegistry.ts` + one consolidated **Audio, Models & Keys Hub** (`ModelAudioHubView.tsx` / quick sheet) used by Settings, HUD, and Meeting Re-transcribe. | **High (Regression Surface)** — Multiple views and existing unit tests (`modelCatalog.test.ts`, `providerRouting.test.ts`, `settingsCategories.test.ts`) read `AppSettings.activeWhisperId` / `activeLlmId` / `liveProviderId` / `activityRoutes`. Requires clean adapter & test updates. |
| **BYOK API Keys & Custom Endpoint Vault** | `src/components/ApiKeysModal.tsx`, `src/utils/providerRouting.ts` (`PAID_PROVIDERS`), `src/components/SettingsView.tsx` (`system` bucket) | **Full** | **Remove** standalone `ApiKeysModal.tsx` and fold BYOK keys (OpenAI, Anthropic, Deepgram, Groq, AssemblyAI, Custom) + Localhost Ollama/LM Studio/Speaches endpoints directly into the consolidated **Audio, Models & Keys Hub** (`Keys & Endpoints` section). Note: keep Gemini managed server-side via `process.env.GEMINI_API_KEY` in `server.ts`. | **Low** — Keep `onOpenApiKeys` deep-link callers (`DictionaryBucketView`, `StudioView`, `MeetingActionSheets`) opening the Hub directly on the `Keys` tab. |
| **Dictation Modes & Spoken Trigger Words** | None (partial intent analog in `ScoutTriggers.tsx` `/web` `@scout` + `nanobotCatalog.ts` office styles) | **None** | **Add** Dictation Modes (`Clean Dictation`, `Email & Memo`, `Translate A→B`, `Technical / Code`) with spoken trigger prefix detection (`dictationModes.ts`) & mode-specific model/output config. | **Low** — Ensure spoken triggers stay isolated to active dictation streams and never conflict with `/web` note tokens. |
| **Real-Time A → B Translation** | None | **None** | **Add** `Speak Language A → Output Language B` flow inside HUD + Hub + `POST /api/dictation/translate` (using `@google/genai` `gemini-4-hydrogen` / `gemini-3.5-live-translate-preview` online, or local translation / clear notice offline). | **Low** — Explicit language pair state & clear notice when offline without a local translation model. |
| **Dictation History & Retention Policy** | Partial in `DriveFolderView.tsx` (raw audio clips) & `MeetingNotesView.tsx` (meeting sessions) | **Partial** | **Add** dedicated searchable Dictation History store (`dictationHistory.ts`, audio replay via Drive/Blob, Copy/Export MD/TXT/SRT/VTT, retention `keep-forever` / `30-days` / `do-not-save`) while keeping `MeetingSessions` and `DriveFolderView` intact. | **Low** — Guard `localStorage` quota by storing large audio blobs in IndexedDB/ObjectURL rather than JSON `localStorage`. |
| **Local-Only Mode & Network Firewall** | Partial (`AppSettings.offlineOnly` soft checks in `providerRouting.ts`, `ScoutSheet.tsx`, `StudioView.tsx`, `server.ts` `/api/vector-db/query`) | **Partial** | **Redesign** into a true centralized `networkGateway.ts` (client) + `X-Local-Only` server middleware (`server.ts`): blocks all external `fetch`/SSE/cloud AI/Scout/Cloud-Sync calls while allowing loopback (`127.0.0.1` / `localhost`) and already-cached local models; adds persistent Liquid Glass status pill; disables cloud models with explicit lock reason badges in Hub. | **Medium** — Must cleanly pause Firestore cloud sync listeners/writes or show local-only mode notice without triggering `FirestoreErrorBoundary` crashes. |
| **Local Model Download & Cache UX** | Simulated `setTimeout` toggle in `src/App.tsx` (`handleDownloadLlm`, `handleDownloadWhisper`) | **Partial** | **Redesign** with real Hugging Face / Transformers.js ONNX model fetch + browser Cache API (`cache` inspection, byte progress %, delete cached weights, WebGPU vs WASM SIMD capability detection, blocked when Local-Only is ON unless user permits). | **Medium** — Must work deterministically in offline/CI smoke tests and recover cleanly if CDN download fails. |
| **Meeting Notes, Diff Comparison & Exports** | `src/components/MeetingNotesView.tsx`, `MeetingActionSheets.tsx`, `BatchExportSheet.tsx`, `PrepareExportModal.tsx`, `ExportProgressModal.tsx`, `src/utils/meetingNotes.ts`, `documentExport.ts` | **Partial** (Transcription input only) | **Keep** Meeting sessions, S1/S2 diff comparisons, PDF/DOCX/JSON/VTT/ZIP exports; rewire live capture & re-transcribe picker to use the new unified `modelRegistry` + real STT engine. | **Low** |
| **NanoTeam, Nanobots, Sandboxes & Callsigns** | `CrewPlannerSection.tsx`, `CreateNanobotWizard.tsx`, `NanobotDetailView.tsx`, `GenTeamView.tsx`, `CallsignIdentitySection.tsx`, `server.ts` | **None** | **Keep** 100% intact; gate Nanobot external cloud runs through the centralized `networkGateway` / `X-Local-Only` check. | **Low** |
| **Scout, Office Diary, Studio & Notebook RAG** | `ScoutSheet.tsx`, `ScoutTriggers.tsx`, `UnifiedWorkspaceView.tsx`, `StudioView.tsx`, `NotebookLMView.tsx`, `VoiceProfileBucketView.tsx` | **None** | **Keep** 100% intact; add HUD insertion target for Diary/Studio/Meetings and enforce Local-Only gateway across Scout & Studio. | **Low** |
| **Legacy Orphaned Chat & Research Stubs** | `src/components/AgentResearchView.tsx`, `src/components/OnDeviceChat.tsx`, `INITIAL_CHAT_MESSAGES`, `SAMPLE_SPARKPAGES` in `mockData.ts` | **Full (Superseded & Unused)** | **Remove** completely (zero active consumers). | **None** — Zero runtime impact; removes ~750 lines of dead code. |

---

## 3. Complete Deletion & Consolidation List + Dependency Audit

### 3.1 Files & Symbols Slated for Removal
1. **`src/components/AgentResearchView.tsx`** *(Delete file)*
   - *Reason*: Completely superseded by `UnifiedWorkspaceView.tsx` (using `AgentTaskTimeline.tsx`) and `ScoutSheet.tsx`; simulated static `setInterval` pipeline.
   - *Dependencies*: **None** (`grep` confirms zero imports across `src/` and `server.ts`). Keep `src/components/AgentTaskTimeline.tsx` (which is imported by `UnifiedWorkspaceView.tsx`).
2. **`src/components/OnDeviceChat.tsx`** *(Delete file)*
   - *Reason*: Unused simulated local chat + audio stub superseded by Notebook Q&A and the new global Dictation HUD + History.
   - *Dependencies*: **None** (`grep` confirms zero imports across `src/`).
3. **`src/data/mockData.ts` dead exports** *(Remove unused symbols)*
   - Remove `INITIAL_CHAT_MESSAGES`, `SAMPLE_SPARKPAGES`, `WHISPER_MODELS`, `LIVE_TRANSCRIPTION_PROVIDERS`, `ACTIVITY_MODELS`, and `AVAILABLE_MODELS` **once migrated** into `src/utils/modelRegistry.ts` (keep `OPEN_SOURCE_VOICE_MODS`, `VOICE_TRAINING_PROMPTS`, `INITIAL_DICTIONARY_ENTRIES`, `DEFAULT_APP_SETTINGS`, `SAMPLE_PODCAST_EPISODES`, `INITIAL_LOCAL_DOCUMENTS`).
   - *Dependents*:
     - `src/App.tsx`: passes `llmModels` & `whisperModels` → switch to unified registry state (`models`).
     - `src/components/NotebookLMView.tsx:37`: imports `AVAILABLE_MODELS` → read active local model descriptor from registry helper.
     - `src/utils/providerRouting.ts`: imports `ACTIVITY_MODELS`, `LIVE_TRANSCRIPTION_PROVIDERS` → migrate into `modelRegistry.ts` + `providerRouting.ts` unified readiness helpers.
     - `src/utils/settingsCategories.test.ts` & `src/utils/modelCatalog.test.ts`: update test fixtures to new registry.
4. **`src/components/ModelPickerModal.tsx`** *(Delete file — consolidated into Hub)*
   - *Dependents*: `src/App.tsx` (line 12 import, line 1100 render, `pickerState`). Replace callers with opening the consolidated **Model, Audio & Keys Hub** sheet/view.
5. **`src/components/ApiKeysModal.tsx`** *(Delete file — consolidated into Hub)*
   - *Dependents*: `src/App.tsx` (line 13 import, line 1115 render, `apiKeyModalState`). Existing `onOpenApiKeys(focusProvider)` props in `SettingsView.tsx`, `StudioView.tsx`, `DictionaryBucketView.tsx`, `MeetingNotesView.tsx`, and `MeetingActionSheets.tsx` stay typed and route straight to the Hub's **Keys & Endpoints** tab!
6. **`src/components/ActivityPipelineBar.tsx`** *(Delete file — consolidated into Hub)*
   - *Dependents*: `src/components/SettingsView.tsx` (line 63 import, line 447 render). Replaced cleanly inside the unified **Audio, Models & Keys Hub** section.
7. **`src/utils/modelCatalog.ts` & `src/utils/modelCatalog.test.ts`** *(Remove/replace with unified `src/utils/modelRegistry.ts` & `modelRegistry.test.ts`)*
   - *Dependents*: `src/App.tsx` (lines 52–57).
8. **`src/components/MeetingNotesView.tsx` simulated live script** *(Remove `script` hardcoded 3-turn timer inside `handleToggleLiveTranscribe` lines 622–668)*
   - Replace with unified live dictation stream (real microphone WebGPU/WASM Whisper Worker or active cloud gateway stream, with active `localOnly` gate check).
9. **`src/components/SettingsView.tsx` redundant `models` + `speech` split** *(Consolidate)*
   - Merge `models` (`Models & Routing`), `speech` (`Speech & Live`), and API-key launch under a single cohesive **Models, Audio & Dictation Hub** category (`hub` — mapping legacy `models`/`speech` bucket requests automatically via `resolveInitialSettingsCategory`), while keeping `callsigns`, `voice` (Podcast TTS), `haptics`, `dictionary`, `drive`, and `system` clean and intact.

### 3.2 Server Routes (`server.ts`) & Gateway Audit
- **Existing Routes Retained**:
  - `/api/health`, `/api/vector-db/*`, `/api/documents/parse`, `/api/audio/formats`, `/api/audio/convert`, `/api/diary*`, `/api/scheduler/tasks*`, `/api/scout/stream`, `/api/identity/init`, `/api/callsigns*`, `/api/nanobots*`.
- **Legacy Route Evaluation — `POST /api/search/cloud` (`server.ts:577–617`)**:
  - Currently executes `executeRagRetrieval(..., { offlineOnly: false })` + unconditional `fetchLiveCloudWebCitations(query)` even if `offlineOnly` is on. `src/utils/ragClient.ts:372` (`executeCloudSearchRequest`) is still used by `UnifiedWorkspaceView.tsx` Deep Search tab.
  - **Action**: Keep route for Deep Search backwards compatibility, **add** `localOnly` / `X-Local-Only` enforcement so `fetchLiveCloudWebCitations` is hard-blocked (`403 LOCAL_ONLY_BLOCKED`) when Local-Only Mode is active.
- **New Gateway Routes Added in Phase 3**:
  - `POST /api/dictation/transcribe`: Server-side cloud STT gateway (routes to `gemini-3.5-transcribe` via `@google/genai` using `process.env.GEMINI_API_KEY`, or forwards BYOK Deepgram/OpenAI/Groq when user explicitly provides a BYOK key). **Blocked by `X-Local-Only` middleware.**
  - `POST /api/dictation/translate`: Server-side fast translation/cleanup gateway (routes to `gemini-4-hydrogen` / `gemini-3.5-live-translate-preview` via `@google/genai`, or user BYOK text model). **Blocked by `X-Local-Only` middleware.**

### 3.3 Firestore Collections, Security Rules & Blueprint Audit
- **Existing Collections (`firebase-blueprint.json` & `firestore.rules`)**:
  - `/users/{userId}`, `/private/profile`, `/diaryEntries/{entryId}`, `/schedulerTasks/{taskId}`, `/coreDataDocuments/{docId}`, `/preferences/app`, `/identity/account`, `/callsigns/{callsignId}`, `/nanobots/{botId}`, `/runs/{runId}`.
  - **Zero collections need deletion.**
- **Preferences Schema Update (`/users/{userId}/preferences/app`)**:
  - Keep existing keys (`activeLlmId`, `activeWhisperId`, `ttsEngine`, `offlineOnly`, `motionIntensity`, `hapticFeedback`, `diarization`, `autoPunctuation`, `language`, `autoLearnDictionary`, `liveProviderId`) for smooth non-breaking hydration.
  - Add new non-secret fields to `UserPreferencesDoc` (`firebase-blueprint.json`), `isValidUserPreferences` + `affectedKeys().hasOnly(...)` (`firestore.rules`), and `buildSanitizedPreferencesPayload` (`src/utils/firestoreSync.ts`):
    - `activeSttModelId` (string, 1–80 chars)
    - `activeTextModelId` (string, 1–80 chars)
    - `activeDictationModeId` (string, 1–64 chars)
    - `translationSourceLang` (string, 2–24 chars)
    - `translationTargetLang` (string, 2–24 chars)
    - `historyRetention` (`'forever' | '30d' | 'none'`)
    - `overlayStyle` (`'capsule' | 'panel'`)
  - Enforce ESLint `@firebase/eslint-plugin-security-rules` validation & deploy updated `firestore.rules` (if Firebase rules deployment is requested/permitted).
  - **Dictation History Storage Strategy**: Store dictation history entries + audio locally first (IndexedDB / `localStorage` metadata) so Local-Only Mode & unauthenticated users have full history, with zero cloud leakage when `offlineOnly` / `localOnly` is active.

### 3.4 Environment Variables Audit (`.env.example`)
- Current `.env.example` contains `GEMINI_API_KEY` and `APP_URL`.
- **Zero env vars deleted; zero new secret env vars required.** Platform Gemini transcription/translation uses the existing server-side `GEMINI_API_KEY`. BYOK cloud keys remain optional session/local user inputs.

---

## 4. Migration Steps (Executed at Start of Phase 3)

1. **Non-Breaking Preferences Migration Helper**:
   - Write `migrateLegacyAppSettings(raw)` so any stored preferences containing `offlineOnly`, `activeWhisperId` (e.g., `'whisper-large-v3-turbo'`), or `liveProviderId` (e.g., `'deepgram-live'`) map cleanly onto unified `ModelRegistry` IDs (`activeSttModelId`, `localOnly` synced 1:1 with `offlineOnly`).
2. **Legacy Deep-Link Bucket Redirect**:
   - Map `resolveInitialSettingsCategory('models')` and `resolveInitialSettingsCategory('speech')` cleanly to the new unified `'hub'` category so any deep link (`SettingsBucketId`) lands inside the consolidated Audio, Models & Keys Hub without dead-ends.
3. **Central Network Gateway Cutover**:
   - Route all client `fetch` calls (`ragClient.ts`, `nanobotClient.ts`, `scoutAgent.ts`, `audioConversion.ts`) through `networkGateway.fetch(...)`, add `X-Local-Only` Express middleware on `server.ts`, and gate Firebase cloud sync writes when `localOnly` is `true`.
4. **Clean Removal & Test Verification**:
   - Delete `AgentResearchView.tsx`, `OnDeviceChat.tsx`, `ModelPickerModal.tsx`, `ApiKeysModal.tsx`, `ActivityPipelineBar.tsx`, `modelCatalog.ts`, and dead `mockData.ts` arrays; update remaining imports and affected unit tests (`modelCatalog.test.ts` → `modelRegistry.test.ts`, `settingsCategories.test.ts`, `providerRouting.test.ts`, `firestoreSync.test.ts`); verify `tsc --noEmit`, `vite build`, unit tests, and Playwright UI verification.

---

## 5. Fallback & Degradation Strategy

To ensure realtime dictation, A→B translation, and Local-Only air-gapping never trap the user in a broken state across varying browser capabilities, network conditions, or missing hardware:

### 5.1 Local Speech-to-Text Execution Ladder (WebGPU → WASM → Gateway / Recovery)
1. **Primary Runtime — In-Browser WebGPU Whisper Worker (`localStt.worker.ts`)**:
   - Runs quantized ONNX Whisper weights (`Tiny` / `Base` / `Small`) off the main UI thread with weights persisted in browser Cache API / IndexedDB.
2. **Fallback 1 — Automatic WASM SIMD Downgrade**:
   - If `navigator.gpu` is unavailable, adapter initialization fails, or WebGPU hits memory limits, the worker transparently initializes `onnxruntime-web` WASM (`simd` / `threads`) and surfaces a subtle `"WASM CPU"` telemetry badge in the HUD & Hub without interrupting capture.
3. **Fallback 2 — Un-Downloaded Local Weights (`localOnly` Aware)**:
   - Captured audio (`Blob`) is buffered in memory / Drive rather than discarded.
   - **When `localOnly === false`**: HUD offers 1-tap **"Download Local Weights (~40 MB)"** or 1-tap **"Use Cloud Gateway Fallback (`gemini-3.5-transcribe`)"** directly on the captured buffer.
   - **When `localOnly === true`**: Cloud gateway and CDN downloads stay strictly blocked (`LOCAL_ONLY_BLOCKED`). **Privacy Guard**: Never silently fall back to browser `webkitSpeechRecognition` / `SpeechRecognition` under Local-Only Mode, because Chromium's Web Speech API transmits raw audio to external Google servers. Instead, preserve the recorded clip locally in Drive/History and offer selection of an already-cached local model or a loopback (`localhost` / `127.0.0.1`) ASR server.
4. **Fallback 3 — Mic Hardware Missing / Permission Denied / Headless Environments**:
   - Catch `NotAllowedError`, `NotFoundError`, and `AbortError` cleanly inside the HUD and `MeetingNotesView`; switch the HUD into an inline recovery state with: (a) **Upload / Drop Audio Clip** (`.wav`, `.mp3`, `.m4a`, `.webm`) routed through the same STT pipeline, and (b) **Type / Paste Text → Translate / Format** so translation Modes and insertion remain functional without live mic hardware.

### 5.2 A → B Translation Fallback Ladder
- **Primary (`localOnly === false`)**: Server-side `@google/genai` (`gemini-4-hydrogen` / `gemini-3.5-live-translate-preview`) via `POST /api/dictation/translate`, or user-configured BYOK provider.
- **Fallback 1 (`localOnly === true` + Loopback Model)**: Routes to user-configured `localhost` Ollama / LM Studio / custom endpoint (explicitly exempted by `networkGateway`).
- **Fallback 2 (`localOnly === true`, No Loopback Model)**: Never fails silently or leaks to cloud. Commits the clean source-language transcript into History / active note with a clear inline status pill: *"Translated output unavailable offline — source transcript preserved"*.

### 5.3 Local-Only Network Gateway & Firestore Sync Fallback
- **When `localOnly === true`**:
  - `networkGateway.ts` intercepts external client `fetch` / SSE calls and rejects before socket creation (`LOCAL_ONLY_BLOCKED`).
  - `server.ts` enforces `X-Local-Only` middleware on `/api/search/cloud`, `/api/vector-db/query`, `/api/scout/stream`, `/api/nanobots/*`, `/api/dictation/transcribe`, and `/api/dictation/translate`.
  - **Firestore Pause & Local Persistence Fallback**: Active `onSnapshot` listeners and cloud writes in `App.tsx` / `firestoreSync.ts` pause cleanly when `localOnly === true` (preventing unwanted egress and avoiding `FirestoreErrorBoundary` offline crashes). Diary entries, Dictation History, Modes, and Settings read/write cleanly via `localStorage` + IndexedDB/Cache API and reconcile once `localOnly` is disabled.

### 5.4 Non-Breaking Data, UI Deep-Link & Rollback Fallbacks
- **Legacy Settings Hydration (`migrateLegacyAppSettings`)**: Maps old `activeWhisperId` + `liveProviderId` → `activeSttModelId`, `activeLlmId` → `activeTextModelId`, and keeps `offlineOnly` ↔ `localOnly` synchronized bidirectionally. Missing new fields on pre-Phase-3 Firestore `preferences/app` documents fall back safely to defaults.
- **Legacy Settings Bucket Links (`resolveInitialSettingsCategory`)**: Calls targeting `'models'` or `'speech'` resolve automatically to `'hub'` (`Models, Audio & Dictation Hub`), preventing dead views or broken tests.
- **API-Key Modal Deep Links (`onOpenApiKeys`)**: Existing triggers across Studio, Dictionary, Meetings, and Settings open the consolidated Hub scrolled directly to the `Keys & Endpoints` section.

---

> **PHASE 2 STOP GATE — WAITING FOR YOUR APPROVAL**
> Please confirm if you approve the **Deletion, Consolidation & Fallback Plan** above (removing `AgentResearchView.tsx`, `OnDeviceChat.tsx`, `ModelPickerModal.tsx`, `ApiKeysModal.tsx`, `ActivityPipelineBar.tsx`, `modelCatalog.ts`, fragmented arrays in `mockData.ts`, and the simulated timer in `MeetingNotesView.tsx`) so I can proceed to **Phase 3 (Redesign + Implementation + Smoke Tests)**.
