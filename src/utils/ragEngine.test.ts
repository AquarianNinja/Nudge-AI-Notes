import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_LLM_MODELS } from './modelRegistry.ts';
import { createInitialCoreDataStore, upsertCoreDataDocument } from './coreDataVectorDb.ts';
import {
  RAG_STRATEGIES,
  buildChunksFromWorkspaceAttachments,
  buildDynamicCloudSearchSparkpage,
  executeRagRetrieval,
  generateDynamicCloudCitations,
  synthesizeRagAnswerWithLocalLlm
} from './ragEngine.ts';

test('RAG_STRATEGIES defines 5 distinct top-quality RAG strategies', () => {
  assert.equal(RAG_STRATEGIES.length, 5);
  const ids = new Set(RAG_STRATEGIES.map((s) => s.id));
  assert.deepEqual(ids, new Set(['hybrid-rrf', 'agentic', 'graph-rag', 'corrective', 'multimodal']));
});

test('executeRagRetrieval retrieves relevant CoreData chunks across Hybrid, Agentic, and Graph RAG', () => {
  const baseStore = createInitialCoreDataStore();
  const { nextStore } = upsertCoreDataDocument(baseStore, {
    id: 'doc-siu-pdf',
    title: 'SIU_Fraud_Thresholds.pdf',
    format: 'PDF',
    assetKind: 'document',
    sizeKB: 120,
    text: 'Claims scoring SIU >= 70 route automatically to Special Investigations Unit review.',
    tags: ['SIU', 'PDF']
  });

  const hybrid = executeRagRetrieval(nextStore, 'When does SIU Score route to Special Investigations Unit?', {
    strategyId: 'hybrid-rrf',
    topK: 3
  });
  assert.ok(hybrid.retrieved.length >= 1);
  assert.match(hybrid.retrieved[0].text, /SIU|Special Investigations/i);
  assert.ok(hybrid.confidenceScore >= 50);

  const agentic = executeRagRetrieval(nextStore, 'Compare PolicyCenter snapshots and Gosu reserves', {
    strategyId: 'agentic',
    topK: 3
  });
  assert.ok(agentic.pipelineSteps[0].includes('Decomposed prompt'));
  assert.ok(agentic.retrieved.length >= 2);

  const graph = executeRagRetrieval(nextStore, 'ClaimCenter PolicyCenter FaultRating', {
    strategyId: 'graph-rag',
    topK: 3
  });
  assert.ok(graph.retrieved.some((c) => Array.isArray(c.graphHops) && c.graphHops.length > 0));
});

test('Corrective RAG triggers Cloud Search fallback on out-of-corpus queries when online', () => {
  const store = createInitialCoreDataStore();
  const crag = executeRagRetrieval(store, 'Quantum entanglement error correction surface codes', {
    strategyId: 'corrective',
    offlineOnly: false
  });
  assert.equal(crag.shouldTriggerCloudFallback, true);

  const cragOffline = executeRagRetrieval(store, 'Quantum entanglement error correction surface codes', {
    strategyId: 'corrective',
    offlineOnly: true
  });
  assert.equal(cragOffline.shouldTriggerCloudFallback, false);
});

test('Multimodal RAG indexes and prioritizes uploaded images and audio alongside documents', () => {
  const store = createInitialCoreDataStore();
  const attachmentChunks = buildChunksFromWorkspaceAttachments([
    {
      id: 'att-img-1',
      kind: 'image',
      fileName: 'fnol_damage_diagram.png',
      mimeType: 'image/png',
      sizeBytes: 64000,
      sizeLabel: '63 KB',
      formatLabel: 'PNG',
      imageMeta: {
        width: 1200,
        height: 800,
        visualSummary: 'Front bumper collision diagram showing third-party liability zone'
      }
    }
  ]);

  const mm = executeRagRetrieval(store, 'Analyze the uploaded front bumper collision image', {
    strategyId: 'multimodal',
    attachmentChunks,
    topK: 3
  });
  assert.ok(mm.retrieved.some((c) => c.assetKind === 'image'));
});

test('synthesizeRagAnswerWithLocalLlm and buildDynamicCloudSearchSparkpage reflect actual query inputs', () => {
  const store = createInitialCoreDataStore();
  const { retrieved, pipelineSteps, confidenceScore } = executeRagRetrieval(store, 'ClaimCenter Cloud API FNOL');
  const synthesis = synthesizeRagAnswerWithLocalLlm({
    query: 'ClaimCenter Cloud API FNOL',
    strategyId: 'hybrid-rrf',
    localModel: LEGACY_LLM_MODELS[1],
    retrievedChunks: retrieved,
    pipelineSteps,
    confidenceScore,
    cloudSearchTriggered: false
  });

  assert.match(synthesis.localLlmName, /Llama 3 8B/);
  assert.match(synthesis.answer, /Retrieved CoreData Context/);
  assert.equal(synthesis.pipelineSteps.length, 4);

  const citations = generateDynamicCloudCitations('Kubernetes Pod Autoscaling HPA');
  const sparkpage = buildDynamicCloudSearchSparkpage({
    query: 'Kubernetes Pod Autoscaling HPA',
    strategyId: 'agentic',
    retrievedChunks: [],
    citations
  });
  assert.equal(sparkpage.title, 'Kubernetes Pod Autoscaling HPA');
  assert.match(sparkpage.citations[0].title, /Kubernetes Pod Autoscaling HPA/);
});
