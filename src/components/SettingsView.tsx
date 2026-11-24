import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Bot,
  ChevronRight,
  Cloud,
  Compass,
  Cpu,
  FileCode,
  FileText,
  Fingerprint,
  HardDrive,
  Key,
  LogIn,
  LogOut,
  Mic,
  Shield,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Vibrate
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { HAPTIC_PROFILES } from '../utils/haptics.ts';
import {
  MOTION_INTENSITY_OPTIONS,
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS,
  buildTabVariants
} from '../utils/motion.ts';
import {
  SETTINGS_CATEGORY_GROUPS,
  buildSettingsCategorySummaries,
  getSettingsCategoryMeta,
  resolveInitialSettingsCategory
} from '../utils/settingsCategories.ts';
import {
  AppSettings,
  Callsign,
  DictationHistoryEntry,
  DictionaryEntry,
  DriveAudioFile,
  ModelOption,
  PaidProviderId,
  SettingsBucketId,
  SettingsCategoryId,
  UserIdentity,
  WhisperModelOption
} from '../types/index.ts';
import {
  PAID_PROVIDERS,
  checkLiveTranscriptionReadiness,
  countConfiguredApiKeys,
  validateApiKeyFormat
} from '../utils/providerRouting.ts';
import { isLocalOnlyActive } from '../utils/networkGateway.ts';
import { CallsignIdentitySection } from './CallsignIdentitySection.tsx';
import { DictionaryBucketView } from './DictionaryBucketView.tsx';
import { DriveFolderView } from './DriveFolderView.tsx';
import { HapticsBucketView } from './HapticsBucketView.tsx';
import { HardwareLabView } from './HardwareLabView.tsx';
import { ModelAudioHubView, type HubTabId } from './ModelAudioHubView.tsx';
import { VoiceProfileBucketView } from './VoiceProfileBucketView.tsx';
import { WhitepaperView } from './WhitepaperView.tsx';
import { useFirebaseAuth } from './FirebaseProvider.tsx';

interface SettingsViewProps {
  settings: AppSettings;
  llmModels: ModelOption[];
  whisperModels: WhisperModelOption[];
  driveFiles: DriveAudioFile[];
  dictionaryEntries: DictionaryEntry[];
  historyEntries: DictationHistoryEntry[];
  identity: UserIdentity;
  callsigns: Callsign[];
  isDeviceFrame: boolean;
  onToggleDeviceFrame: () => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUpdateDictionary: (next: DictionaryEntry[]) => void;
  onOpenHubModal: (tab?: HubTabId) => void;
  onOpenApiKeys: (focusProvider?: PaidProviderId) => void;
  onDeleteHistoryEntry: (entryId: string) => void;
  onWipeHistory: () => void;
  onInsertDictatedText?: (text: string) => void;
  onSaveToDrive: (file: DriveAudioFile) => void;
  onDeleteFromDrive: (id: string) => void;
  onOpenDriveFileInMeetings: (file: DriveAudioFile) => void;
  onCreateCallsign: (input: { displayName: string; avatar: string; isActive: boolean }) => Promise<void>;
  onUpdateCallsign: (
    callsignId: string,
    patch: { displayName?: string; avatar?: string; isActive?: boolean }
  ) => Promise<void>;
  onDeleteCallsign: (callsignId: string) => Promise<void>;
  onReplayOnboarding?: () => void;
  requestedBucket?: SettingsBucketId | null;
  requestedBucketNonce?: number;
}

