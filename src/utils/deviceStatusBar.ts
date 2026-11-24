import type { HapticKind } from './haptics.ts';

export type CellularSignalBars = 0 | 1 | 2 | 3 | 4;

export interface BatteryMockState {
  id: 'high' | 'medium' | 'low-power' | 'charging' | 'full-charging';
  level: number;
  isCharging: boolean;
  isLowPowerMode: boolean;
  label: string;
}

export const BATTERY_MOCK_PRESETS: readonly BatteryMockState[] = [
  { id: 'high', level: 86, isCharging: false, isLowPowerMode: false, label: '86%' },
  { id: 'medium', level: 48, isCharging: false, isLowPowerMode: false, label: '48%' },
  {
    id: 'low-power',
    level: 18,
    isCharging: false,
    isLowPowerMode: true,
    label: '18% (Low Power Mode)'
  },
  { id: 'charging', level: 74, isCharging: true, isLowPowerMode: false, label: '74% (Plugged in)' },
  {
    id: 'full-charging',
    level: 100,
    isCharging: true,
    isLowPowerMode: false,
    label: '100% (Plugged in)'
  }
];

export function formatStatusBarClock(date: Date, locale?: string): string {
  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour')?.value;
    const minutePart = parts.find((p) => p.type === 'minute')?.value;
    const literalPart = parts.find((p) => p.type === 'literal')?.value?.trim() || ':';
    if (hourPart && minutePart) {
      return `${hourPart}${literalPart || ':'}${minutePart}`;
    }
  } catch {
    // Fall back to zero-padded local hours and minutes
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function getMsUntilNextMinute(date: Date): number {
  const remainingMs = (60 - date.getSeconds()) * 1000 - date.getMilliseconds();
  return Math.max(250, remainingMs);
}

export function cycleCellularSignalBars(current: CellularSignalBars): CellularSignalBars {
  if (current <= 0) return 4;
  return (current - 1) as CellularSignalBars;
}

export function cycleBatteryMockIndex(currentIndex: number): number {
  const normalized = Number.isFinite(currentIndex) ? Math.max(0, Math.floor(currentIndex)) : 0;
  return (normalized + 1) % BATTERY_MOCK_PRESETS.length;
}

export function getBatteryColorTier(
  state: Pick<BatteryMockState, 'level' | 'isCharging' | 'isLowPowerMode'>
): 'charging' | 'low' | 'normal' {
  if (state.isCharging) return 'charging';
  if (state.isLowPowerMode || state.level <= 20) return 'low';
  return 'normal';
}

export function getBatteryHapticKind(
  state: Pick<BatteryMockState, 'level' | 'isCharging' | 'isLowPowerMode'>
): HapticKind {
  if (state.isCharging) return 'success';
  if (state.isLowPowerMode || state.level <= 20) return 'warning';
  return 'selection';
}

export function parseCssRgbaColor(
  rawColor?: string | null
): { r: number; g: number; b: number; a: number } | null {
  if (!rawColor) return null;
  const match = rawColor
    .trim()
    .match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
  if (!match) return null;

  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const a = match[4] !== undefined ? Number(match[4]) : 1;

  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  return { r, g, b, a };
}

export function computeRelativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const toLinear = (channel: number) => {
    const srgb = Math.min(1, Math.max(0, channel / 255));
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const rLin = toLinear(rgb.r);
  const gLin = toLinear(rgb.g);
  const bLin = toLinear(rgb.b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

export function isBrightBackgroundTone(params: {
  backgroundColor?: string | null;
  backgroundImage?: string | null;
  className?: string | null;
}): boolean {
  const cls = typeof params.className === 'string' ? params.className : '';
  if (
    cls.includes('liquid-lens-active') ||
    cls.includes('liquid-accent-glass') ||
    /\bbg-white(?:\/\d+)?\b/.test(cls)
  ) {
    return true;
  }

  const parsed = parseCssRgbaColor(params.backgroundColor);
  if (parsed && parsed.a >= 0.28) {
    const lum = computeRelativeLuminance(parsed);
    if (lum >= 0.42) return true;
  }

  const bgImage = typeof params.backgroundImage === 'string' ? params.backgroundImage : '';
  if (bgImage && bgImage !== 'none') {
    const rgbMatches = bgImage.match(/rgba?\([^)]+\)/gi) || [];
    for (const token of rgbMatches) {
      const gradColor = parseCssRgbaColor(token);
      if (gradColor && gradColor.a >= 0.35 && computeRelativeLuminance(gradColor) >= 0.52) {
        return true;
      }
    }
  }

  return false;
}
