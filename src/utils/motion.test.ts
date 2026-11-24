import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTION_DURATIONS,
  MOTION_INTENSITY_OPTIONS,
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  buildListItemVariants,
  buildScreenVariants,
  buildTabVariants,
  buildTimelineStepVariants,
  getMotionConfigProps,
  getStaggerDelay,
  getTabTransitionDirection,
  shouldDismissSheet
} from './motion.ts';

test('motion duration tiers stay within specified bounds', () => {
  assert.ok(MOTION_DURATIONS.microFast >= 0.1 && MOTION_DURATIONS.microFast <= 0.2);
  assert.ok(MOTION_DURATIONS.micro >= 0.1 && MOTION_DURATIONS.micro <= 0.2);
  assert.ok(MOTION_DURATIONS.element >= 0.25 && MOTION_DURATIONS.element <= 0.35);
  assert.ok(MOTION_DURATIONS.elementExit >= 0.25 && MOTION_DURATIONS.elementExit <= 0.35);
  assert.ok(MOTION_DURATIONS.screen >= 0.3 && MOTION_DURATIONS.screen <= 0.45);
  assert.ok(MOTION_DURATIONS.screenExit >= 0.3 && MOTION_DURATIONS.screenExit <= 0.45);
});

test('tap scales and stagger steps satisfy system rules', () => {
  assert.ok(MOTION_OFFSETS.tapScale >= 0.96 && MOTION_OFFSETS.tapScale <= 0.98);
  assert.ok(MOTION_OFFSETS.cardTapScale >= 0.96 && MOTION_OFFSETS.cardTapScale <= 0.98);
  assert.ok(MOTION_OFFSETS.staggerStepSec >= 0.03 && MOTION_OFFSETS.staggerStepSec <= 0.05);
  assert.equal(MOTION_SPRINGS.sheet.type, 'spring');
  assert.equal(MOTION_SPRINGS.pill.type, 'spring');
});

test('getTabTransitionDirection computes directional sign along ordered tabs', () => {
  const tabs = ['workspace', 'meetings', 'studio', 'notebook', 'settings'] as const;
  assert.equal(getTabTransitionDirection(tabs, 'workspace', 'studio'), 1);
  assert.equal(getTabTransitionDirection(tabs, 'settings', 'meetings'), -1);
  assert.equal(getTabTransitionDirection(tabs, 'studio', 'studio'), 1);
});

test('shouldDismissSheet detects drag offset and swipe velocity thresholds', () => {
  assert.equal(shouldDismissSheet(40, 120), false);
  assert.equal(shouldDismissSheet(95, 100), true);
  assert.equal(shouldDismissSheet(30, 500), true);
});

test('getStaggerDelay increments cleanly and caps for long lists', () => {
  assert.equal(getStaggerDelay(0), 0);
  assert.equal(getStaggerDelay(2), 0.08);
  assert.equal(getStaggerDelay(20), MOTION_OFFSETS.maxStaggerSec);
});

test('reducedMotion builds simple opacity-only variants with zero spatial translation', () => {
  const screenReduced = buildScreenVariants(true);
  const tabReduced = buildTabVariants(true);
  const listReduced = buildListItemVariants(true);
  const timelineReduced = buildTimelineStepVariants(true);

  assert.deepEqual(screenReduced.initial, { opacity: 0 });
  assert.deepEqual(tabReduced.initial, { opacity: 0 });
  assert.deepEqual(listReduced.initial, { opacity: 0 });
  assert.deepEqual(timelineReduced.initial, { opacity: 0 });
});

test('buildTimelineStepVariants staggers pending-to-completed transitions by step index', () => {
  const stepVariants = buildTimelineStepVariants(false);
  const completedFn = stepVariants.completed as (index?: number) => {
    opacity: number[];
    y: number[];
    scale: number[];
    transition: { delay: number; duration: number };
  };

  const step0 = completedFn(0);
  const step2 = completedFn(2);

  assert.equal(step0.transition.delay, 0);
  assert.equal(step2.transition.delay, 0.08);
  assert.deepEqual(step0.opacity, [0.78, 1]);
  assert.deepEqual(step0.scale, [0.98, 1]);
  assert.equal(step0.y[1], 0);
  assert.ok(step0.y[0] > 0);
});

test('getMotionConfigProps maps Reduced, Standard, and Fluid presets cleanly', () => {
  assert.deepEqual(
    MOTION_INTENSITY_OPTIONS.map((o) => o.id),
    ['reduced', 'standard', 'fluid']
  );

  const reduced = getMotionConfigProps('reduced');
  assert.equal(reduced.reducedMotion, 'always');
  assert.ok(
    'duration' in reduced.transition &&
      typeof reduced.transition.duration === 'number' &&
      reduced.transition.duration <= 0.2
  );

  const standard = getMotionConfigProps('standard');
  assert.equal(standard.reducedMotion, 'user');
  assert.equal(standard.transition.type, 'spring');

  const fluid = getMotionConfigProps('fluid');
  assert.equal(fluid.reducedMotion, 'user');
  assert.equal(fluid.transition.type, 'spring');
  if ('stiffness' in fluid.transition && 'stiffness' in standard.transition && 'damping' in fluid.transition && 'damping' in standard.transition) {
    assert.ok((fluid.transition.stiffness ?? 0) < (standard.transition.stiffness ?? 0));
    assert.ok((fluid.transition.damping ?? 0) < (standard.transition.damping ?? 0));
  }
});
