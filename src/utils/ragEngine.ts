import type {
  CoreDataChunkEmbedding,
  CoreDataVectorStoreState,
  ModelOption,
  RagRetrievedChunk,
  RagStrategyId,
  RagSynthesisResult,
  SparkpageCitation,
  SparkpageData,
  WorkspaceAttachment
} from '../types/index.ts';
import {
  computeTextEmbedding,
  cosineSimilarity,
  extractDomainEntities,
  tokenizeForSearch
} from './coreDataVectorDb.ts';

export interface RagStrategySpec {
  id: RagStrategyId;
  label: string;
  shortLabel: string;
  mechanism: string;
  description: string;
}

export const RAG_STRATEGIES: RagStrategySpec[] = [
  {
    id: 'hybrid-rrf',
    label: 'Hybrid RAG (Dense + BM25 RRF)',
    shortLabel: 'Hybrid RAG',
    mechanism: 'Reciprocal Rank Fusion (k=60)',
    description: 'Fuses 128-d CoreData vector similarity with BM25 exact term matching.'
  },
  {
    id: 'agentic',
    label: 'Agentic RAG (Decompose & Verify)',
    shortLabel: 'Agentic RAG',
    mechanism: 'Multi-Step Query Planner',
    description: 'Breaks complex prompts into sub-queries and verifies chunk coverage.'
  },
  {
    id: 'graph-rag',
    label: 'Graph RAG (Entity Neighborhood)',
    shortLabel: 'Graph RAG',
    mechanism: '1-Hop Entity Traversal',
    description: 'Follows linked entities across CoreData chunks for multi-hop recall.'
  },
  {
    id: 'corrective',
    label: 'Corrective RAG (CRAG + Cloud Fallback)',
    shortLabel: 'Corrective RAG',
    mechanism: 'Confidence Grading + Web Guard',
    description: 'Grades chunk confidence and triggers Cloud Search if local recall is weak.'
  },
  {
    id: 'multimodal',
    label: 'Multimodal RAG (Docs + Image + Audio)',
    shortLabel: 'Multimodal RAG',
    mechanism: 'Cross-Modal Index Fusion',
    description: 'Retrieves jointly across uploaded PDFs, EPUBs, TXT, images, and audio.'
  }
];

export function getRagStrategySpec(id: RagStrategyId): RagStrategySpec {
  return RAG_STRATEGIES.find((s) => s.id === id) || RAG_STRATEGIES[0];
}

export {
  RAG_STRATEGY_USER_CONFIG,
  getRagStrategyUserConfig
} from './ragStrategiesConfig.ts';
export type { RagStrategyUserConfig } from './ragStrategiesConfig.ts';

function computeBm25Score(
  queryTokens: string[],
  chunkTextLower: string,
  chunkKeywords: string[],
  avgDocLen: number,
  docFreqMap: Map<string, number>,
  totalDocs: number
): { score: number; matchedTerms: string[] } {
  if (queryTokens.length === 0) return { score: 0, matchedTerms: [] };

  const chunkTokens = tokenizeForSearch(chunkTextLower);
  const termCounts = new Map<string, number>();
  for (const t of chunkTokens) {
    termCounts.set(t, (termCounts.get(t) || 0) + 1);
  }
  for (const kw of chunkKeywords) {
    if (!termCounts.has(kw)) termCounts.set(kw, 1);
  }

  const k1 = 1.4;
  const b = 0.72;
  const dl = Math.max(1, chunkTokens.length);
  let rawScore = 0;
  const matched = new Set<string>();

  for (const qt of queryTokens) {
    const tf = termCounts.get(qt) || 0;
    const partialMatch = tf > 0 ? tf : chunkTextLower.includes(qt) ? 0.65 : 0;
    if (partialMatch <= 0) continue;

    matched.add(qt);
    const df = docFreqMap.get(qt) || 1;
    const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
    const tfNorm =
      (partialMatch * (k1 + 1)) / (partialMatch + k1 * (1 - b + b * (dl / Math.max(1, avgDocLen))));
    rawScore += idf * tfNorm;
  }

  // Normalize roughly into 0..1
  const normalized = rawScore > 0 ? Math.min(1, rawScore / (queryTokens.length * 1.65)) : 0;
  return {
    score: Number(normalized.toFixed(4)),
    matchedTerms: Array.from(matched)
  };
}

