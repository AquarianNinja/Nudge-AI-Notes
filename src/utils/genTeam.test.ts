import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENTEAM_BRAND_COLORS,
  INITIAL_GENTEAM_AGENTS,
  INITIAL_GENTEAM_CHANNELS,
  INITIAL_GENTEAM_TASKS,
  createGenTeamAgent,
  generateAgentCollaborationReplies,
  getAgentInitials,
  getNextTaskStatus,
  parseMentionedAgentIds,
  resolveRespondingAgentIds
} from './genTeam.ts';

test('GenTeam brand palette uses official #000000 / #FFFFFF / #0F7FFF and seeds Claude, Gemini, WisprFlow AI, Grok Bot', () => {
  assert.equal(GENTEAM_BRAND_COLORS.primaryBlack, '#000000');
  assert.equal(GENTEAM_BRAND_COLORS.primaryWhite, '#FFFFFF');
  assert.equal(GENTEAM_BRAND_COLORS.accentBlue, '#0F7FFF');

  const names = INITIAL_GENTEAM_AGENTS.map(a => a.name);
  assert.ok(names.includes('Claude'));
  assert.ok(names.includes('Gemini'));
  assert.ok(names.includes('WisprFlow AI'));
  assert.ok(names.includes('Grok Bot'));
  assert.equal(getAgentInitials('WisprFlow AI'), 'WA');
  assert.equal(getAgentInitials('Claude'), 'CL');
});

test('createGenTeamAgent normalizes unique @handles and provisions matching 1:1 DM channel', () => {
  const created = createGenTeamAgent(
    {
      name: 'Claude',
      handle: 'claude',
      vendor: 'claude',
      modelName: 'Claude 3.7 Sonnet',
      roleTitle: 'Security Reviewer',
      accent: 'amber',
      executionMode: 'local-cli'
    },
    INITIAL_GENTEAM_AGENTS
  );

  assert.equal(created.agent.handle, '@claude2');
  assert.equal(created.agent.executionMode, 'local-cli');
  assert.equal(created.dmChannel.kind, 'dm');
  assert.equal(created.dmChannel.dmAgentId, created.agent.id);
});

test('parseMentionedAgentIds and resolveRespondingAgentIds route @mentions and @team cleanly', () => {
  const explicit = parseMentionedAgentIds(
    'Ask @wisprflow and @grok to inspect this.',
    INITIAL_GENTEAM_AGENTS
  );
  assert.deepEqual(explicit, ['agent-wisprflow', 'agent-grok']);

  const allTeam = parseMentionedAgentIds('@team sync status', INITIAL_GENTEAM_AGENTS);
  assert.equal(allTeam.length, INITIAL_GENTEAM_AGENTS.length);

  const dmChannel = INITIAL_GENTEAM_CHANNELS.find(c => c.id === 'dm-agent-gemini')!;
  const dmTargets = resolveRespondingAgentIds('Summarize PDF notes', dmChannel, INITIAL_GENTEAM_AGENTS);
  assert.deepEqual(dmTargets, ['agent-gemini']);
});

test('generateAgentCollaborationReplies builds multi-agent responses with @mention handoffs', () => {
  const channel = INITIAL_GENTEAM_CHANNELS[0];
  const replies = generateAgentCollaborationReplies({
    prompt: 'Audit FNOL webhook retries @claude @gemini',
    channel,
    agents: INITIAL_GENTEAM_AGENTS,
    targetAgentIds: ['agent-claude', 'agent-gemini'],
    timestamp: '10:30 AM'
  });

  assert.equal(replies.length, 2);
  assert.equal(replies[0].senderName, 'Claude');
  assert.equal(replies[0].handoffToAgentId, 'agent-gemini');
  assert.ok(replies[0].content.includes('@gemini'));
  assert.equal(replies[1].senderName, 'Gemini');
  assert.equal(replies[1].handoffToAgentId, undefined);
});

test('Kanban task progression cycles todo -> in-progress -> in-review -> done -> todo', () => {
  assert.ok(INITIAL_GENTEAM_TASKS.length >= 4);
  assert.equal(getNextTaskStatus('todo'), 'in-progress');
  assert.equal(getNextTaskStatus('in-progress'), 'in-review');
  assert.equal(getNextTaskStatus('in-review'), 'done');
  assert.equal(getNextTaskStatus('done'), 'todo');
});
