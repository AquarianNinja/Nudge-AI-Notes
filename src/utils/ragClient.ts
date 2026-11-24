import {
  BackgroundAgentTask,
  CloudSchedulerModelId,
  CoreDataChunkEmbedding,
  CoreDataDocumentFormat,
  CoreDataManagedDocument,
  CoreDataVectorStoreState,
  ModelOption,
  OfficeDiaryCategory,
  OfficeDiaryEntry,
  RagRetrievedChunk,
  RagStrategyId,
  RagSynthesisResult,
  SchedulerIntervalId,
  SparkpageCitation,
  SparkpageData,
  UploadedAssetKind,
  WorkspaceAttachment
} from '../types/index.ts';
import { ParsedDocumentResult, parseDocumentBytes } from './documentParsers.ts';
import {
  buildDynamicCloudSearchSparkpage,
  executeRagRetrieval,
  generateDynamicCloudCitations,
  synthesizeRagAnswerWithLocalLlm
} from './ragEngine.ts';
import { createDriveAudioFile } from './audioDrive.ts';
import { computeBoundedTimestamp } from './meetingNotes.ts';
import { gatewayFetch } from './networkGateway.ts';

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
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

export function classifyUploadedFileKind(file: Pick<File, 'name' | 'type'>): UploadedAssetKind {
  const lower = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg|heic)$/.test(lower)) {
    return 'image';
  }
  if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|webm|ogg|flac|aac)$/.test(lower)) {
    return 'audio';
  }
  return 'document';
}

export function readImageAttachmentMeta(
  file: File
): Promise<{ width: number; height: number; previewUrl: string; visualSummary: string }> {
  return new Promise((resolve) => {
    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    let settled = false;
    const finish = (width: number, height: number) => {
      if (settled) return;
      settled = true;
      const aspect = width > 0 && height > 0 ? `${width}x${height}px` : 'image';
      const stem = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      resolve({
        width,
        height,
        previewUrl,
        visualSummary: `Visual asset "${stem}" (${aspect}, ${formatByteSize(file.size || 24000)}) indexed for Multimodal RAG visual context.`
      });
    };
    img.onload = () => finish(img.naturalWidth || 1024, img.naturalHeight || 768);
    img.onerror = () => finish(800, 600);
    setTimeout(() => finish(800, 600), 600);
    img.src = previewUrl;
  });
}

export function readAudioFileMeta(file: File): Promise<{ durationSec: number; url: string }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    let settled = false;
    const finish = (sec: number) => {
      if (settled) return;
      settled = true;
      resolve({ durationSec: sec > 0 ? Math.round(sec) : 45, url });
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(45);
    setTimeout(() => finish(45), 600);
    audio.src = url;
  });
}

export async function parseDocumentFileViaBackendOrClient(file: File): Promise<ParsedDocumentResult> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  try {
    const base64Data = arrayBufferToBase64(buffer);
    const resp = await gatewayFetch('/api/documents/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        base64Data
      })
    });
    if (resp.ok) {
      const parsed = (await resp.json()) as ParsedDocumentResult;
      if (parsed && Array.isArray(parsed.sections)) {
        return parsed;
      }
    }
  } catch {
    // Fall back gracefully to pure browser parser
  }

  return parseDocumentBytes(bytes, file.name, file.type);
}