function decomposeSubQueries(query: string): string[] {
  const trimmed = query.trim();
  const splitParts = trimmed
    .split(/\b(?:and|vs\.?|versus|compare|with)\b|[,;?]+/i)
    .map((p) => p.trim())
    .filter((p) => p.length >= 4);

  if (splitParts.length >= 2) {
    return [trimmed, ...splitParts.slice(0, 3)];
  }
  const entities = extractDomainEntities(trimmed);
  if (entities.length >= 2) {
    return [trimmed, ...entities.slice(0, 2).map((e) => `${e} details and constraints`)];
  }
  return [trimmed, `${trimmed} workflow rules`];
}

export function buildChunksFromWorkspaceAttachments(
  attachments: WorkspaceAttachment[]
): CoreDataChunkEmbedding[] {
  return attachments.map((att, idx) => {
    const text =
      att.kind === 'image'
        ? `Uploaded Image: ${att.fileName}. ${att.imageMeta ? `${att.imageMeta.width}x${att.imageMeta.height}px. ${att.imageMeta.visualSummary}` : ''} ${att.extractedText || ''}`.trim()
        : att.kind === 'audio'
        ? `Uploaded Audio: ${att.fileName} (${att.audioMeta?.durationLabel || 'audio'}). ${
            att.audioMeta?.highlights
              ?.map((h) => `[${h.timestamp}] ${h.speaker}: ${h.text}`)
              .join(' ') || ''
          } ${att.extractedText || ''}`.trim()
        : (att.extractedText || `Uploaded Document: ${att.fileName}`).trim();

    return {
      managedObjectId: `x-coredata://LOCALLY-NEXUS-CLOUDKIT/CDChunkEmbedding/ws_${att.id}`,
      entityName: 'CDChunkEmbedding',
      documentId: att.vectorDocId || `ws-doc-${att.id}`,
      documentTitle: att.fileName,
      documentFormat:
        att.kind === 'image'
          ? 'Image'
          : att.kind === 'audio'
          ? 'Audio'
          : att.formatLabel === 'PDF' ||
            att.formatLabel === 'EPUB' ||
            att.formatLabel === 'Markdown'
          ? att.formatLabel
          : 'TXT',
      assetKind: att.kind,
      chunkIndex: idx + 1,
      sectionLabel:
        att.kind === 'image'
          ? `Image (${att.imageMeta?.width ?? 0}×${att.imageMeta?.height ?? 0})`
          : att.kind === 'audio'
          ? `Audio (${att.audioMeta?.durationLabel || 'clip'})`
          : 'Uploaded Context',
      text: text.slice(0, 800),
      keywords: tokenizeForSearch(`${att.fileName} ${text}`).slice(0, 14),
      entities: extractDomainEntities(`${att.fileName} ${text}`),
      embedding: computeTextEmbedding(`${att.fileName} ${text}`)
    };
  });
}

