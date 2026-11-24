# Phase 1: Spokenly Reverse-Engineering Teardown & Design Spec

> **Methodology & Epistemic Hygiene**: All findings below are derived strictly from public Spokenly documentation (`spokenly.app/docs`), official release notes, App Store / platform descriptions, and observable public behavior. Every claim is tagged `[Confirmed]`, `[Inferred]`, or `[Unknown]`.

---

## 1. Product Model & Core Loop

- **`[Confirmed]` Core Interaction Loop**: Press/hold global hotkey (or tap UI control) → compact recording overlay appears showing live audio levels / streaming partial words → speak naturally (optionally across multiple languages or prefixed with a spoken trigger word) → release hotkey (or tap Stop) → Spokenly runs STT → optionally runs Mode LLM post-processing / A→B translation → outputs according to Mode action (Paste at Cursor, Paste & Send, Copy to Clipboard, or Save to History Only) → commits entry + audio to local History.
- **`[Confirmed]` Cross-Platform Surface Area**: Native macOS client (primary flagship with hardware-notch overlay, MacBook aluminum-tap gestures, and system-audio meeting capture), plus Windows, Linux, iOS/Apple Watch, Android, and Chrome Extension.
- **`[Confirmed]` Zero-Account Local Baseline**: Users can download local STT weights (Whisper variants / NVIDIA Parakeet) immediately after installation with zero account creation or cloud dependency.

---

## 2. UI & Ergonomic Specification

### 2.1 Layout & Navigation Hierarchy

- **`[Confirmed]` Mac Desktop Shell**: Menu bar status item provides quick access to Mode switcher, recent History, Local-Only indicator, and Settings window.
- **`[Confirmed]` Settings Window Architecture (Sidebar + Detail Pane)**:
  - Left rail groups configuration into predictable buckets: **Home / Stats**, **Dictation Modes**, **AI Models (Dictation & Text)**, **Translation**, **Hotkeys & Triggers**, **Recording Display**, **History**, and **Privacy & Updates**.
  - On mobile (iOS), switches to a bottom-tab bar (`Home`, `History`, `Modes`, `Settings` `[Inferred]`) with `Settings > App > Local-only mode`.
- **`[Inferred]` Spacing & Hierarchy Rules**:
  - Top-level shell uses clean 16–20px outer padding, 12px card gaps, 8px internal control spacing, and clear active badges for Mode, Model, and Network State so the user always knows *where* voice goes before speaking.

### 2.2 Recording Overlay / Notch / Capsule Specification (`Settings > Recording Display`)

Spokenly exposes three distinct live overlay styles `[Confirmed]`:

1. **Panel (Default / Free)** `[Confirmed]`
   - **Position**: Floating bottom-center card (`~380–460px` wide `[Inferred]`).
   - **Contents**: Live multi-bar waveform + streaming real-time partial transcription (when a realtime engine is selected) + active Mode pill + Stop/Cancel triggers.
   - **Dual Role on macOS**: Also displays meeting capture notices and voice agent answers.
2. **Notch (macOS Hardware-Notch Strip)** `[Confirmed]`
   - **Position**: Anchored flush at top-center straddling/flanking the Mac display notch (`width expands ~120px → 360px` `[Inferred]`).
   - **Contents**: Compact waveform on the right wing, single-line horizontally scrolling live transcript underneath/across the expanded notch bezel, and Mode icon on the left wing.
3. **Capsule (Minimal Floating Pill)** `[Confirmed]`
   - **Position**: Compact pill (`~180–280px` wide `[Inferred]`) centered near bottom edge (or top-center dynamic island on mobile/web adaptations).
   - **Behavior**: Waveform swaps smoothly into live partial text while speaking; hovering/pointing reveals inline **Finish**, **Cancel**, and **Switch Mode** controls.

#### Overlay Motion & State Timing (`[Inferred]` from public demos & native platform norms)
- **Appearance / Morph**: Spring expansion (`~220–280ms`, zero blocking backdrop—editor behind remains focused/visible).
- **Waveform**: Audio-reactive vertical scale bars sampled from mic RMS amplitude (~30–60fps).
- **Partial → Final Transition**: Dimmed/italicized unstable tokens stabilize as committed words; brief "Processing / Formatting..." shimmer badge when an LLM post-processor Mode is active, then collapses cleanly on completion.

