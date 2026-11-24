import type {
  CoreDataChunkEmbedding,
  CoreDataDocumentFormat,
  CoreDataManagedDocument,
  CoreDataVectorStoreState,
  LocalDocument,
  UploadedAssetKind
} from '../types/index.ts';
import { SAMPLE_DOCUMENTS } from '../data/mockData.ts';
import { chunkDocumentSections, type ParsedDocumentSection } from './documentParsers.ts';

export const COREDATA_EMBEDDING_DIM = 128;
export const COREDATA_CONTAINER_ID = 'x-coredata://LOCALLY-NEXUS-CLOUDKIT';
export const COREDATA_ZONE_NAME = 'LocallyNexusPrivateVectorZone';

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'when',
  'where',
  'what',
  'which',
  'how',
  'are',
  'was',
  'were',
  'been',
  'have',
  'has',
  'had',
  'will',
  'can',
  'could',
  'should',
  'would',
  'about',
  'over',
  'under',
  'after',
  'before',
  'between',
  'through',
  'during',
  'using',
  'used'
]);

/**
 * Deterministic 32-bit FNV-1a hash for feature hashing into fixed-dimension vectors.
 */
function fnv1aHash(token: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function tokenizeForSearch(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9_/-]{1,}/g) || []).filter(
    (tok) => tok.length >= 2 && !STOP_WORDS.has(tok)
  );
}

/**
 * Computes an L2-normalized 128-dimensional embedding combining unigrams,
 * word bigrams, and character 3-grams for CoreData vector similarity search.
 */
export function computeTextEmbedding(
  text: string,
  dim = COREDATA_EMBEDDING_DIM
): number[] {
  const vec = new Float64Array(dim);
  const tokens = tokenizeForSearch(text);

  if (tokens.length === 0) {
    vec[0] = 1;
    return Array.from(vec);
  }

  const addFeature = (feature: string, weight: number) => {
    const h = fnv1aHash(feature);
    const bucket = h % dim;
    const sign = (fnv1aHash(feature, 0x9e3779b1) & 1) === 0 ? 1 : -1;
    vec[bucket] += sign * weight;
  };

  tokens.forEach((tok, idx) => {
    addFeature(`u:${tok}`, 1.35);
    // Stem approximation for inflections (reserves -> reserve, policies -> polic)
    if (tok.length > 5) {
      addFeature(`s:${tok.slice(0, -1)}`, 0.55);
    }
    if (idx + 1 < tokens.length) {
      addFeature(`b:${tok}_${tokens[idx + 1]}`, 0.9);
    }
    if (tok.length >= 4) {
      for (let i = 0; i <= tok.length - 3; i++) {
        addFeature(`c:${tok.slice(i, i + 3)}`, 0.28);
      }
    }
  });

  let normSq = 0;
  for (let i = 0; i < dim; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq) || 1;
  return Array.from(vec, (v) => Number((v / norm).toFixed(6)));
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!denom) return 0;
  return Math.max(0, Math.min(1, dot / denom));
}

export function extractDomainEntities(text: string): string[] {
  const entities = new Set<string>();
  // Acronyms & key domain tokens
  const acronymMatches = text.match(/\b[A-Z]{2,8}\b/g) || [];
  for (const m of acronymMatches) {
    if (!['THE', 'AND', 'FOR', 'NOT', 'ALL', 'ANY'].includes(m)) {
      entities.add(m);
    }
  }
  // PascalCase / CamelCase / API paths
  const pascalMatches = text.match(/\b[A-Z][a-zA-Z0-9]{2,}(?:[A-Z][a-zA-Z0-9]+)+\b/g) || [];
  for (const m of pascalMatches) {
    entities.add(m);
  }
  const pathMatches = text.match(/\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)+/gi) || [];
  for (const m of pathMatches) {
    entities.add(m);
  }
  // Important multi-letter domain keywords
  const importantTerms = [
    'ClaimCenter',
    'PolicyCenter',
    'BillingCenter',
    'Gosu',
    'Cloud API',
    'Subrogation',
    'Reserve',
    'Exposure',
    'Coverage',
    'Deductible',
    'Jutro',
    'App Events',
    'CoreData',
    'RAG',
    'Embedding'
  ];
  for (const term of importantTerms) {
    if (text.toLowerCase().includes(term.toLowerCase())) {
      entities.add(term);
    }
  }
  return Array.from(entities).slice(0, 10);
}