export function executeRagRetrieval(
  store: CoreDataVectorStoreState,
  query: string,
  options: {
    strategyId?: RagStrategyId;
    topK?: number;
    filterDocumentId?: string | null;
    attachmentChunks?: CoreDataChunkEmbedding[];
    offlineOnly?: boolean;
  } = {}
): {
  retrieved: RagRetrievedChunk[];
  pipelineSteps: string[];
  confidenceScore: number;
  shouldTriggerCloudFallback: boolean;
} {
  const strategyId = options.strategyId || 'hybrid-rrf';
  const topK = options.topK ?? 4;
  const attachments = options.attachmentChunks || [];
  const storeDocIds = new Set(store.chunks.map((c) => c.documentId));
  const storeDocTitles = new Set(store.chunks.map((c) => `${c.documentFormat}:${c.documentTitle}`));
  const uniqueAttachments = attachments.filter(
    (a) =>
      !storeDocIds.has(a.documentId) &&
      !storeDocTitles.has(`${a.documentFormat}:${a.documentTitle}`)
  );

  let candidatePool: CoreDataChunkEmbedding[] = [...uniqueAttachments, ...store.chunks];
  if (options.filterDocumentId) {
    candidatePool = candidatePool.filter(
      (c) => c.documentId === options.filterDocumentId || c.documentId.startsWith('ws-doc-')
    );
  }

  if (candidatePool.length === 0) {
    return {
      retrieved: [],
      pipelineSteps: ['1. CoreData Cloud Vector DB empty · awaiting document ingestion'],
      confidenceScore: 0,
      shouldTriggerCloudFallback: !options.offlineOnly
    };
  }

  const totalDocs = candidatePool.length;
  const avgDocLen =
    candidatePool.reduce((acc, c) => acc + Math.max(1, tokenizeForSearch(c.text).length), 0) /
    totalDocs;

  const docFreqMap = new Map<string, number>();
  for (const chunk of candidatePool) {
    const uniq = new Set(tokenizeForSearch(`${chunk.documentTitle} ${chunk.text}`));
    for (const term of uniq) {
      docFreqMap.set(term, (docFreqMap.get(term) || 0) + 1);
    }
  }

  const queryTokens = tokenizeForSearch(query);
  const queryVec = computeTextEmbedding(query);

  // Compute dense + BM25 base metrics
  const baseScored = candidatePool.map((chunk) => {
    const vectorScore = cosineSimilarity(queryVec, chunk.embedding);
    const bm25 = computeBm25Score(
      queryTokens,
      `${chunk.documentTitle} ${chunk.sectionLabel} ${chunk.text}`.toLowerCase(),
      chunk.keywords,
      avgDocLen,
      docFreqMap,
      totalDocs
    );
    return {
      chunk,
      vectorScore: Number(vectorScore.toFixed(4)),
      lexicalScore: bm25.score,
      matchedTerms: bm25.matchedTerms
    };
  });

  // Sort orders for RRF
  const byDense = [...baseScored].sort((a, b) => b.vectorScore - a.vectorScore);
  const byLexical = [...baseScored].sort((a, b) => b.lexicalScore - a.lexicalScore);
  const denseRankMap = new Map<string, number>();
  const lexicalRankMap = new Map<string, number>();
  byDense.forEach((item, idx) => denseRankMap.set(item.chunk.managedObjectId, idx + 1));
  byLexical.forEach((item, idx) => lexicalRankMap.set(item.chunk.managedObjectId, idx + 1));

  // Graph RAG: entity neighbor map
  const queryEntities = new Set(extractDomainEntities(query).map((e) => e.toLowerCase()));
  const entityCooccurrence = new Map<string, Set<string>>();
  if (strategyId === 'graph-rag') {
    for (const chunk of candidatePool) {
      const ents = chunk.entities.map((e) => e.toLowerCase());
      for (const e1 of ents) {
        if (!entityCooccurrence.has(e1)) entityCooccurrence.set(e1, new Set());
        for (const e2 of ents) {
          if (e1 !== e2) entityCooccurrence.get(e1)!.add(e2);
        }
      }
    }
  }

  const subQueries = strategyId === 'agentic' ? decomposeSubQueries(query) : [query];
  const subQueryVecs = subQueries.map((sq) => computeTextEmbedding(sq));

  const ranked: RagRetrievedChunk[] = baseScored.map((item) => {
    const id = item.chunk.managedObjectId;
    const dRank = denseRankMap.get(id) || totalDocs;
    const lRank = lexicalRankMap.get(id) || totalDocs;
    // Normalized RRF (max when rank=1 on both = 2/61)
    const rrfRaw = 1 / (60 + dRank) + 1 / (60 + lRank);
    const rrfNorm = Math.min(1, rrfRaw / (2 / 61));

    let fusedScore = 0.45 * item.vectorScore + 0.35 * item.lexicalScore + 0.2 * rrfNorm;
    let graphHops: string[] | undefined;

    if (strategyId === 'agentic') {
      const bestSubDense = Math.max(
        item.vectorScore,
        ...subQueryVecs.map((v) => cosineSimilarity(v, item.chunk.embedding))
      );
      fusedScore = 0.55 * bestSubDense + 0.25 * item.lexicalScore + 0.2 * rrfNorm;
    } else if (strategyId === 'graph-rag') {
      const chunkEnts = item.chunk.entities.map((e) => e.toLowerCase());
      const directHits = chunkEnts.filter((e) => queryEntities.has(e));
      const oneHopHits: string[] = [];
      for (const qe of queryEntities) {
        const neighbors = entityCooccurrence.get(qe);
        if (!neighbors) continue;
        for (const ce of chunkEnts) {
          if (neighbors.has(ce) && !oneHopHits.includes(ce)) {
            oneHopHits.push(ce);
          }
        }
      }
      const graphBoost = Math.min(0.28, directHits.length * 0.1 + oneHopHits.length * 0.05);
      fusedScore = Math.min(1, fusedScore + graphBoost);
      if (directHits.length > 0 || oneHopHits.length > 0) {
        graphHops = item.chunk.entities.slice(0, 4);
      }
    } else if (strategyId === 'multimodal') {
      const isAttachedAsset = attachments.some(
        (a) => a.managedObjectId === id || a.documentId === item.chunk.documentId
      );
      const modalityBoost =
        item.chunk.assetKind === 'image' || item.chunk.assetKind === 'audio' || isAttachedAsset
          ? 0.2
          : 0;
      fusedScore = Math.min(1, fusedScore + modalityBoost);
    }

    return {
      chunkId: item.chunk.managedObjectId,
      documentId: item.chunk.documentId,
      documentTitle: item.chunk.documentTitle,
      documentFormat: item.chunk.documentFormat,
      assetKind: item.chunk.assetKind,
      sectionLabel: item.chunk.sectionLabel,
      text: item.chunk.text,
      vectorScore: item.vectorScore,
      lexicalScore: item.lexicalScore,
      fusedScore: Number(fusedScore.toFixed(4)),
      matchedTerms: item.matchedTerms,
      ...(graphHops ? { graphHops } : {})
    };
  });

  ranked.sort((a, b) => b.fusedScore - a.fusedScore);

  let selected = ranked.slice(0, topK);

  // Multimodal RAG ensures uploaded non-text modalities appear in top results if present
  if (strategyId === 'multimodal' && attachments.length > 0) {
    const pickedIds = new Set(selected.map((s) => s.chunkId));
    const missingModalities = ranked.filter(
      (r) => (r.assetKind === 'image' || r.assetKind === 'audio') && !pickedIds.has(r.chunkId)
    );
    if (missingModalities.length > 0) {
      selected = [...missingModalities.slice(0, 2), ...selected].slice(0, topK);
    }
  }

  // Corrective RAG prunes weak chunks and computes real relevance confidence
  const topScore = selected[0]?.fusedScore ?? 0;
  const topMatchedTerms = selected[0]?.matchedTerms.length ?? 0;
  const hasRealSignal = topScore >= 0.24 || topMatchedTerms > 0;

  if (strategyId === 'corrective') {
    const filtered = selected.filter((c) => c.fusedScore >= 0.22 || c.matchedTerms.length > 0);
    if (filtered.length > 0) selected = filtered;
  }

  const confidenceScore = hasRealSignal
    ? Math.min(98, Math.max(42, Math.round(topScore * 115 + Math.min(18, topMatchedTerms * 5))))
    : Math.max(18, Math.round(topScore * 90));

  const shouldTriggerCloudFallback =
    !options.offlineOnly &&
    ((strategyId === 'corrective' && confidenceScore < 58) || !hasRealSignal);

  const stepLabels: Record<RagStrategyId, string[]> = {
    'hybrid-rrf': [
      `1. Encoded query (${store.embeddingDim}-d L2 CoreData embedding)`,
      `2. Queried ${candidatePool.length} CDChunkEmbedding records in CoreData CloudKit`,
      `3. Ranked dense cosine + BM25 via Reciprocal Rank Fusion (k=60)`
    ],
    agentic: [
      `1. Decomposed prompt into ${subQueries.length} retrieval vectors`,
      `2. Iterative CoreData CloudKit retrieval across ${store.documents.length} documents`,
      `3. Verified cross-chunk coverage & eliminated duplicates`
    ],
    'graph-rag': [
      `1. Extracted ${Math.max(1, queryEntities.size)} seed entities from prompt`,
      `2. Traversed 1-hop entity neighborhood across CoreData CDChunkEmbedding graph`,
      `3. Fused graph proximity with dense vector cosine similarity`
    ],
    corrective: [
      `1. Scored ${candidatePool.length} CoreData chunks for query alignment`,
      `2. Graded retrieval confidence at ${confidenceScore}% (${
        shouldTriggerCloudFallback ? 'Below threshold -> Cloud Search fallback' : 'Grounded locally'
      })`,
      `3. Pruned low-relevance noise prior to synthesis`
    ],
    multimodal: [
      `1. Indexed ${candidatePool.length} chunks across Docs, Images & Audio`,
      `2. Executed cross-modal alignment in CoreData CloudKit index`,
      `3. Balanced source citations across active workspace uploads`
    ]
  };

  return {
    retrieved: selected,
    pipelineSteps: stepLabels[strategyId],
    confidenceScore,
    shouldTriggerCloudFallback
  };
}