### 2.3 Screen-by-Screen Design Spec & ASCII Wireframes

#### Screen A: Recording Overlay Styles (Panel / Notch / Capsule)

```
  1. NOTCH / DYNAMIC ISLAND (Top-Center)
  ╭────────────────────────────────────────────────────────────────────╮
  │  ● Clean Dictation   [En → Es]              ▂▄▇▅▃▂  00:08  [ ■ ]  │
  │  "Sending updated reserve estimate for ClaimCenter FNOL..."        │
  ╰────────────────────────────────────────────────────────────────────╯

  2. CAPSULE (Minimal Pill — swaps Waveform <-> Live Partial Text)
  ╭────────────────────────────────────────╮
  │  ◉ "Please check PolicyCenter SLA..."  │  (Hover/Tap -> Stop | × | Mode ▾)
  ╰────────────────────────────────────────╯

  3. PANEL (Anchored Card — Waveform + Multi-Line Partial + Meeting Alert)
  ╭────────────────────────────────────────────────────────╮
  │  Mode: Email Draft · Whisper Large v3 (Local)   [ ✕ ]  │
  │  ────────────────────────────────────────────────────  │
  │  Live: "Hi team, following up on today's subrogation    │
  │         review—"                                       │
  │  ▂▅█▆▃▂▅▇▄▂▁▂▄▆█▅▃                        [ ■ Finish ] │
  ╰────────────────────────────────────────────────────────╯
```

#### Screen B: Active-Mode Indicator & Dictation Mode Editor

- **`[Confirmed]` Mode Anatomy**: Each Mode bundles:
  1. **Name & Icon** (`Clean`, `Email`, `Translate EN→ES`, `Code / Terminal`)
  2. **AI Instructions** (free-text system prompt: filler removal, tone rewrite, translation directive)
  3. **Dictation Model (STT)** + **Text/Fallback Model (LLM)**
  4. **Output Behavior** (`Paste at Cursor`, `Paste & Send`, `Copy Only`, `Save to History`)
  5. **Activation Rules** (Dedicated Hotkey, Spoken Trigger Word—auto-stripped from output, Active App bundle ID, or Browser URL)
  6. **Context Awareness** (Clipboard text, selected cursor text, active app metadata, browser URL) `[Confirmed]`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Active Mode: [ ✦ Clean Dictation ▾ ]   Shortcut: ⌥+Space / Spoken:"clean"│
├───────────────────────────────────┬──────────────────────────────────────┤
│  MODES                            │  MODE: Translate ES (EN → ES)        │
│  ● Clean Dictation        (⌥Space)│  Dictation STT: [ Whisper v3 Local ▾]│
│  ○ Email & Memo           (⌥E)    │  Post-Process:  [ Local / Translation]│
│  ○ Translate (EN → ES)    (⌥T)    │  Spoken Lang:   [ English (Auto)   ▾]│
│  ○ Technical / Code       (⌥C)    │  Output Lang:   [ Spanish          ▾]│
│  [ + New Mode ]                   │  Output Action: (●) Insert ( ) Copy  │
│                                   │  Trigger Word:  "translate" [Strip ✓]│
│                                   │  Context: [x] Selected text [ ] URL  │
└───────────────────────────────────┴──────────────────────────────────────┘
```

#### Screen C: Settings Navigation & AI Models Catalog

```
┌───────────────────────────┬──────────────────────────────────────────────┐
│  SPOKENLY SETTINGS        │  AI MODELS · SPEECH-TO-TEXT                  │
│                           │  Filter: [ All | Local | BYOK | Realtime ]   │
│  ▸ Home & Word Stats      │  ┌────────────────────────────────────────┐  │
│  ▸ Dictation Modes        │  │ ★ Parakeet v2 (Local · Apple Silicon)  │  │
│  ● AI Models              │  │   Realtime ✓ · 62x · Cached (390 MB)   │  │
│  ▸ Translation            │  │   Speed █████  Accuracy ████░  [Active]│  │
│  ▸ Hotkeys & Tap Gestures │  ├────────────────────────────────────────┤  │
│  ▸ Recording Display      │  │   Whisper Large v3 Turbo (Local)       │  │
│  ▸ History & Retention    │  │   Batch/Chunk · 100+ langs · 547 MB    │  │
│  ▸ Privacy & Updates      │  │   Speed ████░  Accuracy █████ [Download]│  │
│                           │  ├────────────────────────────────────────┤  │
│  ───────────────────────  │  │ 🔒 Deepgram Nova-3 (Cloud BYOK)        │  │
│  🛡 Local-Only Mode [ON]  │  │   Blocked: Local-Only Mode is active   │  │
└───────────────────────────┴──────────────────────────────────────────────┘
```

#### Screen D: History Archive & Audio Replay

- **`[Confirmed]` Capabilities**: Local chronological archive of dictations & meeting audio; retention selector (`Do not save history`, `30 days` `[Inferred]`, `Keep forever`), manual wipe, audio replay, copy/export (`Markdown`, `TXT`, `SRT`, `VTT` `[Inferred]` / `[Confirmed]` formats for transcripts), and word-count / duration metadata.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  HISTORY  [ Search transcripts... ]     Retention: [ Keep Forever ▾ ]    │
├──────────────────────────────────────────────────────────────────────────┤
│  Today · 14:22   Mode: Translate [EN → ES]   Whisper v3 (Local) · 0:18   │
│  "Por favor revise los límites..."   [▶ Play Audio] [Copy] [Export ▾][🗑]│
├──────────────────────────────────────────────────────────────────────────┤
│  Today · 11:05   Mode: Clean Dictation       Parakeet (Local) · 0:42     │
│  "Aligned FNOL intake via ClaimCenter..."  [▶ Play] [Copy] [Export ▾][🗑]│
└──────────────────────────────────────────────────────────────────────────┘
```

