import React, { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle, Flame } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  calculateMemoryPressure,
  estimateTokenGenerationSpeed,
  DEVICE_PROFILES
} from '../utils/hardwareMath.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  buildListItemVariants
} from '../utils/motion.ts';
import { MotionAlertBanner } from './MotionPrimitives.tsx';

export const HardwareLabView: React.FC = () => {
  const prefersReduced = Boolean(useReducedMotion());
  const listItemVariants = buildListItemVariants(prefersReduced);
  const [selectedDeviceKey, setSelectedDeviceKey] = useState<keyof typeof DEVICE_PROFILES>('IPHONE_15_PRO');
  const [paramsBillion, setParamsBillion] = useState<number>(8);
  const [quantBits, setQuantBits] = useState<number>(4);
  const [contextTokens, setContextTokens] = useState<number>(4096);
  const [ragDbMB, setRagDbMB] = useState<number>(150);

  const activeDevice = DEVICE_PROFILES[selectedDeviceKey];

  const memoryMetrics = useMemo(() => {
    return calculateMemoryPressure({
      modelParamsBillion: paramsBillion,
      quantizationBits: quantBits,
      contextWindowTokens: contextTokens,
      embeddingDbSizeMB: ragDbMB,
      deviceTotalRAM_GB: activeDevice.totalRAM_GB
    });
  }, [paramsBillion, quantBits, contextTokens, ragDbMB, activeDevice]);

  const estimatedSpeed = useMemo(() => {
    return estimateTokenGenerationSpeed(
      memoryMetrics.modelWeightsGB,
      activeDevice.memoryBandwidthGBs,
      0.65
    );
  }, [memoryMetrics.modelWeightsGB, activeDevice.memoryBandwidthGBs]);

  const applyPreset = (preset: 'safe-3b' | 'optimal-8b' | 'danger-8b-8bit' | 'fatal-14b') => {
    triggerHaptic(preset === 'fatal-14b' ? 'warning' : 'selection');
    if (preset === 'safe-3b') {
      setParamsBillion(3.2);
      setQuantBits(4);
      setContextTokens(8192);
    } else if (preset === 'optimal-8b') {
      setParamsBillion(8.0);
      setQuantBits(4);
      setContextTokens(4096);
    } else if (preset === 'danger-8b-8bit') {
      setParamsBillion(8.0);
      setQuantBits(8);
      setContextTokens(4096);
    } else if (preset === 'fatal-14b') {
      setParamsBillion(14.0);
      setQuantBits(4);
      setContextTokens(4096);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full px-3 sm:px-5 py-3 pb-24 overflow-y-auto">
      {/* Device Header */}
      <motion.div
        custom={0}
        variants={listItemVariants}
        initial="initial"
        animate="animate"
        className="p-4 rounded-2xl liquid-glass mb-3"
      >
        <div className="flex flex-col @lg:flex-row @lg:items-center justify-between gap-2.5">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">iOS Memory & Jetsam Profiler</h2>
            <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
              {activeDevice.chipset} · {activeDevice.memoryBandwidthGBs} GB/s · {activeDevice.jetsamLimit_GB} GB limit
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 liquid-glass-subtle rounded-full w-fit">
            {(Object.keys(DEVICE_PROFILES) as Array<keyof typeof DEVICE_PROFILES>).map((key) => {
              const dev = DEVICE_PROFILES[key];
              const isSelected = selectedDeviceKey === key;
              return (
                <motion.button
                  key={key}
                  type="button"
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => setSelectedDeviceKey(key)}
                  className={`relative px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="hardware-device-pill"
                      transition={MOTION_SPRINGS.pill}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full liquid-lens-active"
                    />
                  )}
                  <span className="relative z-10">{dev.name.split(' ')[1]} ({dev.totalRAM_GB}G)</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Watchdog Status */}
      {memoryMetrics.riskLevel === 'fatal' ? (
        <MotionAlertBanner
          shakeKey={`${selectedDeviceKey}-${paramsBillion}-${quantBits}-fatal`}
          className="p-3.5 rounded-2xl border mb-3 flex items-center justify-between gap-3 bg-red-500/12 border-red-400/35 text-red-100 backdrop-blur-md"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Flame className="w-4 h-4 text-red-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-wide">
                Jetsam SIGKILL
              </div>
              <div className="text-[11px] font-mono tabular-nums opacity-85 truncate">
                {memoryMetrics.totalAppMemoryGB} GB used · {memoryMetrics.jetsamHeadroomGB} GB headroom
              </div>
            </div>
          </div>

          <div className="text-right font-mono tabular-nums shrink-0">
            <div className="text-sm font-semibold text-zinc-100">0.0 tok/s</div>
          </div>
        </MotionAlertBanner>
      ) : (
        <motion.div
          custom={1}
          variants={listItemVariants}
          initial="initial"
          animate="animate"
          className={`p-3.5 rounded-2xl mb-3 flex items-center justify-between gap-3 transition-colors ${
            memoryMetrics.riskLevel === 'critical' || memoryMetrics.riskLevel === 'warning'
              ? 'border bg-amber-500/12 border-amber-400/35 text-amber-100 backdrop-blur-md'
              : 'liquid-glass text-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {memoryMetrics.riskLevel === 'critical' || memoryMetrics.riskLevel === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold capitalize tracking-wide">
                {memoryMetrics.riskLevel}
              </div>
              <div className="text-[11px] font-mono tabular-nums opacity-85 truncate">
                {memoryMetrics.totalAppMemoryGB} GB used · {memoryMetrics.jetsamHeadroomGB} GB headroom
              </div>
            </div>
          </div>

          <div className="text-right font-mono tabular-nums shrink-0">
            <div className="text-sm font-semibold text-zinc-100">
              {memoryMetrics.isJetsamTriggered ? '0.0 tok/s' : `${estimatedSpeed} tok/s`}
            </div>
          </div>
        </motion.div>
      )}

      {/* Allocation Bar */}
      <motion.div
        custom={2}
        variants={listItemVariants}
        initial="initial"
        animate="animate"
        className="p-4 rounded-2xl liquid-glass mb-3"
      >
        <div className="flex items-center justify-between text-xs font-mono tabular-nums text-zinc-400 mb-2">
          <span>
            {memoryMetrics.totalSystemMemoryGB} / {activeDevice.totalRAM_GB} GB RAM
          </span>
          <span>Ceiling {memoryMetrics.jetsamThresholdGB} GB</span>
        </div>

        <div className="w-full h-6 liquid-glass-subtle rounded-xl overflow-hidden p-0.5 flex gap-0.5">
          <div
            style={{ width: `${(memoryMetrics.osOverheadGB / activeDevice.totalRAM_GB) * 100}%` }}
            className="h-full bg-white/15 rounded-lg flex items-center justify-center text-[10px] font-mono text-zinc-100 truncate px-1 transition-all duration-200"
          >
            OS {memoryMetrics.osOverheadGB}G
          </div>
          <div
            style={{ width: `${(memoryMetrics.modelWeightsGB / activeDevice.totalRAM_GB) * 100}%` }}
            className="h-full bg-[#2B98FF]/80 rounded-lg flex items-center justify-center text-[10px] font-mono text-white truncate px-1 transition-all duration-200"
          >
            LLM {memoryMetrics.modelWeightsGB}G
          </div>
          <div
            style={{ width: `${Math.max(4, (memoryMetrics.kvCacheGB / activeDevice.totalRAM_GB) * 100)}%` }}
            className="h-full bg-sky-300/75 rounded-lg flex items-center justify-center text-[10px] font-mono text-zinc-950 truncate px-1 transition-all duration-200"
          >
            KV
          </div>
          <div
            style={{ width: `${Math.max(3, ((memoryMetrics.embeddingAndRAGGB + memoryMetrics.appRuntimeGB) / activeDevice.totalRAM_GB) * 100)}%` }}
            className="h-full bg-white/30 rounded-lg flex items-center justify-center text-[10px] font-mono text-zinc-100 truncate px-1 transition-all duration-200"
          >
            RAG
          </div>
          <div
            style={{ width: `${Math.max(0, (memoryMetrics.freeRAMGB / activeDevice.totalRAM_GB) * 100)}%` }}
            className="h-full bg-emerald-400/20 rounded-lg flex items-center justify-center text-[10px] font-mono text-emerald-300 truncate px-1 transition-all duration-200"
          >
            {memoryMetrics.freeRAMGB}G
          </div>
        </div>
      </motion.div>

      {/* Controls */}
      <motion.div
        custom={3}
        variants={listItemVariants}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 @2xl:grid-cols-2 gap-3"
      >
        <div className="p-4 rounded-2xl liquid-glass space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={() => applyPreset('safe-3b')}
              className="text-[11px] px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-zinc-200 whitespace-nowrap shrink-0"
            >
              3.2B Safe
            </motion.button>
            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={() => applyPreset('optimal-8b')}
              className="text-[11px] px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-zinc-100 border-white/20 whitespace-nowrap shrink-0"
            >
              8B Q4
            </motion.button>
            <motion.button
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={() => applyPreset('danger-8b-8bit')}
              className="text-[11px] px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-amber-300 whitespace-nowrap shrink-0"
            >
              8B Q8
            </motion.button>
            <motion.button
              type="button"
              data-haptic="warning"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={() => applyPreset('fatal-14b')}
              className="text-[11px] px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-red-300 whitespace-nowrap shrink-0"
            >
              14B Fatal
            </motion.button>
          </div>

          <div className="text-xs">
            <div className="flex justify-between text-zinc-400 mb-1">
              <label htmlFor="param-slider">Parameters</label>
              <span className="font-mono text-zinc-100">{paramsBillion}B</span>
            </div>
            <input
              id="param-slider"
              type="range"
              min={1}
              max={14}
              step={0.5}
              value={paramsBillion}
              onChange={(e) => {
                triggerHaptic('selection');
                setParamsBillion(parseFloat(e.target.value));
              }}
              className="w-full accent-[#2B98FF]"
            />
          </div>

          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl liquid-glass-subtle">
            {[
              { bits: 3, label: 'Q3' },
              { bits: 4, label: 'Q4' },
              { bits: 8, label: 'Q8' },
              { bits: 16, label: 'FP16' }
            ].map((q) => {
              const active = quantBits === q.bits;
              return (
                <motion.button
                  key={q.bits}
                  type="button"
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => setQuantBits(q.bits)}
                  className={`relative py-1.5 rounded-lg text-[11px] font-mono transition-colors ${
                    active
                      ? 'text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="hardware-quant-pill"
                      transition={MOTION_SPRINGS.pill}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-lg liquid-lens-active"
                    />
                  )}
                  <span className="relative z-10">{q.label}</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="p-4 rounded-2xl liquid-glass space-y-4 text-xs">
          <div>
            <div className="flex justify-between text-zinc-400 mb-1">
              <label htmlFor="context-slider">Context Window</label>
              <span className="font-mono text-zinc-100">{contextTokens.toLocaleString()} tok</span>
            </div>
            <input
              id="context-slider"
              type="range"
              min={1024}
              max={16384}
              step={1024}
              value={contextTokens}
              onChange={(e) => {
                triggerHaptic('selection');
                setContextTokens(parseInt(e.target.value, 10));
              }}
              className="w-full accent-[#2B98FF]"
            />
          </div>

          <div>
            <div className="flex justify-between text-zinc-400 mb-1">
              <label htmlFor="rag-slider">ClaimCenter Vector Index</label>
              <span className="font-mono text-zinc-100">{ragDbMB} MB</span>
            </div>
            <input
              id="rag-slider"
              type="range"
              min={50}
              max={500}
              step={25}
              value={ragDbMB}
              onChange={(e) => {
                triggerHaptic('selection');
                setRagDbMB(parseInt(e.target.value, 10));
              }}
              className="w-full accent-[#2B98FF]"
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
};