export async function buildWorkspaceAttachmentFromFile(file: File): Promise<{
  attachment: WorkspaceAttachment;
  parsedDocument?: ParsedDocumentResult;
  driveAudioFile?: ReturnType<typeof createDriveAudioFile>;
}> {
  const kind = classifyUploadedFileKind(file);
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const sizeBytes = file.size || 2048;
  const sizeLabel = formatByteSize(sizeBytes);

  if (kind === 'image') {
    const meta = await readImageAttachmentMeta(file);
    const ext = file.name.split('.').pop()?.toUpperCase() || 'IMG';
    return {
      attachment: {
        id,
        kind: 'image',
        fileName: file.name,
        mimeType: file.type || 'image/png',
        sizeBytes,
        sizeLabel,
        formatLabel: ext,
        previewUrl: meta.previewUrl,
        extractedText: meta.visualSummary,
        imageMeta: {
          width: meta.width,
          height: meta.height,
          visualSummary: meta.visualSummary
        },
        chunkCount: 1
      }
    };
  }

  if (kind === 'audio') {
    const { durationSec, url } = await readAudioFileMeta(file);
    const driveAudioFile = createDriveAudioFile({
      fileName: file.name,
      origin: 'imported',
      durationSec,
      sizeBytes,
      audioUrl: url,
      mimeType: file.type || 'audio/mpeg',
      linkedSessionTitle: 'Workspace Multimodal Audio'
    });
    const t1 = computeBoundedTimestamp(durationSec, 0.22);
    const t2 = computeBoundedTimestamp(durationSec, 0.68);
    const highlights = [
      {
        timestamp: t1,
        speaker: 'Speaker 1',
        text: `Key context from uploaded audio ${file.name}.`
      },
      {
        timestamp: t2,
        speaker: 'Speaker 2',
        text: 'Cross-referenced terms queued for CoreData vector retrieval.'
      }
    ];
    return {
      driveAudioFile,
      attachment: {
        id,
        kind: 'audio',
        fileName: file.name,
        mimeType: file.type || 'audio/mpeg',
        sizeBytes,
        sizeLabel,
        formatLabel: file.name.split('.').pop()?.toUpperCase() || 'AUDIO',
        previewUrl: url,
        extractedText: highlights.map((h) => `[${h.timestamp}] ${h.speaker}: ${h.text}`).join(' '),
        audioMeta: {
          durationSec,
          durationLabel: driveAudioFile.durationLabel,
          driveFileId: driveAudioFile.id,
          highlights
        },
        chunkCount: 1
      }
    };
  }

  const parsed = await parseDocumentFileViaBackendOrClient(file);
  return {
    parsedDocument: parsed,
    attachment: {
      id,
      kind: 'document',
      fileName: file.name,
      mimeType: file.type || 'text/plain',
      sizeBytes,
      sizeLabel,
      formatLabel: parsed.format,
      extractedText: parsed.extractedText.slice(0, 1200),
      chunkCount: Math.max(1, parsed.sectionCount)
    }
  };
}

export interface CoreDataStoreSummaryResponse {
  containerId: string;
  zoneName: string;
  embeddingDim: number;
  lastSyncedIso: string;
  documentCount: number;
  chunkCount: number;
  documents: CoreDataManagedDocument[];
}

export async function fetchCoreDataStoreSummary(): Promise<CoreDataStoreSummaryResponse | null> {
  try {
    const resp = await gatewayFetch('/api/vector-db/status');
    if (!resp.ok) return null;
    return (await resp.json()) as CoreDataStoreSummaryResponse;
  } catch {
    return null;
  }
}

