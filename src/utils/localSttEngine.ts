import type {
  AppSettings,
  DictationMode,
  LocalSttBackendKind
} from '../types/index.ts';
import {
  applyDeterministicOfflineCleanup,
  applySpokenTriggerAndFormat,
  buildOfflineTranslationFallbackNote,
  loadDictationModes
} from './dictationModes.ts';
import { getUnifiedModelById, UNIFIED_MODELS } from './modelRegistry.ts';
import {
  gatewayFetch,
  isLocalOnlyActive,
  isLoopbackOrPrivateUrl,
  LocalOnlyBlockedError
} from './networkGateway.ts';

export interface LocalSttCapabilities {
  webgpu: boolean;
  wasm: boolean;
  mediaRecorder: boolean;
  audioContext: boolean;
}

export async function detectLocalSttCapabilities(): Promise<LocalSttCapabilities> {
  let webgpu = false;
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<unknown | null> } }).gpu;
      const adapter = await gpu?.requestAdapter?.();
      webgpu = Boolean(adapter);
    } catch {
      webgpu = false;
    }
  }
  const wasm = typeof WebAssembly === 'object';
  const mediaRecorder = typeof MediaRecorder !== 'undefined';
  const audioContext =
    typeof AudioContext !== 'undefined' ||
    typeof (window as Window & { webkitAudioContext?: typeof AudioContext })?.webkitAudioContext !==
      'undefined';
  return { webgpu, wasm, mediaRecorder, audioContext };
}

