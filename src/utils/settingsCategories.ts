import type {
  AppSettings,
  DictionaryEntry,
  DriveAudioFile,
  ModelOption,
  SettingsBucketId,
  SettingsCategoryId,
  WhisperModelOption
} from '../types/index.ts';
import { getDriveStorageSummary } from './audioDrive.ts';
import { loadDictationModes, resolveActiveDictationMode } from './dictationModes.ts';
import { HAPTIC_PROFILES } from './haptics.ts';
import { getUnifiedModelById } from './modelRegistry.ts';
import { MOTION_INTENSITY_OPTIONS } from './motion.ts';
import { isLocalOnlyActive } from './networkGateway.ts';
import { PAID_PROVIDERS, countConfiguredApiKeys } from './providerRouting.ts';

export type SettingsCategoryGroupId = 'intelligence' | 'personalization' | 'system';

export interface SettingsCategoryMeta {
  id: SettingsCategoryId;
  group: SettingsCategoryGroupId;
  title: string;
  description: string;
  accentClass: string;
}

export interface SettingsCategoryGroup {
  id: SettingsCategoryGroupId;
  label: string;
  categoryIds: readonly SettingsCategoryId[];
}

export interface SettingsCategorySummary {
  id: SettingsCategoryId;
  primarySummary: string;
  trailingLabel: string;
}

export const SETTINGS_CATEGORIES: readonly SettingsCategoryMeta[] = [
  {
    id: 'callsigns',
    group: 'personalization',
    title: 'Callsign & Identity',
    description: 'Create display Callsigns and inspect your immutable backend User ID',
    accentClass: 'bg-[#0F7FFF]/18 text-[#54B0FF] border-[#2B98FF]/30'
  },
  {
    id: 'hub',
    group: 'intelligence',
    title: 'Models, Audio & Dictation Hub',
    description:
      'Unified Speech & Text model registry, Modes & A→B translation, BYOK API keys, Local-Only firewall & History',
    accentClass: 'bg-[#0F7FFF]/18 text-[#54B0FF] border-[#2B98FF]/30'
  },
  {
    id: 'voice',
    group: 'personalization',
    title: 'Voice Profile',
    description: 'Personal voice training samples and open-source cloud voice mods',
    accentClass: 'bg-violet-500/18 text-violet-300 border-violet-400/30'
  },
  {
    id: 'haptics',
    group: 'personalization',
    title: 'Haptics',
    description: 'Tactile feedback profiles, intensity scaling & interaction triggers',
    accentClass: 'bg-amber-500/18 text-amber-300 border-amber-400/30'
  },
  {
    id: 'dictionary',
    group: 'personalization',
    title: 'Dictionary',
    description: 'Domain glossary, auto-learned vocabulary & keyterm boosts',
    accentClass: 'bg-emerald-500/18 text-emerald-300 border-emerald-400/30'
  },
  {
    id: 'drive',
    group: 'personalization',
    title: 'Drive',
    description: 'Recorded audio vault, imported clips & storage management',
    accentClass: 'bg-sky-500/18 text-sky-300 border-sky-400/30'
  },
  {
    id: 'features',
    group: 'system',
    title: 'Features & Modules',
    description: 'Enable or hide optional modules like Crew Planner, Office Diary & Scout web search',
    accentClass: 'bg-indigo-500/18 text-indigo-300 border-indigo-400/30'
  },
  {
    id: 'system',
    group: 'system',
    title: 'System & Firewall',
    description: 'Local-Only shield, Motion Intensity, Jetsam lab & device diagnostics',
    accentClass: 'bg-white/10 text-zinc-200 border-white/20'
  }
] as const;

export const SETTINGS_CATEGORY_GROUPS: readonly SettingsCategoryGroup[] = [
  {
    id: 'intelligence',
    label: 'Models, Audio & Dictation Hub',
    categoryIds: ['hub']
  },
  {
    id: 'personalization',
    label: 'Identity, Personalization & Vault',
    categoryIds: ['callsigns', 'voice', 'haptics', 'dictionary', 'drive']
  },
  {
    id: 'system',
    label: 'Modules, Firewall & System',
    categoryIds: ['features', 'system']
  }
] as const;

export function getSettingsCategoryMeta(id: SettingsCategoryId): SettingsCategoryMeta {
  return SETTINGS_CATEGORIES.find(c => c.id === id) || SETTINGS_CATEGORIES[0];
}

export function resolveInitialSettingsCategory(
  requestedBucket?: SettingsBucketId | null
): SettingsCategoryId | null {
  if (!requestedBucket) return null;
  if (requestedBucket === 'models' || requestedBucket === 'speech') {
    return 'hub';
  }
  return SETTINGS_CATEGORIES.some(c => c.id === requestedBucket)
    ? (requestedBucket as SettingsCategoryId)
    : null;
}

