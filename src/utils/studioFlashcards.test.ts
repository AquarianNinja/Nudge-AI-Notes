import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_DICTIONARY_ENTRIES } from '../data/mockData.ts';
import { INITIAL_MEETING_SESSION } from './meetingNotes.ts';
import { generateFlashcardsFromSession } from './studioFlashcards.ts';

test('generateFlashcardsFromSession synthesizes deduplicated summary, decision/action/risk, glossary, and highlight cards', () => {
  const cards = generateFlashcardsFromSession(INITIAL_MEETING_SESSION, INITIAL_DICTIONARY_ENTRIES);

  assert.ok(cards.length >= 4);
  const categories = new Set(cards.map((c) => c.deckCategory));
  assert.ok(categories.has('Highlight'));
  assert.ok(categories.has('Decision') || categories.has('Action') || categories.has('Risk'));

  const fronts = cards.map((c) => c.front.trim().toLowerCase());
  assert.equal(new Set(fronts).size, fronts.length);
  for (const card of cards) {
    assert.ok(card.front.length > 0);
    assert.ok(card.back.length > 0);
    assert.ok(card.sourceRef.length > 0);
  }
});
