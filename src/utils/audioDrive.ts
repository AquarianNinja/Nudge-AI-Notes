import { AudioOrigin, DriveAudioFile } from '../types/index.ts';
import { formatAudioDuration, formatFileSize } from './meetingNotes.ts';

export function parseTimestampToSeconds(timestamp: string): number {
  const clean = timestamp.trim();
  if (!clean) return 0;
  const parts = clean.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;

  if (parts.length === 2) {
    return Math.round(parts[0] * 60 + parts[1]);
  }
  if (parts.length === 3) {
    return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  return 0;
}

export function clampSeekSeconds(seconds: number, durationSec?: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  if (typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0) {
    return Math.min(seconds, Math.max(0, durationSec - 0.5));
  }
  return seconds;
}

/**
 * Generates an 8-bit 4kHz mono PCM WAV byte buffer so seeded/simulated
 * sessions and fallback recordings have genuine, seekable audio duration.
 */
export function createSyntheticMeetingWavBytes(durationSec: number, seed = 1): Uint8Array {
  const sampleRate = 4000;
  const safeDuration = Math.max(2, Math.min(900, Math.round(durationSec || 10)));
  const dataSize = sampleRate * safeDuration;
  const totalSize = 44 + dataSize;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  // RIFF header
  buffer.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  buffer.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt subchunk
  buffer.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate (sampleRate * 1 * 1)
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample

  // data subchunk
  buffer.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataSize, true);

  // Fill subtle cadence waveform so playback is audible & distinct by timestamp
  const baseFreq = 190 + (seed % 5) * 35;
  const twoPi = Math.PI * 2;
  for (let i = 0; i < dataSize; i++) {
    const t = i / sampleRate;
    const cadence = Math.sin(twoPi * 1.4 * t) > -0.25 ? 1 : 0.15;
    const segmentShift = Math.floor(t / 15) % 3;
    const freq = baseFreq + segmentShift * 42;
    const sample = 128 + Math.round(Math.sin(twoPi * freq * t) * 18 * cadence);
    buffer[44 + i] = sample;
  }

  return buffer;
}

export function createSyntheticMeetingWavUrl(durationSec: number, seed = 1): string {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return '';
  }
  const bytes = createSyntheticMeetingWavBytes(durationSec, seed);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export interface CreateDriveAudioInput {
  id?: string;
  fileName: string;
  origin: AudioOrigin;
  durationSec: number;
  sizeBytes: number;
  audioUrl: string;
  mimeType?: string;
  linkedSessionTitle?: string;
  createdAt?: string;
}

export function createDriveAudioFile(input: CreateDriveAudioInput): DriveAudioFile {
  return {
    id: input.id || `drive-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fileName: input.fileName,
    origin: input.origin,
    durationSec: Math.max(1, Math.round(input.durationSec)),
    durationLabel: formatAudioDuration(input.durationSec),
    sizeBytes: Math.max(1024, Math.round(input.sizeBytes)),
    sizeLabel: formatFileSize(input.sizeBytes),
    createdAt:
      input.createdAt ||
      new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      }),
    audioUrl: input.audioUrl,
    mimeType: input.mimeType || 'audio/wav',
    linkedSessionTitle: input.linkedSessionTitle
  };
}

export function addDriveAudioFile(
  files: DriveAudioFile[],
  entry: DriveAudioFile
): DriveAudioFile[] {
  const filtered = files.filter((f) => f.id !== entry.id);
  return [entry, ...filtered];
}

export function removeDriveAudioFile(
  files: DriveAudioFile[],
  id: string
): DriveAudioFile[] {
  return files.filter((f) => f.id !== id);
}

export function filterDriveAudioFiles(
  files: DriveAudioFile[],
  originFilter: 'all' | AudioOrigin,
  query: string
): DriveAudioFile[] {
  const q = query.trim().toLowerCase();
  return files.filter((f) => {
    if (originFilter !== 'all' && f.origin !== originFilter) return false;
    if (!q) return true;
    return (
      f.fileName.toLowerCase().includes(q) ||
      (f.linkedSessionTitle || '').toLowerCase().includes(q)
    );
  });
}

export function getDriveStorageSummary(files: DriveAudioFile[]): {
  count: number;
  totalBytes: number;
  totalSizeLabel: string;
} {
  const totalBytes = files.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
  return {
    count: files.length,
    totalBytes,
    totalSizeLabel: formatFileSize(totalBytes)
  };
}
