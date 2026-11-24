/**
 * Multi-agent web research pipeline logic.
 * Decomposes queries, dispatches agent stages, calculates consensus confidence,
 * and formats structured Sparkpages.
 */

import {
  AgentRole,
  AgentStep,
  SparkpageData,
  SparkpageCitation,
  StageTelemetryMap,
  TimelineStage,
  TimelineStageId,
  TimelineStageStatus,
  TimelineStageTelemetry
} from '../types/index.ts';

export interface ResearchPlan {
  originalQuery: string;
  subQueries: string[];
  targetDomains: string[];
  searchDepth: 'standard' | 'deep' | 'exhaustive';
}

/**
 * Planner Agent: Decomposes a user query into orthogonal research vectors
 */
export function generateResearchPlan(query: string): ResearchPlan {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  const subQueries: string[] = [];
  const targetDomains: string[] = [
    'docs.guidewire.com',
    'developer.guidewire.com',
    'community.guidewire.com',
    'github.com'
  ];

  if (lower.includes('vs') || lower.includes('compare') || lower.includes('better')) {
    subQueries.push(`${trimmed} architectural differences`);
    subQueries.push(`${trimmed} performance benchmarks and latency`);
    subQueries.push(`${trimmed} upgrade isolation and integration trade-offs`);
  } else if (
    lower.includes('claimcenter') ||
    lower.includes('guidewire') ||
    lower.includes('fnol') ||
    lower.includes('subrogation') ||
    lower.includes('policycenter') ||
    lower.includes('gosu')
  ) {
    subQueries.push(`${trimmed} ClaimCenter data model & API contracts`);
    subQueries.push(`${trimmed} Gosu rules, reserves & validation hooks`);
    subQueries.push(`${trimmed} PolicyCenter & BillingCenter event sync`);
  } else {
    subQueries.push(`${trimmed} technical architecture`);
    subQueries.push(`${trimmed} constraints and edge cases`);
    subQueries.push(`${trimmed} production patterns`);
  }

  return {
    originalQuery: trimmed,
    subQueries,
    targetDomains,
    searchDepth: 'deep'
  };
}

export const EMPTY_STAGE_TELEMETRY: StageTelemetryMap = {
  search: { elapsedMs: 0, sourceCount: 0, sourceLabel: 'sources' },
  synthesis: { elapsedMs: 0, sourceCount: 0, sourceLabel: 'verified' },
  drafting: { elapsedMs: 0, sourceCount: 0, sourceLabel: 'citations' }
};

export const INITIAL_COMPLETED_TELEMETRY: StageTelemetryMap = {
  search: { elapsedMs: 1600, sourceCount: 24, sourceLabel: 'sources' },
  synthesis: { elapsedMs: 2100, sourceCount: 18, sourceLabel: 'verified' },
  drafting: { elapsedMs: 1100, sourceCount: 5, sourceLabel: 'citations' }
};

/**
 * Initializes the default 5-step agent execution pipeline
 */
export function initializeAgentSteps(plan: ResearchPlan): AgentStep[] {
  return [
    {
      id: 'step-planner',
      role: 'planner',
      title: 'Planner',
      status: 'pending',
      detail: `${plan.subQueries.length} query vectors`,
      dataOutput: plan.subQueries
    },
    {
      id: 'step-scout',
      role: 'scout',
      title: 'WebScout',
      status: 'pending',
      detail: `Parallel crawl across ${plan.targetDomains.length} domains`,
      dataOutput: plan.targetDomains.map(d => `${d} · indexed`)
    },
    {
      id: 'step-reader',
      role: 'reader',
      title: 'DeepReader',
      status: 'pending',
      detail: 'DOM extraction & markdown cleanup',
      dataOutput: [
        'JSON:API schema & FNOL endpoint contracts',
        'TransactionSet pre-update Gosu hook specs'
      ]
    },
    {
      id: 'step-verifier',
      role: 'verifier',
      title: 'Verifier',
      status: 'pending',
      detail: 'Cross-source claim validation',
      dataOutput: [
        'Verified Claim API authority boundary',
        'Cross-checked PolicyCenter snapshot SLA'
      ]
    },
    {
      id: 'step-synthesizer',
      role: 'synthesizer',
      title: 'Synthesizer',
      status: 'pending',
      detail: 'Structured Sparkpage compilation',
      dataOutput: [
        'Compiled architecture summary & trade-offs',
        'Bound inline source citations [1..5]'
      ]
    }
  ];
}

/**
 * Maps a 0..4 sub-step index from the 5-step pipeline to its 3-stage stepper bucket
 */
export function getStageForStepIndex(stepIndex: number): TimelineStageId {
  if (stepIndex <= 1) return 'search';
  if (stepIndex <= 3) return 'synthesis';
  return 'drafting';
}

/**
 * Advances the 5-step pipeline cleanly to a specific active step index
 */
export function advancePipelineStep(
  steps: AgentStep[],
  activeStepIndex: number,
  defaultLatencyMs = 450
): AgentStep[] {
  return steps.map((step, idx) => {
    if (idx < activeStepIndex) {
      return {
        ...step,
        status: 'completed',
        latencyMs: step.latencyMs || defaultLatencyMs
      };
    }
    if (idx === activeStepIndex) {
      return {
        ...step,
        status: 'running'
      };
    }
    return {
      ...step,
      status: 'pending'
    };
  });
}

