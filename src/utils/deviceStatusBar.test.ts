import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BATTERY_MOCK_PRESETS,
  computeRelativeLuminance,
  cycleBatteryMockIndex,
  cycleCellularSignalBars,
  formatStatusBarClock,
  getBatteryColorTier,
  getBatteryHapticKind,
  getMsUntilNextMinute,
  isBrightBackgroundTone,
  parseCssRgbaColor
} from './deviceStatusBar.ts';

test('formatStatusBarClock renders compact HH:MM in both 24-hour and 12-hour locales', () => {
  const sample = new Date(2026, 10, 24, 14, 5, 30);

  const gbTime = formatStatusBarClock(sample, 'en-GB');
  assert.equal(gbTime, '14:05');

  const usTime = formatStatusBarClock(sample, 'en-US');
  assert.equal(usTime, '02:05');
  assert.equal(usTime.includes('PM'), false);
});

test('getMsUntilNextMinute calculates exact delay to the next minute rollover', () => {
  const atFortySeconds = new Date(2026, 10, 24, 9, 41, 40, 250);
  assert.equal(getMsUntilNextMinute(atFortySeconds), 19750);

  const nearRollover = new Date(2026, 10, 24, 9, 41, 59, 950);
  assert.equal(getMsUntilNextMinute(nearRollover), 250);
});

test('cycleCellularSignalBars cycles cleanly between 0 and 4 bars', () => {
  let bars = cycleCellularSignalBars(4);
  assert.equal(bars, 3);
  bars = cycleCellularSignalBars(bars);
  assert.equal(bars, 2);
  bars = cycleCellularSignalBars(bars);
  assert.equal(bars, 1);
  bars = cycleCellularSignalBars(bars);
  assert.equal(bars, 0);
  bars = cycleCellularSignalBars(bars);
  assert.equal(bars, 4);
});

test('cycleBatteryMockIndex, color tiers, and haptics cover normal, low power, and plugged-in states', () => {
  let idx = 0;
  const seenIds: string[] = [];

  for (let i = 0; i < BATTERY_MOCK_PRESETS.length; i += 1) {
    const preset = BATTERY_MOCK_PRESETS[idx];
    seenIds.push(preset.id);
    idx = cycleBatteryMockIndex(idx);
  }

  assert.equal(idx, 0);
  assert.deepEqual(seenIds, ['high', 'medium', 'low-power', 'charging', 'full-charging']);
  assert.equal(getBatteryColorTier({ level: 18, isCharging: false, isLowPowerMode: true }), 'low');
  assert.equal(getBatteryColorTier({ level: 74, isCharging: true, isLowPowerMode: false }), 'charging');
  assert.equal(getBatteryColorTier({ level: 86, isCharging: false, isLowPowerMode: false }), 'normal');

  assert.equal(getBatteryHapticKind({ level: 74, isCharging: true, isLowPowerMode: false }), 'success');
  assert.equal(getBatteryHapticKind({ level: 18, isCharging: false, isLowPowerMode: true }), 'warning');
  assert.equal(getBatteryHapticKind({ level: 86, isCharging: false, isLowPowerMode: false }), 'selection');
});

test('Liquid Glass background contrast helpers distinguish dark canvas from bright UI components', () => {
  const darkRgb = parseCssRgbaColor('rgba(11, 16, 26, 0.56)');
  assert.ok(darkRgb);
  assert.ok(computeRelativeLuminance(darkRgb) < 0.05);

  assert.equal(
    isBrightBackgroundTone({
      backgroundColor: 'rgba(11, 16, 26, 0.56)',
      className: 'liquid-glass-subtle rounded-xl'
    }),
    false
  );

  assert.equal(
    isBrightBackgroundTone({
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      className: 'liquid-lens-active rounded-full'
    }),
    true
  );

  assert.equal(
    isBrightBackgroundTone({
      backgroundColor: 'rgba(0, 0, 0, 0)',
      backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(232, 240, 252, 0.85) 100%)',
      className: 'rounded-2xl'
    }),
    true
  );
});