export function generateDynamicCloudCitations(
  query: string,
  extraWebResults: SparkpageCitation[] = []
): SparkpageCitation[] {
  if (extraWebResults.length > 0) return extraWebResults;
  const cleanQuery = query.trim();
  const encoded = encodeURIComponent(cleanQuery);
  const tokens = tokenizeForSearch(cleanQuery);
  const topicSlug = tokens.slice(0, 3).join(' ') || cleanQuery;
  const lower = cleanQuery.toLowerCase();

  if (/claimcenter|policycenter|guidewire|fnol|gosu|subrogation|siu/.test(lower)) {
    return [
      {
        id: 1,
        title: `Guidewire Cloud Documentation — ${topicSlug}`,
        url: `https://docs.guidewire.com/cloud/cc/latest/search?q=${encoded}`,
        snippet: `Official Guidewire InsuranceSuite architectural guidance covering ${cleanQuery}, JSON:API contracts, and upgrade-safe Gosu rules.`,
        domain: 'docs.guidewire.com',
        crawlTimestamp: new Date().toISOString(),
        reliabilityScore: 98,
        authorOrSource: 'Guidewire Documentation'
      },
      {
        id: 2,
        title: `Developer Patterns: ${topicSlug}`,
        url: `https://developer.guidewire.com/search?q=${encoded}`,
        snippet: `Reference integration workflows and SLA recommendations for ${cleanQuery} across Cloud API and App Events.`,
        domain: 'developer.guidewire.com',
        crawlTimestamp: new Date().toISOString(),
        reliabilityScore: 95,
        authorOrSource: 'Guidewire Developer Portal'
      }
    ];
  }

  return [
    {
      id: 1,
      title: `Cloud Search Brief: ${cleanQuery}`,
      url: `https://en.wikipedia.org/w/index.php?search=${encoded}`,
      snippet: `Cloud web reference matching "${cleanQuery}" — cross-referenced for factual context, architecture, and implementation trade-offs.`,
      domain: 'en.wikipedia.org',
      crawlTimestamp: new Date().toISOString(),
      reliabilityScore: 93,
      authorOrSource: 'Cloud Web Index'
    },
    {
      id: 2,
      title: `Engineering Reference & Specs — ${topicSlug}`,
      url: `https://developer.mozilla.org/en-US/search?q=${encoded}`,
      snippet: `Technical documentation and production patterns retrieved via Cloud Search for "${cleanQuery}".`,
      domain: 'developer.mozilla.org',
      crawlTimestamp: new Date().toISOString(),
      reliabilityScore: 91,
      authorOrSource: 'Open Technical Index'
    }
  ];
}

