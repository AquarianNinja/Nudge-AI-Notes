import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HAPTIC_CONFIG,
  HAPTIC_PATTERNS,
  HAPTIC_PROFILES,
  computeHapticPattern,
  configureHaptics,
  getHapticCategory,
  getHapticsConfig,
  isHapticsEnabled,
  resolveInteractiveHapticKind,
  setHapticsEnabled,
  triggerHaptic
} from './haptics.ts';

test('triggerHaptic dispatches pattern via vibrateFn when enabled and respects disabled state', () => {
  const received: Array<number | number[]> = [];
  configureHaptics(DEFAULT_HAPTIC_CONFIG);
  setHapticsEnabled(true);
  assert.equal(isHapticsEnabled(), true);

  const res1 = triggerHaptic('success', {
    vibrateFn: (p) => {
      received.push(p);
      return true;
    }
  });
  assert.equal(res1.triggered, true);
  assert.deepEqual(res1.pattern, HAPTIC_PATTERNS.success);
  assert.deepEqual(received[0], HAPTIC_PATTERNS.success);

  setHapticsEnabled(false);
  const res2 = triggerHaptic('medium', {
    vibrateFn: (p) => {
      received.push(p);
      return true;
    }
  });
  assert.equal(res2.triggered, false);
  assert.equal(res2.blockedReason, 'disabled');
  assert.equal(received.length, 1);

  configureHaptics(DEFAULT_HAPTIC_CONFIG);
});

test('haptic profiles, intensity multipliers, and category toggles produce expected patterns and gating', () => {
  assert.equal(HAPTIC_PROFILES.length, 5);
  assert.equal(getHapticCategory('selection'), 'navigation');
  assert.equal(getHapticCategory('light'), 'taps');
  assert.equal(getHapticCategory('medium'), 'taps');
  assert.equal(getHapticCategory('heavy'), 'taps');
  assert.equal(getHapticCategory('success'), 'outcomes');
  assert.equal(getHapticCategory('warning'), 'alerts');

  const gentleCrisp = computeHapticPattern('medium', 'crisp', 'gentle');
  const strongExpressive = computeHapticPattern('medium', 'expressive', 'strong');
  assert.ok(strongExpressive[0] > gentleCrisp[0]);

  const mechanicalSuccess = computeHapticPattern('success', 'mechanical', 'balanced');
  assert.deepEqual(mechanicalSuccess, [14, 24, 24]);

  configureHaptics({
    enabled: true,
    profile: 'rhythmic',
    intensity: 'strong',
    categories: { navigation: false, taps: true, outcomes: true, alerts: true }
  });
  assert.equal(getHapticsConfig().profile, 'rhythmic');

  const mutedSelection = triggerHaptic('selection', { vibrateFn: () => true });
  assert.equal(mutedSelection.triggered, false);
  assert.equal(mutedSelection.blockedReason, 'category-muted');

  const activeOutcome = triggerHaptic('success', { vibrateFn: () => true });
  assert.equal(activeOutcome.triggered, true);
  assert.equal(activeOutcome.profile, 'rhythmic');
  assert.equal(activeOutcome.intensity, 'strong');
  assert.deepEqual(activeOutcome.pattern, computeHapticPattern('success', 'rhythmic', 'strong'));

  configureHaptics(DEFAULT_HAPTIC_CONFIG);
});

test('resolveInteractiveHapticKind maps tabs, switches, explicit attributes, and disabled controls cleanly', () => {
  const makeNode = (opts: {
    tagName?: string;
    attrs?: Record<string, string>;
    disabled?: boolean;
  }) => {
    const node = {
      tagName: opts.tagName || 'BUTTON',
      hasAttribute: (k: string) => Boolean(opts.disabled && k === 'disabled'),
      getAttribute: (k: string) => opts.attrs?.[k] ?? null,
      dataset: opts.attrs?.['data-haptic'] ? { haptic: opts.attrs['data-haptic'] } : {},
      closest: () => node
    };
    return node;
  };

  assert.equal(resolveInteractiveHapticKind(makeNode({ attrs: { role: 'tab' } })), 'selection');
  assert.equal(resolveInteractiveHapticKind(makeNode({ attrs: { role: 'switch' } })), 'selection');
  assert.equal(resolveInteractiveHapticKind(makeNode({ tagName: 'SELECT' })), 'selection');
  assert.equal(
    resolveInteractiveHapticKind(makeNode({ tagName: 'INPUT', attrs: { type: 'checkbox' } })),
    'selection'
  );
  assert.equal(
    resolveInteractiveHapticKind(makeNode({ tagName: 'INPUT', attrs: { type: 'radio' } })),
    'selection'
  );
  assert.equal(
    resolveInteractiveHapticKind(makeNode({ tagName: 'INPUT', attrs: { type: 'range' } })),
    'selection'
  );
  assert.equal(
    resolveInteractiveHapticKind(makeNode({ attrs: { 'data-haptic': 'heavy' } })),
    'heavy'
  );
  assert.equal(
    resolveInteractiveHapticKind(makeNode({ attrs: { 'data-haptic': 'off' } })),
    null
  );
  assert.equal(resolveInteractiveHapticKind(makeNode({ disabled: true })), null);
  assert.equal(resolveInteractiveHapticKind(makeNode({})), 'light');
});