/**
 * Builds a completed 5-step + 3-stage telemetry snapshot for an existing Sparkpage
 */
export function buildCompletedPipelineSnapshot(
  query: string,
  telemetry: StageTelemetryMap = INITIAL_COMPLETED_TELEMETRY
): { steps: AgentStep[]; telemetry: StageTelemetryMap } {
  const plan = generateResearchPlan(query);
  const searchSplit = Math.round(telemetry.search.elapsedMs * 0.38);
  const scoutSplit = telemetry.search.elapsedMs - searchSplit;
  const readerSplit = Math.round(telemetry.synthesis.elapsedMs * 0.52);
  const verifierSplit = telemetry.synthesis.elapsedMs - readerSplit;
  const synthLatencies = [
    searchSplit,
    scoutSplit,
    readerSplit,
    verifierSplit,
    telemetry.drafting.elapsedMs
  ];

  const steps = initializeAgentSteps(plan).map((step, idx) => ({
    ...step,
    status: 'completed' as const,
    latencyMs: synthLatencies[idx] ?? 500
  }));

  return { steps, telemetry };
}

/**
 * Formats millisecond duration into a compact tabular second display (e.g. "1.4s")
 */
export function formatStageDuration(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return '0.0s';
  const seconds = elapsedMs / 1000;
  return `${seconds.toFixed(1)}s`;
}

/**
 * Derives aggregate status for a stage from its child agent steps
 */
export function deriveTimelineStatus(steps: AgentStep[]): TimelineStageStatus {
  if (steps.length === 0) return 'pending';
  if (steps.some(s => s.status === 'failed')) return 'failed';
  if (steps.every(s => s.status === 'completed')) return 'completed';
  if (steps.some(s => s.status === 'running')) return 'running';
  if (steps.some(s => s.status === 'completed') && steps.some(s => s.status === 'pending')) {
    return 'running';
  }
  return 'pending';
}

/**
 * Maps the 5-step multi-agent pipeline into 3 high-level progress-stepper stages:
 * 01 Search (planner + scout), 02 Synthesis (reader + verifier), 03 Drafting (synthesizer)
 */
export function mapAgentStepsToTimelineStages(
  steps: AgentStep[],
  telemetryOverrides?: Partial<Record<TimelineStageId, Partial<TimelineStageTelemetry>>>
): TimelineStage[] {
  const byRole = (roles: AgentRole[]) => steps.filter(s => roles.includes(s.role));

  const searchSteps = byRole(['planner', 'scout']);
  const synthesisSteps = byRole(['reader', 'verifier']);
  const draftingSteps = byRole(['synthesizer']);

  const sumStepLatency = (group: AgentStep[]) =>
    group.reduce((total, s) => total + (s.latencyMs || 0), 0);

  const buildTelemetry = (
    stageId: TimelineStageId,
    group: AgentStep[],
    defaultLabel: string
  ): TimelineStageTelemetry => {
    const override = telemetryOverrides?.[stageId];
    const elapsedMs = override?.elapsedMs ?? sumStepLatency(group);
    const sourceCount = override?.sourceCount ?? 0;
    const sourceLabel = override?.sourceLabel ?? defaultLabel;
    return { elapsedMs, sourceCount, sourceLabel };
  };

  return [
    {
      id: 'search',
      indexLabel: '01',
      label: 'Search',
      description: 'Decompose query vectors and discover Guidewire & technical sources',
      status: deriveTimelineStatus(searchSteps),
      telemetry: buildTelemetry('search', searchSteps, 'sources'),
      subSteps: searchSteps
    },
    {
      id: 'synthesis',
      indexLabel: '02',
      label: 'Synthesis',
      description: 'Extract passages and verify API & rule consistency',
      status: deriveTimelineStatus(synthesisSteps),
      telemetry: buildTelemetry('synthesis', synthesisSteps, 'verified'),
      subSteps: synthesisSteps
    },
    {
      id: 'drafting',
      indexLabel: '03',
      label: 'Drafting',
      description: 'Compile concise summary, comparison matrix, and citations',
      status: deriveTimelineStatus(draftingSteps),
      telemetry: buildTelemetry('drafting', draftingSteps, 'citations'),
      subSteps: draftingSteps
    }
  ];
}

/**
 * Calculates weighted consensus confidence score from citations
 */
export function calculateConsensusScore(citations: SparkpageCitation[]): number {
  if (!citations || citations.length === 0) return 0;
  const total = citations.reduce((acc, c) => acc + (c.reliabilityScore || 70), 0);
  const average = total / citations.length;
  const uniqueDomains = new Set(citations.map(c => c.domain)).size;
  const diversityBonus = Math.min(5, uniqueDomains * 1.2);
  return Math.min(99, Math.round(average + diversityBonus));
}

/**
 * Validates that all citations referenced in sections exist in the citation registry
 */
export function validateSparkpageCitations(sparkpage: SparkpageData): { isValid: boolean; missingIds: number[] } {
  const registeredIds = new Set(sparkpage.citations.map(c => c.id));
  const missingIds: number[] = [];

  sparkpage.sections.forEach(section => {
    section.citations.forEach(id => {
      if (!registeredIds.has(id) && !missingIds.includes(id)) {
        missingIds.push(id);
      }
    });
  });

  return {
    isValid: missingIds.length === 0,
    missingIds
  };
}
