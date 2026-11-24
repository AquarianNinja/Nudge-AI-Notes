export interface WhitepaperSection {
  id: string;
  title: string;
  subtitle: string;
  readTime: string;
  content: string;
  codeSnippet?: {
    filename: string;
    language: string;
    code: string;
  };
  keyTakeaways?: string[];
}

export const WHITEPAPER_SECTIONS: WhitepaperSection[] = [
  {
    id: 'overview',
    title: '1. Tri-Hybrid Architecture',
    subtitle: 'Local MLX inference, SQLite RAG, and ClaimCenter agentic research',
    readTime: '2m',
    content:
      `Nudge AI Notes separates sensitive ClaimCenter workloads from live documentation search:\n\n` +
      `• Local Core (MLX Swift): Runs quantized models on-device with zero network egress for private adjuster notes and claim summaries.\n` +
      `• Grounded Vault (sqlite-vec): Indexes ClaimCenter Cloud API specs, Gosu rules, and PolicyCenter contracts locally.\n` +
      `• Research Fleet: Dispatches parallel web agents to synthesize Guidewire Cloud release updates into structured Sparkpages.`,
    keyTakeaways: [
      'Private claim context stays on-device via MLX and sqlite-vec.',
      'Public Guidewire Cloud documentation is fetched via parallel research agents.'
    ]
  },
  {
    id: 'multi-agent',
    title: '2. Multi-Agent Research',
    subtitle: 'Search, Synthesis, and Drafting pipeline for ClaimCenter topics',
    readTime: '3m',
    content:
      `The research fleet executes a three-stage pipeline mapped from five sub-agents:\n\n` +
      `1. Search (Planner + WebScout): Decomposes ClaimCenter queries (e.g., Cloud API vs. Gosu plugins) across official docs.\n` +
      `2. Synthesis (DeepReader + Verifier): Extracts clean passages and checks consensus across API versions.\n` +
      `3. Drafting (Synthesizer): Outputs structured comparison tables and verified citations.`,
    codeSnippet: {
      filename: 'ClaimResearchAgent.swift',
      language: 'swift',
      code: `actor ClaimResearchAgent {
    func run(query: String) async throws -> SparkpageAST {
        let vectors = ["\\(query) Cloud API", "\\(query) Gosu rules", "\\(query) PolicyCenter sync"]
        let sources = try await scoutParallel(vectors)
        let verified = try await verifyConsensus(sources)
        return try await draftSparkpage(verified)
    }
}`
    },
    keyTakeaways: [
      'Maps 5 granular sub-agents into Search, Synthesis, and Drafting stages.',
      'Enforces citation verification before rendering Sparkpage sections.'
    ]
  },
  {
    id: 'rag-audio',
    title: '3. Local RAG & Audio',
    subtitle: 'sqlite-vec retrieval and dual-host AVSpeech synthesis',
    readTime: '3m',
    content:
      `ClaimCenter specs and carrier runbooks are chunked and embedded locally with CoreML into sqlite-vec (<15 MB RAM overhead).\n\n` +
      `Audio Overviews convert retrieved chunks into a concise Alex/Maya dialogue using either Apple AVSpeechSynthesizer offline or a zero-retention cloud TTS stream.`,
    codeSnippet: {
      filename: 'VectorVault.swift',
      language: 'swift',
      code: `final class VectorVault {
    func queryClaimSpecs(embedding: [Float], limit: Int = 5) throws -> [String] {
        // SIMD cosine similarity via sqlite-vec over ClaimCenter docs
        return []
    }
}`
    },
    keyTakeaways: [
      'Sub-5ms local lookup across indexed FNOL and Gosu specs.',
      'Dual-host audio runs completely offline via AVSpeechSynthesizer.'
    ]
  },
  {
    id: 'memory-limits',
    title: '4. iOS Memory Budget',
    subtitle: 'Fitting 4-bit models and ClaimCenter RAG inside 5.5 GB Jetsam ceiling',
    readTime: '2m',
    content:
      `On an 8 GB iPhone 15 Pro, iOS grants ~5.5 GB of dirty memory before triggering Jetsam SIGKILL:\n\n` +
      `• 4-bit 8B Weights (mmap): 3.9 GB\n` +
      `• 4k Rotating KV Cache: 0.5 GB\n` +
      `• sqlite-vec + CoreML Embedder: 0.15 GB\n` +
      `• Headroom: ~0.6 GB safe margin`,
    keyTakeaways: [
      'POSIX mmap avoids duplicating model weights in dirty heap memory.',
      'Rotating KV cache caps attention memory at 512 MB.'
    ]
  }
];