export async function syncDocumentIngestToBackend(input: {
  id?: string;
  title: string;
  format: CoreDataDocumentFormat;
  assetKind: UploadedAssetKind;
  sizeKB: number;
  summary?: string;
  text: string;
  sections?: Array<{ label: string; text: string }>;
  tags?: string[];
  dateAdded?: string;
}): Promise<{ document: CoreDataManagedDocument; storeSummary: CoreDataStoreSummaryResponse } | null> {
  try {
    const resp = await gatewayFetch('/api/vector-db/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!resp.ok) return null;
    return (await resp.json()) as {
      document: CoreDataManagedDocument;
      storeSummary: CoreDataStoreSummaryResponse;
    };
  } catch {
    return null;
  }
}

export async function syncDocumentDeleteToBackend(documentId: string): Promise<boolean> {
  try {
    const resp = await gatewayFetch(`/api/vector-db/documents/${encodeURIComponent(documentId)}`, {
      method: 'DELETE'
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function executeFullRagPipeline(params: {
  store: CoreDataVectorStoreState;
  query: string;
  strategyId: RagStrategyId;
  localModel: Pick<ModelOption, 'name' | 'engine' | 'tokensPerSec'>;
  topK?: number;
  filterDocumentId?: string | null;
  attachmentChunks?: CoreDataChunkEmbedding[];
  offlineOnly?: boolean;
}): Promise<RagSynthesisResult> {
  const startedAt = performance.now();

  try {
    const resp = await gatewayFetch('/api/vector-db/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: params.query,
        strategyId: params.strategyId,
        topK: params.topK ?? 4,
        filterDocumentId: params.filterDocumentId ?? null,
        attachmentChunks: params.attachmentChunks || [],
        offlineOnly: Boolean(params.offlineOnly)
      })
    });
    if (resp.ok) {
      const data = (await resp.json()) as {
        retrieved: RagRetrievedChunk[];
        pipelineSteps: string[];
        confidenceScore: number;
        shouldTriggerCloudFallback: boolean;
        cloudCitations?: SparkpageCitation[];
      };
      const elapsed = Math.max(48, Math.round(performance.now() - startedAt));
      return synthesizeRagAnswerWithLocalLlm({
        query: params.query,
        strategyId: params.strategyId,
        localModel: params.localModel,
        retrievedChunks: data.retrieved,
        pipelineSteps: data.pipelineSteps,
        confidenceScore: data.confidenceScore,
        cloudSearchTriggered: data.shouldTriggerCloudFallback,
        cloudCitations: data.cloudCitations || [],
        latencyMs: elapsed
      });
    }
  } catch {
    // Fall back seamlessly to local engine
  }

  const retrieval = executeRagRetrieval(params.store, params.query, {
    strategyId: params.strategyId,
    topK: params.topK ?? 4,
    filterDocumentId: params.filterDocumentId ?? null,
    attachmentChunks: params.attachmentChunks || [],
    offlineOnly: Boolean(params.offlineOnly)
  });

  const cloudCitations =
    retrieval.shouldTriggerCloudFallback && !params.offlineOnly
      ? generateDynamicCloudCitations(params.query)
      : [];

  return synthesizeRagAnswerWithLocalLlm({
    query: params.query,
    strategyId: params.strategyId,
    localModel: params.localModel,
    retrievedChunks: retrieval.retrieved,
    pipelineSteps: retrieval.pipelineSteps,
    confidenceScore: retrieval.confidenceScore,
    cloudSearchTriggered: retrieval.shouldTriggerCloudFallback,
    cloudCitations,
    latencyMs: Math.max(64, Math.round(performance.now() - startedAt))
  });
}

export async function executeCloudSearchRequest(params: {
  store: CoreDataVectorStoreState;
  query: string;
  strategyId: RagStrategyId;
  attachmentChunks?: CoreDataChunkEmbedding[];
}): Promise<{ sparkpage: SparkpageData; citations: SparkpageCitation[] }> {
  try {
    const resp = await gatewayFetch('/api/search/cloud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: params.query,
        strategyId: params.strategyId,
        attachmentChunks: params.attachmentChunks || []
      })
    });
    if (resp.ok) {
      const data = (await resp.json()) as {
        sparkpage: SparkpageData;
        citations: SparkpageCitation[];
      };
      if (data?.sparkpage) {
        return data;
      }
    }
  } catch {
    // Fallback to client dynamic Cloud Search synthesis
  }

  const retrieval = executeRagRetrieval(params.store, params.query, {
    strategyId: params.strategyId,
    topK: 4,
    attachmentChunks: params.attachmentChunks || [],
    offlineOnly: false
  });
  const citations = generateDynamicCloudCitations(params.query);
  const sparkpage = buildDynamicCloudSearchSparkpage({
    query: params.query,
    strategyId: params.strategyId,
    retrievedChunks: retrieval.retrieved,
    citations,
    executionTimeSec: 1.9
  });
  return { sparkpage, citations };
}