#### Screen E: First-Run Onboarding, Empty & Error States

- **`[Confirmed]` Onboarding**: Guided welcome → mic & accessibility permission prompts → hotkey choice (Hold-to-Talk vs Toggle) → immediate local model selection (`Whisper` / `Parakeet`) or optional BYOK / Cloud login.
- **Empty & Error States** (`[Confirmed]` triggers, `[Inferred]` UI phrasing):
  - *Empty History*: Centered mic icon + shortcut hint (`Press ⌥+Space anywhere to capture your first dictation`).
  - *Mic Permission Denied*: Inline banner inside overlay + Settings deep link to grant microphone access.
  - *Missing API Key*: Cloud model shows `Key Required` badge; attempting to record surfaces quick-action button to add key or switch to local fallback.
  - *Local Model Not Downloaded*: Prompts 1-tap weight download (blocked if Local-Only is enforcing air-gap without temporary override `[Inferred]`).
  - *No Audio / Silence Detected*: Auto-dismisses cleanly with brief subtle status toast (*"No speech detected"* `[Inferred]`) without polluting History.

#### Screen F: Shortcuts & Hardware Triggers

- **`[Confirmed]` Keyboard & Physical Triggers**:
  - Push-to-Talk (hold modifier/function key, release to transcribe) vs Toggle mode (tap to start, tap to stop).
  - Dedicated **Translation Hotkey** separate from primary **Dictation Hotkey**.
  - Per-Mode hotkeys (`⌥+Space`, `F1–F19`, single modifier keys like `Right Cmd`).
  - Spoken **Trigger Words** inside audio stream that dynamically route into a Mode and strip the trigger prefix.
  - MacBook aluminum-case **2/3/4-tap** chassis triggers `[Confirmed]`.

---

## 3. Engine & Model Catalog Specification

| Tier | Engines Supported (`[Confirmed]` vs `[Inferred]`) | Auth / Setup | Latency & Streaming | Offline Capable |
| :--- | :--- | :--- | :--- | :--- |
| **Local On-Device STT** | `[Confirmed]` OpenAI Whisper family (Tiny, Base, Small, Large v3 / Turbo), NVIDIA Parakeet / Parakeet Redux | Zero key, explicit weight download inside `AI Models > Local Models` | `[Confirmed]` Parakeet = ultra-fast realtime; Whisper = fast chunked or batch | **Yes (100%)** |
| **Managed Spokenly Cloud** | `[Confirmed]` Hosted ElevenLabs Scribe, OpenAI, Deepgram, etc. via Pro subscription | Spokenly Pro account | `[Confirmed]` Realtime streaming + batch | **No** |
| **BYOK Cloud STT** | `[Confirmed]` Deepgram, Groq (Whisper Large), OpenAI (`gpt-4o-transcribe` / Realtime), ElevenLabs Scribe, Soniox, Mistral, AssemblyAI | User-supplied API key stored locally | `[Confirmed]` Deepgram / OpenAI Realtime / Soniox = streaming; Groq = ultra-fast batch | **No** |
| **Local / LAN Self-Hosted** | `[Confirmed]` Ollama, LM Studio (AI text processing), Speaches (local OpenAI-compatible STT server) | Loopback / LAN URL (`localhost:11434`, etc.) | `[Inferred]` Depends on local GPU | **Yes (Loopback / LAN)** |

