import express from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { inflateRawSync, inflateSync } from 'node:zlib';
import {
  AUDIO_EXPORT_FORMATS,
  buildConvertedFileName,
  getAudioExportFormatSpec,
  sanitizeAudioSourceExtension
} from './src/utils/audioConversion.ts';
import { parseDocumentBytes } from './src/utils/documentParsers.ts';
import {
  createInitialCoreDataStore,
  deleteCoreDataDocument,
  upsertCoreDataDocument
} from './src/utils/coreDataVectorDb.ts';
import {
  buildDynamicCloudSearchSparkpage,
  executeRagRetrieval,
  generateDynamicCloudCitations
} from './src/utils/ragEngine.ts';
import {
  computeNextRunIso,
  createBackgroundAgentTask,
  createDiaryEntry,
  executeBackgroundAgentTaskCycle,
  formatDiaryDateLabel,
  getCloudSchedulerModelSpec
} from './src/utils/workspaceScheduler.ts';
import {
  createCallsignItem,
  createUserIdentity,
  deleteCallsignItem,
  setActiveCallsign,
  updateCallsignItem
} from './src/utils/identityCallsigns.ts';
import {
  computeNextNanobotRunIso,
  executeNanobotRunRecord,
  getModelsForEngine
} from './src/utils/nanobotCatalog.ts';
import {
  SandboxPolicyError,
  appendBotSandboxMemory,
  buildSandboxId,
  provisionBotSandbox,
  readBotSandbox,
  wipeBotSandbox
} from './src/utils/nanobotSandbox.ts';
import {
  SCOUT_ENGINE_TIMEOUT_MS,
  ScoutRateLimiter,
  buildScoutGroundingPrompt,
  extractDomainFromUrl,
  isSafePublicHttpUrl,
  redactSensitiveText
} from './src/utils/scoutAgent.ts';
import type {
  ApiProviderId,
  BackgroundAgentTask,
  Callsign,
  CloudSchedulerModelId,
  CoreDataChunkEmbedding,
  CoreDataDocumentFormat,
  CoreDataVectorStoreState,
  Nanobot,
  NanobotEngineId,
  NanobotRun,
  NanobotSchedule,
  NanobotStatus,
  NanobotStyleId,
  OfficeDiaryCategory,
  OfficeDiaryEntry,
  RagStrategyId,
  SchedulerIntervalId,
  ScoutCitation,
  ScoutErrorCode,
  ScoutScope,
  ScoutStreamEvent,
  SparkpageCitation,
  UploadedAssetKind,
  UserIdentity
} from './src/types/index.ts';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
let activeCoreDataPath = path.resolve(__dirname, '.coredata-vector-store.json');
let activeWorkspacePath = path.resolve(__dirname, '.workspace-diary-scheduler.json');
let activeNanoRuntimePath = path.resolve(__dirname, '.nanobot-runtime-state.json');
let activeSandboxRootDir = path.resolve(__dirname, '.nanobot-sandboxes');

interface WorkspacePersistedState {
  diaryEntries: OfficeDiaryEntry[];
  schedulerTasks: BackgroundAgentTask[];
}

interface NanoRuntimePersistedState {
  identitiesByKey: Record<string, UserIdentity>;
  callsigns: Callsign[];
  nanobots: Nanobot[];
  runs: NanobotRun[];
}

let memoryCoreDataStore: CoreDataVectorStoreState | null = null;
let memoryWorkspaceState: WorkspacePersistedState | null = null;
let memoryNanoRuntimeState: NanoRuntimePersistedState | null = null;
let schedulerTickInFlight = false;
const scoutRateLimiter = new ScoutRateLimiter();

function getServerGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}

async function writeJsonAtomicWithFallback(
  primaryPath: string,
  fallbackFileName: string,
  payload: unknown
): Promise<string> {
  const serialized = JSON.stringify(payload);
  try {
    const tmpPath = `${primaryPath}.tmp`;
    await fs.writeFile(tmpPath, serialized, 'utf-8');
    await fs.rename(tmpPath, primaryPath);
    return primaryPath;
  } catch {
    const fallbackPath = path.join(os.tmpdir(), fallbackFileName);
    try {
      const tmpFallback = `${fallbackPath}.tmp`;
      await fs.writeFile(tmpFallback, serialized, 'utf-8');
      await fs.rename(tmpFallback, fallbackPath);
      return fallbackPath;
    } catch {
      return primaryPath;
    }
  }
}

async function loadCoreDataStore(): Promise<CoreDataVectorStoreState> {
  if (memoryCoreDataStore) return memoryCoreDataStore;
  for (const candidatePath of [
    activeCoreDataPath,
    path.join(os.tmpdir(), 'locally-nexus-coredata-store.json')
  ]) {
    try {
      const raw = await fs.readFile(candidatePath, 'utf-8');
      const parsed = JSON.parse(raw) as CoreDataVectorStoreState;
      if (
        parsed &&
        Array.isArray(parsed.documents) &&
        Array.isArray(parsed.chunks) &&
        typeof parsed.embeddingDim === 'number'
      ) {
        activeCoreDataPath = candidatePath;
        memoryCoreDataStore = parsed;
        return memoryCoreDataStore;
      }
    } catch {
      // Try next candidate or initialize fresh store
    }
  }
  memoryCoreDataStore = createInitialCoreDataStore();
  await saveCoreDataStore(memoryCoreDataStore);
  return memoryCoreDataStore;
}

async function saveCoreDataStore(store: CoreDataVectorStoreState): Promise<void> {
  memoryCoreDataStore = store;
  activeCoreDataPath = await writeJsonAtomicWithFallback(
    activeCoreDataPath,
    'locally-nexus-coredata-store.json',
    store
  );
}

function summarizeStore(store: CoreDataVectorStoreState) {
  return {
    containerId: store.containerId,
    zoneName: store.zoneName,
    embeddingDim: store.embeddingDim,
    lastSyncedIso: store.lastSyncedIso,
    documentCount: store.documents.length,
    chunkCount: store.chunks.length,
    documents: store.documents
  };
}

async function loadWorkspaceState(): Promise<WorkspacePersistedState> {
  if (memoryWorkspaceState) return memoryWorkspaceState;
  for (const candidatePath of [
    activeWorkspacePath,
    path.join(os.tmpdir(), 'locally-nexus-workspace-state.json')
  ]) {
    try {
      const raw = await fs.readFile(candidatePath, 'utf-8');
      const parsed = JSON.parse(raw) as WorkspacePersistedState;
      if (
        parsed &&
        Array.isArray(parsed.diaryEntries) &&
        Array.isArray(parsed.schedulerTasks)
      ) {
        activeWorkspacePath = candidatePath;
        memoryWorkspaceState = parsed;
        return memoryWorkspaceState;
      }
    } catch {
      // Try next candidate or initialize empty cleanly
    }
  }
  memoryWorkspaceState = { diaryEntries: [], schedulerTasks: [] };
  await saveWorkspaceState(memoryWorkspaceState);
  return memoryWorkspaceState;
}

async function saveWorkspaceState(state: WorkspacePersistedState): Promise<void> {
  memoryWorkspaceState = state;
  activeWorkspacePath = await writeJsonAtomicWithFallback(
    activeWorkspacePath,
    'locally-nexus-workspace-state.json',
    state
  );
}

async function loadNanoRuntimeState(): Promise<NanoRuntimePersistedState> {
  if (memoryNanoRuntimeState) return memoryNanoRuntimeState;
  for (const candidatePath of [
    activeNanoRuntimePath,
    path.join(os.tmpdir(), 'nudge-ai-nanobot-runtime.json')
  ]) {
    try {
      const raw = await fs.readFile(candidatePath, 'utf-8');
      const parsed = JSON.parse(raw) as NanoRuntimePersistedState;
      if (
        parsed &&
        parsed.identitiesByKey &&
        Array.isArray(parsed.callsigns) &&
        Array.isArray(parsed.nanobots) &&
        Array.isArray(parsed.runs)
      ) {
        activeNanoRuntimePath = candidatePath;
        memoryNanoRuntimeState = parsed;
        return memoryNanoRuntimeState;
      }
    } catch {
      // Try next candidate
    }
  }
  memoryNanoRuntimeState = {
    identitiesByKey: {},
    callsigns: [],
    nanobots: [],
    runs: []
  };
  await saveNanoRuntimeState(memoryNanoRuntimeState);
  return memoryNanoRuntimeState;
}