function encodeWavFromFloat32(pcm: Float32Array, sampleRate: number = 16000): ArrayBuffer {
  const numSamples = pcm.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function decodeAudioBlobToMono16kFloat32(blob: Blob): Promise<{
  pcm: Float32Array;
  durationSec: number;
}> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Web AudioContext is unavailable in this browser.');
  }

  const ctx = new AudioCtx();
  try {
    const rawBuffer = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(rawBuffer.slice(0));
    const targetRate = 16000;
    const durationSec = Math.max(0.25, decoded.duration);
    const frameCount = Math.max(1, Math.ceil(decoded.duration * targetRate));

    if (typeof OfflineAudioContext !== 'undefined') {
      const offline = new OfflineAudioContext(1, frameCount, targetRate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      return {
        pcm: rendered.getChannelData(0).slice(),
        durationSec
      };
    }

    // Fallback manual downmix + linear resample
    const ch0 = decoded.getChannelData(0);
    const out = new Float32Array(frameCount);
    const ratio = ch0.length / frameCount;
    for (let i = 0; i < frameCount; i++) {
      out[i] = ch0[Math.min(ch0.length - 1, Math.floor(i * ratio))];
    }
    return { pcm: out, durationSec };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

let sharedWorker: Worker | null = null;

function getLocalSttWorker(): Worker {
  if (!sharedWorker) {
    sharedWorker = new Worker(new URL('../workers/localStt.worker.ts', import.meta.url), {
      type: 'module'
    });
  }
  return sharedWorker;
}

export async function transcribeAudioWithLocalWorker(params: {
  pcmFloat32: Float32Array;
  hfRepoId: string;
  language?: string;
  onStatus?: (detail: string, backend: 'webgpu' | 'wasm') => void;
  signal?: AbortSignal;
}): Promise<{ text: string; backend: 'webgpu' | 'wasm'; detectedLang: string; durationMs: number }> {
  const worker = getLocalSttWorker();
  const jobId = `stt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        worker.removeEventListener('message', onMessage);
        reject(new Error('Local Whisper WebGPU/WASM worker timed out after 45s.'));
      }
    }, 45_000);

    const cleanup = () => {
      clearTimeout(timeout);
      worker.removeEventListener('message', onMessage);
      params.signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new DOMException('Transcription aborted', 'AbortError'));
      }
    };
    params.signal?.addEventListener('abort', onAbort);

    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data as {
        id?: string;
        type?: 'status' | 'progress' | 'final' | 'error';
        backend?: 'webgpu' | 'wasm';
        detail?: string;
        progress?: number;
        text?: string;
        detectedLang?: string;
        durationMs?: number;
        error?: string;
      };
      if (!msg || msg.id !== jobId) return;

      if (msg.type === 'status' || msg.type === 'progress') {
        params.onStatus?.(
          msg.progress !== undefined ? `${msg.detail || 'Loading'} (${msg.progress}%)` : msg.detail || 'Processing...',
          msg.backend || 'wasm'
        );
      } else if (msg.type === 'final') {
        settled = true;
        cleanup();
        resolve({
          text: msg.text || '',
          backend: msg.backend || 'wasm',
          detectedLang: msg.detectedLang || 'English (US)',
          durationMs: msg.durationMs || 0
        });
      } else if (msg.type === 'error') {
        settled = true;
        cleanup();
        reject(new Error(msg.error || 'Local Whisper worker failed'));
      }
    };

    worker.addEventListener('message', onMessage);
    worker.postMessage({
      id: jobId,
      type: 'transcribe',
      hfRepoId: params.hfRepoId,
      language: params.language,
      pcmData: params.pcmFloat32
    });
  });
}

export interface DictationPipelineExecutionResult {
  rawText: string;
  finalText: string;
  translatedText?: string;
  matchedMode: DictationMode;
  triggeredByVoice: boolean;
  backend: LocalSttBackendKind;
  detectedLang: string;
  durationSec: number;
  sttModelId: string;
  sttModelName: string;
  textModelId: string;
  localOnlyUsed: boolean;
}

export async function executeDictationPipeline(params: {
  pcmFloat32?: Float32Array;
  audioBlob?: Blob;
  audioMimeType?: string;
  textInputOverride?: string;
  settings: AppSettings;
  mode: DictationMode;
  translationEnabled: boolean;
  sourceLang: string;
  targetLang: string;
  durationSec?: number;
  onPartial?: (partialText: string, backend: LocalSttBackendKind, statusDetail?: string) => void;
  signal?: AbortSignal;
}): Promise<DictationPipelineExecutionResult> {
  const localOnly = isLocalOnlyActive(params.settings);
  const sttSpec =
    getUnifiedModelById(params.settings.activeSttModelId || params.mode.sttModelId) ||
    UNIFIED_MODELS[0];

  if (localOnly && sttSpec.runtime === 'cloud' && !params.textInputOverride) {
    throw new LocalOnlyBlockedError(
      sttSpec.id,
      `${sttSpec.name} is blocked by Local-Only Mode. Switch to a cached local Whisper model or Speaches loopback server.`
    );
  }

  let rawText = (params.textInputOverride || '').trim();
  let backend: LocalSttBackendKind = params.textInputOverride ? 'fallback-audio' : 'wasm';
  let detectedLang = params.sourceLang === 'Auto-detect' ? 'English (US)' : params.sourceLang;
  let durationSec = params.durationSec || 2;

  if (!rawText) {
    let pcm = params.pcmFloat32;
    if (!pcm && params.audioBlob && sttSpec.runtime === 'local') {
      params.onPartial?.('', 'wasm', 'Decoding audio buffer to 16kHz PCM...');
      const decoded = await decodeAudioBlobToMono16kFloat32(params.audioBlob);
      pcm = decoded.pcm;
      durationSec = Math.max(durationSec, Math.round(decoded.durationSec));
    }

    if (sttSpec.isLoopbackServer) {
      const base = (params.settings.localServerUrl || 'http://127.0.0.1:8000').replace(/\/$/, '');
      if (localOnly && !isLoopbackOrPrivateUrl(base)) {
        throw new LocalOnlyBlockedError(base, 'Loopback STT URL must target localhost or LAN when Local-Only Mode is active.');
      }
      const wavBlob = pcm
        ? new Blob([encodeWavFromFloat32(pcm, 16000)], { type: 'audio/wav' })
        : params.audioBlob;
      if (!wavBlob) throw new Error('No audio data available for loopback transcription.');
      const form = new FormData();
      form.append('file', wavBlob, 'dictation.wav');
      form.append('model', params.settings.customEndpoint.transcriptionModelId || 'whisper-1');
      params.onPartial?.('', 'loopback', `Streaming audio to loopback server (${base})...`);
      const resp = await gatewayFetch(`${base}/v1/audio/transcriptions`, {
        method: 'POST',
        body: form,
        signal: params.signal,
        localOnlyOverride: localOnly
      });
      if (!resp.ok) {
        throw new Error(`Loopback transcription failed (${resp.status})`);
      }
      const payload = (await resp.json()) as { text?: string; language?: string };
      rawText = (payload.text || '').trim();
      backend = 'loopback';
      if (payload.language) detectedLang = payload.language;
    } else if (sttSpec.runtime === 'local') {
      if (!pcm) {
        throw new Error('No audio samples captured for on-device Whisper transcription.');
      }
      const localResult = await transcribeAudioWithLocalWorker({
        pcmFloat32: pcm,
        hfRepoId: sttSpec.hfRepoId || 'Xenova/whisper-tiny',
        language: params.sourceLang,
        onStatus: (detail, workerBackend) => {
          params.onPartial?.('', workerBackend, detail);
        },
        signal: params.signal
      });
      rawText = localResult.text;
      backend = localResult.backend;
      detectedLang = localResult.detectedLang;
    } else {
      // Cloud Gateway or BYOK transcription via /api/dictation/transcribe
      let audioBase64 = '';
      let mimeType = params.audioMimeType || params.audioBlob?.type || 'audio/wav';
      if (pcm) {
        audioBase64 = arrayBufferToBase64(encodeWavFromFloat32(pcm, 16000));
        mimeType = 'audio/wav';
      } else if (params.audioBlob) {
        audioBase64 = arrayBufferToBase64(await params.audioBlob.arrayBuffer());
      } else {
        throw new Error('No audio recording or file provided.');
      }

      params.onPartial?.('', 'gateway', `Transcribing via ${sttSpec.name}...`);
      const providerKey =
        sttSpec.provider !== 'local' ? params.settings.apiKeys[sttSpec.provider] || '' : '';
      const resp = await gatewayFetch('/api/dictation/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType,
          modelId: sttSpec.id,
          provider: sttSpec.provider,
          apiKey: providerKey,
          customUrl: params.settings.customEndpoint.transcriptionUrl,
          customModelId: params.settings.customEndpoint.transcriptionModelId,
          language: params.sourceLang,
          domainTerms: params.settings.domainTerms
        }),
        signal: params.signal,
        localOnlyOverride: localOnly
      });
      if (!resp.ok) {
        const errBody = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `Cloud transcription failed (${resp.status})`);
      }
      const payload = (await resp.json()) as { text?: string; detectedLang?: string };
      rawText = (payload.text || '').trim();
      backend = 'gateway';
      if (payload.detectedLang) detectedLang = payload.detectedLang;
    }
  }

  if (!rawText) {
    throw new Error('No speech recognized in this recording. Try speaking closer or upload a clearer clip.');
  }

  params.onPartial?.(rawText, backend, 'Applying Dictation Mode cleanup & translation...');

  const allModes = params.settings.dictationModes || loadDictationModes();
  const { matchedMode, cleanedInput, triggeredByVoice } = applySpokenTriggerAndFormat(
    rawText,
    allModes,
    params.mode
  );

  const shouldTranslate = Boolean(params.translationEnabled || matchedMode.translateEnabled);
  const effectiveTargetLang = params.targetLang || matchedMode.targetLang || 'English (US)';
  const effectiveSourceLang = params.sourceLang || matchedMode.sourceLang || 'Auto-detect';

  const preferredTextId =
    params.settings.activeTextModelId || matchedMode.textModelId || 'gemini-4-hydrogen';
  const textSpec =
    getUnifiedModelById(preferredTextId) ||
    UNIFIED_MODELS.find((m) => m.id === 'gemini-4-hydrogen')!;

  let finalText = applyDeterministicOfflineCleanup(
    cleanedInput,
    matchedMode,
    params.settings.autoPunctuation
  );
  let translatedText: string | undefined;

  if (textSpec.isLoopbackServer) {
    // Loopback Ollama/LM Studio runs directly from browser even in Local-Only Mode
    const base = (params.settings.localServerUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
    if (!localOnly || isLoopbackOrPrivateUrl(base)) {
      try {
        const systemPrompt = shouldTranslate
          ? `${matchedMode.instructions} Also translate cleanly from ${effectiveSourceLang} into ${effectiveTargetLang}. Output only the final text.`
          : `${matchedMode.instructions} Output only the cleaned text.`;
        const resp = await gatewayFetch(`${base}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: params.settings.customEndpoint.modelId || 'llama3.2',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: cleanedInput }
            ]
          }),
          signal: params.signal,
          localOnlyOverride: localOnly
        });
        if (resp.ok) {
          const data = (await resp.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const out = data.choices?.[0]?.message?.content?.trim();
          if (out) {
            if (shouldTranslate) translatedText = out;
            else finalText = out;
          }
        }
      } catch {
        // Fallback gracefully to deterministic offline cleanup below
      }
    }
  } else if (!localOnly && textSpec.runtime === 'cloud') {
    const controller = new AbortController();
    const abortTimeout = setTimeout(() => controller.abort(), 7000);
    const onParentAbort = () => controller.abort();
    params.signal?.addEventListener('abort', onParentAbort, { once: true });
    try {
      const providerKey =
        textSpec.provider !== 'local' ? params.settings.apiKeys[textSpec.provider] || '' : '';
      const resp = await gatewayFetch('/api/dictation/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanedInput,
          modeInstructions: matchedMode.instructions,
          translateEnabled: shouldTranslate,
          sourceLang: effectiveSourceLang,
          targetLang: effectiveTargetLang,
          modelId: textSpec.id,
          provider: textSpec.provider,
          apiKey: providerKey,
          customUrl: params.settings.customEndpoint.baseUrl,
          customModelId: params.settings.customEndpoint.modelId,
          domainTerms: params.settings.domainTerms
        }),
        signal: controller.signal,
        localOnlyOverride: false
      });
      if (resp.ok) {
        const payload = (await resp.json()) as {
          cleanedText?: string;
          translatedText?: string;
        };
        if (payload.cleanedText) finalText = payload.cleanedText.trim();
        if (shouldTranslate && payload.translatedText) {
          translatedText = payload.translatedText.trim();
        }
      }
    } catch {
      // Keep deterministic cleanup when cloud route is unreachable or times out
    } finally {
      clearTimeout(abortTimeout);
      params.signal?.removeEventListener('abort', onParentAbort);
    }
  }

  if (shouldTranslate && !translatedText) {
    translatedText = buildOfflineTranslationFallbackNote({
      cleanedText: finalText,
      sourceLang: detectedLang || effectiveSourceLang,
      targetLang: effectiveTargetLang,
      localOnlyBlocked: localOnly
    });
  }

  return {
    rawText,
    finalText,
    translatedText,
    matchedMode,
    triggeredByVoice,
    backend,
    detectedLang,
    durationSec,
    sttModelId: sttSpec.id,
    sttModelName: sttSpec.name,
    textModelId: localOnly && textSpec.runtime === 'cloud' ? 'llama-3.2-3b-local' : textSpec.id,
    localOnlyUsed: localOnly
  };
}