const CATEGORY_ICONS: Record<SettingsCategoryId, React.ComponentType<{ className?: string }>> = {
  callsigns: Fingerprint,
  hub: Cpu,
  voice: Mic,
  haptics: Vibrate,
  dictionary: BookOpen,
  drive: HardDrive,
  features: SlidersHorizontal,
  system: Key
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  llmModels,
  whisperModels,
  driveFiles,
  dictionaryEntries,
  historyEntries,
  identity,
  callsigns,
  isDeviceFrame,
  onToggleDeviceFrame,
  onUpdateSettings,
  onUpdateDictionary,
  onOpenHubModal,
  onOpenApiKeys,
  onDeleteHistoryEntry,
  onWipeHistory,
  onInsertDictatedText,
  onSaveToDrive,
  onDeleteFromDrive,
  onOpenDriveFileInMeetings,
  onCreateCallsign,
  onUpdateCallsign,
  onDeleteCallsign,
  onReplayOnboarding,
  requestedBucket,
  requestedBucketNonce = 0
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const { user, workspaceRootReady, isSigningIn, authError, signInWithGoogle, signOut, clearAuthError } =
    useFirebaseAuth();
  const isReducedMotion = prefersReduced || settings.motionIntensity === 'reduced';
  const drillVariants = buildTabVariants(isReducedMotion);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [[activeCategory, viewDirection], setCategoryState] = useState<
    [SettingsCategoryId | null, 1 | -1]
  >(() => [resolveInitialSettingsCategory(requestedBucket), 1]);

  const openCategory = (next: SettingsCategoryId) => {
    setCategoryState(([prev]) => [next, prev === null ? 1 : 1]);
  };

  const backToCategories = () => {
    setCategoryState(([prev]) => (prev === null ? [null, -1] : [null, -1]));
  };

  const [systemSubView, setSystemSubView] = useState<'root' | 'hardware' | 'whitepaper'>('root');

  useEffect(() => {
    const resolved = resolveInitialSettingsCategory(requestedBucket);
    setCategoryState(([prev]) => {
      if (prev === resolved) return [prev, 1];
      return [resolved, resolved === null ? -1 : 1];
    });
    setSystemSubView('root');
  }, [requestedBucket, requestedBucketNonce]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    if (activeCategory !== 'system') {
      setSystemSubView('root');
    }
  }, [activeCategory]);

  const localOnly = isLocalOnlyActive(settings);
  const configuredKeyCount = countConfiguredApiKeys(settings);
  const configuredProviderNames = PAID_PROVIDERS
    .filter(p => validateApiKeyFormat(p.id, settings.apiKeys[p.id] || '').valid)
    .map(p => p.name);
  const liveReadiness = useMemo(() => checkLiveTranscriptionReadiness(settings), [settings]);

  const activeMotionOption =
    MOTION_INTENSITY_OPTIONS.find(o => o.id === settings.motionIntensity) || MOTION_INTENSITY_OPTIONS[1];

  const activeCallsign = callsigns.find((c) => c.isActive) || callsigns[0];
  const activeCallsignLabel = activeCallsign
    ? `${activeCallsign.avatar ? `${activeCallsign.avatar} ` : ''}${activeCallsign.displayName}`
    : undefined;

  const categorySummaries = useMemo(
    () =>
      buildSettingsCategorySummaries({
        settings,
        llmModels,
        whisperModels,
        driveFiles,
        dictionaryEntries,
        liveProviderLabel: liveReadiness.option.companyName,
        isDeviceFrame,
        activeCallsignLabel,
        callsignCount: callsigns.length
      }),
    [
      settings,
      llmModels,
      whisperModels,
      driveFiles,
      dictionaryEntries,
      liveReadiness.option.companyName,
      isDeviceFrame,
      activeCallsignLabel,
      callsigns.length
    ]
  );

  const activeMeta = activeCategory ? getSettingsCategoryMeta(activeCategory) : null;
  const ActiveCategoryIcon = activeCategory ? CATEGORY_ICONS[activeCategory] : null;

  return (
    <div
      ref={scrollRef}
      className="flex flex-col h-full max-w-3xl mx-auto w-full px-3 sm:px-5 py-3 pb-28 overflow-y-auto"
    >
      <AnimatePresence mode="wait" initial={false} custom={viewDirection}>
        {activeCategory === null ? (
          <motion.div
            key="settings-categories-root"
            custom={viewDirection}
            variants={drillVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-4"
          >
            {/* Categories Root Header */}
            <div className="flex items-baseline justify-between gap-3 px-1">
              <div>
                <h2 className="text-base font-semibold text-zinc-50 tracking-tight">Settings</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Select a category to inspect and configure options
                </p>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-zinc-400 shrink-0 whitespace-nowrap">
                {configuredKeyCount}/{PAID_PROVIDERS.length} keys · {settings.offlineOnly ? 'Offline' : 'Hybrid'}
              </span>
            </div>

            {/* Firebase Cloud Sync & Account Card */}
            <div className="rounded-2xl liquid-glass p-3.5 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Google Account'}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-xl object-cover border border-white/15 shrink-0"
                    />
                  ) : (
                    <div
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                        user
                          ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                          : 'bg-[#0F7FFF]/15 border-[#54B0FF]/35 text-[#54B0FF]'
                      }`}
                    >
                      <Cloud className="w-4 h-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-zinc-100 truncate">
                      {user ? user.displayName || 'Google Workspace User' : 'Firebase Cloud Sync'}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      {user
                        ? `${user.email || 'Verified'} · ${
                            workspaceRootReady ? 'Firestore Live' : 'Connecting…'
                          }`
                        : 'Sign in with Google to sync diary, tasks, documents & preferences'}
                    </div>
                  </div>
                </div>

                {user ? (
                  <button
                    type="button"
                    data-haptic="selection"
                    onClick={() => void signOut()}
                    className="px-3 py-1.5 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-[11px] font-medium text-zinc-200 flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Sign Out</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    data-haptic="medium"
                    disabled={isSigningIn}
                    onClick={() => void signInWithGoogle()}
                    className="px-3 py-1.5 rounded-xl bg-[#0F7FFF] hover:bg-[#2B98FF] text-[11px] font-semibold text-white flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{isSigningIn ? 'Connecting…' : 'Sign In'}</span>
                  </button>
                )}
              </div>

              {authError && (
                <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-amber-500/10 border border-amber-400/30 text-[11px] text-amber-200">
                  <span className="truncate">{authError}</span>
                  <button
                    type="button"
                    onClick={clearAuthError}
                    className="text-[10px] font-semibold text-amber-300 hover:text-amber-100 shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>

            {/* Grouped Category Directory */}
            <div className="space-y-4">
              {SETTINGS_CATEGORY_GROUPS.map((group) => (
                <section key={group.id} aria-label={group.label} className="space-y-1.5">
                  <div className="px-1">
                    <span className="text-[11px] font-medium text-zinc-400 tracking-wide">
                      {group.label}
                    </span>
                  </div>

                  <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
                    {group.categoryIds.map((categoryId) => {
                      const meta = getSettingsCategoryMeta(categoryId);
                      const summary = categorySummaries[categoryId];
                      const Icon = CATEGORY_ICONS[categoryId];

                      return (
                        <motion.button
                          key={categoryId}
                          type="button"
                          data-haptic="selection"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={() => openCategory(categoryId)}
                          aria-label={`${meta.title}: ${summary.primarySummary}`}
                          className="w-full min-h-[64px] flex items-center justify-between gap-3 px-3.5 sm:px-4 py-3 text-left hover:bg-white/[0.06] transition-colors group"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span
                              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${meta.accentClass}`}
                              aria-hidden="true"
                            >
                              <Icon className="w-[18px] h-[18px]" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-semibold text-zinc-100 leading-snug">
                                {meta.title}
                              </div>
                              <div className="text-xs text-zinc-400 truncate mt-0.5">
                                {summary.primarySummary}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-mono tabular-nums text-zinc-300 whitespace-nowrap">
                              {summary.trailingLabel}
                            </span>
                            <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`settings-detail-${activeCategory}`}
            custom={viewDirection}
            variants={drillVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-4"
          >
            {/* Category Detail Sticky-Style Top Navigation Bar */}
            <div className="rounded-2xl liquid-glass px-3 py-2.5 flex items-center justify-between gap-3">
              <motion.button
                type="button"
                data-haptic="selection"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={backToCategories}
                aria-label="Back to settings categories"
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-medium text-[#54B0FF] hover:bg-white/[0.08] transition-colors shrink-0 whitespace-nowrap"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Settings</span>
              </motion.button>

              {activeMeta && ActiveCategoryIcon && (
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${activeMeta.accentClass}`}
                    aria-hidden="true"
                  >
                    <ActiveCategoryIcon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 text-right sm:text-left">
                    <h2 className="text-sm font-semibold text-zinc-50 tracking-tight truncate">
                      {activeMeta.title}
                    </h2>
                  </div>
                </div>
              )}
            </div>

            {activeMeta && (
              <p className="text-xs text-zinc-400 px-1">{activeMeta.description}</p>
            )}

            {/* DETAIL 0: Callsign & Identity */}
            {activeCategory === 'callsigns' && (
              <section aria-label="Callsign and Identity settings">
                <CallsignIdentitySection
                  identity={identity}
                  callsigns={callsigns}
                  onCreateCallsign={onCreateCallsign}
                  onUpdateCallsign={onUpdateCallsign}
                  onDeleteCallsign={onDeleteCallsign}
                  onReplayOnboarding={onReplayOnboarding}
                />
              </section>
            )}

            {/* DETAIL 1: Unified Models, Audio & Dictation Hub */}
            {activeCategory === 'hub' && (
              <section aria-label="Models, Audio and Dictation Hub">
                <ModelAudioHubView
                  settings={settings}
                  onUpdateSettings={onUpdateSettings}
                  historyEntries={historyEntries}
                  onDeleteHistoryEntry={onDeleteHistoryEntry}
                  onWipeHistory={onWipeHistory}
                  onInsertText={onInsertDictatedText}
                  mode="embedded"
                />
              </section>
            )}

            {/* DETAIL 3: Voice Profile */}
            {activeCategory === 'voice' && (
              <section aria-label="Voice Profile settings">
                <VoiceProfileBucketView
                  settings={settings}
                  onUpdateSettings={onUpdateSettings}
                  onSaveToDrive={onSaveToDrive}
                />
              </section>
            )}

            {/* DETAIL 4: Haptics */}
            {activeCategory === 'haptics' && (
              <section aria-label="Haptics settings">
                <HapticsBucketView
                  settings={settings}
                  onUpdateSettings={onUpdateSettings}
                />
              </section>
            )}

            {/* DETAIL 5: Dictionary */}
            {activeCategory === 'dictionary' && (
              <section aria-label="Dictionary settings">
                <DictionaryBucketView
                  entries={dictionaryEntries}
                  settings={settings}
                  onUpdateEntries={onUpdateDictionary}
                  onUpdateSettings={onUpdateSettings}
                  onOpenApiKeys={onOpenApiKeys}
                />
              </section>
            )}

            {/* DETAIL 6: Drive */}
            {activeCategory === 'drive' && (
              <section aria-label="Drive audio storage settings">
                <DriveFolderView
                  embedded
                  files={driveFiles}
                  onSaveToDrive={onSaveToDrive}
                  onDeleteFromDrive={onDeleteFromDrive}
                  onOpenInMeetings={onOpenDriveFileInMeetings}
                />
              </section>
            )}

            {/* DETAIL 7: Features & Optional Modules */}
            {activeCategory === 'features' && (
              <section aria-label="Optional features and modules">
                <div className="rounded-2xl liquid-glass divide-y divide-white/10 text-xs overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <Bot
                        className={`w-4 h-4 shrink-0 ${
                          settings.enableCrewPlanner ?? false ? 'text-[#54B0FF]' : 'text-zinc-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-zinc-100">Crew Planner</div>
                        <div className="text-[11px] text-zinc-400">
                          Adds Nanobot &amp; Crew task orchestration inside Workspace
                        </div>
                      </div>
                    </div>
                    <motion.button
                      type="button"
                      role="switch"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      aria-checked={settings.enableCrewPlanner ?? false}
                      aria-label="Toggle Crew Planner workspace tab"
                      onClick={() =>
                        onUpdateSettings({
                          enableCrewPlanner: !(settings.enableCrewPlanner ?? false)
                        })
                      }
                      className={`px-3 py-1 rounded-full text-[11px] font-mono border transition-colors shrink-0 ${
                        settings.enableCrewPlanner ?? false
                          ? 'bg-[#0F7FFF]/20 text-[#54B0FF] border-[#54B0FF]/40'
                          : 'liquid-glass-subtle text-zinc-400'
                      }`}
                    >
                      {settings.enableCrewPlanner ?? false ? 'ON' : 'OFF'}
                    </motion.button>
                  </div>

                  <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText
                        className={`w-4 h-4 shrink-0 ${
                          settings.enableOfficeDiary ?? false ? 'text-[#54B0FF]' : 'text-zinc-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-zinc-100">Office Diary</div>
                        <div className="text-[11px] text-zinc-400">
                          Adds private daily journal &amp; quick note logs inside Workspace
                        </div>
                      </div>
                    </div>
                    <motion.button
                      type="button"
                      role="switch"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      aria-checked={settings.enableOfficeDiary ?? false}
                      aria-label="Toggle Office Diary workspace tab"
                      onClick={() =>
                        onUpdateSettings({
                          enableOfficeDiary: !(settings.enableOfficeDiary ?? false)
                        })
                      }
                      className={`px-3 py-1 rounded-full text-[11px] font-mono border transition-colors shrink-0 ${
                        settings.enableOfficeDiary ?? false
                          ? 'bg-[#0F7FFF]/20 text-[#54B0FF] border-[#54B0FF]/40'
                          : 'liquid-glass-subtle text-zinc-400'
                      }`}
                    >
                      {settings.enableOfficeDiary ?? false ? 'ON' : 'OFF'}
                    </motion.button>
                  </div>

                  <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <Compass
                        className={`w-4 h-4 shrink-0 ${
                          settings.enableScoutFeature ?? false ? 'text-[#54B0FF]' : 'text-zinc-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-zinc-100">Scout Web Search</div>
                        <div className="text-[11px] text-zinc-400">
                          Adds Scout orb, /web commands &amp; Cmd+K inside opened Meeting details
                        </div>
                      </div>
                    </div>
                    <motion.button
                      type="button"
                      role="switch"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      aria-checked={settings.enableScoutFeature ?? false}
                      aria-label="Toggle Scout web search inside Meeting details"
                      onClick={() =>
                        onUpdateSettings({
                          enableScoutFeature: !(settings.enableScoutFeature ?? false)
                        })
                      }
                      className={`px-3 py-1 rounded-full text-[11px] font-mono border transition-colors shrink-0 ${
                        settings.enableScoutFeature ?? false
                          ? 'bg-[#0F7FFF]/20 text-[#54B0FF] border-[#54B0FF]/40'
                          : 'liquid-glass-subtle text-zinc-400'
                      }`}
                    >
                      {settings.enableScoutFeature ?? false ? 'ON' : 'OFF'}
                    </motion.button>
                  </div>
                </div>
              </section>
            )}

            {/* DETAIL 8: System & Firewall (Clean drill-down screens for Diagnostics) */}
            {activeCategory === 'system' && (
              <section aria-label="Keys and System settings" className="space-y-3">
                {systemSubView !== 'root' ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl liquid-glass px-3 py-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setSystemSubView('root')}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#54B0FF] hover:text-white"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>System &amp; Firewall</span>
                      </button>
                      <span className="text-xs font-semibold text-zinc-100">
                        {systemSubView === 'hardware' ? 'iOS Memory & Jetsam Lab' : 'Architecture Study'}
                      </span>
                    </div>
                    {systemSubView === 'hardware' ? <HardwareLabView /> : <WhitepaperView />}
                  </div>
                ) : (
                  <div className="rounded-2xl liquid-glass divide-y divide-white/10 text-xs overflow-hidden">
                    <motion.button
                      type="button"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      onClick={() => onOpenHubModal('keys')}
                      className="w-full min-h-[56px] flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Key className="w-4 h-4 text-[#2B98FF] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-zinc-100">
                            Paid API Keys &amp; Loopback Endpoints
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono truncate">
                            {configuredKeyCount}/{PAID_PROVIDERS.length} configured
                            {configuredProviderNames.length > 0
                              ? ` · ${configuredProviderNames.join(' · ')}`
                              : ' · Gemini, OpenAI, Anthropic, Groq, Deepgram, AssemblyAI'}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                    </motion.button>

                    <div className="px-4 py-3 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Sparkles className="w-4 h-4 text-[#2B98FF] shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-zinc-100">Motion Intensity</div>
                            <div className="text-[11px] text-zinc-400">
                              {activeMotionOption.tagline}
                            </div>
                          </div>
                        </div>

                        <div
                          role="radiogroup"
                          aria-label="Motion intensity preset"
                          className="flex items-center gap-0.5 p-1 rounded-full liquid-glass-subtle text-[11px] shrink-0"
                        >
                          {MOTION_INTENSITY_OPTIONS.map((opt) => {
                            const active = settings.motionIntensity === opt.id;
                            return (
                              <motion.button
                                key={opt.id}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                data-haptic="selection"
                                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                                transition={MOTION_SPRINGS.interactive}
                                onClick={() => onUpdateSettings({ motionIntensity: opt.id })}
                                className={`relative px-2.5 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                                  active ? 'text-zinc-950' : 'text-zinc-300 hover:text-zinc-100'
                                }`}
                              >
                                {active && (
                                  <motion.span
                                    layoutId="motion-intensity-pill"
                                    transition={MOTION_SPRINGS.pill}
                                    aria-hidden="true"
                                    className="absolute inset-0 rounded-full liquid-lens-active"
                                  />
                                )}
                                <span className="relative z-10">{opt.label}</span>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Shield
                          className={`w-4 h-4 ${localOnly ? 'text-emerald-400' : 'text-zinc-400'}`}
                        />
                        <div>
                          <div className="text-zinc-200">Local-Only Firewall Mode</div>
                          <div className="text-[11px] text-zinc-400">
                            Blocks external egress; allows WebGPU/WASM &amp; loopback
                          </div>
                        </div>
                      </div>
                      <motion.button
                        type="button"
                        role="switch"
                        data-haptic="selection"
                        whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                        transition={MOTION_SPRINGS.interactive}
                        aria-checked={localOnly}
                        aria-label="Toggle local-only firewall mode"
                        onClick={() =>
                          onUpdateSettings({ localOnly: !localOnly, offlineOnly: !localOnly })
                        }
                        className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                          localOnly
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'liquid-glass-subtle text-zinc-300'
                        }`}
                      >
                        {localOnly ? 'LOCAL-ONLY' : 'HYBRID'}
                      </motion.button>
                    </div>

                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Smartphone className="w-4 h-4 text-zinc-400" />
                        <div className="text-zinc-200">iOS Device Frame</div>
                      </div>
                      <motion.button
                        type="button"
                        data-haptic="selection"
                        whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                        transition={MOTION_SPRINGS.interactive}
                        onClick={onToggleDeviceFrame}
                        className="px-2.5 py-1 rounded-full text-[11px] font-mono liquid-glass-subtle text-zinc-200 hover:bg-white/10"
                      >
                        {isDeviceFrame ? 'iPhone' : 'Expanded'}
                      </motion.button>
                    </div>

                    <motion.button
                      type="button"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      onClick={() => setSystemSubView('hardware')}
                      className="w-full min-h-[52px] flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Activity className="w-4 h-4 text-zinc-400" />
                        <div className="text-xs font-medium text-zinc-100">iOS Memory &amp; Jetsam Lab</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    </motion.button>

                    <motion.button
                      type="button"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      onClick={() => setSystemSubView('whitepaper')}
                      className="w-full min-h-[52px] flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileCode className="w-4 h-4 text-zinc-400" />
                        <div className="text-xs font-medium text-zinc-100">Architecture Study</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    </motion.button>
                  </div>
                )}
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