export async function fetchDiaryEntries(): Promise<OfficeDiaryEntry[]> {
  try {
    const resp = await gatewayFetch('/api/diary');
    if (!resp.ok) return [];
    const data = (await resp.json()) as { entries?: OfficeDiaryEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

export async function createDiaryEntryRequest(payload: {
  dateIso?: string;
  title: string;
  content: string;
  category: OfficeDiaryCategory;
  tags?: string[];
  attachmentNames?: string[];
}): Promise<OfficeDiaryEntry[] | null> {
  try {
    const resp = await gatewayFetch('/api/diary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { entries?: OfficeDiaryEntry[] };
    return Array.isArray(data.entries) ? data.entries : null;
  } catch {
    return null;
  }
}

export async function updateDiaryEntryRequest(
  id: string,
  patch: Partial<Pick<OfficeDiaryEntry, 'title' | 'content' | 'category' | 'dateIso' | 'tags'>>
): Promise<OfficeDiaryEntry[] | null> {
  try {
    const resp = await gatewayFetch(`/api/diary/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { entries?: OfficeDiaryEntry[] };
    return Array.isArray(data.entries) ? data.entries : null;
  } catch {
    return null;
  }
}

export async function deleteDiaryEntryRequest(id: string): Promise<OfficeDiaryEntry[] | null> {
  try {
    const resp = await gatewayFetch(`/api/diary/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { entries?: OfficeDiaryEntry[] };
    return Array.isArray(data.entries) ? data.entries : null;
  } catch {
    return null;
  }
}

export async function fetchSchedulerTasks(): Promise<BackgroundAgentTask[]> {
  try {
    const resp = await gatewayFetch('/api/scheduler/tasks');
    if (!resp.ok) return [];
    const data = (await resp.json()) as { tasks?: BackgroundAgentTask[] };
    return Array.isArray(data.tasks) ? data.tasks : [];
  } catch {
    return [];
  }
}

export async function createSchedulerTaskRequest(payload: {
  title: string;
  prompt: string;
  cloudModelId: CloudSchedulerModelId;
  intervalId: SchedulerIntervalId;
  ragEnabled: boolean;
  ragStrategyId: RagStrategyId;
  attachmentNames?: string[];
  assignedAgentId?: string;
  scheduledSlotIso?: string;
}): Promise<BackgroundAgentTask[] | null> {
  try {
    const resp = await gatewayFetch('/api/scheduler/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { tasks?: BackgroundAgentTask[] };
    return Array.isArray(data.tasks) ? data.tasks : null;
  } catch {
    return null;
  }
}

export async function toggleSchedulerTaskRequest(
  id: string,
  patch: Partial<{
    status: 'running' | 'paused';
    cloudModelId: CloudSchedulerModelId;
    ragEnabled: boolean;
    ragStrategyId: RagStrategyId;
    assignedAgentId: string;
    scheduledSlotIso: string;
  }>
): Promise<BackgroundAgentTask[] | null> {
  try {
    const resp = await gatewayFetch(`/api/scheduler/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { tasks?: BackgroundAgentTask[] };
    return Array.isArray(data.tasks) ? data.tasks : null;
  } catch {
    return null;
  }
}

export async function runSchedulerTaskNowRequest(id: string): Promise<BackgroundAgentTask[] | null> {
  try {
    const resp = await gatewayFetch(`/api/scheduler/tasks/${encodeURIComponent(id)}/run`, {
      method: 'POST'
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { tasks?: BackgroundAgentTask[] };
    return Array.isArray(data.tasks) ? data.tasks : null;
  } catch {
    return null;
  }
}

export async function deleteSchedulerTaskRequest(id: string): Promise<BackgroundAgentTask[] | null> {
  try {
    const resp = await gatewayFetch(`/api/scheduler/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { tasks?: BackgroundAgentTask[] };
    return Array.isArray(data.tasks) ? data.tasks : null;
  } catch {
    return null;
  }
}

