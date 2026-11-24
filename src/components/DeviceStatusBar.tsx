import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  BATTERY_MOCK_PRESETS,
  CellularSignalBars,
  cycleBatteryMockIndex,
  cycleCellularSignalBars,
  formatStatusBarClock,
  getBatteryColorTier,
  getBatteryHapticKind,
  getMsUntilNextMinute,
  isBrightBackgroundTone
} from '../utils/deviceStatusBar.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS } from '../utils/motion.ts';

const SIGNAL_BAR_HEIGHTS = [3.5, 5.5, 8, 10.5] as const;

export const DeviceStatusBar: React.FC = () => {
  const prefersReduced = Boolean(useReducedMotion());
  const statusBarRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [signalBars, setSignalBars] = useState<CellularSignalBars>(4);
  const [batteryPresetIdx, setBatteryPresetIdx] = useState<number>(0);
  const [isOverBrightSurface, setIsOverBrightSurface] = useState<boolean>(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextTick = () => {
      const current = new Date();
      setNow(current);
      timeoutId = setTimeout(scheduleNextTick, getMsUntilNextMinute(current));
    };

    timeoutId = setTimeout(scheduleNextTick, getMsUntilNextMinute(new Date()));

    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, []);

  const evaluateBackdropContrast = useCallback(() => {
    if (
      typeof document === 'undefined' ||
      typeof document.elementsFromPoint !== 'function' ||
      !statusBarRef.current
    ) {
      return;
    }

    const barEl = statusBarRef.current;
    const rect = barEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const samplePoints: Array<[number, number]> = [
      [rect.left + Math.min(48, rect.width * 0.14), rect.top + rect.height / 2],
      [rect.right - Math.min(54, rect.width * 0.15), rect.top + rect.height / 2]
    ];

    let brightDetected = false;
    for (const [x, y] of samplePoints) {
      const stack = document.elementsFromPoint(x, y);
      for (const node of stack) {
        if (barEl.contains(node)) continue;
        if (!(node instanceof HTMLElement)) continue;
        // Stop at the root device screen / canvas wrapper
        if (node.dataset.deviceFrame !== undefined) break;

        const computed = window.getComputedStyle(node);
        if (
          isBrightBackgroundTone({
            backgroundColor: computed.backgroundColor,
            backgroundImage: computed.backgroundImage,
            className: typeof node.className === 'string' ? node.className : ''
          })
        ) {
          brightDetected = true;
          break;
        }

        if (node.tagName === 'MAIN') break;
      }
      if (brightDetected) break;
    }

    setIsOverBrightSurface((prev) => (prev === brightDetected ? prev : brightDetected));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let rafId: number | null = null;
    const scheduleEval = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        evaluateBackdropContrast();
      });
    };

    scheduleEval();

    const parentContainer = statusBarRef.current?.parentElement;
    const observer =
      typeof MutationObserver !== 'undefined' && parentContainer
        ? new MutationObserver(scheduleEval)
        : null;
    if (observer && parentContainer) {
      observer.observe(parentContainer, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }

    window.addEventListener('scroll', scheduleEval, true);
    window.addEventListener('resize', scheduleEval);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('scroll', scheduleEval, true);
      window.removeEventListener('resize', scheduleEval);
    };
  }, [evaluateBackdropContrast]);

  const formattedClock = formatStatusBarClock(now);
  const battery = BATTERY_MOCK_PRESETS[batteryPresetIdx] || BATTERY_MOCK_PRESETS[0];
  const batteryTier = getBatteryColorTier(battery);

  // Green when plugged in, Yellow when Low Power Mode kicks in, bright neutral otherwise
  const batteryFillWidth = Math.max(3, Math.round(((27.8 * battery.level) / 100) * 10) / 10);
  const batteryFillColor =
    batteryTier === 'charging'
      ? '#22c55e'
      : batteryTier === 'low'
      ? '#facc15'
      : isOverBrightSurface
      ? '#ffffff'
      : '#e4e4e7';
  const batteryStrokeColor =
    batteryTier === 'charging'
      ? 'rgba(74, 222, 128, 0.9)'
      : batteryTier === 'low'
      ? 'rgba(250, 204, 21, 0.9)'
      : isOverBrightSurface
      ? 'rgba(255, 255, 255, 0.85)'
      : 'rgba(228, 228, 231, 0.58)';

  const foregroundClass = isOverBrightSurface
    ? 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.92)]'
    : 'text-zinc-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]';

  const activeSignalColor = isOverBrightSurface ? '#ffffff' : '#e4e4e7';
  const inactiveSignalColor = isOverBrightSurface
    ? 'rgba(255, 255, 255, 0.38)'
    : 'rgba(161, 161, 170, 0.34)';
  const batteryTextFill =
    batteryTier === 'normal' && battery.level >= 55 && !battery.isCharging
      ? '#09090b'
      : '#ffffff';
  const batteryTextStroke =
    batteryTextFill === '#09090b' ? 'none' : 'rgba(5, 7, 12, 0.88)';

  return (
    <div
      ref={statusBarRef}
      data-contrast-mode={isOverBrightSurface ? 'bright' : 'dark'}
      aria-label="Device status bar"
      className={`pointer-events-none absolute top-[6px] inset-x-0 z-40 h-[28px] px-4 sm:px-6 flex items-center justify-between gap-2 select-none transition-colors duration-200 ${foregroundClass}`}
    >
      {/* Left shoulder: Locale-aware HH:MM real-time clock */}
      <div className="flex-1 min-w-0 flex items-center justify-start">
        <time
          dateTime={now.toISOString()}
          aria-label={`Current time ${formattedClock}`}
          className={`text-[13px] font-semibold tracking-tight tabular-nums leading-none whitespace-nowrap shrink-0 transition-colors duration-200 ${
            isOverBrightSurface ? 'text-white' : 'text-zinc-200'
          }`}
        >
          {formattedClock}
        </time>
      </div>

      {/* Center spacer matching Dynamic Island width to keep left/right spacing balanced */}
      <div aria-hidden="true" className="w-[108px] shrink-0 h-full" />

      {/* Right shoulder: Cellular signal bars + Dynamic percentage battery indicator */}
      <div className="pointer-events-auto flex-1 min-w-0 flex items-center justify-end gap-1 sm:gap-1.5">
        <motion.button
          type="button"
          data-haptic="off"
          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
          transition={MOTION_SPRINGS.interactive}
          onClick={() => {
            triggerHaptic('selection');
            setSignalBars((prev) => cycleCellularSignalBars(prev));
          }}
          aria-label={`Cellular signal: ${signalBars} of 4 bars. Tap to toggle.`}
          title={`Cellular signal: ${signalBars}/4 bars (tap to toggle)`}
          className="min-h-[28px] px-0.5 sm:px-1 shrink-0 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#54B0FF]"
        >
          <svg
            viewBox="0 0 18 12"
            className="w-[17px] h-[11px] overflow-visible shrink-0"
            aria-hidden="true"
          >
            {SIGNAL_BAR_HEIGHTS.map((barHeight, idx) => {
              const active = idx < signalBars;
              const x = 1 + idx * 4.2;
              const y = 11.5 - barHeight;
              return (
                <rect
                  key={idx}
                  x={x}
                  y={y}
                  width="2.6"
                  height={barHeight}
                  rx="1"
                  className="transition-opacity duration-150"
                  fill={active ? activeSignalColor : inactiveSignalColor}
                />
              );
            })}
            {signalBars === 0 && (
              <line
                x1="1.5"
                y1="10.5"
                x2="16.5"
                y2="2"
                stroke="#f87171"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            )}
          </svg>
        </motion.button>

        <motion.button
          type="button"
          data-haptic="off"
          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
          transition={MOTION_SPRINGS.interactive}
          onClick={() => {
            const nextIdx = cycleBatteryMockIndex(batteryPresetIdx);
            const nextPreset = BATTERY_MOCK_PRESETS[nextIdx] || BATTERY_MOCK_PRESETS[0];
            triggerHaptic(getBatteryHapticKind(nextPreset));
            setBatteryPresetIdx(nextIdx);
          }}
          aria-label={`Battery ${battery.label}. Tap to change mock level.`}
          title={`Battery: ${battery.label} (tap to cycle)`}
          className="min-h-[28px] px-0.5 sm:px-1 shrink-0 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[#54B0FF]"
        >
          <svg
            viewBox="0 0 38 16"
            className="w-[33px] h-[14px] overflow-visible shrink-0"
            aria-hidden="true"
          >
            {/* Battery outer shell */}
            <rect
              x="1"
              y="1.5"
              width="31"
              height="13"
              rx="3.4"
              fill={isOverBrightSurface ? 'rgba(5, 7, 12, 0.52)' : 'rgba(5, 7, 12, 0.45)'}
              stroke={batteryStrokeColor}
              strokeWidth="1.2"
            />
            {/* Positive terminal nub */}
            <rect
              x="33.2"
              y="5"
              width="2.1"
              height="6"
              rx="1"
              fill={batteryStrokeColor}
            />
            {/* Charge level fill bar */}
            <rect
              x="2.6"
              y="3.1"
              width={batteryFillWidth}
              height="9.8"
              rx="2"
              fill={batteryFillColor}
              className="transition-colors duration-150"
            />
            {/* Percentage digits rendered inside the battery icon */}
            <text
              x={battery.isCharging ? 13.2 : 16.5}
              y="10.8"
              textAnchor="middle"
              fontSize={battery.level >= 100 && battery.isCharging ? '7.2' : '8.2'}
              fontWeight="800"
              fontFamily="var(--font-sans)"
              fill={batteryTextFill}
              stroke={batteryTextStroke}
              strokeWidth={batteryTextStroke === 'none' ? 0 : 1.7}
              paintOrder="stroke"
            >
              {battery.level}
            </text>
            {/* Charging bolt icon beside percentage when plugged in */}
            {battery.isCharging && (
              <path
                d="M26.2 3.2L23.2 8h2l-1 4.6 3-4.8h-2l1-4.6z"
                fill="#ffffff"
                stroke="#05070c"
                strokeWidth="0.8"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </motion.button>
      </div>
    </div>
  );
};