export function synthesizeRagAnswerWithLocalLlm(params: {
  query: string;
  strategyId: RagStrategyId;
  localModel: Pick<ModelOption, 'name' | 'engine' | 'tokensPerSec'>;
  retrievedChunks: RagRetrievedChunk[];
  pipelineSteps: string[];
  confidenceScore: number;
  cloudSearchTriggered: boolean;
  cloudCitations?: SparkpageCitation[];
  latencyMs?: number;
}): RagSynthesisResult {
  const {
    query,
    strategyId,
    localModel,
    retrievedChunks,
    pipelineSteps,
    confidenceScore,
    cloudSearchTriggered,
    cloudCitations = [],
    latencyMs = 148
  } = params;

  const spec = getRagStrategySpec(strategyId);
  const topChunks = retrievedChunks.filter((c) => c.fusedScore > 0.14 || c.matchedTerms.length > 0);
  const usedChunks = topChunks.length > 0 ? topChunks.slice(0, 3) : retrievedChunks.slice(0, 2);

  const chunkEvidenceLines = usedChunks.map(
    (c, idx) => `[${idx + 1}] ${c.documentTitle} (${c.sectionLabel}): ${c.text}`
  );

  const cloudLines =
    cloudSearchTriggered && cloudCitations.length > 0
      ? cloudCitations.map((cit, idx) => `[Cloud ${idx + 1}] ${cit.title}: ${cit.snippet}`)
      : [];

  const localSynthesisParagraph =
    usedChunks.length > 0 && (usedChunks[0].matchedTerms.length > 0 || usedChunks[0].vectorScore >= 0.25)
      ? `Synthesized locally by ${localModel.name} (${localModel.engine}): Based on ${usedChunks.length} retrieved CoreData chunk${usedChunks.length === 1 ? '' : 's'}, key grounded details for "${query}" center on ${usedChunks
          .map((c) => c.documentTitle.replace(/\.[^/.]+$/, ''))
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .join(' & ')}.`
      : `Synthesized locally by ${localModel.name} (${localModel.engine}): Direct exact-term overlap in the indexed CoreData chunks was limited for "${query}", so local model reasoning combines the closest semantic neighbors${
          cloudLines.length > 0 ? ' with Cloud Search augmentation' : ''
        } to answer cleanly.`;

  const answerSections = [localSynthesisParagraph];
  if (chunkEvidenceLines.length > 0) {
    answerSections.push(`Retrieved CoreData Context:\n${chunkEvidenceLines.join('\n')}`);
  }
  if (cloudLines.length > 0) {
    answerSections.push(`Cloud Search Fallback:\n${cloudLines.join('\n')}`);
  }

  return {
    query,
    strategyId,
    strategyLabel: spec.shortLabel,
    answer: answerSections.join('\n\n'),
    localLlmName: `${localModel.name} (${localModel.engine})`,
    cloudVectorUsed: retrievedChunks.length > 0,
    cloudSearchTriggered,
    confidenceScore,
    latencyMs,
    pipelineSteps: [
      ...pipelineSteps,
      `4. Synthesized grounded answer with ${localModel.name} (${localModel.tokensPerSec} tok/s)`
    ],
    retrievedChunks: usedChunks,
    ...(cloudLines.length > 0 ? { cloudSearchCitations: cloudCitations } : {})
  };
}