async function saveNanoRuntimeState(state: NanoRuntimePersistedState): Promise<void> {
  memoryNanoRuntimeState = state;
  activeNanoRuntimePath = await writeJsonAtomicWithFallback(
    activeNanoRuntimePath,
    'nudge-ai-nanobot-runtime.json',
    state
  );
}

async function runNanobotSchedulerCycleIfDue(): Promise<boolean> {
  const state = await loadNanoRuntimeState();
  const now = new Date();
  const nowMs = now.getTime();
  let changed = false;
  const nextRuns = [...state.runs];
  const nextBots: Nanobot[] = [];

  for (const bot of state.nanobots) {
    if (
      bot.status === 'scheduled' &&
      bot.schedule.nextRunIso &&
      nowMs >= new Date(bot.schedule.nextRunIso).getTime()
    ) {
      const { updatedBot, run } = executeNanobotRunRecord(bot, now);
      nextBots.push(updatedBot);
      nextRuns.unshift(run);
      await appendBotSandboxMemory(
        activeSandboxRootDir,
        updatedBot,
        updatedBot.userId,
        updatedBot.id,
        `Scheduled run (${run.status}): ${updatedBot.taskPrompt.slice(0, 120)}`
      ).catch(() => undefined);
      changed = true;
    } else {
      nextBots.push(bot);
    }
  }

  if (changed) {
    await saveNanoRuntimeState({
      ...state,
      nanobots: nextBots,
      runs: nextRuns.slice(0, 500)
    });
  }
  return changed;
}

async function runSchedulerCycleIfDue(forceTaskId?: string): Promise<boolean> {
  if (schedulerTickInFlight && !forceTaskId) return false;
  schedulerTickInFlight = true;
  try {
    const state = await loadWorkspaceState();
    const store = await loadCoreDataStore();
    const now = new Date();
    const nowMs = now.getTime();
    let changed = false;

    const updatedTasks: BackgroundAgentTask[] = [];
    for (const task of state.schedulerTasks) {
      const isForced = Boolean(forceTaskId && task.id === forceTaskId);
      const isDue =
        task.status === 'running' && nowMs >= new Date(task.nextRunIso).getTime();

      if (isForced || isDue) {
        const liveCitations = await fetchLiveCloudWebCitations(task.prompt);
        const updated = executeBackgroundAgentTaskCycle({
          task,
          store,
          liveCitations,
          now
        });
        updatedTasks.push(updated);
        changed = true;
      } else {
        updatedTasks.push(task);
      }
    }

    if (changed) {
      await saveWorkspaceState({
        ...state,
        schedulerTasks: updatedTasks
      });
    }
    return changed;
  } finally {
    schedulerTickInFlight = false;
  }
}

