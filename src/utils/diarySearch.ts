import type {
  CoreDataChunkEmbedding,
  CoreDataVectorStoreState,
  OfficeDiaryCategory,
  OfficeDiaryEntry
} from '../types/index.ts';
import {
  computeTextEmbedding,
  cosineSimilarity,
  tokenizeForSearch
} from './coreDataVectorDb.ts';

export type DiaryMatchKind = 'exact' | 'semantic' | 'both';

export interface DiarySearchHitMeta {
  entryId: string;
  matchKind: DiaryMatchKind;
  exactScore: number;
  semanticScore: number;
  usedFallbackKeywordOnly: boolean;
  matchedTokens: string[];
}

export interface DiaryHybridSearchResult {
  entries: OfficeDiaryEntry[];
  hitMetaById: Record<string, DiarySearchHitMeta>;
  matchedKeywords: string[];
}

const MIN_SEMANTIC_SIMILARITY = 0.14;

/**
 * Finds existing stored embeddings in the CoreData vector index associated with a diary entry.
 * Never creates a new store or re-embeds existing diary entries.
 */
function findStoredEntryVectors(
  entry: OfficeDiaryEntry,
  chunks: readonly CoreDataChunkEmbedding[]
): { directVectors: number[][]; linkedChunks: CoreDataChunkEmbedding[] } {
  const directDocIds = new Set([entry.id, `diary-${entry.id}`]);
  const directVectors: number[][] = [];
  const linkedChunks: CoreDataChunkEmbedding[] = [];

  const entryTitleLower = entry.title.toLowerCase();
  const entryTagsLower = new Set(entry.tags.map((t) => t.toLowerCase()));
  const entryTokens = new Set(tokenizeForSearch(`${entry.title} ${entry.content} ${entry.tags.join(' ')}`));

  for (const chunk of chunks) {
    if (!Array.isArray(chunk.embedding) || chunk.embedding.length === 0) continue;

    if (
      directDocIds.has(chunk.documentId) ||
      (entryTitleLower.length >= 4 && chunk.documentTitle.toLowerCase().includes(entryTitleLower))
    ) {
      directVectors.push(chunk.embedding);
      continue;
    }

    let overlapCount = 0;
    for (const kw of chunk.keywords) {
      if (entryTagsLower.has(kw.toLowerCase()) || entryTokens.has(kw.toLowerCase())) {
        overlapCount += 1;
        if (overlapCount >= 2) break;
      }
    }
    if (overlapCount >= 2) {
      linkedChunks.push(chunk);
    }
  }

  return { directVectors, linkedChunks };
}

/**
 * Hybrid search across Daily Office Diary entries:
 * 1) Ranks exact keyword/phrase matches first.
 * 2) Adds semantic matches scored using existing CoreData vector embeddings via computeTextEmbedding + cosineSimilarity.
 * 3) Gracefully falls back to keyword matching when an entry has no stored embedding yet.
 */
