import React, { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { TabBar } from './components/TabBar.tsx';
import { UnifiedWorkspaceView } from './components/UnifiedWorkspaceView.tsx';
import { CrewPlannerSubView } from './components/CrewPlannerSection.tsx';
import { MeetingNotesView } from './components/MeetingNotesView.tsx';
import { StudioView } from './components/StudioView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { OnboardingFlow } from './components/OnboardingFlow.tsx';
import { CreateNanobotPayload } from './components/CreateNanobotWizard.tsx';
import { ModelAudioHubView, type HubTabId } from './components/ModelAudioHubView.tsx';
import { ScoutSheet } from './components/ScoutSheet.tsx';
import { DeviceStatusBar } from './components/DeviceStatusBar.tsx';
import { useFirebaseAuth } from './components/FirebaseProvider.tsx';
import {
  AppMode,
  AppSettings,
  Callsign,
  CoreDataDocumentFormat,
  CoreDataManagedDocument,
  CoreDataVectorStoreState,
  DictationHistoryEntry,
  DictionaryEntry,
  DictionaryTermSource,
  DriveAudioFile,
  GenTeamAgent,
  GenTeamChannel,
  GenTeamMessage,
  GenTeamTask,
  MeetingSession,
  ModelOption,
  Nanobot,
  NanobotRun,
  NanobotStatus,
  NanobotWizardSeed,
  PaidProviderId,
  ScoutLaunchRequest,
  ScoutResult,
  SettingsBucketId,
  SparkpageData,
  UploadedAssetKind,
  UserIdentity,
  WhisperModelOption,
  WorkspaceSubTab
} from './types/index.ts';
import {
  DEFAULT_APP_SETTINGS,
  INITIAL_DICTIONARY_ENTRIES
} from './data/mockData.ts';
import {
  LEGACY_LLM_MODELS,
  LEGACY_WHISPER_MODELS,
  applyUnifiedSettingsPatch,
  resolveActiveLlmFromRegistry
} from './utils/modelRegistry.ts';
import {
  installFetchLocalOnlyFirewall,
  isLocalOnlyActive,
  setGlobalLocalOnlyPolicy
} from './utils/networkGateway.ts';
import {
  addDictationHistoryEntry,
  createDictationHistoryEntry,
  loadDictationHistory,
  pruneDictationHistoryByRetention,
  removeDictationHistoryEntry,
  saveDictationHistory,
  wipeDictationHistory
} from './utils/dictationHistory.ts';
import type { DictationPipelineExecutionResult } from './utils/localSttEngine.ts';
import {
  addDriveAudioFile,
  createDriveAudioFile,
  createSyntheticMeetingWavUrl,
  removeDriveAudioFile
} from './utils/audioDrive.ts';
import {
  formatDictionaryTermsCsv,
  learnTermsFromContext
} from './utils/dictionaryLearning.ts';
import { parseSpeakerLabels } from './utils/providerRouting.ts';
import {
  INITIAL_MEETING_SESSION,
  stripAudioFromMeetingSession
} from './utils/meetingNotes.ts';
import {
  configureHaptics,
  resolveInteractiveHapticKind,
  triggerHaptic
} from './utils/haptics.ts';
import {
  INITIAL_GENTEAM_AGENTS,
  INITIAL_GENTEAM_CHANNELS,
  INITIAL_GENTEAM_MESSAGES,
  INITIAL_GENTEAM_TASKS
} from './utils/genTeam.ts';
import {
  buildScreenVariants,
  getMotionConfigProps,
  getTabTransitionDirection
} from './utils/motion.ts';
import {
  createInitialCoreDataStore,
  deleteCoreDataDocument,
  upsertCoreDataDocument
} from './utils/coreDataVectorDb.ts';
import {
  createDiaryEntryRequest,
  fetchCoreDataStoreSummary,
  syncDocumentDeleteToBackend,
  syncDocumentIngestToBackend
} from './utils/ragClient.ts';
import {
  deleteCallsignFromFirestore,
  deleteCoreDataDocFromFirestore,
  deleteNanobotFromFirestore,
  loadAccountIdentityFromFirestore,
  saveAccountIdentityToFirestore,
  saveCallsignToFirestore,
  saveCoreDataDocToFirestore,
  saveNanobotRunToFirestore,
  saveNanobotToFirestore,
  saveUserPreferencesToFirestore,
  subscribeCallsigns,
  subscribeCoreDataDocuments,
  subscribeNanobots,
  subscribeUserPreferences
} from './utils/firestoreSync.ts';
import {
  createCallsignRequest,
  createNanobotRequest,
  deleteCallsignRequest,
  deleteNanobotRequest,
  fetchNanobotsRequest,
  initBackendIdentity,
  rerunNanobotRequest,
  updateCallsignRequest,
  updateNanobotRequest
} from './utils/nanobotClient.ts';
import { generateReadableUserId } from './utils/identityCallsigns.ts';

const PRIMARY_MODES: readonly AppMode[] = [
  'workspace',
  'meetings',
  'studio',
  'settings'
];

function readShouldSkipOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') return true;
    return window.localStorage.getItem('hasSeenOnboarding') === 'true';
  } catch {
    return false;
  }
}

