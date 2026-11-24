import { env, pipeline } from '@huggingface/transformers';

// Configure browser-first WASM/WebGPU weight caching with zero local filesystem reads
env.allowLocalModels = false;
env.useBrowserCache = true;

interface WorkerIncomingMessage {
  id: string;
  type: 'preload' | 'transcribe';
  hfRepoId: string;
  language?: string;
  pcmData?: Float32Array;
}

type PipelineFn = (
  audio: Float32Array,
  options?: Record<string, unknown>
) => Promise<{ text?: string; chunks?: Array<{ text: string; timestamp?: [number, number] }> }>;

const pipelineCache = new Map<string, { fn: PipelineFn; backend: 'webgpu' | 'wasm' }>();

function mapLanguageToWhisper(lang?: string): string | undefined {
  if (!lang || lang === 'Auto-detect') return undefined;
  const normalized = lang.toLowerCase();
  if (normalized.startsWith('english')) return 'english';
  if (normalized.startsWith('spanish')) return 'spanish';
  if (normalized.startsWith('french')) return 'french';
  if (normalized.startsWith('german')) return 'german';
  if (normalized.startsWith('japanese')) return 'japanese';
  if (normalized.startsWith('hindi')) return 'hindi';
  if (normalized.startsWith('portuguese')) return 'portuguese';
  if (normalized.startsWith('italian')) return 'italian';
  if (normalized.startsWith('chinese')) return 'chinese';
  if (normalized.startsWith('korean')) return 'korean';
  if (normalized.startsWith('arabic')) return 'arabic';
  return undefined;
}

async function detectPreferredBackend(): Promise<'webgpu' | 'wasm'> {
  try {
    const nav = (self as unknown as {
      navigator?: { gpu?: { requestAdapter?: () => Promise<unknown | null> } };
    }).navigator;
    if (nav?.gpu?.requestAdapter) {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch {
    // WebGPU unavailable in this browser/worker context
  }
  return 'wasm';
}

async function getOrCreatePipeline(
  id: string,
  hfRepoId: string
): Promise<{ fn: PipelineFn; backend: 'webgpu' | 'wasm' }> {
  const existing = pipelineCache.get(hfRepoId);
  if (existing) return existing;

  const preferred = await detectPreferredBackend();
  const attempts: Array<{ backend: 'webgpu' | 'wasm'; opts: Record<string, unknown> }> =
    preferred === 'webgpu'
      ? [
          {
            backend: 'webgpu',
            opts: {
              device: 'webgpu',
              dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }
            }
          },
          {
            backend: 'wasm',
            opts: {
              device: 'wasm',
              dtype: 'q8'
            }
          }
        ]
      : [
          {
            backend: 'wasm',
            opts: {
              device: 'wasm',
              dtype: 'q8'
            }
          }
        ];

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      self.postMessage({
        id,
        type: 'status',
        backend: attempt.backend,
        detail: `Loading ${hfRepoId} (${attempt.backend.toUpperCase()})...`
      });

      const created = (await pipeline('automatic-speech-recognition', hfRepoId, {
        ...attempt.opts,
        progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
          if (typeof info.progress === 'number') {
            self.postMessage({
              id,
              type: 'progress',
              backend: attempt.backend,
              progress: Math.round(info.progress),
              detail: info.file ? `Loading ${info.file}` : 'Downloading weights'
            });
          }
        }
      })) as unknown as PipelineFn;

      const entry = { fn: created, backend: attempt.backend };
      pipelineCache.set(hfRepoId, entry);
      return entry;
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Failed to initialize Whisper pipeline');
}

self.onmessage = async (event: MessageEvent<WorkerIncomingMessage>) => {
  const msg = event.data;
  if (!msg || !msg.id) return;

  try {
    const repo = msg.hfRepoId || 'Xenova/whisper-tiny';
    const { fn, backend } = await getOrCreatePipeline(msg.id, repo);

    if (msg.type === 'preload') {
      self.postMessage({
        id: msg.id,
        type: 'final',
        backend,
        text: '',
        detectedLang: msg.language || 'Auto-detect',
        durationMs: 0
      });
      return;
    }

    if (!msg.pcmData || msg.pcmData.length === 0) {
      throw new Error('No 16kHz PCM audio frames provided.');
    }

    const startedAt = performance.now();
    self.postMessage({
      id: msg.id,
      type: 'status',
      backend,
      detail: `Transcribing on-device (${backend.toUpperCase()})...`
    });

    const whisperLang = mapLanguageToWhisper(msg.language);
    const result = await fn(msg.pcmData, {
      chunk_length_s: 25,
      stride_length_s: 4,
      ...(whisperLang ? { language: whisperLang, task: 'transcribe' } : { task: 'transcribe' })
    });

    const finalText = (result?.text || '').trim();
    self.postMessage({
      id: msg.id,
      type: 'final',
      backend,
      text: finalText,
      detectedLang: msg.language && msg.language !== 'Auto-detect' ? msg.language : 'English (US)',
      durationMs: Math.max(1, Math.round(performance.now() - startedAt))
    });
  } catch (err) {
    self.postMessage({
      id: msg.id,
      type: 'error',
      error: err instanceof Error ? err.message : 'Local Whisper worker execution failed'
    });
  }
};