- **Speed vs. Accuracy Framing** `[Confirmed]`:
  - UI surfaces clear speed vs. accuracy trade-offs (e.g., *Parakeet* / *Groq* / *Whisper Tiny* prioritized for instant partial streaming & responsiveness; *Whisper Large v3* / *OpenAI* / *Deepgram Nova* framed for maximum multi-accent and domain precision).
- **Realtime vs. Batch** `[Confirmed]`:
  - Live partial text inside Recording Display is enabled **only** when a realtime-capable STT model is active; batch models capture full audio waveform first and render text immediately on release/stop.
- **Languages & Mid-Sentence Mixing** `[Confirmed]`:
  - 100+ languages supported across Whisper/cloud models; supports *Auto-detect* and *mixed-language speech* within a single utterance.
- **Translation Flow** `[Confirmed]`:
  - Two first-class entry points:
    1. **Global Translation Tab (`Settings > Translation`) + Dedicated Translation Hotkey**: Toggle *Dictation Translation*, choose *Spoken Language* (or Auto), choose *Target Language*, press secondary hotkey to speak Language A and paste Language B.
    2. **Mode AI Instruction**: Attach translation prompt + Target Language inside a reusable Dictation Mode (e.g., *"Translate to Spanish preserving technical nouns"*).
- **API-Key Management** `[Confirmed]`:
  - Keys are entered per provider in `AI Models > API Keys`, validated before saving (`[Inferred]`), and bypass managed Spokenly Cloud routing when selected.

---

## 4. Local-Only Mode Behavior

- **`[Confirmed]` What It Blocks**:
  - Blocks **all** outbound internet calls so raw audio, transcripts, analytics telemetry, and update checks never leave the device.
  - **Explicit Exemptions `[Confirmed]`**: Local loopback (`localhost`, `127.0.0.1`) and RFC-1918 LAN endpoints (`10.x`, `172.16–31.x`, `192.168.x`) remain reachable so local Ollama / LM Studio / Speaches servers work offline; explicit model weight downloads (`Hugging Face / CDN`) are exempted or require user trigger.
- **`[Confirmed]` How UI Surfaces It**:
  - Dedicated privacy toggle at `Settings > Privacy & Updates > Local-only mode` (macOS/Win/Linux; prompts restart on Mac) and `Settings > App > Local-only mode` (iOS).
  - Visual lock/shield indicator confirms external egress is disabled `[Inferred]`.
- **`[Confirmed]` Cloud Model Behavior Under Local-Only Mode**:
  - Cloud-only STT models (ElevenLabs Scribe, Deepgram, OpenAI, Groq, Managed Cloud) and cloud text post-processors become **disabled / unavailable** with clear explanation banners, forcing selection of downloaded local Whisper/Parakeet models or localhost endpoints.
- **`[Confirmed]` Model Download & Management UX**:
  - Local models show exact download size, download progress, installed status badge, and option to remove cached weights to reclaim disk space (`[Inferred]` cache delete control).
  - Attempting to use a non-downloaded local model guides the user to download weights (which requires network access unless pre-cached).

---

## 5. Summary of Items Marked `[Unknown]`

- Exact internal Apple CoreML / WhisperKit vs whisper.cpp runtime threading constants inside Spokenly's proprietary macOS binary `[Unknown]`.
- Exact default day-count steps in the History retention dropdown beyond `"Do not save"` and `"Keep forever"` `[Unknown]`.
- Exact key-validation regexes or macOS Keychain ACL flags used internally by Spokenly `[Unknown]`.
