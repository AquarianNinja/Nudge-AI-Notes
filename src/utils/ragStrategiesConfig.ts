import type { RagStrategyId } from '../types/index.ts';

export interface RagStrategyUserConfig {
  id: RagStrategyId;
  friendlyName: string;
  technicalName: string;
  whatItDoes: string;
  whenToUse: string;
  tradeOff: string;
}

export const RAG_STRATEGY_USER_CONFIG: RagStrategyUserConfig[] = [
  {
    id: 'hybrid-rrf',
    friendlyName: 'Smart Document Lookup',
    technicalName: 'Hybrid RAG (Dense + BM25 RRF)',
    whatItDoes:
      'Combines exact keyword matching with meaning-based search across your saved files to surface the most relevant passages.',
    whenToUse:
      'Everyday questions across office notes, policies, meeting logs, and product specs.',
    tradeOff: 'Fast speed · High balanced accuracy · Low cost'
  },
  {
    id: 'agentic',
    friendlyName: 'Step-by-Step Deep Check',
    technicalName: 'Agentic RAG (Decompose & Verify)',
    whatItDoes:
      'Splits a complex question into smaller sub-questions and double-checks multiple sources before putting together the answer.',
    whenToUse:
      'Multi-part research, cross-team comparisons, or thorough compliance and policy audits.',
    tradeOff: 'Slower speed · Very high accuracy · Medium cost'
  },
  {
    id: 'graph-rag',
    friendlyName: 'Connected Topics Search',
    technicalName: 'Graph RAG (Entity Neighborhood)',
    whatItDoes:
      'Follows links between related people, rules, systems, and concepts across your documents to uncover indirect connections.',
    whenToUse:
      'Tracing how one policy change, bug, or decision affects connected workflows and teams.',
    tradeOff: 'Medium speed · High cross-doc accuracy · Medium cost'
  },
  {
    id: 'corrective',
    friendlyName: 'Verified Answer + Web Backup',
    technicalName: 'Corrective RAG (CRAG + Cloud Fallback)',
    whatItDoes:
      'Checks how reliable your local files are first, then fetches live cloud web sources automatically if local results look weak.',
    whenToUse:
      'Time-sensitive checks or questions where your saved documents might not have the latest facts.',
    tradeOff: 'Medium speed · Highest coverage · Higher cost when web runs'
  },
  {
    id: 'multimodal',
    friendlyName: 'All-Media Search (Docs, Images & Audio)',
    technicalName: 'Multimodal RAG (Docs + Image + Audio)',
    whatItDoes:
      'Searches jointly across uploaded PDFs, text files, EPUBs, screenshots, photos, and audio transcripts in a single sweep.',
    whenToUse:
      'Any task involving uploaded screenshots, diagrams, voice notes, or recorded meetings.',
    tradeOff: 'Medium speed · High multimodal accuracy · Medium cost'
  }
];

export function getRagStrategyUserConfig(id: RagStrategyId): RagStrategyUserConfig {
  return RAG_STRATEGY_USER_CONFIG.find((c) => c.id === id) || RAG_STRATEGY_USER_CONFIG[0];
}