export function searchOfficeDiaryEntries(
  entries: OfficeDiaryEntry[],
  coreDataStore: CoreDataVectorStoreState | undefined,
  options: {
    query?: string;
    category?: OfficeDiaryCategory | 'All';
    dateIso?: string;
  }
): DiaryHybridSearchResult {
  const rawQuery = (options.query || '').trim();
  const category = options.category || 'All';
  const dateIso = (options.dateIso || '').trim();

  const scoped = entries.filter((entry) => {
    if (category !== 'All' && entry.category !== category) return false;
    if (dateIso && entry.dateIso !== dateIso) return false;
    return true;
  });

  if (!rawQuery) {
    const sorted = [...scoped].sort((a, b) => b.updatedIso.localeCompare(a.updatedIso));
    return { entries: sorted, hitMetaById: {}, matchedKeywords: [] };
  }

  const queryLower = rawQuery.toLowerCase();
  const queryTokens = tokenizeForSearch(rawQuery);
  const rawTerms = queryLower.split(/\s+/).filter((t) => t.length >= 2);
  const searchTerms = Array.from(new Set([...queryTokens, ...rawTerms]));

  const storedChunks = coreDataStore?.chunks || [];
  const queryEmbedding = storedChunks.length > 0 ? computeTextEmbedding(rawQuery) : null;

  // Pre-score existing CoreData chunks once for semantic bridging
  const topSemanticChunkScores = new Map<string, number>();
  if (queryEmbedding) {
    for (const chunk of storedChunks) {
      if (!Array.isArray(chunk.embedding) || chunk.embedding.length === 0) continue;
      const sim = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (sim >= MIN_SEMANTIC_SIMILARITY) {
        topSemanticChunkScores.set(chunk.managedObjectId, sim);
      }
    }
  }

  interface RankedEntry {
    entry: OfficeDiaryEntry;
    meta: DiarySearchHitMeta;
  }

  const ranked: RankedEntry[] = [];

  for (const entry of scoped) {
    const titleLower = entry.title.toLowerCase();
    const contentLower = entry.content.toLowerCase();
    const tagsLower = entry.tags.join(' ').toLowerCase();
    const haystack = `${titleLower} ${contentLower} ${tagsLower} ${entry.dateLabel.toLowerCase()}`;

    const phraseMatch = haystack.includes(queryLower);
    const matchedTokens = searchTerms.filter((term) => haystack.includes(term));

    let exactScore = 0;
    if (phraseMatch) exactScore += 2.0;
    if (titleLower.includes(queryLower)) exactScore += 1.2;
    if (searchTerms.length > 0 && matchedTokens.length > 0) {
      exactScore += matchedTokens.length / searchTerms.length;
    }

    // Semantic score strictly reusing existing stored CoreData vectors (no re-embedding of entries)
    let semanticScore = 0;
    let hasStoredEmbedding = false;

    if (queryEmbedding && storedChunks.length > 0) {
      const { directVectors, linkedChunks } = findStoredEntryVectors(entry, storedChunks);
      if (directVectors.length > 0) {
        hasStoredEmbedding = true;
        for (const vec of directVectors) {
          const sim = cosineSimilarity(queryEmbedding, vec);
          if (sim > semanticScore) semanticScore = sim;
        }
      } else if (linkedChunks.length > 0) {
        hasStoredEmbedding = true;
        for (const chunk of linkedChunks) {
          const sim = topSemanticChunkScores.get(chunk.managedObjectId) ?? 0;
          // Slightly discount indirect cross-linked CoreData chunk similarity
          const weighted = Number((sim * 0.88).toFixed(4));
          if (weighted > semanticScore) semanticScore = weighted;
        }
      }
    }

    const isExactMatch = exactScore > 0;
    const isSemanticMatch = hasStoredEmbedding && semanticScore >= MIN_SEMANTIC_SIMILARITY;

    // Fallback: if entry has no stored embedding, strictly rely on exact/keyword match
    if (!isExactMatch && !isSemanticMatch) continue;

    const matchKind: DiaryMatchKind =
      isExactMatch && isSemanticMatch ? 'both' : isExactMatch ? 'exact' : 'semantic';

    ranked.push({
      entry,
      meta: {
        entryId: entry.id,
        matchKind,
        exactScore: Number(exactScore.toFixed(4)),
        semanticScore: Number(semanticScore.toFixed(4)),
        usedFallbackKeywordOnly: !hasStoredEmbedding,
        matchedTokens: phraseMatch
          ? Array.from(new Set([rawQuery, ...matchedTokens]))
          : matchedTokens
      }
    });
  }

  // Exact matches MUST rank first, followed by semantic score, then recency
  ranked.sort((a, b) => {
    const aExactTier = a.meta.exactScore > 0 ? 1 : 0;
    const bExactTier = b.meta.exactScore > 0 ? 1 : 0;
    if (aExactTier !== bExactTier) return bExactTier - aExactTier;

    if (Math.abs(a.meta.exactScore - b.meta.exactScore) > 0.01) {
      return b.meta.exactScore - a.meta.exactScore;
    }
    if (Math.abs(a.meta.semanticScore - b.meta.semanticScore) > 0.01) {
      return b.meta.semanticScore - a.meta.semanticScore;
    }
    return b.entry.updatedIso.localeCompare(a.entry.updatedIso);
  });

  const hitMetaById: Record<string, DiarySearchHitMeta> = {};
  for (const item of ranked) {
    hitMetaById[item.entry.id] = item.meta;
  }

  return {
    entries: ranked.map((r) => r.entry),
    hitMetaById,
    matchedKeywords: Array.from(new Set([rawQuery, ...searchTerms].filter((t) => t.length >= 2)))
  };
}

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Splits text into plain and highlighted segments matching any active search keyword.
 */
export function splitHighlightSegments(
  text: string,
  keywords: readonly string[]
): HighlightSegment[] {
  if (!text) return [];
  const cleanKeywords = Array.from(
    new Set(
      keywords
        .map((k) => k.trim())
        .filter((k) => k.length >= 2)
    )
  ).sort((a, b) => b.length - a.length);

  if (cleanKeywords.length === 0) {
    return [{ text, highlighted: false }];
  }

  const escaped = cleanKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);
  if (parts.length <= 1) {
    return [{ text, highlighted: false }];
  }

  const lowerSet = new Set(cleanKeywords.map((k) => k.toLowerCase()));
  return parts
    .filter((p) => p.length > 0)
    .map((part) => ({
      text: part,
      highlighted: lowerSet.has(part.toLowerCase())
    }));
}
