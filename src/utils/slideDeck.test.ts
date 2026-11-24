import test from 'node:test';
import assert from 'node:assert/strict';
import { exportSlideDeckToMarkdown, generateSlideDeckFromContext } from './slideDeck.ts';
import { DEFAULT_APP_SETTINGS, SAMPLE_DOCUMENTS } from '../data/mockData.ts';
import { INITIAL_MEETING_SESSION } from './meetingNotes.ts';

test('generateSlideDeckFromContext builds structured ClaimCenter deck from meeting session', () => {
  const deck = generateSlideDeckFromContext({
    topic: '',
    sourceType: 'meeting',
    audience: 'Architecture Review',
    slideCount: 6,
    meetingSession: INITIAL_MEETING_SESSION,
    settings: DEFAULT_APP_SETTINGS
  });

  assert.equal(deck.slides.length, 6);
  assert.equal(deck.title, INITIAL_MEETING_SESSION.title);
  assert.equal(deck.approach, 'cloud');
  assert.ok(deck.slides[1].bullets.some(b => b.includes('Cloud API v10')));
});

test('generateSlideDeckFromContext attributes hybrid cloud model and exports markdown', () => {
  const settings = {
    ...DEFAULT_APP_SETTINGS,
    apiKeys: { ...DEFAULT_APP_SETTINGS.apiKeys, anthropic: 'sk-ant-validkey123' },
    activityRoutes: {
      ...DEFAULT_APP_SETTINGS.activityRoutes,
      slideDeck: { approach: 'hybrid' as const, modelId: 'claude-sonnet-4-slides' }
    }
  };

  const deck = generateSlideDeckFromContext({
    topic: 'ClaimCenter Subrogation Triage Rollout',
    sourceType: 'vault',
    audience: 'Executive Brief',
    slideCount: 5,
    documents: SAMPLE_DOCUMENTS,
    settings
  });

  assert.equal(deck.slides.length, 5);
  assert.equal(deck.approach, 'hybrid');
  assert.equal(deck.modelName, 'Claude Sonnet 4');

  const md = exportSlideDeckToMarkdown(deck);
  assert.match(md, /# ClaimCenter Subrogation Triage Rollout/);
  assert.match(md, /## Slide 1:/);
  assert.match(md, /Speaker Notes:/);
});
