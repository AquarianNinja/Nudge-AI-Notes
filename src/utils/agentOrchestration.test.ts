import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateResearchPlan,
  initializeAgentSteps,
  calculateConsensusScore,
  validateSparkpageCitations,
  formatStageDuration,
  deriveTimelineStatus,
  mapAgentStepsToTimelineStages
} from './agentOrchestration.ts';
import { SparkpageData, SparkpageCitation } from '../types/index.ts';

test('generateResearchPlan decomposes comparative and ClaimCenter queries appropriately', () => {
  const comparePlan = generateResearchPlan('ClaimCenter Cloud API vs Gosu');
  assert.equal(comparePlan.originalQuery, 'ClaimCenter Cloud API vs Gosu');
  assert.ok(comparePlan.subQueries.length >= 3);
  assert.ok(comparePlan.subQueries.some(q => q.includes('benchmarks')));
  assert.ok(comparePlan.subQueries.some(q => q.includes('differences')));

  const ccPlan = generateResearchPlan('Guidewire ClaimCenter Subrogation Triage');
  assert.ok(ccPlan.subQueries.some(q => q.includes('Gosu rules')));
  assert.ok(ccPlan.targetDomains.includes('docs.guidewire.com'));
});

test('initializeAgentSteps creates ordered 5-step agent execution pipeline', () => {
  const plan = generateResearchPlan('ClaimCenter FNOL Workflow');
  const steps = initializeAgentSteps(plan);

  assert.equal(steps.length, 5);
  assert.equal(steps[0].role, 'planner');
  assert.equal(steps[1].role, 'scout');
  assert.equal(steps[2].role, 'reader');
  assert.equal(steps[3].role, 'verifier');
  assert.equal(steps[4].role, 'synthesizer');
  assert.equal(steps[0].status, 'pending');
});

test('formatStageDuration formats milliseconds into single-decimal seconds', () => {
  assert.equal(formatStageDuration(0), '0.0s');
  assert.equal(formatStageDuration(-50), '0.0s');
  assert.equal(formatStageDuration(1420), '1.4s');
  assert.equal(formatStageDuration(4800), '4.8s');
});

test('deriveTimelineStatus handles pending, mixed running, completed, and failed states', () => {
  const plan = generateResearchPlan('ClaimCenter Cloud API');
  const steps = initializeAgentSteps(plan).slice(0, 2);

  assert.equal(deriveTimelineStatus(steps), 'pending');

  steps[0].status = 'completed';
  assert.equal(deriveTimelineStatus(steps), 'running');

  steps[1].status = 'completed';
  assert.equal(deriveTimelineStatus(steps), 'completed');

  steps[1].status = 'failed';
  assert.equal(deriveTimelineStatus(steps), 'failed');
});

test('mapAgentStepsToTimelineStages maps 5 pipeline steps into Search, Synthesis, and Drafting', () => {
  const plan = generateResearchPlan('ClaimCenter Cloud API vs Gosu');
  const steps = initializeAgentSteps(plan);
  steps[0].status = 'completed';
  steps[0].latencyMs = 500;
  steps[1].status = 'running';
  steps[1].latencyMs = 900;

  const stages = mapAgentStepsToTimelineStages(steps, {
    search: { sourceCount: 24 },
    synthesis: { elapsedMs: 0, sourceCount: 0 },
    drafting: { elapsedMs: 0, sourceCount: 0 }
  });

  assert.equal(stages.length, 3);
  assert.equal(stages[0].label, 'Search');
  assert.equal(stages[0].status, 'running');
  assert.equal(stages[0].subSteps.length, 2);
  assert.equal(stages[0].telemetry.elapsedMs, 1400);
  assert.equal(stages[0].telemetry.sourceCount, 24);

  assert.equal(stages[1].label, 'Synthesis');
  assert.equal(stages[1].status, 'pending');
  assert.equal(stages[1].subSteps.length, 2);

  assert.equal(stages[2].label, 'Drafting');
  assert.equal(stages[2].status, 'pending');
  assert.equal(stages[2].subSteps.length, 1);
});