export function buildSettingsCategorySummaries(params: {
  settings: AppSettings;
  llmModels?: readonly ModelOption[];
  whisperModels?: readonly WhisperModelOption[];
  driveFiles: readonly DriveAudioFile[];
  dictionaryEntries: readonly DictionaryEntry[];
  liveProviderLabel?: string;
  isDeviceFrame: boolean;
  activeCallsignLabel?: string;
  callsignCount?: number;
}): Record<SettingsCategoryId, SettingsCategorySummary> {
  const {
    settings,
    driveFiles,
    dictionaryEntries,
    isDeviceFrame,
    activeCallsignLabel,
    callsignCount = 0
  } = params;

  const localOnly = isLocalOnlyActive(settings);
  const sttSpec = getUnifiedModelById(settings.activeSttModelId || settings.activeWhisperId);
  const textSpec = getUnifiedModelById(settings.activeTextModelId || settings.activeLlmId);
  const modes = loadDictationModes(settings.dictationModes);
  const activeMode = resolveActiveDictationMode(modes, settings.activeDictationModeId);

  const driveSummary = getDriveStorageSummary([...driveFiles]);
  const configuredKeyCount = countConfiguredApiKeys(settings);
  const isHapticsActive = settings.hapticFeedback && settings.haptics.enabled;
  const activeHapticProfile =
    HAPTIC_PROFILES.find(p => p.id === settings.haptics.profile) || HAPTIC_PROFILES[0];
  const activeMotionOption =
    MOTION_INTENSITY_OPTIONS.find(o => o.id === settings.motionIntensity) ||
    MOTION_INTENSITY_OPTIONS[1];

  const voiceReady = settings.voiceProfile.personalProfile.status === 'ready';
  const voiceSummary =
    settings.voiceProfile.activeMode === 'open-source-mod'
      ? `Open-source mod · ${settings.voiceProfile.openSourceModId}`
      : voiceReady
        ? 'Personal voice clone trained'
        : `${settings.voiceProfile.personalProfile.samplesCompleted}/${settings.voiceProfile.personalProfile.totalSamples} calibration samples`;

  const enabledFeatures: string[] = [];
  if (settings.enableCrewPlanner ?? false) enabledFeatures.push('Crew Planner');
  if (settings.enableOfficeDiary ?? false) enabledFeatures.push('Office Diary');
  if (settings.enableScoutFeature ?? false) enabledFeatures.push('Scout');

  return {
    callsigns: {
      id: 'callsigns',
      primarySummary: activeCallsignLabel
        ? `Active: ${activeCallsignLabel} · ${callsignCount} ${callsignCount === 1 ? 'Callsign' : 'Callsigns'}`
        : 'Create display Callsigns & view immutable User ID',
      trailingLabel: `${callsignCount}`
    },
    hub: {
      id: 'hub',
      primarySummary: `${sttSpec?.name || 'Whisper Tiny'} · ${textSpec?.name || 'Gemini 4'} · ${activeMode.name}`,
      trailingLabel: localOnly ? 'Local-Only' : `${configuredKeyCount}/${PAID_PROVIDERS.length} keys`
    },
    voice: {
      id: 'voice',
      primarySummary: voiceSummary,
      trailingLabel: voiceReady
        ? 'Trained'
        : `${settings.voiceProfile.personalProfile.samplesCompleted}/3`
    },
    haptics: {
      id: 'haptics',
      primarySummary: isHapticsActive
        ? `${activeHapticProfile.name} · ${settings.haptics.intensity} intensity`
        : 'Muted across all interactions',
      trailingLabel: isHapticsActive ? activeHapticProfile.name : 'Off'
    },
    dictionary: {
      id: 'dictionary',
      primarySummary: `${dictionaryEntries.length} domain terms · ${
        settings.autoLearnDictionary ? 'Auto-learn on' : 'Manual'
      }`,
      trailingLabel: `${dictionaryEntries.length}`
    },
    drive: {
      id: 'drive',
      primarySummary:
        driveSummary.count === 0
          ? 'No recordings stored'
          : `${driveSummary.count} ${driveSummary.count === 1 ? 'file' : 'files'} · ${driveSummary.totalSizeLabel}`,
      trailingLabel: `${driveSummary.count}`
    },
    features: {
      id: 'features',
      primarySummary:
        enabledFeatures.length === 0
          ? 'Deep Search only · optional modules off'
          : `${enabledFeatures.join(' · ')} active`,
      trailingLabel: `${enabledFeatures.length}/3`
    },
    system: {
      id: 'system',
      primarySummary: `${activeMotionOption.label} motion · ${
        localOnly ? 'Local-Only Shield' : 'Hybrid'
      } · ${isDeviceFrame ? 'iPhone frame' : 'Expanded'}`,
      trailingLabel: localOnly ? 'LOCAL' : 'HYBRID'
    }
  };
}