function getOrCreateGuestScopeKey(): string {
  const storageKey = 'nudge_guest_scope_key';
  if (typeof window === 'undefined') return 'guest-default';
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const created =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `guest-${crypto.randomUUID().slice(0, 12)}`
        : `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    window.localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return 'guest-default';
  }
}

export default function App() {
  const prefersReduced = Boolean(useReducedMotion());
  const { user, authReady, workspaceRootReady } = useFirebaseAuth();
  const [[activeMode, navDirection], setModeState] = useState<[AppMode, 1 | -1]>([
    'workspace',
    1
  ]);
  const [requestedWorkspaceSubTab, setRequestedWorkspaceSubTab] = useState<WorkspaceSubTab | null>(
    null
  );
  const [requestedCrewView, setRequestedCrewView] = useState<CrewPlannerSubView | null>(null);
  const [requestedWorkspaceNonce, setRequestedWorkspaceNonce] = useState<number>(0);

  const setActiveMode = (nextMode: AppMode) => {
    if (nextMode === 'nanoteam' || nextMode === 'genteam') {
      setRequestedWorkspaceSubTab('scheduler');
      setRequestedCrewView('nanoteam');
      setRequestedWorkspaceNonce((n) => n + 1);
      setModeState(([prevMode]) => [
        'workspace',
        getTabTransitionDirection(PRIMARY_MODES, prevMode, 'workspace')
      ]);
      return;
    }
    if (nextMode === 'settings') {
      setRequestedSettingsBucket(null);
      setRequestedSettingsNonce(n => n + 1);
    }
    setModeState(([prevMode]) => {
      if (prevMode === nextMode) return [prevMode, 1];
      return [nextMode, getTabTransitionDirection(PRIMARY_MODES, prevMode, nextMode)];
    });
  };

  const [isDeviceFrame, setIsDeviceFrame] = useState<boolean>(true);
  const [studioSeedSession, setStudioSeedSession] = useState<MeetingSession | null>(null);
  const [incomingDriveFile, setIncomingDriveFile] = useState<DriveAudioFile | null>(null);
  const [requestedSettingsBucket, setRequestedSettingsBucket] = useState<SettingsBucketId | null>(null);
  const [requestedSettingsNonce, setRequestedSettingsNonce] = useState<number>(0);

  const [driveFiles, setDriveFiles] = useState<DriveAudioFile[]>(() => [
    createDriveAudioFile({
      id: INITIAL_MEETING_SESSION.driveFileId || 'drive-sample-fnol-s1',
      fileName: INITIAL_MEETING_SESSION.audioFileName,
      origin: 'sample',
      durationSec: INITIAL_MEETING_SESSION.audioDurationSec || 760,
      sizeBytes: 6400000,
      audioUrl: createSyntheticMeetingWavUrl(INITIAL_MEETING_SESSION.audioDurationSec || 760, 1),
      mimeType: 'audio/wav',
      createdAt: INITIAL_MEETING_SESSION.recordedAt,
      linkedSessionTitle: INITIAL_MEETING_SESSION.title
    })
  ]);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const motionConfig = getMotionConfigProps(settings.motionIntensity);
  const isReducedMotion = prefersReduced || settings.motionIntensity === 'reduced';
  const screenVariants = buildScreenVariants(isReducedMotion);
  const [genTeamAgents, setGenTeamAgents] = useState<GenTeamAgent[]>(INITIAL_GENTEAM_AGENTS);
  const [genTeamChannels, setGenTeamChannels] = useState<GenTeamChannel[]>(INITIAL_GENTEAM_CHANNELS);
  const [genTeamMessages, setGenTeamMessages] = useState<GenTeamMessage[]>(INITIAL_GENTEAM_MESSAGES);
  const [genTeamTasks, setGenTeamTasks] = useState<GenTeamTask[]>(INITIAL_GENTEAM_TASKS);
  const [meetingSessions, setMeetingSessions] = useState<MeetingSession[]>([INITIAL_MEETING_SESSION]);
  const [meetingBaseId, setMeetingBaseId] = useState<string>(INITIAL_MEETING_SESSION.id);
  const [meetingCurrentId, setMeetingCurrentId] = useState<string>(INITIAL_MEETING_SESSION.id);
  const [dictionaryEntries, setDictionaryEntries] = useState<DictionaryEntry[]>(
    INITIAL_DICTIONARY_ENTRIES
  );
  const llmModels: ModelOption[] = LEGACY_LLM_MODELS;
  const whisperModels: WhisperModelOption[] = LEGACY_WHISPER_MODELS;
  const [hubModalState, setHubModalState] = useState<{
    isOpen: boolean;
    tab: HubTabId;
  }>({
    isOpen: false,
    tab: 'models'
  });
  const [historyEntries, setHistoryEntries] = useState<DictationHistoryEntry[]>(() =>
    loadDictationHistory(DEFAULT_APP_SETTINGS.historyRetention || 'forever')
  );
  const [dictationToast, setDictationToast] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => !readShouldSkipOnboarding());
  const [onboardingInitialStage, setOnboardingInitialStage] = useState<'carousel' | 'link'>('carousel');
  const [identity, setIdentity] = useState<UserIdentity>(() => ({
    userId: generateReadableUserId(),
    createdAt: new Date().toISOString(),
    linkedProvider: 'guest'
  }));
  const [identityReady, setIdentityReady] = useState<boolean>(false);
  const [callsigns, setCallsigns] = useState<Callsign[]>([]);
  const [nanobots, setNanobots] = useState<Nanobot[]>([]);
  const [nanobotRuns, setNanobotRuns] = useState<NanobotRun[]>([]);
  const [botNotificationToast, setBotNotificationToast] = useState<{
    botId: string;
    botName: string;
    status: NanobotRun['status'];
  } | null>(null);
  const [scoutRequest, setScoutRequest] = useState<ScoutLaunchRequest | null>(null);
  const [nanobotWizardSeed, setNanobotWizardSeed] = useState<NanobotWizardSeed | null>(null);
  const seenRunIdsRef = React.useRef<Set<string>>(new Set());
  const localOnlyActive = isLocalOnlyActive(settings);
  const isCloudSynced = Boolean(
    authReady && user && user.emailVerified && workspaceRootReady && !localOnlyActive
  );

  // Install global fetch Local-Only Firewall once & synchronize policy on change
  useEffect(() => {
    installFetchLocalOnlyFirewall();
  }, []);

  useEffect(() => {
    setGlobalLocalOnlyPolicy(localOnlyActive);
  }, [localOnlyActive]);

  useEffect(() => {
    if (!dictationToast) return;
    const t = setTimeout(() => setDictationToast(null), 3500);
    return () => clearTimeout(t);
  }, [dictationToast]);

  const [coreDataStore, setCoreDataStore] = useState<CoreDataVectorStoreState>(() =>
    createInitialCoreDataStore()
  );

  const activeLlm = resolveActiveLlmFromRegistry(settings.activeLlmId);

  useEffect(() => {
    let active = true;
    fetchCoreDataStoreSummary().then((summary) => {
      if (!active || !summary) return;
      // Merge any server-side uploaded documents not yet in client store
      setCoreDataStore((prev) => {
        const existingIds = new Set(prev.documents.map((d) => d.id));
        const missingDocs = summary.documents.filter((d) => !existingIds.has(d.id));
        if (missingDocs.length === 0) {
          return {
            ...prev,
            lastSyncedIso: summary.lastSyncedIso
          };
        }
        let next = prev;
        for (const doc of missingDocs) {
          next = upsertCoreDataDocument(next, {
            id: doc.id,
            title: doc.title,
            format: doc.format,
            assetKind: doc.assetKind,
            sizeKB: doc.sizeKB,
            summary: doc.summary,
            text: `${doc.summary}\n${doc.contentExcerpt}`,
            tags: doc.tags,
            dateAdded: doc.dateAdded
          }).nextStore;
        }
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, []);

  // Initialize server-issued immutable User ID (NB-XXXX-XXXX) and reconcile with Google/Firestore identity
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    const guestScopeKey = getOrCreateGuestScopeKey();

    const syncIdentity = async () => {
      try {
        if (user) {
          let preferredExistingUserId: string | undefined;
          if (user.emailVerified && workspaceRootReady) {
            const cloudIdentity = await loadAccountIdentityFromFirestore(user.uid).catch(() => null);
            if (cloudIdentity) {
              preferredExistingUserId = cloudIdentity.userId;
            }
          }
          const res = await initBackendIdentity({
            scopeKey: `uid:${user.uid}`,
            authUid: user.uid,
            linkedProvider: 'google',
            preferredExistingUserId,
            guestScopeKey
          });
          if (cancelled) return;
          setIdentity(res.identity);
          setCallsigns(res.callsigns);
          setIdentityReady(true);

          if (user.emailVerified && workspaceRootReady && !preferredExistingUserId) {
            void saveAccountIdentityToFirestore(user.uid, res.identity).catch(() => undefined);
          }
        } else {
          const res = await initBackendIdentity({
            scopeKey: guestScopeKey,
            linkedProvider: 'guest'
          });
          if (cancelled) return;
          setIdentity(res.identity);
          setCallsigns(res.callsigns);
          setIdentityReady(true);
        }
      } catch (err) {
        console.error('Failed to initialize backend User ID:', err);
        if (!cancelled) setIdentityReady(true);
      }
    };

    void syncIdentity();
    return () => {
      cancelled = true;
    };
  }, [authReady, user, workspaceRootReady]);

  // Load Nanobots + Run history for active immutable userId and poll while any Nanobot is scheduled/running
  useEffect(() => {
    if (!identityReady || !identity.userId) return;
    let cancelled = false;

    const refreshNanobots = async (announceNewCompletions: boolean) => {
      try {
        const res = await fetchNanobotsRequest(identity.userId);
        if (cancelled) return;

        if (!announceNewCompletions) {
          seenRunIdsRef.current = new Set(res.runs.map((r) => r.id));
        } else {
          for (const run of res.runs) {
            if (!seenRunIdsRef.current.has(run.id)) {
              seenRunIdsRef.current.add(run.id);
              const ownerBot = res.nanobots.find((b) => b.id === run.botId);
              if (ownerBot && ownerBot.schedule.notificationsEnabled && run.status !== 'running') {
                setBotNotificationToast({
                  botId: ownerBot.id,
                  botName: ownerBot.name,
                  status: run.status
                });
                triggerHaptic('success');
                if (
                  typeof window !== 'undefined' &&
                  'Notification' in window &&
                  Notification.permission === 'granted'
                ) {
                  try {
                    new Notification(`Nanobot ${ownerBot.name}`, {
                      body: `Run ${run.status}: ${ownerBot.taskPrompt.slice(0, 80)}`
                    });
                  } catch {
                    // ignore browser notification block
                  }
                }
              }
            }
          }
        }

        setNanobots(res.nanobots);
        setNanobotRuns(res.runs);
      } catch {
        // ignore transient polling failure
      }
    };

    void refreshNanobots(false);
    const hasActiveBots = nanobots.some((b) => b.status === 'scheduled' || b.status === 'running');
    if (!hasActiveBots) {
      return () => {
        cancelled = true;
      };
    }

    const timer = setInterval(() => {
      void refreshNanobots(true);
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [identityReady, identity.userId, nanobots.some((b) => b.status === 'scheduled' || b.status === 'running')]);

  // Auto-dismiss Nanobot completion toast
  useEffect(() => {
    if (!botNotificationToast) return;
    const t = setTimeout(() => setBotNotificationToast(null), 6000);
    return () => clearTimeout(t);
  }, [botNotificationToast]);

  // Firestore real-time sync for CoreData Documents, User Preferences, Callsigns & Nanobots when authenticated
  useEffect(() => {
    if (!isCloudSynced || !user) return;
    const unsubDocs = subscribeCoreDataDocuments(user.uid, (cloudDocs) => {
      if (cloudDocs.length === 0) return;
      setCoreDataStore((prev) => {
        const existingIds = new Set(prev.documents.map((d) => d.id));
        const missingDocs = cloudDocs.filter((d) => !existingIds.has(d.id));
        if (missingDocs.length === 0) return prev;
        let next = prev;
        for (const docItem of missingDocs) {
          next = upsertCoreDataDocument(next, {
            id: docItem.id,
            title: docItem.title,
            format: docItem.format,
            assetKind: docItem.assetKind,
            sizeKB: docItem.sizeKB,
            summary: docItem.summary,
            text: `${docItem.summary}\n${docItem.contentExcerpt}`,
            tags: docItem.tags,
            dateAdded: docItem.dateAdded
          }).nextStore;
        }
        return next;
      });
    });

    const unsubPrefs = subscribeUserPreferences(user.uid, (patch) => {
      setSettings((prev) => {
        const cleanedPatch: Partial<AppSettings> = {};
        if (patch.activeLlmId) cleanedPatch.activeLlmId = patch.activeLlmId;
        if (patch.activeWhisperId) cleanedPatch.activeWhisperId = patch.activeWhisperId;
        if (patch.ttsEngine) cleanedPatch.ttsEngine = patch.ttsEngine;
        if (patch.offlineOnly !== undefined) cleanedPatch.offlineOnly = patch.offlineOnly;
        if (patch.localOnly !== undefined) cleanedPatch.localOnly = patch.localOnly;
        if (patch.activeSttModelId) cleanedPatch.activeSttModelId = patch.activeSttModelId;
        if (patch.activeTextModelId) cleanedPatch.activeTextModelId = patch.activeTextModelId;
        if (patch.activeDictationModeId)
          cleanedPatch.activeDictationModeId = patch.activeDictationModeId;
        if (patch.translationEnabled !== undefined)
          cleanedPatch.translationEnabled = patch.translationEnabled;
        if (patch.translationSourceLang)
          cleanedPatch.translationSourceLang = patch.translationSourceLang;
        if (patch.translationTargetLang)
          cleanedPatch.translationTargetLang = patch.translationTargetLang;
        if (patch.historyRetention) cleanedPatch.historyRetention = patch.historyRetention;
        if (patch.overlayStyle) cleanedPatch.overlayStyle = patch.overlayStyle;
        if (patch.motionIntensity) cleanedPatch.motionIntensity = patch.motionIntensity;
        if (patch.hapticFeedback !== undefined) cleanedPatch.hapticFeedback = patch.hapticFeedback;
        if (patch.diarization !== undefined) cleanedPatch.diarization = patch.diarization;
        if (patch.autoPunctuation !== undefined) cleanedPatch.autoPunctuation = patch.autoPunctuation;
        if (patch.language) cleanedPatch.language = patch.language;
        if (patch.autoLearnDictionary !== undefined)
          cleanedPatch.autoLearnDictionary = patch.autoLearnDictionary;
        if (patch.liveProviderId) cleanedPatch.liveProviderId = patch.liveProviderId;
        if (patch.enableCrewPlanner !== undefined)
          cleanedPatch.enableCrewPlanner = patch.enableCrewPlanner;
        if (patch.enableOfficeDiary !== undefined)
          cleanedPatch.enableOfficeDiary = patch.enableOfficeDiary;
        if (patch.enableScoutFeature !== undefined)
          cleanedPatch.enableScoutFeature = patch.enableScoutFeature;
        return applyUnifiedSettingsPatch(prev, cleanedPatch);
      });
    });

    const unsubCallsigns = subscribeCallsigns(user.uid, (cloudCallsigns) => {
      setCallsigns((localCallsigns) => {
        if (cloudCallsigns.length === 0 && localCallsigns.length > 0) {
          for (const cs of localCallsigns) {
            void saveCallsignToFirestore(user.uid, cs).catch(() => undefined);
          }
          return localCallsigns;
        }
        if (cloudCallsigns.length === 0) return localCallsigns;
        const byId = new Map<string, Callsign>();
        for (const cs of localCallsigns) byId.set(cs.id, cs);
        for (const cs of cloudCallsigns) byId.set(cs.id, cs);
        return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
    });

    const unsubNanobots = subscribeNanobots(user.uid, (cloudBots) => {
      setNanobots((localBots) => {
        if (cloudBots.length === 0 && localBots.length > 0) {
          for (const bot of localBots) {
            void saveNanobotToFirestore(user.uid, bot).catch(() => undefined);
          }
          return localBots;
        }
        if (cloudBots.length === 0) return localBots;
        const byId = new Map<string, Nanobot>();
        for (const bot of localBots) byId.set(bot.id, bot);
        for (const bot of cloudBots) byId.set(bot.id, bot);
        return Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
    });

    return () => {
      unsubDocs();
      unsubPrefs();
      unsubCallsigns();
      unsubNanobots();
    };
  }, [isCloudSynced, user]);

  useEffect(() => {
    document.documentElement.dataset.motionIntensity = settings.motionIntensity;
  }, [settings.motionIntensity]);

  useEffect(() => {
    configureHaptics({
      ...settings.haptics,
      enabled: settings.hapticFeedback && settings.haptics.enabled
    });
  }, [settings.hapticFeedback, settings.haptics]);

  useEffect(() => {
    let lastPointerHapticAt = 0;

    const handlePointerDown = (e: PointerEvent) => {
      const kind = resolveInteractiveHapticKind(e.target as HTMLElement | null);
      if (kind) {
        lastPointerHapticAt = Date.now();
        triggerHaptic(kind);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const kind = resolveInteractiveHapticKind(e.target as HTMLElement | null);
      if (kind) {
        triggerHaptic(kind);
      }
    };

    const handleChange = (e: Event) => {
      // Avoid double trigger right after pointer interaction on form controls
      if (Date.now() - lastPointerHapticAt < 250) return;
      const target = e.target as HTMLElement | null;
      const inputType = (target as HTMLInputElement | null)?.type;
      if (
        target &&
        (target.tagName === 'SELECT' ||
          inputType === 'range' ||
          inputType === 'checkbox' ||
          inputType === 'radio')
      ) {
        triggerHaptic('selection');
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    document.addEventListener('keydown', handleKeyDown, { capture: true, passive: true });
    document.addEventListener('change', handleChange, { capture: true, passive: true });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('change', handleChange, { capture: true });
    };
  }, []);

  const handleUpdateSettings = (patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = applyUnifiedSettingsPatch(prev, patch);
      setGlobalLocalOnlyPolicy(isLocalOnlyActive(next));
      if (patch.historyRetention) {
        setHistoryEntries((entries) => {
          const pruned = pruneDictationHistoryByRetention(entries, patch.historyRetention!);
          saveDictationHistory(pruned);
          return pruned;
        });
      }
      if (
        authReady &&
        user &&
        user.emailVerified &&
        workspaceRootReady &&
        !isLocalOnlyActive(next)
      ) {
        void saveUserPreferencesToFirestore(user.uid, next).catch((err) => {
          console.error('Failed to sync preferences to Firestore:', err);
        });
      }
      return next;
    });
  };

  const handleUpdateDictionary = (next: DictionaryEntry[]) => {
    setDictionaryEntries(next);
  };

  const handleLearnTerms = (payload: {
    text: string;
    source: DictionaryTermSource;
    sourceFile: string;
  }) => {
    if (!settings.autoLearnDictionary) {
      return { addedCount: 0, learnedTerms: [] };
    }
    const res = learnTermsFromContext(dictionaryEntries, {
      ...payload,
      speakerLabels: parseSpeakerLabels(settings.speakerLabels)
    });
    setDictionaryEntries(res.entries);
    setSettings((prev) =>
      applyUnifiedSettingsPatch(prev, { domainTerms: formatDictionaryTermsCsv(res.entries) })
    );
    return { addedCount: res.addedCount, learnedTerms: res.learnedTerms };
  };

  const handleOpenHubModal = (tab: HubTabId = 'models') => {
    setHubModalState({ isOpen: true, tab });
  };

  const handleOpenApiKeys = (_focusProvider?: PaidProviderId) => {
    setHubModalState({ isOpen: true, tab: 'keys' });
  };

  const handleCompletedDictation = (res: DictationPipelineExecutionResult) => {
    const newEntry = createDictationHistoryEntry({
      modeId: res.matchedMode.id,
      modeName: res.matchedMode.name,
      sttModelId: res.sttModelId,
      sttModelName: res.sttModelName,
      textModelId: res.textModelId,
      rawText: res.rawText,
      finalText: res.finalText,
      translatedText: res.translatedText,
      detectedLang: res.detectedLang,
      sourceLang: settings.translationSourceLang || res.matchedMode.sourceLang,
      targetLang: settings.translationTargetLang || res.matchedMode.targetLang,
      durationSec: res.durationSec,
      localOnlyUsed: res.localOnlyUsed
    });
    setHistoryEntries((prev) =>
      addDictationHistoryEntry(prev, newEntry, settings.historyRetention || 'forever')
    );
    if (settings.autoLearnDictionary) {
      handleLearnTerms({
        text: res.finalText,
        source: 'live-stream',
        sourceFile: `dictation-${res.matchedMode.id}`
      });
    }
  };

  const handleDeleteHistoryEntry = (entryId: string) => {
    setHistoryEntries((prev) => removeDictationHistoryEntry(prev, entryId));
  };

  const handleWipeHistory = () => {
    setHistoryEntries(wipeDictationHistory());
  };

  const handleInsertDictatedText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void navigator.clipboard?.writeText(trimmed).catch(() => undefined);
    void createDiaryEntryRequest({
      title: `Dictated Note (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
      content: trimmed,
      category: 'Note',
      tags: ['Dictation', settings.translationEnabled ? 'Translated' : 'Spoken']
    })
      .then((entries) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('nudge-diary-refresh', { detail: entries }));
        }
      })
      .catch(() => undefined);
    setDictationToast('Inserted dictated note into Office Diary & copied to clipboard.');
  };

  const handleSaveToDrive = (file: DriveAudioFile) => {
    setDriveFiles(prev => addDriveAudioFile(prev, file));
  };

  const handleDeleteFromDrive = (id: string) => {
    setDriveFiles(prev => removeDriveAudioFile(prev, id));
    setMeetingSessions(prev =>
      prev.map(s => (s.driveFileId === id ? stripAudioFromMeetingSession(s) : s))
    );
  };

  const handleOpenDriveFileInMeetings = (file: DriveAudioFile) => {
    setIncomingDriveFile(file);
    setActiveMode('meetings');
  };

  const handleIngestDocumentToCoreData = async (input: {
    id?: string;
    title: string;
    format: CoreDataDocumentFormat;
    assetKind: UploadedAssetKind;
    sizeKB: number;
    summary?: string;
    text: string;
    sections?: Array<{ label: string; text: string }>;
    tags?: string[];
    dateAdded?: string;
  }): Promise<CoreDataManagedDocument> => {
    const resolvedId =
      input.id || `cd-doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const normalizedInput = { ...input, id: resolvedId };
    const { document: localDoc } = upsertCoreDataDocument(coreDataStore, normalizedInput);

    setCoreDataStore((prev) => upsertCoreDataDocument(prev, normalizedInput).nextStore);

    const backendResp = await syncDocumentIngestToBackend(normalizedInput);
    const finalDoc = backendResp?.document || localDoc;
    if (authReady && user && user.emailVerified && workspaceRootReady && !localOnlyActive) {
      void saveCoreDataDocToFirestore(user.uid, finalDoc).catch((err) => {
        console.error('Failed to sync CoreData document to Firestore:', err);
      });
    }
    return finalDoc;
  };

  const handleDeleteCoreDataDocument = async (docId: string): Promise<void> => {
    setCoreDataStore((prev) => deleteCoreDataDocument(prev, docId));
    await syncDocumentDeleteToBackend(docId);
    if (authReady && user && user.emailVerified && workspaceRootReady && !localOnlyActive) {
      void deleteCoreDataDocFromFirestore(user.uid, docId).catch((err) => {
        console.error('Failed to delete CoreData document from Firestore:', err);
      });
    }
  };

  const handleIngestSparkpage = (sp: SparkpageData) => {
    const sections = sp.sections.map((s) => ({
      label: s.title,
      text: `${s.summary}\n${s.content}${s.bullets ? `\n${s.bullets.join('\n')}` : ''}`
    }));
    void handleIngestDocumentToCoreData({
      id: `doc-${sp.id}`,
      title: `${sp.title.slice(0, 48)}.md`,
      format: 'Markdown',
      assetKind: 'document',
      sizeKB: Math.max(12, Math.round(JSON.stringify(sp).length / 128)),
      summary: sp.subtitle,
      text: sections.map((s) => s.text).join('\n\n'),
      sections,
      tags: ['Sparkpage', 'Cloud Search']
    });
    setDictationToast('Saved to Workspace Sources.');
  };

  const handleOpenInStudio = (session: MeetingSession) => {
    setStudioSeedSession(session);
    setActiveMode('studio');
  };

  const handleOpenSettingsBucket = (bucket?: SettingsBucketId) => {
    setRequestedSettingsBucket(bucket || null);
    setRequestedSettingsNonce(n => n + 1);
    setModeState(([prevMode]) => {
      if (prevMode === 'settings') return [prevMode, 1];
      return ['settings', getTabTransitionDirection(PRIMARY_MODES, prevMode, 'settings')];
    });
  };

  const handleCompleteOnboarding = () => {
    try {
      window.localStorage.setItem('hasSeenOnboarding', 'true');
    } catch {
      // ignore storage quota errors
    }
    setShowOnboarding(false);
  };

  const handleReplayOnboarding = () => {
    setOnboardingInitialStage('carousel');
    setShowOnboarding(true);
  };

  const handleCreateCallsign = async (input: {
    displayName: string;
    avatar: string;
    isActive: boolean;
  }): Promise<void> => {
    const res = await createCallsignRequest({
      userId: identity.userId,
      ...input
    });
    setCallsigns(res.callsigns);
    if (isCloudSynced && user) {
      for (const cs of res.callsigns) {
        void saveCallsignToFirestore(user.uid, cs).catch(() => undefined);
      }
    }
  };

  const handleUpdateCallsign = async (
    callsignId: string,
    patch: { displayName?: string; avatar?: string; isActive?: boolean }
  ): Promise<void> => {
    const res = await updateCallsignRequest(callsignId, {
      userId: identity.userId,
      ...patch
    });
    setCallsigns(res.callsigns);
    if (isCloudSynced && user) {
      for (const cs of res.callsigns) {
        void saveCallsignToFirestore(user.uid, cs).catch(() => undefined);
      }
    }
  };

  const handleDeleteCallsign = async (callsignId: string): Promise<void> => {
    const res = await deleteCallsignRequest(callsignId, identity.userId);
    setCallsigns(res.callsigns);
    if (isCloudSynced && user) {
      void deleteCallsignFromFirestore(user.uid, callsignId).catch(() => undefined);
      for (const cs of res.callsigns) {
        void saveCallsignToFirestore(user.uid, cs).catch(() => undefined);
      }
    }
  };

  const handleReleaseNanobot = async (payload: CreateNanobotPayload): Promise<Nanobot> => {
    const res = await createNanobotRequest({
      userId: identity.userId,
      ...payload
    });
    for (const r of res.runs) {
      seenRunIdsRef.current.add(r.id);
    }
    setNanobots(res.nanobots);
    setNanobotRuns((prev) => [...res.runs, ...prev.filter((r) => !res.runs.some((nr) => nr.id === r.id))]);
    if (isCloudSynced && user) {
      void saveNanobotToFirestore(user.uid, res.nanobot).catch(() => undefined);
      for (const r of res.runs) {
        void saveNanobotRunToFirestore(user.uid, r).catch(() => undefined);
      }
    }
    return res.nanobot;
  };

  const handleRerunNanobot = async (bot: Nanobot): Promise<void> => {
    const res = await rerunNanobotRequest(bot.id, identity.userId);
    seenRunIdsRef.current.add(res.run.id);
    setNanobots((prev) => prev.map((b) => (b.id === res.nanobot.id ? res.nanobot : b)));
    setNanobotRuns((prev) => [res.run, ...prev]);
    if (isCloudSynced && user) {
      void saveNanobotToFirestore(user.uid, res.nanobot).catch(() => undefined);
      void saveNanobotRunToFirestore(user.uid, res.run).catch(() => undefined);
    }
  };

  const handleUpdateNanobot = async (
    botId: string,
    patch: {
      name?: string;
      modelId?: string;
      taskPrompt?: string;
      schedule?: Nanobot['schedule'];
      status?: NanobotStatus;
    }
  ): Promise<void> => {
    const res = await updateNanobotRequest(botId, {
      userId: identity.userId,
      ...patch
    });
    setNanobots((prev) => prev.map((b) => (b.id === res.nanobot.id ? res.nanobot : b)));
    if (isCloudSynced && user) {
      void saveNanobotToFirestore(user.uid, res.nanobot).catch(() => undefined);
    }
  };

  const handleDeleteNanobot = async (bot: Nanobot): Promise<void> => {
    await deleteNanobotRequest(bot.id, identity.userId);
    setNanobots((prev) => prev.filter((b) => b.id !== bot.id));
    setNanobotRuns((prev) => prev.filter((r) => r.botId !== bot.id));
    if (isCloudSynced && user) {
      void deleteNanobotFromFirestore(user.uid, bot.id).catch(() => undefined);
    }
  };

  return (
    <MotionConfig reducedMotion={motionConfig.reducedMotion} transition={motionConfig.transition}>
      <div
        data-device-frame={isDeviceFrame ? 'true' : 'false'}
        className={`group/app relative w-full liquid-canvas text-zinc-100 flex flex-col font-sans selection:bg-[#0F7FFF]/35 selection:text-white overflow-hidden ${
          isDeviceFrame ? 'min-h-screen items-center justify-center p-2 sm:p-6' : 'h-screen'
        }`}
      >
        <div
          className={
            isDeviceFrame
              ? 'relative z-10 w-full max-w-[422px] h-[874px] max-h-[96vh] rounded-[54px] p-[3px] bg-gradient-to-b from-zinc-600/80 via-zinc-900 to-zinc-700/80 shadow-[0_32px_90px_-16px_rgba(0,0,0,0.92)] flex flex-col overflow-hidden my-auto'
              : 'relative z-10 flex-1 min-h-0 flex flex-col h-full overflow-hidden'
          }
        >
          <div
            className={
              isDeviceFrame
                ? 'relative w-full h-full rounded-[51px] bg-black p-2.5 flex flex-col overflow-hidden'
                : 'flex-1 min-h-0 flex flex-col h-full overflow-hidden'
            }
          >
            {isDeviceFrame && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[106px] h-[28px] bg-black rounded-full z-50 border border-white/15 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] flex items-center justify-end pr-2.5 pointer-events-none">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-900 border border-white/10" />
              </div>
            )}

            <div
              className={
                isDeviceFrame
                  ? 'relative w-full h-full rounded-[42px] overflow-hidden isolate [transform:translateZ(0)] liquid-canvas flex flex-col border border-white/12'
                  : 'flex-1 min-h-0 flex flex-col h-full overflow-hidden'
              }
            >
            {isDeviceFrame && <DeviceStatusBar />}
            <main
              className={`@container flex-1 min-h-0 overflow-hidden relative ${
                isDeviceFrame ? 'pt-10' : 'pt-2'
              }`}
            >

              {/* Dictation Insert Confirmation Toast */}
              <AnimatePresence>
                {!showOnboarding && dictationToast && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 px-3.5 py-2 rounded-2xl liquid-glass-elevated border border-[#54B0FF]/40 text-xs text-white shadow-lg flex items-center gap-2"
                  >
                    <span>{dictationToast}</span>
                    {Boolean(settings.enableOfficeDiary) &&
                      dictationToast.includes('Office Diary') && (
                        <button
                          type="button"
                          onClick={() => {
                            setRequestedWorkspaceSubTab('diary');
                            setRequestedWorkspaceNonce((n) => n + 1);
                            setActiveMode('workspace');
                            setDictationToast(null);
                          }}
                          className="px-2 py-0.5 rounded-lg bg-[#0F7FFF] text-[10px] font-semibold"
                        >
                          View Diary
                        </button>
                      )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Completed Nanobot Notification Banner */}
              <AnimatePresence>
                {!showOnboarding && botNotificationToast && (
                  <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className="absolute top-16 left-3 right-3 z-30 p-2.5 rounded-2xl liquid-glass-elevated border border-emerald-400/35 flex items-center justify-between gap-2 text-xs shadow-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-zinc-100 truncate block">
                        Nanobot {botNotificationToast.botName} finished ({botNotificationToast.status})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setBotNotificationToast(null);
                        setActiveMode('nanoteam');
                      }}
                      className="px-2.5 py-1 rounded-lg liquid-accent-glass text-[11px] font-semibold shrink-0"
                    >
                      Open
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {showOnboarding ? (
                <OnboardingFlow
                  initialStage={onboardingInitialStage}
                  onComplete={handleCompleteOnboarding}
                />
              ) : (
                <AnimatePresence mode="popLayout" initial={false} custom={navDirection}>
                  <motion.div
                    key={activeMode}
                    custom={navDirection}
                    variants={screenVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="h-full w-full"
                  >
                    {activeMode === 'workspace' && (
                      <UnifiedWorkspaceView
                        selectedModel={activeLlm}
                        offlineOnly={localOnlyActive}
                        coreDataStore={coreDataStore}
                        onToggleOffline={() =>
                          handleUpdateSettings({
                            localOnly: !localOnlyActive,
                            offlineOnly: !localOnlyActive
                          })
                        }
                        onIngestToNotebook={handleIngestSparkpage}
                        onIngestToCoreData={handleIngestDocumentToCoreData}
                        onDeleteFromCoreData={handleDeleteCoreDataDocument}
                        onSaveToDrive={handleSaveToDrive}
                        genTeamAgents={genTeamAgents}
                        genTeamChannels={genTeamChannels}
                        genTeamMessages={genTeamMessages}
                        genTeamTasks={genTeamTasks}
                        onGenTeamAgentsChange={setGenTeamAgents}
                        onGenTeamChannelsChange={setGenTeamChannels}
                        onGenTeamMessagesChange={setGenTeamMessages}
                        onGenTeamTasksChange={setGenTeamTasks}
                        identity={identity}
                        nanobots={nanobots}
                        nanobotRuns={nanobotRuns}
                        onReleaseNanobot={handleReleaseNanobot}
                        onRerunNanobot={handleRerunNanobot}
                        onUpdateNanobot={handleUpdateNanobot}
                        onDeleteNanobot={handleDeleteNanobot}
                        nanobotWizardSeed={nanobotWizardSeed}
                        onClearNanobotSeed={() => setNanobotWizardSeed(null)}
                        enableCrewPlanner={settings.enableCrewPlanner ?? false}
                        enableOfficeDiary={settings.enableOfficeDiary ?? false}
                        requestedSubTab={requestedWorkspaceSubTab}
                        requestedCrewView={requestedCrewView}
                        requestedNonce={requestedWorkspaceNonce}
                      />
                    )}
                    {activeMode === 'meetings' && (
                      <MeetingNotesView
                        onSendNotesToVault={handleIngestSparkpage}
                        onOpenInStudio={handleOpenInStudio}
                        onOpenSettings={() => handleOpenSettingsBucket('hub')}
                        onOpenHub={handleOpenHubModal}
                        onOpenApiKeys={handleOpenApiKeys}
                        settings={settings}
                        onUpdateSettings={handleUpdateSettings}
                        onCompletedDictation={handleCompletedDictation}
                        onInsertDictatedText={handleInsertDictatedText}
                        driveFiles={driveFiles}
                        onSaveToDrive={handleSaveToDrive}
                        onDeleteFromDrive={handleDeleteFromDrive}
                        dictionaryEntries={dictionaryEntries}
                        whisperModels={whisperModels}
                        onLearnTerms={handleLearnTerms}
                        sessions={meetingSessions}
                        onSessionsChange={setMeetingSessions}
                        baseSessionId={meetingBaseId}
                        onBaseSessionIdChange={setMeetingBaseId}
                        currentSessionId={meetingCurrentId}
                        onCurrentSessionIdChange={setMeetingCurrentId}
                        incomingDriveFile={incomingDriveFile}
                        onClearIncomingDriveFile={() => setIncomingDriveFile(null)}
                        enableScoutFeature={settings.enableScoutFeature ?? false}
                        onLaunchScout={setScoutRequest}
                      />
                    )}
                    {activeMode === 'studio' && (
                      <StudioView
                        settings={settings}
                        meetingSessions={meetingSessions}
                        dictionaryEntries={dictionaryEntries}
                        coreDataStore={coreDataStore}
                        seedSession={studioSeedSession}
                        onOpenSettings={() => handleOpenSettingsBucket('hub')}
                        onOpenApiKeys={handleOpenApiKeys}
                      />
                    )}
                    {activeMode === 'settings' && (
                      <SettingsView
                        settings={settings}
                        llmModels={llmModels}
                        whisperModels={whisperModels}
                        driveFiles={driveFiles}
                        dictionaryEntries={dictionaryEntries}
                        historyEntries={historyEntries}
                        identity={identity}
                        callsigns={callsigns}
                        isDeviceFrame={isDeviceFrame}
                        onToggleDeviceFrame={() => setIsDeviceFrame(!isDeviceFrame)}
                        onUpdateSettings={handleUpdateSettings}
                        onUpdateDictionary={handleUpdateDictionary}
                        onOpenHubModal={handleOpenHubModal}
                        onOpenApiKeys={handleOpenApiKeys}
                        onDeleteHistoryEntry={handleDeleteHistoryEntry}
                        onWipeHistory={handleWipeHistory}
                        onInsertDictatedText={handleInsertDictatedText}
                        onSaveToDrive={handleSaveToDrive}
                        onDeleteFromDrive={handleDeleteFromDrive}
                        onOpenDriveFileInMeetings={handleOpenDriveFileInMeetings}
                        onCreateCallsign={handleCreateCallsign}
                        onUpdateCallsign={handleUpdateCallsign}
                        onDeleteCallsign={handleDeleteCallsign}
                        onReplayOnboarding={handleReplayOnboarding}
                        requestedBucket={requestedSettingsBucket}
                        requestedBucketNonce={requestedSettingsNonce}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
            </main>

            {isDeviceFrame && (
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-28 h-1 bg-white/30 rounded-full z-50 pointer-events-none" />
            )}

            {!showOnboarding && (
              <TabBar
                activeMode={activeMode}
                onChangeMode={setActiveMode}
                isContained={isDeviceFrame}
              />
            )}
            </div>
          </div>
        </div>

        <ModelAudioHubView
          mode="modal"
          isOpen={hubModalState.isOpen}
          initialTab={hubModalState.tab}
          onClose={() => setHubModalState((prev) => ({ ...prev, isOpen: false }))}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          historyEntries={historyEntries}
          onDeleteHistoryEntry={handleDeleteHistoryEntry}
          onWipeHistory={handleWipeHistory}
          onInsertText={handleInsertDictatedText}
        />

        <ScoutSheet
          request={scoutRequest}
          userId={identity.userId}
          offlineOnly={settings.offlineOnly}
          nanobots={nanobots}
          onClose={() => setScoutRequest(null)}
          onEnableHybridAndRetry={() => handleUpdateSettings({ offlineOnly: false, localOnly: false })}
          onSwitchToNotes={() => {
            if (!settings.enableOfficeDiary) {
              handleUpdateSettings({ enableOfficeDiary: true });
            }
            setRequestedWorkspaceSubTab('diary');
            setRequestedWorkspaceNonce((n) => n + 1);
            setActiveMode('workspace');
          }}
          onSaveAsSource={async (result: ScoutResult) => {
            const citationsBlock = result.citations
              .map((c) => `[${c.id}] ${c.title} (${c.domain}) — ${c.url}\n${c.snippet}`)
              .join('\n\n');
            await handleIngestDocumentToCoreData({
              title: `Scout: ${result.redactedQuery.slice(0, 48)}`,
              format: 'Note',
              assetKind: 'document',
              sizeKB: Math.max(
                1,
                Math.round((result.summary.length + citationsBlock.length) / 1024)
              ),
              summary: result.summary.slice(0, 220),
              text: `${result.summary}\n\n${citationsBlock}`.trim(),
              tags: ['Scout', 'Web Source', result.engine]
            });
          }}
          onPromoteToNanobot={(seed: NanobotWizardSeed) => {
            if (!settings.enableCrewPlanner) {
              handleUpdateSettings({ enableCrewPlanner: true });
            }
            setNanobotWizardSeed(seed);
            setActiveMode('nanoteam');
          }}
        />
      </div>
    </MotionConfig>
  );
}
