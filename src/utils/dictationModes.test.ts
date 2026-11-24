import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DICTATION_MODES,
  applyDeterministicOfflineCleanup,
  applySpokenTriggerAndFormat,
  buildOfflineTranslationFallbackNote
} from './dictationModes.ts';

test('applySpokenTriggerAndFormat activates matching mode and strips trigger prefix', () => {
  const defaultMode = DEFAULT_DICTATION_MODES[0];

  const translateMatch = applySpokenTriggerAndFormat(
    'translate: ship ClaimCenter telemetry today',
    DEFAULT_DICTATION_MODES,
    defaultMode
  );
  assert.equal(translateMatch.triggeredByVoice, true);
  assert.equal(translateMatch.matchedMode.id, 'translate-ab');
  assert.equal(translateMatch.cleanedInput, 'ship ClaimCenter telemetry today');

  const emailMatch = applySpokenTriggerAndFormat(
    'Email note, finalize reserve ceiling before Friday',
    DEFAULT_DICTATION_MODES,
    defaultMode
  );
  assert.equal(emailMatch.triggeredByVoice, true);
  assert.equal(emailMatch.matchedMode.id, 'email-memo');
  assert.equal(emailMatch.cleanedInput, 'finalize reserve ceiling before Friday');

  const unmatched = applySpokenTriggerAndFormat(
    'Regular dictation without trigger phrase',
    DEFAULT_DICTATION_MODES,
    defaultMode
  );
  assert.equal(unmatched.triggeredByVoice, false);
  assert.equal(unmatched.matchedMode.id, defaultMode.id);
});

test('applyDeterministicOfflineCleanup strips hesitation fillers and formats memos', () => {
  const cleanMode = DEFAULT_DICTATION_MODES[0];
  const emailMode = DEFAULT_DICTATION_MODES[1];
  const techMode = DEFAULT_DICTATION_MODES[3];

  const cleaned = applyDeterministicOfflineCleanup(
    'um we need to uh ship ClaimCenter telemetry today',
    cleanMode,
    true
  );
  assert.equal(cleaned, 'We need to ship ClaimCenter telemetry today.');

  const tech = applyDeterministicOfflineCleanup('uh git push origin main', techMode, true);
  assert.equal(tech, 'Git push origin main');

  const memo = applyDeterministicOfflineCleanup(
    'first we lock local-only firewall rules. second we validate all dictation modes end to end on web.',
    emailMode,
    true
  );
  assert.match(memo, /\n\n• /);
});

test('buildOfflineTranslationFallbackNote clearly tags blocked cloud A->B fallback', () => {
  const note = buildOfflineTranslationFallbackNote({
    cleanedText: 'Ship telemetry today.',
    sourceLang: 'English (US)',
    targetLang: 'Spanish',
    localOnlyBlocked: true
  });
  assert.match(note, /Local-Only blocks cloud A→B translation to Spanish/);
});