test('calculateConsensusScore weights reliability and domain diversity', () => {
  const citations: SparkpageCitation[] = [
    {
      id: 1,
      title: 'Guidewire ClaimCenter Cloud API Guide',
      url: 'https://docs.guidewire.com/cloud/cc/latest/apiref/',
      snippet: 'FNOL JSON:API endpoints',
      domain: 'docs.guidewire.com',
      crawlTimestamp: '2026-11-05',
      reliabilityScore: 95
    },
    {
      id: 2,
      title: 'Guidewire Integration Patterns',
      url: 'https://developer.guidewire.com/integration-patterns',
      snippet: 'App Events webhook delivery',
      domain: 'developer.guidewire.com',
      crawlTimestamp: '2026-11-05',
      reliabilityScore: 92
    }
  ];

  const score = calculateConsensusScore(citations);
  assert.ok(score >= 90 && score <= 99, `Score should be between 90 and 99, got ${score}`);
});

test('validateSparkpageCitations catches dangling or missing citations', () => {
  const mockSparkpage: SparkpageData = {
    id: 'sp-1',
    query: 'Test',
    title: 'Test Sparkpage',
    subtitle: 'Subtitle',
    generatedDate: '2026-11-05',
    consensusScore: 94,
    agentExecutionTimeSec: 4.2,
    sourcesScannedCount: 24,
    sections: [
      {
        id: 's1',
        title: 'Section 1',
        summary: 'Summary',
        content: 'Content here',
        citations: [1, 2, 99]
      }
    ],
    citations: [
      {
        id: 1,
        title: 'Source 1',
        url: 'https://docs.guidewire.com/1',
        snippet: 'Snippet 1',
        domain: 'docs.guidewire.com',
        crawlTimestamp: '2026-11-05',
        reliabilityScore: 90
      },
      {
        id: 2,
        title: 'Source 2',
        url: 'https://developer.guidewire.com/2',
        snippet: 'Snippet 2',
        domain: 'developer.guidewire.com',
        crawlTimestamp: '2026-11-05',
        reliabilityScore: 85
      }
    ],
    keyTakeaways: ['Key takeaway']
  };

  const validation = validateSparkpageCitations(mockSparkpage);
  assert.equal(validation.isValid, false);
  assert.deepEqual(validation.missingIds, [99]);
});

test('getStageForStepIndex, advancePipelineStep, and buildCompletedPipelineSnapshot manage 5-step telemetry', async () => {
  const {
    getStageForStepIndex,
    advancePipelineStep,
    buildCompletedPipelineSnapshot,
    INITIAL_COMPLETED_TELEMETRY
  } = await import('./agentOrchestration.ts');

  assert.equal(getStageForStepIndex(0), 'search');
  assert.equal(getStageForStepIndex(1), 'search');
  assert.equal(getStageForStepIndex(2), 'synthesis');
  assert.equal(getStageForStepIndex(3), 'synthesis');
  assert.equal(getStageForStepIndex(4), 'drafting');

  const plan = generateResearchPlan('ClaimCenter PolicyCenter Sync');
  const initial = initializeAgentSteps(plan);
  const midRun = advancePipelineStep(initial, 2, 350);
  assert.equal(midRun[0].status, 'completed');
  assert.equal(midRun[1].status, 'completed');
  assert.equal(midRun[2].status, 'running');
  assert.equal(midRun[3].status, 'pending');
  assert.equal(midRun[4].status, 'pending');

  const snapshot = buildCompletedPipelineSnapshot(
    'ClaimCenter Cloud API vs Gosu',
    INITIAL_COMPLETED_TELEMETRY
  );
  assert.equal(snapshot.steps.length, 5);
  assert.ok(snapshot.steps.every(s => s.status === 'completed'));
  const stages = mapAgentStepsToTimelineStages(snapshot.steps, snapshot.telemetry);
  assert.equal(stages[0].telemetry.sourceCount, 24);
  assert.equal(stages[1].telemetry.sourceCount, 18);
  assert.equal(stages[2].telemetry.sourceCount, 5);
});
