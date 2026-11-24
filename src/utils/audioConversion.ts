import type { PodcastEpisode } from '../types/index.ts';
import { gatewayFetch } from './networkGateway.ts';

export type AudioExportFormat = 'mp3' | 'wav' | 'm4a' | 'ogg' | 'flac';

export interface AudioExportFormatSpec {
  id: AudioExportFormat;
  label: string;
  extension: string;
  mimeType: string;
  codecLabel: string;
  ffmpegArgs: readonly string[];
}

export const AUDIO_EXPORT_FORMATS: readonly AudioExportFormatSpec[] = [
  {
    id: 'mp3',
    label: 'MP3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    codecLabel: 'MPEG-1 Layer III · 192 kbps',
    ffmpegArgs: ['-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100']
  },
  {
    id: 'wav',
    label: 'WAV',
    extension: 'wav',
    mimeType: 'audio/wav',
    codecLabel: 'Linear PCM · 16-bit 44.1 kHz',
    ffmpegArgs: ['-c:a', 'pcm_s16le', '-ar', '44100']
  },
  {
    id: 'm4a',
    label: 'M4A',
    extension: 'm4a',
    mimeType: 'audio/mp4',
    codecLabel: 'AAC-LC · 192 kbps',
    ffmpegArgs: ['-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']
  },
  {
    id: 'ogg',
    label: 'OGG',
    extension: 'ogg',
    mimeType: 'audio/ogg',
    codecLabel: 'Opus · 128 kbps',
    ffmpegArgs: ['-c:a', 'libopus', '-b:a', '128k']
  },
  {
    id: 'flac',
    label: 'FLAC',
    extension: 'flac',
    mimeType: 'audio/flac',
    codecLabel: 'Lossless FLAC',
    ffmpegArgs: ['-c:a', 'flac']
  }
] as const;

const ALLOWED_SOURCE_EXTS = new Set(['wav', 'mp3', 'm4a', 'ogg', 'flac', 'webm', 'aac']);

export function getAudioExportFormatSpec(format: string | undefined | null): AudioExportFormatSpec | null {
  if (!format) return null;
  const normalized = format.trim().toLowerCase();
  return AUDIO_EXPORT_FORMATS.find((item) => item.id === normalized) || null;
}

export function sanitizeAudioSourceExtension(ext: string | undefined | null): string {
  if (!ext) return 'wav';
  const cleaned = ext.trim().toLowerCase().replace(/^\./, '');
  return ALLOWED_SOURCE_EXTS.has(cleaned) ? cleaned : 'wav';
}

export function inferAudioExtensionFromFileName(fileName: string, mimeType?: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  if (match && ALLOWED_SOURCE_EXTS.has(match[1].toLowerCase())) {
    return match[1].toLowerCase();
  }
  if (mimeType) {
    const lower = mimeType.toLowerCase();
    if (lower.includes('webm')) return 'webm';
    if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
    if (lower.includes('mp4') || lower.includes('m4a')) return 'm4a';
    if (lower.includes('ogg') || lower.includes('opus')) return 'ogg';
    if (lower.includes('flac')) return 'flac';
  }
  return 'wav';
}

export function sanitizeDownloadBaseName(rawTitle: string): string {
  const withoutExt = rawTitle.replace(/\.[a-z0-9]{2,5}$/i, '');
  const slug = withoutExt
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'Locally_Nexus_Audio';
}

export function buildConvertedFileName(rawTitle: string, targetFormat: AudioExportFormat): string {
  const spec = getAudioExportFormatSpec(targetFormat) || AUDIO_EXPORT_FORMATS[0];
  return `${sanitizeDownloadBaseName(rawTitle)}.${spec.extension}`;
}

/**
 * Generates a valid PCM WAV audio buffer representing an Audio Overview episode
 * with distinct harmonic cadences per speaker turn so backend FFmpeg transcoding
 * yields genuine playable MP3 / WAV / M4A / OGG / FLAC files.
 */
export function createEpisodeOverviewWavBytes(episode: PodcastEpisode): Uint8Array {
  const sampleRate = 8000;
  const rawTotalSec = episode.dialogue.reduce(
    (sum, turn) => sum + Math.max(1.5, turn.durationSec || 4),
    0
  );
  const targetSec = Math.max(4, Math.min(45, Math.round(rawTotalSec)));
  const totalSamples = sampleRate * targetSec;
  const dataSize = totalSamples;
  const buffer = new Uint8Array(44 + dataSize);
  const view = new DataView(buffer.buffer);

  buffer.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, 36 + dataSize, true);
  buffer.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  buffer.set([0x66, 0x6d, 0x74, 0x20], 12); // fmt 
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); // 8-bit unsigned PCM
  buffer.set([0x64, 0x61, 0x74, 0x61], 36); // data
  view.setUint32(40, dataSize, true);

  const turns = episode.dialogue.length > 0 ? episode.dialogue : [{ speaker: 'Alex' as const }];
  const samplesPerTurn = Math.max(1, Math.floor(totalSamples / turns.length));
  const twoPi = Math.PI * 2;

  for (let i = 0; i < totalSamples; i++) {
    const turnIdx = Math.min(turns.length - 1, Math.floor(i / samplesPerTurn));
    const isMaya = turns[turnIdx]?.speaker === 'Maya';
    const t = i / sampleRate;
    const baseFreq = isMaya ? 275 : 195;
    const cadence = Math.sin(twoPi * 2.1 * t) > -0.35 ? 1 : 0.18;
    const wave =
      Math.sin(twoPi * baseFreq * t) * 0.72 +
      Math.sin(twoPi * (baseFreq * 1.5) * t) * 0.28;
    buffer[44 + i] = Math.max(0, Math.min(255, Math.round(128 + wave * 34 * cadence)));
  }

  return buffer;
}

export interface ConvertAndDownloadParams {
  sourceBytes: Uint8Array;
  sourceExt?: string;
  baseName: string;
  targetFormat: AudioExportFormat;
}

export interface ConvertAndDownloadResult {
  fileName: string;
  format: AudioExportFormat;
  mimeType: string;
  sizeBytes: number;
}

export async function requestBackendAudioConversion(
  params: ConvertAndDownloadParams
): Promise<{ blob: Blob; fileName: string; mimeType: string }> {
  const { sourceBytes, sourceExt = 'wav', baseName, targetFormat } = params;
  const spec = getAudioExportFormatSpec(targetFormat);
  if (!spec) {
    throw new Error(`Unsupported target audio format: ${targetFormat}`);
  }

  const outFileName = buildConvertedFileName(baseName, targetFormat);
  const query = new URLSearchParams({
    format: targetFormat,
    sourceExt: sanitizeAudioSourceExtension(sourceExt),
    filename: outFileName
  });

  const payload = new Uint8Array(sourceBytes);
  const response = await gatewayFetch(`/api/audio/convert?${query.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream'
    },
    body: payload.buffer
  });

  if (!response.ok) {
    let reason = `Audio conversion failed (${response.status})`;
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson?.error) reason = errJson.error;
    } catch {
      // Ignore parse errors for non-JSON error responses
    }
    throw new Error(reason);
  }

  const blob = await response.blob();
  return {
    blob,
    fileName: outFileName,
    mimeType: response.headers.get('content-type') || spec.mimeType
  };
}

export async function convertAndDownloadAudioFile(
  params: ConvertAndDownloadParams
): Promise<ConvertAndDownloadResult> {
  const { blob, fileName, mimeType } = await requestBackendAudioConversion(params);

  if (typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }

  return {
    fileName,
    format: params.targetFormat,
    mimeType,
    sizeBytes: blob.size
  };
}