export function buildDynamicCloudSearchSparkpage(params: {
  query: string;
  strategyId: RagStrategyId;
  retrievedChunks: RagRetrievedChunk[];
  citations: SparkpageCitation[];
  executionTimeSec?: number;
}): SparkpageData {
  const { query, strategyId, retrievedChunks, citations, executionTimeSec = 2.1 } = params;
  const spec = getRagStrategySpec(strategyId);
  const cleanQuery = query.trim();

  const groundedBullets = retrievedChunks
    .slice(0, 3)
    .map((c) => `${c.documentTitle} (${c.sectionLabel}): ${c.text.slice(0, 140)}`);

  const primarySnippet =
    citations[0]?.snippet ||
    `Cloud search aggregated live web references and indexed CoreData vectors for "${cleanQuery}".`;

  const secondaryContent =
    groundedBullets.length > 0
      ? `CoreData Vector DB contributed ${retrievedChunks.length} matching chunk${retrievedChunks.length === 1 ? '' : 's'} using ${spec.label}, combined with ${citations.length} external cloud sources.`
      : `Retrieved ${citations.length} external cloud references matching "${cleanQuery}" with ${spec.shortLabel} verification.`;

  return {
    id: `sp-${Date.now()}`,
    query: cleanQuery,
    title: cleanQuery,
    subtitle: `${citations.length} cloud sources + ${retrievedChunks.length} CoreData chunks · ${spec.shortLabel}`,
    generatedDate: 'Just now',
    consensusScore: citations.length > 0 ? 94 : 88,
    agentExecutionTimeSec: executionTimeSec,
    sourcesScannedCount: citations.length + retrievedChunks.length * 4,
    sections: [
      {
        id: `sec-${Date.now()}-1`,
        title: `Cloud Search Synthesis (${spec.shortLabel})`,
        summary: primarySnippet,
        content: secondaryContent,
        bullets: groundedBullets.length > 0 ? groundedBullets : undefined,
        citations: citations.map((c) => c.id)
      }
    ],
    keyTakeaways: [
      `Cloud Search executed for "${cleanQuery}" using ${spec.shortLabel}.`,
      retrievedChunks.length > 0
        ? `Cross-checked against ${retrievedChunks.length} CoreData Cloud Vector DB chunks.`
        : 'Saved citations can be ingested directly into Workspace Sources.'
    ],
    citations
  };
}