export function buildCoreDataDocumentAndChunks(input: {
  id?: string;
  title: string;
  format: CoreDataDocumentFormat;
  assetKind: UploadedAssetKind;
  sizeKB: number;
  summary?: string;
  text: string;
  sections?: ParsedDocumentSection[];
  tags?: string[];
  dateAdded?: string;
}): {
  document: CoreDataManagedDocument;
  chunks: CoreDataChunkEmbedding[];
} {
  const docId = input.id || `cd-doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const shortKey = docId.replace(/[^a-zA-Z0-9_-]/g, '');
  const nowIso = new Date().toISOString();
  const sections: ParsedDocumentSection[] =
    input.sections && input.sections.length > 0
      ? input.sections
      : [{ label: 'Section 1', text: input.text }];

  const rawChunks = chunkDocumentSections(sections, 420, 60);
  const safeChunks =
    rawChunks.length > 0
      ? rawChunks
      : [{ sectionLabel: 'Section 1', text: input.summary || input.title }];

  const chunks: CoreDataChunkEmbedding[] = safeChunks.map((chunk, idx) => ({
    managedObjectId: `${COREDATA_CONTAINER_ID}/CDChunkEmbedding/${shortKey}_c${idx + 1}`,
    entityName: 'CDChunkEmbedding',
    documentId: docId,
    documentTitle: input.title,
    documentFormat: input.format,
    assetKind: input.assetKind,
    chunkIndex: idx + 1,
    sectionLabel: chunk.sectionLabel,
    text: chunk.text,
    keywords: tokenizeForSearch(chunk.text).slice(0, 12),
    entities: extractDomainEntities(`${input.title} ${chunk.text}`),
    embedding: computeTextEmbedding(`${input.title} ${chunk.sectionLabel} ${chunk.text}`)
  }));

  const cleanExcerpt = (safeChunks[0]?.text || input.text).slice(0, 220);
  const summary =
    input.summary?.trim() ||
    `${input.format} document (${chunks.length} embedded chunk${chunks.length === 1 ? '' : 's'}) · ${cleanExcerpt.slice(0, 120)}...`;

  const document: CoreDataManagedDocument = {
    managedObjectId: `${COREDATA_CONTAINER_ID}/CDDocument/${shortKey}`,
    cloudKitRecordName: `CK-${shortKey}`,
    entityName: 'CDDocument',
    id: docId,
    title: input.title,
    format: input.format,
    assetKind: input.assetKind,
    sizeKB: Math.max(1, Math.round(input.sizeKB)),
    chunkCount: chunks.length,
    embeddingDim: COREDATA_EMBEDDING_DIM,
    dateAdded: input.dateAdded || 'Just now',
    updatedIso: nowIso,
    summary,
    contentExcerpt: cleanExcerpt,
    tags: input.tags && input.tags.length > 0 ? input.tags : [input.format],
    syncState: 'synced'
  };

  return { document, chunks };
}

const SEED_SECTION_EXPANSIONS: Record<string, ParsedDocumentSection[]> = {
  'doc-cc-cloud-api': [
    {
      label: 'Page 1 · FNOL Composite Intake',
      text: 'POST /claim/v1/claims creates draft FNOL payloads with verified policy snapshots, incident vehicles, and exposure mappings in a single composite JSON:API request. Role-based JWT scopes enforce partner vs adjuster intake boundaries.'
    },
    {
      label: 'Page 2 · Reserves & Exposure Patching',
      text: 'External Jutro portals patch exposures via PATCH /claim/v1/claims/{claimId}/exposures while reserving TransactionSet creation respects carrier authority caps enforced before commit.'
    },
    {
      label: 'Page 3 · App Events & Upgrade Isolation',
      text: 'Guidewire App Events publish claim-closed, exposure-updated, and subrogation-recovery webhooks asynchronously, eliminating brittle synchronous core plugins during InsuranceSuite updates.'
    }
  ],
  'doc-cc-gosu-rules': [
    {
      label: 'Section 1 · InitialReserve & Authority Limits',
      text: 'ClaimCenter verifies coverage against PolicyCenter, creates the exposure subtype, and executes InitialReserve pre-update Gosu rules to set statutory indemnity and expense reserves before supervisor escalation.'
    },
    {
      label: 'Section 2 · Subrogation Recovery Routing',
      text: 'When claim.FaultRating == FaultRating.TC_THIRDPARTY and SubrogationSummary.Status == TC_OPEN, Gosu rules auto-assign a third-party recovery owner and emit BillingCenter recovery expectations.'
    },
    {
      label: 'Section 3 · SIU Anomaly Scoring',
      text: 'Pre-update validation checks policy inception age, loss date proximity, and duplicate claimant attributes. Any FNOL scoring SIU Score >= 70 routes directly to Special Investigations Unit triage.'
    }
  ],
  'doc-pc-cc-sync': [
    {
      label: 'Page 1 · PolicyCenter Coverage Snapshot',
      text: 'ClaimCenter invokes IPolicySearchAdapter to retrieve point-in-time endorsements and deductible schedules on the date of loss, caching verified policy snapshots for sub-400ms p95 intake latency.'
    },
    {
      label: 'Page 2 · Unverified Policy & BillingCenter Reconciliation',
      text: 'If PolicyCenter is temporarily unreachable, ClaimCenter permits an unverified draft FNOL flagged for asynchronous verification while BillingCenter reconciles deductible recoveries and indemnity checks.'
    }
  ]
};

export function createInitialCoreDataStore(): CoreDataVectorStoreState {
  const documents: CoreDataManagedDocument[] = [];
  const chunks: CoreDataChunkEmbedding[] = [];

  for (const seed of SAMPLE_DOCUMENTS) {
    const sections = SEED_SECTION_EXPANSIONS[seed.id] || [
      { label: 'Section 1', text: `${seed.summary}\n${seed.contentExcerpt}` }
    ];
    const built = buildCoreDataDocumentAndChunks({
      id: seed.id,
      title: seed.title,
      format: seed.format as CoreDataDocumentFormat,
      assetKind: 'document',
      sizeKB: seed.sizeKB,
      summary: seed.summary,
      text: sections.map((s) => s.text).join('\n\n'),
      sections,
      tags: seed.tags,
      dateAdded: seed.dateAdded
    });
    documents.push(built.document);
    chunks.push(...built.chunks);
  }

  return {
    containerId: COREDATA_CONTAINER_ID,
    zoneName: COREDATA_ZONE_NAME,
    embeddingDim: COREDATA_EMBEDDING_DIM,
    lastSyncedIso: new Date().toISOString(),
    documents,
    chunks
  };
}

export function upsertCoreDataDocument(
  store: CoreDataVectorStoreState,
  input: Parameters<typeof buildCoreDataDocumentAndChunks>[0]
): {
  nextStore: CoreDataVectorStoreState;
  document: CoreDataManagedDocument;
  chunks: CoreDataChunkEmbedding[];
} {
  const built = buildCoreDataDocumentAndChunks(input);
  const replacedDocIds = new Set(
    store.documents
      .filter(
        (d) =>
          d.id === built.document.id ||
          (d.title === built.document.title && d.format === built.document.format)
      )
      .map((d) => d.id)
  );
  const filteredDocs = store.documents.filter((d) => !replacedDocIds.has(d.id));
  const filteredChunks = store.chunks.filter((c) => !replacedDocIds.has(c.documentId));

  return {
    nextStore: {
      ...store,
      lastSyncedIso: new Date().toISOString(),
      documents: [built.document, ...filteredDocs],
      chunks: [...built.chunks, ...filteredChunks]
    },
    document: built.document,
    chunks: built.chunks
  };
}

export function deleteCoreDataDocument(
  store: CoreDataVectorStoreState,
  documentId: string
): CoreDataVectorStoreState {
  return {
    ...store,
    lastSyncedIso: new Date().toISOString(),
    documents: store.documents.filter((d) => d.id !== documentId),
    chunks: store.chunks.filter((c) => c.documentId !== documentId)
  };
}

export function toLocalDocument(cdDoc: CoreDataManagedDocument): LocalDocument {
  return {
    id: cdDoc.id,
    title: cdDoc.title,
    format: cdDoc.format,
    sizeKB: cdDoc.sizeKB,
    chunkCount: cdDoc.chunkCount,
    dateAdded: cdDoc.dateAdded,
    summary: cdDoc.summary,
    contentExcerpt: cdDoc.contentExcerpt,
    tags: cdDoc.tags,
    coreDataRecordId: cdDoc.managedObjectId,
    embeddingDim: cdDoc.embeddingDim,
    syncStatus: cdDoc.syncState
  };
}
