/**
 * Dual-host podcast audio synthesis engine
 * Generates concise conversational scripts between two hosts,
 * resolves trained personal voice vs open-source cloud voice mods,
 * and computes playback pitch/rate calibration.
 */

import {
  LocalDocument,
  OpenSourceVoiceMod,
  PodcastDialogueTurn,
  VoiceProfileConfig
} from '../types/index.ts';
import { OPEN_SOURCE_VOICE_MODS } from '../data/mockData.ts';

export interface AudioSynthesisConfig {
  mode: 'on-device-avspeech' | 'on-device-kokoro' | 'cloud-secure-api';
  voiceAlex: string;
  voiceMaya: string;
  speakingRate: number;
  pitchModulation: boolean;
  zeroDataRetention: boolean;
}

export interface ResolvedPodcastVoiceProfile {
  engineLabel: string;
  hostAlexLabel: string;
  hostMayaLabel: string;
  alexPitch: number;
  alexRate: number;
  mayaPitch: number;
  mayaRate: number;
  isPersonalTrained: boolean;
  mod?: OpenSourceVoiceMod;
}

export function getOpenSourceVoiceMod(id: string): OpenSourceVoiceMod {
  return OPEN_SOURCE_VOICE_MODS.find(m => m.id === id) || OPEN_SOURCE_VOICE_MODS[0];
}

export function resolvePodcastVoiceProfile(
  voiceProfile?: VoiceProfileConfig
): ResolvedPodcastVoiceProfile {
  const mod = getOpenSourceVoiceMod(voiceProfile?.openSourceModId || 'dia-16b');

  if (
    voiceProfile &&
    voiceProfile.activeMode === 'trained-personal' &&
    voiceProfile.personalProfile.status === 'ready'
  ) {
    const p = voiceProfile.personalProfile;
    return {
      engineLabel: `${p.name} (Trained) · Chatterbox Clone`,
      hostAlexLabel: `${p.name} (Your Voice)`,
      hostMayaLabel: `Maya · ${mod.name.split(' ')[0]}`,
      alexPitch: p.pitchMultiplier,
      alexRate: p.rateMultiplier,
      mayaPitch: 1.14,
      mayaRate: 1.03,
      isPersonalTrained: true,
      mod
    };
  }

  return {
    engineLabel: `${mod.name} · Open-Source Cloud`,
    hostAlexLabel: `Alex · ${mod.name.split(' ')[0]}`,
    hostMayaLabel: `Maya · ${mod.coHostPair.split('·')[1]?.trim() || 'Co-Host'}`,
    alexPitch: mod.defaultPitch,
    alexRate: mod.defaultRate,
    mayaPitch: Number(Math.min(1.3, mod.defaultPitch + 0.16).toFixed(2)),
    mayaRate: Number((mod.defaultRate * 1.02).toFixed(2)),
    isPersonalTrained: false,
    mod
  };
}

/**
 * Calculates estimated speech duration in seconds from word count
 * Conversational podcast tempo is approx 155 words per minute (~2.58 words/second)
 */
export function estimateSpokenDurationSec(text: string, speakingRate = 1.0): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  const wordsPerSecond = (155 / 60) * speakingRate;
  return Number((words / wordsPerSecond).toFixed(1));
}

/**
 * Calculates total episode duration in minutes from dialogue turns
 */
export function calculateEpisodeDuration(turns: PodcastDialogueTurn[]): { totalSec: number; formatted: string } {
  const totalSec = turns.reduce((acc, turn) => acc + (turn.durationSec || estimateSpokenDurationSec(turn.text)), 0);
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.floor(totalSec % 60);
  const formatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  return { totalSec, formatted };
}

/**
 * Generates a concise dual-host dialogue outline from a local ClaimCenter document
 */
export function generateDualHostScriptFromDocument(doc: LocalDocument): PodcastDialogueTurn[] {
  return [
    {
      id: 'turn-1',
      speaker: 'Alex',
      speakerRole: 'Deep Tech Host',
      text: `Let us review "${doc.title}". ${doc.summary}`,
      durationSec: 6.5,
      citations: [1]
    },
    {
      id: 'turn-2',
      speaker: 'Maya',
      speakerRole: 'Practical Synthesizer',
      text: `In ClaimCenter workflows, grounding this spec locally means FNOL validation, exposure mapping, and authority rules stay fast and auditable.`,
      durationSec: 7.4,
      citations: [1]
    },
    {
      id: 'turn-3',
      speaker: 'Alex',
      speakerRole: 'Deep Tech Host',
      text: `Specifically, the indexed chunks highlight: ${doc.contentExcerpt}`,
      durationSec: 7.8,
      citations: [2]
    },
    {
      id: 'turn-4',
      speaker: 'Maya',
      speakerRole: 'Practical Synthesizer',
      text: `And because vector retrieval runs inside local SQLite, proprietary carrier rules and claim schemas remain cleanly structured.`,
      durationSec: 6.8,
      citations: [2]
    }
  ];
}

export interface TimedTranscriptTurn {
  turn: PodcastDialogueTurn;
  originalIndex: number;
  startSec: number;
  timestampLabel: string;
}

export function formatTranscriptTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function computeTranscriptTurnsWithOffsets(
  turns: readonly PodcastDialogueTurn[]
): TimedTranscriptTurn[] {
  let elapsed = 0;
  return turns.map((turn, originalIndex) => {
    const entry: TimedTranscriptTurn = {
      turn,
      originalIndex,
      startSec: elapsed,
      timestampLabel: formatTranscriptTimestamp(elapsed)
    };
    elapsed += Math.max(0, turn.durationSec || 0);
    return entry;
  });
}

export function filterTranscriptTurns(
  timedTurns: readonly TimedTranscriptTurn[],
  speakerFilter: 'all' | 'Alex' | 'Maya',
  query: string
): TimedTranscriptTurn[] {
  const q = query.trim().toLowerCase();
  return timedTurns.filter(({ turn }) => {
    if (speakerFilter !== 'all' && turn.speaker !== speakerFilter) return false;
    if (!q) return true;
    return (
      turn.text.toLowerCase().includes(q) ||
      turn.speaker.toLowerCase().includes(q) ||
      turn.speakerRole.toLowerCase().includes(q)
    );
  });
}

export function formatEpisodeTranscriptText(
  title: string,
  turns: readonly PodcastDialogueTurn[]
): string {
  const timed = computeTranscriptTurnsWithOffsets(turns);
  const lines = timed.map(
    ({ turn, timestampLabel }) => `[${timestampLabel}] ${turn.speaker} (${turn.speakerRole}): ${turn.text}`
  );
  return `${title}\n\n${lines.join('\n\n')}`;
}