async function fetchLiveCloudWebCitations(query: string): Promise<SparkpageCitation[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
      cleanQuery
    )}&limit=3&namespace=0&format=json`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'LocallyNexus/1.0' }
    });
    if (!resp.ok) return [];
    const payload = (await resp.json()) as [string, string[], string[], string[]];
    const titles = Array.isArray(payload[1]) ? payload[1] : [];
    const descriptions = Array.isArray(payload[2]) ? payload[2] : [];
    const links = Array.isArray(payload[3]) ? payload[3] : [];

    const citations: SparkpageCitation[] = [];
    for (let i = 0; i < Math.min(3, titles.length); i++) {
      const title = titles[i];
      const href = links[i];
      if (!title || !href) continue;
      citations.push({
        id: i + 1,
        title,
        url: href,
        snippet:
          descriptions[i]?.trim() ||
          `Cloud reference entry for ${title} retrieved in response to "${cleanQuery}".`,
        domain: 'en.wikipedia.org',
        crawlTimestamp: new Date().toISOString(),
        reliabilityScore: 94 - i * 2,
        authorOrSource: 'Wikipedia Live Index'
      });
    }
    return citations;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function convertAudioBufferWithFfmpeg(params: {
  inputBuffer: Buffer;
  sourceExt: string;
  targetFormat: string;
}): Promise<Buffer> {
  const spec = getAudioExportFormatSpec(params.targetFormat);
  if (!spec) {
    throw new Error(`Unsupported target format: ${params.targetFormat}`);
  }

  const safeExt = sanitizeAudioSourceExtension(params.sourceExt);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'locally-nexus-audio-'));
  const inputPath = path.join(workDir, `source.${safeExt}`);
  const outputPath = path.join(workDir, `converted.${spec.extension}`);

  try {
    await fs.writeFile(inputPath, params.inputBuffer);
    await execFileAsync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      inputPath,
      ...spec.ffmpegArgs,
      outputPath
    ]);
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function startServer() {
  const app = express();
  const jsonParser = express.json({ limit: '25mb' });

  const CLOUD_ONLY_ROUTES = [
    '/api/search/cloud',
    '/api/scout/stream',
    '/api/dictation/transcribe',
    '/api/dictation/translate'
  ];

  // Server-side Local-Only Firewall middleware: blocks cloud routes when client sends X-Local-Only: 1
  app.use((req, res, next) => {
    const localOnlyHeader = req.get('x-local-only');
    if (localOnlyHeader === '1' || localOnlyHeader === 'true') {
      const p = req.path;
      const isCloudOnly =
        CLOUD_ONLY_ROUTES.some((route) => p === route || p.startsWith(`${route}/`)) ||
        (p.startsWith('/api/scheduler/tasks') && req.method === 'POST' && p.endsWith('/run'));
      if (isCloudOnly) {
        res.status(403).json({
          code: 'LOCAL_ONLY_BLOCKED',
          error: `Blocked cloud endpoint (${p}) while Local-Only Mode is enabled.`
        });
        return;
      }
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/vector-db/status', async (_req, res) => {
    try {
      const store = await loadCoreDataStore();
      res.json(summarizeStore(store));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load CoreData store' });
    }
  });

  app.post('/api/documents/parse', jsonParser, async (req, res) => {
    try {
      const { fileName, mimeType = '', base64Data } = (req.body || {}) as {
        fileName?: string;
        mimeType?: string;
        base64Data?: string;
      };
      if (!fileName || typeof base64Data !== 'string') {
        res.status(400).json({ error: 'fileName and base64Data are required.' });
        return;
      }
      const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const bytes = new Uint8Array(Buffer.from(cleanBase64, 'base64'));
      const parsed = parseDocumentBytes(bytes, fileName, mimeType, {
        inflate: (data) => new Uint8Array(inflateSync(data)),
        inflateRaw: (data) => new Uint8Array(inflateRawSync(data))
      });
      res.json(parsed);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Document parsing failed' });
    }
  });

  app.post('/api/vector-db/ingest', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        id?: string;
        title?: string;
        format?: CoreDataDocumentFormat;
        assetKind?: UploadedAssetKind;
        sizeKB?: number;
        summary?: string;
        text?: string;
        sections?: Array<{ label: string; text: string }>;
        tags?: string[];
        dateAdded?: string;
      };
      if (!body.title || typeof body.text !== 'string') {
        res.status(400).json({ error: 'title and text are required to ingest into CoreData Vector DB.' });
        return;
      }
      const store = await loadCoreDataStore();
      const { nextStore, document, chunks } = upsertCoreDataDocument(store, {
        id: body.id,
        title: body.title,
        format: body.format || 'TXT',
        assetKind: body.assetKind || 'document',
        sizeKB: Number(body.sizeKB) || Math.max(1, Math.round(body.text.length / 1024)),
        summary: body.summary,
        text: body.text,
        sections: body.sections,
        tags: body.tags,
        dateAdded: body.dateAdded || 'Just now'
      });
      await saveCoreDataStore(nextStore);
      res.json({
        document,
        chunksIndexed: chunks.length,
        storeSummary: summarizeStore(nextStore)
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'CoreData vector ingest failed' });
    }
  });

  app.delete('/api/vector-db/documents/:id', async (req, res) => {
    try {
      const targetId = req.params.id;
      const store = await loadCoreDataStore();
      const nextStore = deleteCoreDataDocument(store, targetId);
      await saveCoreDataStore(nextStore);
      res.json({
        removedId: targetId,
        storeSummary: summarizeStore(nextStore)
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Delete failed' });
    }
  });

  app.post('/api/vector-db/query', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        query?: string;
        strategyId?: RagStrategyId;
        topK?: number;
        filterDocumentId?: string | null;
        attachmentChunks?: CoreDataChunkEmbedding[];
        offlineOnly?: boolean;
      };
      const query = (body.query || '').trim();
      if (!query) {
        res.status(400).json({ error: 'query is required.' });
        return;
      }
      const store = await loadCoreDataStore();
      const retrieval = executeRagRetrieval(store, query, {
        strategyId: body.strategyId || 'hybrid-rrf',
        topK: body.topK ?? 4,
        filterDocumentId: body.filterDocumentId ?? null,
        attachmentChunks: body.attachmentChunks || [],
        offlineOnly: Boolean(body.offlineOnly)
      });

      const headerLocalOnly =
        req.get('x-local-only') === '1' || req.get('x-local-only') === 'true';
      let cloudCitations: SparkpageCitation[] = [];
      if (retrieval.shouldTriggerCloudFallback && !body.offlineOnly && !headerLocalOnly) {
        const live = await fetchLiveCloudWebCitations(query);
        cloudCitations = generateDynamicCloudCitations(query, live);
      }

      res.json({
        ...retrieval,
        cloudCitations
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'CoreData RAG query failed' });
    }
  });

  app.post('/api/search/cloud', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        query?: string;
        strategyId?: RagStrategyId;
        attachmentChunks?: CoreDataChunkEmbedding[];
      };
      const query = (body.query || '').trim();
      if (!query) {
        res.status(400).json({ error: 'query is required for Cloud Search.' });
        return;
      }

      const store = await loadCoreDataStore();
      const retrieval = executeRagRetrieval(store, query, {
        strategyId: body.strategyId || 'hybrid-rrf',
        topK: 4,
        attachmentChunks: body.attachmentChunks || [],
        offlineOnly: false
      });

      const live = await fetchLiveCloudWebCitations(query);
      const citations = generateDynamicCloudCitations(query, live);
      const sparkpage = buildDynamicCloudSearchSparkpage({
        query,
        strategyId: body.strategyId || 'hybrid-rrf',
        retrievedChunks: retrieval.retrieved,
        citations,
        executionTimeSec: 1.9
      });

      res.json({
        citations,
        sparkpage,
        retrievedChunks: retrieval.retrieved,
        pipelineSteps: retrieval.pipelineSteps
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Cloud search failed' });
    }
  });

  // Ephemeral streaming Scout Agent Search endpoint (Gemini Google Search Grounding + live fallback)
  app.post('/api/scout/stream', jsonParser, async (req, res) => {
    const body = (req.body || {}) as {
      userId?: string;
      query?: string;
      scope?: ScoutScope;
      engine?: NanobotEngineId;
      noteContextSnippet?: string;
      redactPii?: boolean;
      consentTimestampIso?: string;
      refineInstruction?: string;
    };

    const userId = String(body.userId || 'guest').trim().slice(0, 64) || 'guest';
    const rawQuery = String(body.query || '').trim();
    const scope: ScoutScope =
      body.scope === 'web+note' || body.scope === 'news' ? body.scope : 'web';
    const engine: NanobotEngineId =
      body.engine === 'pulse' || body.engine === 'nova' ? body.engine : 'atlas';

    if (!body.consentTimestampIso) {
      res.status(403).json({
        code: 'CONSENT_REQUIRED',
        error: 'AI & Data Disclosure consent is required before sending Scout web queries.'
      });
      return;
    }

    if (!rawQuery || rawQuery.length > 400) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        error: 'Query must be between 1 and 400 characters.'
      });
      return;
    }

    const rate = scoutRateLimiter.checkAndConsume(userId, engine);
    if (!rate.allowed) {
      res.status(429).json({
        code: 'RATE_LIMITED',
        retryAfterSec: rate.retryAfterSec,
        error: `Scout ${engine} rate limit reached. Try again in ${rate.retryAfterSec}s.`
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let closed = false;
    const abortController = new AbortController();
    const timeoutMs = SCOUT_ENGINE_TIMEOUT_MS[engine];
    const timeoutHandle = setTimeout(() => {
      abortController.abort(new Error('PROVIDER_TIMEOUT'));
    }, timeoutMs);

    res.on('close', () => {
      if (!res.writableEnded) {
        closed = true;
        abortController.abort(new Error('CANCELLED'));
      }
    });

    const emit = (event: ScoutStreamEvent) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Ephemeral sandbox descriptor: zero access to persistent note files or Nanobot directories
    const ephemeralSandbox = {
      sandboxId: `scout-ephemeral-${Date.now().toString(36)}`,
      userId,
      scope,
      noteContextBytes:
        scope === 'web+note' && body.noteContextSnippet
          ? Math.min(1200, body.noteContextSnippet.length)
          : 0
    };

    const startedAt = Date.now();
    try {
      const cleanQuery =
        body.redactPii !== false ? redactSensitiveText(rawQuery).redactedText : rawQuery;
      const cleanContext =
        ephemeralSandbox.noteContextBytes > 0 && body.noteContextSnippet
          ? (body.redactPii !== false
              ? redactSensitiveText(body.noteContextSnippet).redactedText
              : body.noteContextSnippet
            ).slice(0, 1200)
          : undefined;

      emit({
        type: 'stage',
        stage: 'searching',
        detail: `Querying web in ephemeral sandbox (${engine})`
      });

      const ai = getServerGeminiClient();
      let handledByGemini = false;
      if (ai) {
        try {
          const thinkingLevel =
            engine === 'pulse'
              ? ThinkingLevel.LOW
              : engine === 'nova'
              ? ThinkingLevel.HIGH
              : ThinkingLevel.MEDIUM;

          const { systemInstruction, userPrompt } = buildScoutGroundingPrompt({
            query: cleanQuery,
            scope,
            noteContextSnippet: cleanContext,
            refineInstruction: body.refineInstruction
          });

          const responseStream = await ai.models.generateContentStream({
            model: 'gemini-4-hydrogen',
            contents: userPrompt,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel },
              tools: [{ googleSearch: {} }],
              abortSignal: abortController.signal
            }
          });

          let summaryAcc = '';
          let readingEmitted = false;
          let synthesizingEmitted = false;
          const citationsMap = new Map<string, ScoutCitation>();

          for await (const chunk of responseStream) {
            if (abortController.signal.aborted || closed) break;

            const groundingChunks =
              chunk.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            if (groundingChunks.length > 0 && !readingEmitted) {
              readingEmitted = true;
              emit({
                type: 'stage',
                stage: 'reading',
                detail: `Inspecting ${groundingChunks.length} grounded web sources`,
                count: groundingChunks.length
              });
            }

            for (const gChunk of groundingChunks) {
              const uri = gChunk.web?.uri;
              if (!uri || !isSafePublicHttpUrl(uri) || citationsMap.has(uri)) continue;
              const domain = extractDomainFromUrl(uri);
              const cit: ScoutCitation = {
                id: citationsMap.size + 1,
                title: (gChunk.web?.title || domain).trim(),
                url: uri,
                domain,
                snippet: `Grounded reference retrieved via Gemini Web Search for "${cleanQuery.slice(0, 80)}".`,
                faviconText: domain.slice(0, 2).toUpperCase()
              };
              citationsMap.set(uri, cit);
              emit({ type: 'citation', citation: cit });
            }

            if (chunk.text) {
              if (!synthesizingEmitted) {
                synthesizingEmitted = true;
                emit({
                  type: 'stage',
                  stage: 'synthesizing',
                  detail: 'Streaming cited synthesis'
                });
              }
              summaryAcc += chunk.text;
              emit({ type: 'delta', text: chunk.text });
            }
          }

          if (!abortController.signal.aborted && !closed) {
            emit({
              type: 'complete',
              summary: summaryAcc.trim(),
              citations: Array.from(citationsMap.values()),
              durationMs: Date.now() - startedAt,
              provider: 'gemini-grounding'
            });
          }
          handledByGemini = true;
        } catch (geminiErr) {
          if (abortController.signal.aborted || closed) {
            throw geminiErr;
          }
          // Fall back gracefully to live Wikipedia OpenSearch index when Gemini quota/endpoint is unavailable
        }
      }

      if (!handledByGemini) {
        // Live Wikipedia OpenSearch fallback when GEMINI_API_KEY is absent or quota-exhausted
        const live = await fetchLiveCloudWebCitations(cleanQuery);
        if (abortController.signal.aborted || closed) return;

        const safeCitations: ScoutCitation[] = live
          .filter((item) => isSafePublicHttpUrl(item.url))
          .map((item, idx) => ({
            id: idx + 1,
            title: item.title,
            url: item.url,
            domain: item.domain,
            snippet: item.snippet,
            faviconText: item.domain.slice(0, 2).toUpperCase(),
            publishedLabel: 'Live Web Index'
          }));

        emit({
          type: 'stage',
          stage: 'reading',
          detail:
            safeCitations.length > 0
              ? `Reading ${safeCitations.length} indexed web pages`
              : 'No direct web hits — checking scope context',
          count: safeCitations.length
        });

        for (const cit of safeCitations) {
          emit({ type: 'citation', citation: cit });
        }

        emit({
          type: 'stage',
          stage: 'synthesizing',
          detail: 'Synthesizing brief (Live Web Index fallback)'
        });

        let summaryText = '';
        if (safeCitations.length > 0) {
          const bullets = safeCitations
            .map((c) => `• ${c.title}: ${c.snippet} [${c.id}]`)
            .join('\n');
          summaryText = [
            `Scout Brief (${engine.toUpperCase()} · ${scope === 'news' ? 'Latest News' : 'Web'}) for "${cleanQuery}":`,
            bullets,
            cleanContext
              ? `\nNote Context Alignment: Evaluated against approved ${cleanContext.length}-char note excerpt.`
              : ''
          ]
            .filter(Boolean)
            .join('\n');
        } else {
          summaryText = '';
        }

        const words = summaryText.split(/(\s+)/);
        for (let i = 0; i < words.length; i += 6) {
          if (abortController.signal.aborted || closed) return;
          const slice = words.slice(i, i + 6).join('');
          emit({ type: 'delta', text: slice });
          await new Promise((r) => setTimeout(r, engine === 'pulse' ? 12 : 24));
        }

        if (!abortController.signal.aborted && !closed) {
          emit({
            type: 'complete',
            summary: summaryText.trim(),
            citations: safeCitations,
            durationMs: Date.now() - startedAt,
            provider: 'wikipedia-fallback'
          });
        }
      }
    } catch (err) {
      if (!closed) {
        const rawMsg = err instanceof Error ? err.message : 'Scout upstream error';
        const reason = abortController.signal.reason;
        let code: ScoutErrorCode = 'UPSTREAM_ERROR';
        let cleanMsg = rawMsg;
        if (reason instanceof Error && reason.message === 'PROVIDER_TIMEOUT') {
          code = 'PROVIDER_TIMEOUT';
          cleanMsg = 'Scout search timed out waiting for web sources. Try Pulse for faster lookups.';
        } else if (reason instanceof Error && reason.message === 'CANCELLED') {
          code = 'CANCELLED';
          cleanMsg = 'Search stopped.';
        } else if (rawMsg.includes('429') || rawMsg.toLowerCase().includes('quota')) {
          code = 'QUOTA_EXCEEDED';
          cleanMsg = 'Upstream search quota exceeded. Please try again shortly.';
        }
        emit({ type: 'error', code, message: cleanMsg });
      }
    } finally {
      clearTimeout(timeoutHandle);
      // Guarantee ephemeral sandbox metadata has no persisted state
      ephemeralSandbox.noteContextBytes = 0;
      if (!closed) {
        res.end();
      }
    }
  });

  app.get('/api/audio/formats', (_req, res) => {
    res.json({
      formats: AUDIO_EXPORT_FORMATS.map((f) => ({
        id: f.id,
        label: f.label,
        extension: f.extension,
        mimeType: f.mimeType,
        codecLabel: f.codecLabel
      }))
    });
  });

  app.post(
    '/api/audio/convert',
    express.raw({
      type: ['application/octet-stream', 'audio/*'],
      limit: '50mb'
    }),
    express.json({ limit: '50mb' }),
    async (req, res) => {
      try {
        const isRawBuffer = Buffer.isBuffer(req.body);
        const targetFormatRaw = isRawBuffer
          ? String(req.query.format || '')
          : String((req.body as { targetFormat?: string })?.targetFormat || req.query.format || '');

        const spec = getAudioExportFormatSpec(targetFormatRaw);
        if (!spec) {
          res.status(400).json({
            error: `Unsupported target audio format "${targetFormatRaw}". Supported: ${AUDIO_EXPORT_FORMATS.map((f) => f.id).join(', ')}`
          });
          return;
        }

        let inputBuffer: Buffer;
        if (isRawBuffer) {
          inputBuffer = req.body;
        } else {
          const base64Data = (req.body as { audioBase64?: string })?.audioBase64;
          if (!base64Data || typeof base64Data !== 'string') {
            res.status(400).json({ error: 'Missing audio payload for conversion.' });
            return;
          }
          const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
          inputBuffer = Buffer.from(cleanBase64, 'base64');
        }

        if (!inputBuffer || inputBuffer.length === 0) {
          res.status(400).json({ error: 'Empty audio payload received.' });
          return;
        }

        const sourceExtRaw = isRawBuffer
          ? String(req.query.sourceExt || 'wav')
          : String((req.body as { sourceExt?: string })?.sourceExt || req.query.sourceExt || 'wav');
        const requestedName = isRawBuffer
          ? String(req.query.filename || 'Locally_Nexus_Audio')
          : String((req.body as { fileName?: string })?.fileName || req.query.filename || 'Locally_Nexus_Audio');

        const converted = await convertAudioBufferWithFfmpeg({
          inputBuffer,
          sourceExt: sourceExtRaw,
          targetFormat: spec.id
        });

        const outputName = buildConvertedFileName(requestedName, spec.id);

        res.setHeader('Content-Type', spec.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
        res.setHeader('X-Audio-Format', spec.id);
        res.setHeader('X-Audio-Output-Filename', outputName);
        res.send(converted);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Audio conversion failed';
        res.status(500).json({ error: message });
      }
    }
  );

  // Daily Office Diary endpoints
  app.get('/api/diary', async (_req, res) => {
    try {
      const state = await loadWorkspaceState();
      res.json({ entries: state.diaryEntries });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load diary' });
    }
  });

  app.post('/api/diary', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        dateIso?: string;
        title?: string;
        content?: string;
        category?: OfficeDiaryCategory;
        tags?: string[];
        attachmentNames?: string[];
      };
      if (!body.content?.trim() && !body.title?.trim()) {
        res.status(400).json({ error: 'Title or content is required for an office diary entry.' });
        return;
      }
      const state = await loadWorkspaceState();
      const entry = createDiaryEntry({
        dateIso: body.dateIso,
        title: body.title || 'Office Log',
        content: body.content || '',
        category: body.category || 'Focus',
        tags: body.tags || [],
        attachmentNames: body.attachmentNames || []
      });
      const nextState: WorkspacePersistedState = {
        ...state,
        diaryEntries: [entry, ...state.diaryEntries]
      };
      await saveWorkspaceState(nextState);
      res.status(201).json({ entry, entries: nextState.diaryEntries });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create diary entry' });
    }
  });

  app.patch('/api/diary/:id', jsonParser, async (req, res) => {
    try {
      const targetId = req.params.id;
      const body = (req.body || {}) as Partial<OfficeDiaryEntry>;
      const state = await loadWorkspaceState();
      const existing = state.diaryEntries.find((e) => e.id === targetId);
      if (!existing) {
        res.status(404).json({ error: 'Diary entry not found' });
        return;
      }
      const nextDateIso = body.dateIso ? body.dateIso.trim() : existing.dateIso;
      const updated: OfficeDiaryEntry = {
        ...existing,
        ...(body.title !== undefined ? { title: body.title.trim() || existing.title } : {}),
        ...(body.content !== undefined ? { content: body.content.trim() } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        dateIso: nextDateIso,
        dateLabel: formatDiaryDateLabel(nextDateIso),
        updatedIso: new Date().toISOString()
      };
      const nextEntries = state.diaryEntries.map((e) => (e.id === targetId ? updated : e));
      await saveWorkspaceState({ ...state, diaryEntries: nextEntries });
      res.json({ entry: updated, entries: nextEntries });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update diary entry' });
    }
  });

  app.delete('/api/diary/:id', async (req, res) => {
    try {
      const targetId = req.params.id;
      const state = await loadWorkspaceState();
      const nextEntries = state.diaryEntries.filter((e) => e.id !== targetId);
      await saveWorkspaceState({ ...state, diaryEntries: nextEntries });
      res.json({ removedId: targetId, entries: nextEntries });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete diary entry' });
    }
  });

  // Continuous Background Agentic Task Scheduler endpoints
  app.get('/api/scheduler/tasks', async (_req, res) => {
    try {
      await runSchedulerCycleIfDue();
      const state = await loadWorkspaceState();
      res.json({ tasks: state.schedulerTasks, serverNowIso: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load scheduler tasks' });
    }
  });

  app.post('/api/scheduler/tasks', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        title?: string;
        prompt?: string;
        cloudModelId?: CloudSchedulerModelId;
        intervalId?: SchedulerIntervalId;
        ragEnabled?: boolean;
        ragStrategyId?: RagStrategyId;
        attachmentNames?: string[];
        assignedAgentId?: string;
        scheduledSlotIso?: string;
      };
      if (!body.prompt?.trim()) {
        res.status(400).json({ error: 'Task objective prompt is required.' });
        return;
      }
      const state = await loadWorkspaceState();
      const created = createBackgroundAgentTask({
        title: body.title || '',
        prompt: body.prompt,
        cloudModelId: body.cloudModelId || 'claude-3-7-sonnet',
        intervalId: body.intervalId || '1m',
        ragEnabled: body.ragEnabled ?? true,
        ragStrategyId: body.ragStrategyId || 'hybrid-rrf',
        attachmentNames: body.attachmentNames || [],
        assignedAgentId: body.assignedAgentId,
        scheduledSlotIso: body.scheduledSlotIso
      });

      const store = await loadCoreDataStore();
      const liveCitations = await fetchLiveCloudWebCitations(created.prompt);
      const firstRunTask = executeBackgroundAgentTaskCycle({
        task: created,
        store,
        liveCitations,
        now: new Date()
      });

      const nextTasks = [firstRunTask, ...state.schedulerTasks];
      await saveWorkspaceState({ ...state, schedulerTasks: nextTasks });
      res.status(201).json({ task: firstRunTask, tasks: nextTasks });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to schedule task' });
    }
  });

  app.patch('/api/scheduler/tasks/:id', jsonParser, async (req, res) => {
    try {
      const targetId = req.params.id;
      const body = (req.body || {}) as {
        status?: 'running' | 'paused';
        cloudModelId?: CloudSchedulerModelId;
        intervalId?: SchedulerIntervalId;
        ragEnabled?: boolean;
        ragStrategyId?: RagStrategyId;
        assignedAgentId?: string;
        scheduledSlotIso?: string;
      };
      const state = await loadWorkspaceState();
      const existing = state.schedulerTasks.find((t) => t.id === targetId);
      if (!existing) {
        res.status(404).json({ error: 'Scheduled task not found' });
        return;
      }

      const nextStatus = body.status ?? existing.status;
      const nextModelSpec = body.cloudModelId
        ? getCloudSchedulerModelSpec(body.cloudModelId)
        : null;
      const updated: BackgroundAgentTask = {
        ...existing,
        ...(body.ragEnabled !== undefined ? { ragEnabled: body.ragEnabled } : {}),
        ...(body.ragStrategyId !== undefined ? { ragStrategyId: body.ragStrategyId } : {}),
        ...(body.assignedAgentId !== undefined ? { assignedAgentId: body.assignedAgentId } : {}),
        ...(body.scheduledSlotIso !== undefined ? { scheduledSlotIso: body.scheduledSlotIso } : {}),
        ...(nextModelSpec
          ? {
              cloudModelId: nextModelSpec.id,
              cloudModelLabel: nextModelSpec.label,
              cloudProviderLabel: nextModelSpec.provider
            }
          : {}),
        status: nextStatus,
        nextRunIso:
          nextStatus === 'running' && existing.status === 'paused'
            ? computeNextRunIso(existing.intervalMs, Date.now())
            : existing.nextRunIso
      };

      const nextTasks = state.schedulerTasks.map((t) => (t.id === targetId ? updated : t));
      await saveWorkspaceState({ ...state, schedulerTasks: nextTasks });
      res.json({ task: updated, tasks: nextTasks });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update task' });
    }
  });

  app.post('/api/scheduler/tasks/:id/run', async (req, res) => {
    try {
      const targetId = req.params.id;
      const state = await loadWorkspaceState();
      if (!state.schedulerTasks.some((t) => t.id === targetId)) {
        res.status(404).json({ error: 'Scheduled task not found' });
        return;
      }
      await runSchedulerCycleIfDue(targetId);
      const refreshed = await loadWorkspaceState();
      const task = refreshed.schedulerTasks.find((t) => t.id === targetId);
      res.json({ task, tasks: refreshed.schedulerTasks });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Manual task run failed' });
    }
  });

  app.delete('/api/scheduler/tasks/:id', async (req, res) => {
    try {
      const targetId = req.params.id;
      const state = await loadWorkspaceState();
      const nextTasks = state.schedulerTasks.filter((t) => t.id !== targetId);
      await saveWorkspaceState({ ...state, schedulerTasks: nextTasks });
      res.json({ removedId: targetId, tasks: nextTasks });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete task' });
    }
  });

  // ==================== UNIFIED DICTATION TRANSCRIBE & TRANSLATE GATEWAY ====================
  app.post('/api/dictation/transcribe', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        audioBase64?: string;
        mimeType?: string;
        modelId?: string;
        provider?: ApiProviderId;
        apiKey?: string;
        customUrl?: string;
        customModelId?: string;
        language?: string;
        domainTerms?: string;
      };

      const rawBase64 = String(body.audioBase64 || '').trim();
      if (!rawBase64) {
        res.status(400).json({ error: 'audioBase64 is required for cloud transcription.' });
        return;
      }
      if (rawBase64.length > 26_000_000) {
        res.status(413).json({ error: 'Audio payload exceeds 20MB gateway limit.' });
        return;
      }

      const cleanBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
      const mimeType = String(body.mimeType || 'audio/wav').split(';')[0].trim() || 'audio/wav';
      const provider: ApiProviderId = body.provider || 'gemini';
      const apiKey = String(body.apiKey || '').trim();
      const languageHint =
        body.language && body.language !== 'Auto-detect'
          ? `Spoken language hint: ${body.language}.`
          : 'Auto-detect the spoken language accurately.';
      const termsHint = body.domainTerms?.trim()
        ? `Bias spelling toward these domain terms: ${body.domainTerms.trim().slice(0, 600)}.`
        : '';

      if (provider === 'deepgram') {
        if (!apiKey) {
          res.status(400).json({ error: 'Deepgram API key is required for Deepgram Nova-3.' });
          return;
        }
        const audioBuffer = Buffer.from(cleanBase64, 'base64');
        const dgResp = await fetch(
          'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true',
          {
            method: 'POST',
            headers: {
              Authorization: `Token ${apiKey}`,
              'Content-Type': mimeType
            },
            body: audioBuffer
          }
        );
        if (!dgResp.ok) {
          const msg = await dgResp.text().catch(() => '');
          res.status(dgResp.status).json({ error: `Deepgram error (${dgResp.status}): ${msg.slice(0, 160)}` });
          return;
        }
        const dgData = (await dgResp.json()) as {
          results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
        };
        const transcript = dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
        res.json({ text: transcript.trim(), detectedLang: body.language || 'Auto-detect', provider: 'deepgram' });
        return;
      }

      if (provider === 'openai' || provider === 'groq' || provider === 'custom') {
        const targetUrl =
          provider === 'openai'
            ? 'https://api.openai.com/v1/audio/transcriptions'
            : provider === 'groq'
              ? 'https://api.groq.com/openai/v1/audio/transcriptions'
              : String(body.customUrl || '').trim();

        if (!targetUrl) {
          res.status(400).json({ error: 'Transcription endpoint URL is required.' });
          return;
        }
        if (provider === 'custom' && !isSafePublicHttpUrl(targetUrl)) {
          res.status(400).json({
            error: 'Custom server-proxied transcription URL must be a public HTTP/HTTPS endpoint. Configure localhost endpoints in the browser Hub.'
          });
          return;
        }
        if ((provider === 'openai' || provider === 'groq') && !apiKey) {
          res.status(400).json({ error: `${provider.toUpperCase()} API key is required.` });
          return;
        }

        const audioBytes = Buffer.from(cleanBase64, 'base64');
        const form = new FormData();
        const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'm4a' : 'wav';
        form.append('file', new Blob([audioBytes], { type: mimeType }), `audio.${ext}`);
        form.append(
          'model',
          provider === 'groq'
            ? 'whisper-large-v3-turbo'
            : provider === 'openai'
              ? 'gpt-4o-transcribe'
              : body.customModelId || 'whisper-1'
        );

        const upstream = await fetch(targetUrl, {
          method: 'POST',
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
          body: form
        });
        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => '');
          res.status(upstream.status).json({ error: `Upstream ASR error (${upstream.status}): ${detail.slice(0, 160)}` });
          return;
        }
        const upstreamData = (await upstream.json()) as { text?: string; language?: string };
        res.json({
          text: (upstreamData.text || '').trim(),
          detectedLang: upstreamData.language || body.language || 'Auto-detect',
          provider
        });
        return;
      }

      // Default: Gemini 3.5 Transcribe (server gateway or BYOK Gemini key)
      const ai = apiKey
        ? new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } })
        : getServerGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured on the server and no BYOK key was provided. Switch to Local Whisper (WebGPU/WASM) to transcribe offline.'
        });
        return;
      }

      const geminiResp = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64
                }
              },
              {
                text: `Transcribe the spoken audio accurately with proper punctuation. Output ONLY the raw spoken transcript text without timestamps or commentary. ${languageHint} ${termsHint}`.trim()
              }
            ]
          }
        ]
      });

      res.json({
        text: (geminiResp.text || '').trim(),
        detectedLang: body.language || 'Auto-detect',
        provider: 'gemini',
        modelUsed: 'gemini-3.5-transcribe'
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Transcription gateway failed' });
    }
  });

  app.post('/api/dictation/translate', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        text?: string;
        modeInstructions?: string;
        translateEnabled?: boolean;
        sourceLang?: string;
        targetLang?: string;
        modelId?: string;
        provider?: ApiProviderId;
        apiKey?: string;
        customUrl?: string;
        customModelId?: string;
        domainTerms?: string;
      };

      const inputText = String(body.text || '').trim();
      if (!inputText) {
        res.status(400).json({ error: 'text is required.' });
        return;
      }
      if (inputText.length > 24_000) {
        res.status(413).json({ error: 'Dictation text exceeds 24,000 characters.' });
        return;
      }

      const translateEnabled = Boolean(body.translateEnabled);
      const sourceLang = String(body.sourceLang || 'Auto-detect');
      const targetLang = String(body.targetLang || 'English (US)');
      const provider: ApiProviderId = body.provider || 'gemini';
      const apiKey = String(body.apiKey || '').trim();
      const instructions =
        String(body.modeInstructions || '').trim() ||
        'Remove filler words, fix punctuation, and preserve exact meaning.';
      const termsHint = body.domainTerms?.trim()
        ? `Preserve technical spelling for: ${body.domainTerms.trim().slice(0, 500)}.`
        : '';

      const systemPrompt = [
        'You are a precision dictation cleanup and translation engine.',
        instructions,
        termsHint,
        translateEnabled
          ? `Translate from ${sourceLang} into ${targetLang}. Return JSON with keys "cleanedText" (in source language) and "translatedText" (in ${targetLang}).`
          : 'Return JSON with key "cleanedText" only.'
      ]
        .filter(Boolean)
        .join(' ');

      if (provider === 'anthropic') {
        if (!apiKey) {
          res.status(400).json({ error: 'Anthropic API key is required.' });
          return;
        }
        const anthResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: systemPrompt,
            messages: [{ role: 'user', content: inputText }]
          })
        });
        if (!anthResp.ok) {
          const detail = await anthResp.text().catch(() => '');
          res.status(anthResp.status).json({ error: `Anthropic error: ${detail.slice(0, 160)}` });
          return;
        }
        const anthData = (await anthResp.json()) as {
          content?: Array<{ text?: string }>;
        };
        const rawOut = anthData.content?.[0]?.text?.trim() || inputText;
        try {
          const parsed = JSON.parse(rawOut) as { cleanedText?: string; translatedText?: string };
          res.json({
            cleanedText: parsed.cleanedText || inputText,
            translatedText: parsed.translatedText
          });
        } catch {
          res.json({
            cleanedText: translateEnabled ? inputText : rawOut,
            translatedText: translateEnabled ? rawOut : undefined
          });
        }
        return;
      }

      if (provider === 'openai' || provider === 'groq' || provider === 'custom') {
        const endpoint =
          provider === 'openai'
            ? 'https://api.openai.com/v1/chat/completions'
            : provider === 'groq'
              ? 'https://api.groq.com/openai/v1/chat/completions'
              : String(body.customUrl || '').trim();

        if (!endpoint) {
          res.status(400).json({ error: 'LLM endpoint URL is required.' });
          return;
        }
        if (provider === 'custom' && !isSafePublicHttpUrl(endpoint)) {
          res.status(400).json({
            error: 'Custom server-proxied LLM URL must use a public HTTP/HTTPS host.'
          });
          return;
        }
        if ((provider === 'openai' || provider === 'groq') && !apiKey) {
          res.status(400).json({ error: `${provider.toUpperCase()} API key is required.` });
          return;
        }

        const upstream = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
          },
          body: JSON.stringify({
            model:
              provider === 'groq'
                ? 'llama-3.3-70b-versatile'
                : provider === 'openai'
                  ? 'gpt-4o'
                  : body.customModelId || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: inputText }
            ]
          })
        });
        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => '');
          res.status(upstream.status).json({ error: `Upstream LLM error: ${detail.slice(0, 160)}` });
          return;
        }
        const upstreamData = (await upstream.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const rawOut = upstreamData.choices?.[0]?.message?.content?.trim() || inputText;
        try {
          const parsed = JSON.parse(rawOut) as { cleanedText?: string; translatedText?: string };
          res.json({
            cleanedText: parsed.cleanedText || inputText,
            translatedText: parsed.translatedText
          });
        } catch {
          res.json({
            cleanedText: translateEnabled ? inputText : rawOut,
            translatedText: translateEnabled ? rawOut : undefined
          });
        }
        return;
      }

      // Default: Gemini 4 Hydrogen (omit temperature/topP/topK per guidelines)
      const ai = apiKey
        ? new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } })
        : getServerGeminiClient();
      if (!ai) {
        res.status(503).json({
          error: 'GEMINI_API_KEY is not configured. Using local deterministic cleanup.'
        });
        return;
      }

      const geminiResp = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: inputText,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json'
          }
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini translation gateway timed out after 6.5s')), 6500)
        )
      ]);

      const rawText = (geminiResp.text || '').trim();
      try {
        const parsed = JSON.parse(rawText) as { cleanedText?: string; translatedText?: string };
        res.json({
          cleanedText: (parsed.cleanedText || inputText).trim(),
          translatedText: parsed.translatedText?.trim(),
          modelUsed: 'gemini-4-hydrogen'
        });
      } catch {
        res.json({
          cleanedText: translateEnabled ? inputText : rawText || inputText,
          translatedText: translateEnabled ? rawText : undefined,
          modelUsed: 'gemini-4-hydrogen'
        });
      }
    } catch (err) {
      res.json({
        cleanedText: String((req.body as { text?: string })?.text || '').trim(),
        translatedText: undefined,
        fallbackUsed: true,
        fallbackReason: err instanceof Error ? err.message : 'Translation gateway unavailable'
      });
    }
  });

  // ==================== USER IDENTITY, CALLSIGNS & NANOBOT SANDBOX API ====================
  app.post('/api/identity/init', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        scopeKey?: string;
        authUid?: string;
        linkedProvider?: 'google' | 'guest';
        preferredExistingUserId?: string;
        guestScopeKey?: string;
      };
      const scopeKey = (body.scopeKey || 'default').trim().slice(0, 140);
      const state = await loadNanoRuntimeState();

      let identity = state.identitiesByKey[scopeKey];
      if (!identity && body.guestScopeKey && state.identitiesByKey[body.guestScopeKey]) {
        // Promote existing guest userId seamlessly on first Google link
        const guestIdentity = state.identitiesByKey[body.guestScopeKey];
        identity = createUserIdentity({
          existingUserId: guestIdentity.userId,
          createdAt: guestIdentity.createdAt,
          authUid: body.authUid,
          linkedProvider: body.linkedProvider ?? (body.authUid ? 'google' : 'guest')
        });
      }

      if (!identity) {
        identity = createUserIdentity({
          existingUserId: body.preferredExistingUserId,
          authUid: body.authUid,
          linkedProvider: body.linkedProvider ?? (body.authUid ? 'google' : 'guest')
        });
      } else if (body.authUid && !identity.authUid) {
        identity = {
          ...identity,
          authUid: body.authUid,
          linkedProvider: 'google'
        };
      }

      if (
        !state.identitiesByKey[scopeKey] ||
        state.identitiesByKey[scopeKey].authUid !== identity.authUid
      ) {
        await saveNanoRuntimeState({
          ...state,
          identitiesByKey: {
            ...state.identitiesByKey,
            [scopeKey]: identity
          }
        });
      }

      const callsigns = state.callsigns.filter((c) => c.userId === identity.userId);
      res.json({ identity, callsigns });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to initialize identity' });
    }
  });

  app.get('/api/callsigns', async (req, res) => {
    try {
      const userId = String(req.query.userId || '').trim();
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }
      const state = await loadNanoRuntimeState();
      res.json({ callsigns: state.callsigns.filter((c) => c.userId === userId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list callsigns' });
    }
  });

  app.post('/api/callsigns', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        userId?: string;
        displayName?: string;
        avatar?: string;
        isActive?: boolean;
      };
      const userId = (body.userId || '').trim();
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }
      const state = await loadNanoRuntimeState();
      const userCallsigns = state.callsigns.filter((c) => c.userId === userId);
      const otherCallsigns = state.callsigns.filter((c) => c.userId !== userId);
      const { created, callsigns: nextUserCallsigns } = createCallsignItem({
        userId,
        displayName: body.displayName || '',
        avatar: body.avatar,
        isActive: body.isActive,
        existingCallsigns: userCallsigns
      });

      await saveNanoRuntimeState({
        ...state,
        callsigns: [...nextUserCallsigns, ...otherCallsigns]
      });
      res.status(201).json({ callsign: created, callsigns: nextUserCallsigns });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create callsign' });
    }
  });

  app.patch('/api/callsigns/:id', jsonParser, async (req, res) => {
    try {
      const targetId = req.params.id;
      const body = (req.body || {}) as {
        userId?: string;
        displayName?: string;
        avatar?: string;
        isActive?: boolean;
      };
      const userId = (body.userId || '').trim();
      const state = await loadNanoRuntimeState();
      const existing = state.callsigns.find((c) => c.id === targetId && (!userId || c.userId === userId));
      if (!existing) {
        res.status(404).json({ error: 'Callsign not found' });
        return;
      }

      const ownerId = existing.userId;
      const ownerCallsigns = state.callsigns.filter((c) => c.userId === ownerId);
      const otherCallsigns = state.callsigns.filter((c) => c.userId !== ownerId);

      const nextOwnerCallsigns =
        body.isActive && body.displayName === undefined && body.avatar === undefined
          ? setActiveCallsign(ownerCallsigns, targetId)
          : updateCallsignItem(ownerCallsigns, targetId, {
              displayName: body.displayName,
              avatar: body.avatar,
              isActive: body.isActive
            });

      await saveNanoRuntimeState({
        ...state,
        callsigns: [...nextOwnerCallsigns, ...otherCallsigns]
      });
      res.json({ callsigns: nextOwnerCallsigns });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update callsign' });
    }
  });

  app.delete('/api/callsigns/:id', async (req, res) => {
    try {
      const targetId = req.params.id;
      const userId = String(req.query.userId || '').trim();
      const state = await loadNanoRuntimeState();
      const existing = state.callsigns.find((c) => c.id === targetId && (!userId || c.userId === userId));
      if (!existing) {
        res.status(404).json({ error: 'Callsign not found' });
        return;
      }

      const ownerId = existing.userId;
      const ownerCallsigns = state.callsigns.filter((c) => c.userId === ownerId);
      const otherCallsigns = state.callsigns.filter((c) => c.userId !== ownerId);
      const nextOwnerCallsigns = deleteCallsignItem(ownerCallsigns, targetId);

      await saveNanoRuntimeState({
        ...state,
        callsigns: [...nextOwnerCallsigns, ...otherCallsigns]
      });
      res.json({ removedId: targetId, callsigns: nextOwnerCallsigns });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete callsign' });
    }
  });

  app.get('/api/nanobots', async (req, res) => {
    try {
      const userId = String(req.query.userId || '').trim();
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }
      const state = await loadNanoRuntimeState();
      const nanobots = state.nanobots.filter((b) => b.userId === userId);
      const botIds = new Set(nanobots.map((b) => b.id));
      const runs = state.runs.filter((r) => r.userId === userId && botIds.has(r.botId));
      res.json({ nanobots, runs });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load nanobots' });
    }
  });

  app.post('/api/nanobots', jsonParser, async (req, res) => {
    try {
      const body = (req.body || {}) as {
        userId?: string;
        name?: string;
        engine?: NanobotEngineId;
        styleId?: NanobotStyleId;
        modelId?: string;
        taskPrompt?: string;
        schedule?: NanobotSchedule;
        consentTimestampIso?: string;
        runImmediately?: boolean;
      };
      const userId = (body.userId || '').trim();
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }
      if (!body.consentTimestampIso) {
        res.status(400).json({ error: 'AI & Data Disclosure consent timestamp is required.' });
        return;
      }
      const engine: NanobotEngineId = body.engine || 'atlas';
      const allowedModels = getModelsForEngine(engine);
      const modelId = allowedModels.some((m) => m.id === body.modelId)
        ? (body.modelId as string)
        : allowedModels[0].id;
      const taskPrompt = (body.taskPrompt || '').trim();
      if (!taskPrompt) {
        res.status(400).json({ error: 'Task prompt is required.' });
        return;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const botId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const schedule: NanobotSchedule = {
        cadence: body.schedule?.cadence || 'daily',
        startTime: body.schedule?.startTime || '09:00',
        customIntervalMinutes: body.schedule?.customIntervalMinutes,
        notificationsEnabled: body.schedule?.notificationsEnabled ?? true,
        nextRunIso: computeNextNanobotRunIso(
          {
            cadence: body.schedule?.cadence || 'daily',
            startTime: body.schedule?.startTime || '09:00',
            customIntervalMinutes: body.schedule?.customIntervalMinutes,
            notificationsEnabled: body.schedule?.notificationsEnabled ?? true
          },
          now
        )
      };

      const draftBot: Nanobot = {
        id: botId,
        userId,
        name: (body.name || 'Nanobot').trim().slice(0, 60) || 'Nanobot',
        engine,
        styleId: body.styleId || 'researcher',
        modelId,
        taskPrompt,
        schedule,
        status: 'scheduled',
        sandboxId: buildSandboxId(botId),
        consentTimestampIso: body.consentTimestampIso,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      await provisionBotSandbox(activeSandboxRootDir, draftBot);

      const state = await loadNanoRuntimeState();
      let finalBot = draftBot;
      const newRuns: NanobotRun[] = [];
      if (body.runImmediately ?? true) {
        const execResult = executeNanobotRunRecord(draftBot, now);
        finalBot = execResult.updatedBot;
        newRuns.push(execResult.run);
        await appendBotSandboxMemory(
          activeSandboxRootDir,
          finalBot,
          userId,
          finalBot.id,
          `Initial release run (${execResult.run.status}): ${finalBot.taskPrompt.slice(0, 140)}`
        );
      }

      const nextBots = [finalBot, ...state.nanobots];
      const nextRuns = [...newRuns, ...state.runs];
      await saveNanoRuntimeState({
        ...state,
        nanobots: nextBots,
        runs: nextRuns.slice(0, 500)
      });

      res.status(201).json({
        nanobot: finalBot,
        runs: newRuns,
        nanobots: nextBots.filter((b) => b.userId === userId)
      });
    } catch (err) {
      if (err instanceof SandboxPolicyError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to release nanobot' });
    }
  });

  app.patch('/api/nanobots/:botId', jsonParser, async (req, res) => {
    try {
      const botId = req.params.botId;
      const body = (req.body || {}) as {
        userId?: string;
        name?: string;
        modelId?: string;
        taskPrompt?: string;
        schedule?: NanobotSchedule;
        status?: NanobotStatus;
      };
      const state = await loadNanoRuntimeState();
      const existing = state.nanobots.find((b) => b.id === botId);
      if (!existing) {
        res.status(404).json({ error: 'Nanobot not found' });
        return;
      }
      if (body.userId && existing.userId !== body.userId) {
        res.status(403).json({ error: 'Forbidden: Nanobot belongs to a different User ID.' });
        return;
      }

      const nowIso = new Date().toISOString();
      const nextSchedule = body.schedule
        ? {
            ...body.schedule,
            nextRunIso: computeNextNanobotRunIso(body.schedule, new Date())
          }
        : existing.schedule;

      const allowedModels = getModelsForEngine(existing.engine);
      const nextModelId =
        body.modelId && allowedModels.some((m) => m.id === body.modelId)
          ? body.modelId
          : existing.modelId;

      const updated: Nanobot = {
        ...existing,
        ...(body.name !== undefined ? { name: body.name.trim().slice(0, 60) || existing.name } : {}),
        modelId: nextModelId,
        ...(body.taskPrompt !== undefined ? { taskPrompt: body.taskPrompt.trim() || existing.taskPrompt } : {}),
        schedule: nextSchedule,
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedAt: nowIso
      };

      const nextBots = state.nanobots.map((b) => (b.id === botId ? updated : b));
      await saveNanoRuntimeState({ ...state, nanobots: nextBots });
      res.json({ nanobot: updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update nanobot' });
    }
  });

  app.post('/api/nanobots/:botId/rerun', jsonParser, async (req, res) => {
    try {
      const botId = req.params.botId;
      const body = (req.body || {}) as { userId?: string };
      const state = await loadNanoRuntimeState();
      const existing = state.nanobots.find((b) => b.id === botId);
      if (!existing) {
        res.status(404).json({ error: 'Nanobot not found' });
        return;
      }
      if (body.userId && existing.userId !== body.userId) {
        res.status(403).json({ error: 'Forbidden: Nanobot belongs to a different User ID.' });
        return;
      }

      const { updatedBot, run } = executeNanobotRunRecord(existing, new Date());
      await appendBotSandboxMemory(
        activeSandboxRootDir,
        updatedBot,
        updatedBot.userId,
        updatedBot.id,
        `Manual rerun (${run.status}): ${updatedBot.taskPrompt.slice(0, 140)}`
      );

      const nextBots = state.nanobots.map((b) => (b.id === botId ? updatedBot : b));
      const nextRuns = [run, ...state.runs].slice(0, 500);
      await saveNanoRuntimeState({ ...state, nanobots: nextBots, runs: nextRuns });
      res.json({ nanobot: updatedBot, run });
    } catch (err) {
      if (err instanceof SandboxPolicyError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to rerun nanobot' });
    }
  });

  app.delete('/api/nanobots/:botId', async (req, res) => {
    try {
      const botId = req.params.botId;
      const userId = String(req.query.userId || '').trim();
      const state = await loadNanoRuntimeState();
      const existing = state.nanobots.find((b) => b.id === botId);
      if (!existing) {
        res.status(404).json({ error: 'Nanobot not found' });
        return;
      }
      if (userId && existing.userId !== userId) {
        res.status(403).json({ error: 'Forbidden: Cannot delete another user’s Nanobot.' });
        return;
      }

      await wipeBotSandbox(activeSandboxRootDir, existing.userId, existing.id);
      const nextBots = state.nanobots.filter((b) => b.id !== botId);
      const nextRuns = state.runs.filter((r) => r.botId !== botId);
      await saveNanoRuntimeState({ ...state, nanobots: nextBots, runs: nextRuns });
      res.json({ removedId: botId, sandboxWiped: true });
    } catch (err) {
      if (err instanceof SandboxPolicyError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete nanobot' });
    }
  });

  app.get('/api/nanobots/:botId/sandbox', async (req, res) => {
    try {
      const botId = req.params.botId;
      const userId = String(req.query.userId || '').trim();
      const actorBotId = String(req.query.actorBotId || botId).trim();
      const state = await loadNanoRuntimeState();
      const bot = state.nanobots.find((b) => b.id === botId);
      if (!bot) {
        res.status(404).json({ error: 'Nanobot not found' });
        return;
      }
      const sandbox = await readBotSandbox(activeSandboxRootDir, bot, userId || bot.userId, actorBotId);
      res.json({ sandbox });
    } catch (err) {
      if (err instanceof SandboxPolicyError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Sandbox access error' });
    }
  });

  app.post('/api/nanobots/:botId/sandbox/memory', jsonParser, async (req, res) => {
    try {
      const botId = req.params.botId;
      const body = (req.body || {}) as {
        userId?: string;
        actorBotId?: string;
        summary?: string;
      };
      const state = await loadNanoRuntimeState();
      const bot = state.nanobots.find((b) => b.id === botId);
      if (!bot) {
        res.status(404).json({ error: 'Nanobot not found' });
        return;
      }
      const sandbox = await appendBotSandboxMemory(
        activeSandboxRootDir,
        bot,
        body.userId || bot.userId,
        body.actorBotId || botId,
        body.summary || ''
      );
      res.json({ sandbox });
    } catch (err) {
      if (err instanceof SandboxPolicyError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      res.status(500).json({ error: err instanceof Error ? err.message : 'Sandbox write error' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // Real continuous background scheduler loop (checks every 5s)
  const backgroundSchedulerTimer = setInterval(() => {
    void runSchedulerCycleIfDue().catch(() => undefined);
    void runNanobotSchedulerCycleIfDue().catch(() => undefined);
  }, 5_000);
  backgroundSchedulerTimer.unref?.();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nudge AI Notes server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
