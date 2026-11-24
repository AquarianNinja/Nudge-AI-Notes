/**
 * Hardware and RAM calculation engine for on-device iOS LLM execution
 * and memory pressure / Jetsam watchdog analysis.
 */

export interface HardwareCalculationInput {
  modelParamsBillion: number; // e.g. 3, 7, 8
  quantizationBits: number;   // e.g. 3, 4, 8, 16
  contextWindowTokens: number;// e.g. 2048, 4096, 8192, 16384
  embeddingDbSizeMB?: number; // e.g. 150
  deviceTotalRAM_GB: number;  // e.g. 8 (iPhone 15 Pro), 16 (iPad M4)
}

export interface MemoryBreakdown {
  osOverheadGB: number;
  modelWeightsGB: number;
  kvCacheGB: number;
  embeddingAndRAGGB: number;
  appRuntimeGB: number;
  totalAppMemoryGB: number;
  totalSystemMemoryGB: number;
  freeRAMGB: number;
  jetsamThresholdGB: number; // Max memory before iOS Jetsam sends SIGKILL
  isJetsamTriggered: boolean;
  jetsamHeadroomGB: number;
  riskLevel: 'safe' | 'warning' | 'critical' | 'fatal';
}

/**
 * Standard iOS device profiles
 */
export const DEVICE_PROFILES = {
  IPHONE_15_PRO: {
    id: 'iphone_15_pro',
    name: 'iPhone 15 Pro / 16 (A17 Pro)',
    totalRAM_GB: 8.0,
    osOverhead_GB: 2.8,
    jetsamLimit_GB: 5.5, // App memory limit before dirty-memory jetsam kill
    chipset: 'A17 Pro (6-core GPU, 16-core ANE, 35 TOPS)',
    memoryBandwidthGBs: 153.6
  },
  IPHONE_16_PRO: {
    id: 'iphone_16_pro',
    name: 'iPhone 16 Pro (A18 Pro)',
    totalRAM_GB: 8.0,
    osOverhead_GB: 2.7,
    jetsamLimit_GB: 5.7,
    chipset: 'A18 Pro (6-core GPU, 16-core ANE, 38 TOPS)',
    memoryBandwidthGBs: 168.0
  },
  IPAD_PRO_M4: {
    id: 'ipad_pro_m4',
    name: 'iPad Pro M4 (16GB RAM)',
    totalRAM_GB: 16.0,
    osOverhead_GB: 3.2,
    jetsamLimit_GB: 12.0,
    chipset: 'Apple M4 (10-core GPU, 16-core ANE, 120 GB/s)',
    memoryBandwidthGBs: 120.0
  }
};

/**
 * Calculates raw weight footprint in Gigabytes.
 * Formula: (Params * QuantizationBits / 8) * (1 + 0.05 overhead for scales & metadata)
 */
export function calculateModelWeightGB(paramsBillion: number, bits: number): number {
  const bytesPerParam = bits / 8;
  const rawBytes = paramsBillion * 1e9 * bytesPerParam;
  const withOverhead = rawBytes * 1.05; // 5% quantization tensor headers & quantization tables
  return Number((withOverhead / (1024 * 1024 * 1024)).toFixed(2));
}

/**
 * Calculates KV (Key-Value) Cache memory in Gigabytes for attention layers.
 * Standard Transformer formula for 7B/8B (32 layers, hidden size 4096, 32 heads):
 * KV Cache per token = 2 * n_layers * n_heads * head_dim * precision_bytes
 * For GQA (Grouped Query Attention, e.g. Llama-3 with 8 KV heads):
 * 2 * 32 * 8 * 128 * 2 bytes (FP16) = 131,072 bytes/token (~128 KB per token).
 */
export function calculateKVCacheGB(tokens: number, isGQA: boolean = true): number {
  // Using 128 KB per token for GQA (Llama 3 / Mistral), 512 KB per token for full MHA
  const bytesPerToken = isGQA ? 131072 : 524288;
  const totalBytes = tokens * bytesPerToken;
  return Number((totalBytes / (1024 * 1024 * 1024)).toFixed(3));
}

/**
 * Computes complete memory breakdown and tests against iOS Jetsam limits.
 */
export function calculateMemoryPressure(input: HardwareCalculationInput): MemoryBreakdown {
  const osOverhead = input.deviceTotalRAM_GB === 16 ? 3.2 : 2.8;
  // Jetsam limit is typically ~68-72% of physical RAM on iOS for foreground apps with extended virtual memory entitlement
  const jetsamThreshold = input.deviceTotalRAM_GB === 16 ? 12.0 : 5.5;

  const weightsGB = calculateModelWeightGB(input.modelParamsBillion, input.quantizationBits);
  const kvCacheGB = calculateKVCacheGB(input.contextWindowTokens, true);
  const ragDB_GB = Number(((input.embeddingDbSizeMB || 150) / 1024).toFixed(3));
  const appRuntimeGB = 0.25; // SwiftUI view hierarchy, Metal command buffers, caches

  const totalAppMemoryGB = Number((weightsGB + kvCacheGB + ragDB_GB + appRuntimeGB).toFixed(2));
  const totalSystemMemoryGB = Number((osOverhead + totalAppMemoryGB).toFixed(2));
  const freeRAMGB = Number(Math.max(0, input.deviceTotalRAM_GB - totalSystemMemoryGB).toFixed(2));

  const jetsamHeadroomGB = Number((jetsamThreshold - totalAppMemoryGB).toFixed(2));
  const isJetsamTriggered = totalAppMemoryGB >= jetsamThreshold;

  let riskLevel: 'safe' | 'warning' | 'critical' | 'fatal' = 'safe';
  if (isJetsamTriggered) {
    riskLevel = 'fatal';
  } else if (jetsamHeadroomGB < 0.4) {
    riskLevel = 'critical';
  } else if (jetsamHeadroomGB < 1.0) {
    riskLevel = 'warning';
  }

  return {
    osOverheadGB: osOverhead,
    modelWeightsGB: weightsGB,
    kvCacheGB,
    embeddingAndRAGGB: ragDB_GB,
    appRuntimeGB,
    totalAppMemoryGB,
    totalSystemMemoryGB,
    freeRAMGB,
    jetsamThresholdGB: jetsamThreshold,
    isJetsamTriggered,
    jetsamHeadroomGB,
    riskLevel
  };
}

/**
 * Estimates tokens per second based on memory bandwidth and quantization
 * Memory-bound inference rate: Tokens/sec ≈ MemoryBandwidth_GBs / ModelWeight_GB
 */
export function estimateTokenGenerationSpeed(
  modelWeightGB: number,
  memoryBandwidthGBs: number,
  efficiencyFactor = 0.65 // Metal/MLX memory access efficiency
): number {
  if (modelWeightGB <= 0) return 0;
  const theoreticalSpeed = memoryBandwidthGBs / modelWeightGB;
  return Number((theoreticalSpeed * efficiencyFactor).toFixed(1));
}
