import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateModelWeightGB,
  calculateKVCacheGB,
  calculateMemoryPressure,
  estimateTokenGenerationSpeed,
  DEVICE_PROFILES
} from './hardwareMath.ts';

test('calculateModelWeightGB computes accurate quantized footprint', () => {
  // 8B model at 4-bit (0.5 bytes per param) with 5% overhead:
  // 8e9 * 0.5 * 1.05 = 4.2e9 bytes -> ~3.91 GB
  const weight8B4Bit = calculateModelWeightGB(8, 4);
  assert.ok(weight8B4Bit >= 3.8 && weight8B4Bit <= 4.1, `Weight should be ~3.9GB, got ${weight8B4Bit}`);

  // 3B model at 4-bit:
  // 3e9 * 0.5 * 1.05 = 1.575e9 bytes -> ~1.47 GB
  const weight3B4Bit = calculateModelWeightGB(3, 4);
  assert.ok(weight3B4Bit >= 1.4 && weight3B4Bit <= 1.6, `Weight should be ~1.47GB, got ${weight3B4Bit}`);
});

test('calculateKVCacheGB correctly calculates GQA attention memory', () => {
  // 4096 tokens with GQA (~128KB/tok) = ~500MB (0.5GB)
  const cache4k = calculateKVCacheGB(4096, true);
  assert.ok(cache4k >= 0.45 && cache4k <= 0.55, `KV Cache 4k tokens should be ~0.5GB, got ${cache4k}`);

  // 8192 tokens with GQA = ~1.0GB
  const cache8k = calculateKVCacheGB(8192, true);
  assert.ok(cache8k >= 0.95 && cache8k <= 1.05, `KV Cache 8k tokens should be ~1.0GB, got ${cache8k}`);
});

test('calculateMemoryPressure flags iOS Jetsam kill on 8B model with large context on iPhone 15 Pro', () => {
  // iPhone 15 Pro (8GB RAM, 5.5GB Jetsam limit)
  // 8B model at 8-bit quantization is ~7.8GB -> must trigger Jetsam kill
  const fatalProfile = calculateMemoryPressure({
    modelParamsBillion: 8,
    quantizationBits: 8,
    contextWindowTokens: 4096,
    embeddingDbSizeMB: 150,
    deviceTotalRAM_GB: DEVICE_PROFILES.IPHONE_15_PRO.totalRAM_GB
  });

  assert.equal(fatalProfile.isJetsamTriggered, true);
  assert.equal(fatalProfile.riskLevel, 'fatal');

  // 7B model at 4-bit with 2048 context should be safe or warning
  const safeProfile = calculateMemoryPressure({
    modelParamsBillion: 7,
    quantizationBits: 4,
    contextWindowTokens: 2048,
    embeddingDbSizeMB: 100,
    deviceTotalRAM_GB: DEVICE_PROFILES.IPHONE_15_PRO.totalRAM_GB
  });

  assert.equal(safeProfile.isJetsamTriggered, false);
  assert.ok(safeProfile.jetsamHeadroomGB > 0.5, 'Should have headroom below jetsam ceiling');
});

test('estimateTokenGenerationSpeed calculates memory-bound inference rate', () => {
  // Model weight: 3.9 GB, iPhone 15 Pro bandwidth: 153.6 GB/s, efficiency: 0.65
  // Speed = (153.6 / 3.9) * 0.65 ≈ 25.6 tok/s
  const speed = estimateTokenGenerationSpeed(3.9, 153.6, 0.65);
  assert.ok(speed >= 20 && speed <= 30, `Tokens/sec should be between 20-30, got ${speed}`);
});
