import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase.ts';
import type {
  AppSettings,
  BackgroundAgentTask,
  Callsign,
  CoreDataManagedDocument,
  Nanobot,
  NanobotRun,
  OfficeDiaryEntry,
  UserIdentity
} from '../types/index.ts';
import { buildChunksFromWorkspaceAttachments } from './ragEngine.ts';
import { formatDiaryDateLabel, getTodayIsoDate } from './workspaceScheduler.ts';
import { generateReadableUserId, isValidReadableUserId } from './identityCallsigns.ts';

// Synchronized verbatim with firebase-blueprint.json & firestore.rules
export const BLUEPRINT_LIMITS = {
  ID_MAX: 128,
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  DATE_ISO_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
  DISPLAY_NAME_MAX: 120,
  PHOTO_URL_MAX: 512,
  EMAIL_MAX: 254,
  DIARY_TITLE_MAX: 180,
  DIARY_CONTENT_MAX: 12000,
  DIARY_TAGS_MAX: 12,
  DIARY_ATTACHMENTS_MAX: 12,
  TASK_TITLE_MAX: 180,
  TASK_PROMPT_MAX: 4000,
  TASK_OUTPUT_MAX: 16000,
  COREDATA_TITLE_MAX: 200,
  COREDATA_SUMMARY_MAX: 1500,
  COREDATA_EXCERPT_MAX: 16000,
  COREDATA_TAGS_MAX: 15,
  ISO_MAX: 40,
  LABEL_MAX: 48,
  TIME_LABEL_MAX: 24
} as const;

export function sanitizeFirestoreId(rawId: string, prefix = 'item'): string {
  const cleaned = rawId
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, BLUEPRINT_LIMITS.ID_MAX);
  if (cleaned.length > 0 && BLUEPRINT_LIMITS.ID_PATTERN.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}-${Date.now()}`;
}

function clampString(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const text = (val ?? fallback).toString().trim();
  if (text.length === 0) return fallback.slice(0, maxLen);
  return text.slice(0, maxLen);
}

function clampStringArray(items: string[] | undefined, maxItems: number, maxItemLen = 120): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item || '').trim().slice(0, maxItemLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

export interface SanitizedDiaryDocPayload {
  id: string;
  ownerId: string;
  dateIso: string;
  dateLabel: string;
  timeLabel: string;
  title: string;
  content: string;
  category: OfficeDiaryEntry['category'];
  tags: string[];
  attachmentNames: string[];
  createdIso: string;
  updatedIso: string;
}

export function buildSanitizedDiaryPayload(
  uid: string,
  entry: OfficeDiaryEntry
): SanitizedDiaryDocPayload {
  const safeId = sanitizeFirestoreId(entry.id, 'diary');
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeDateIso = BLUEPRINT_LIMITS.DATE_ISO_PATTERN.test(entry.dateIso)
    ? entry.dateIso
    : getTodayIsoDate();
  const safeCategory: OfficeDiaryEntry['category'] = ['Focus', 'Decision', 'Blocker', 'Note'].includes(
    entry.category
  )
    ? entry.category
    : 'Note';

  return {
    id: safeId,
    ownerId: safeUid,
    dateIso: safeDateIso,
    dateLabel: clampString(
      entry.dateLabel,
      BLUEPRINT_LIMITS.LABEL_MAX,
      formatDiaryDateLabel(safeDateIso)
    ),
    timeLabel: clampString(entry.timeLabel, BLUEPRINT_LIMITS.TIME_LABEL_MAX, '09:00'),
    title: clampString(entry.title, BLUEPRINT_LIMITS.DIARY_TITLE_MAX, 'Office Note'),
    content: clampString(entry.content, BLUEPRINT_LIMITS.DIARY_CONTENT_MAX, 'Entry saved'),
    category: safeCategory,
    tags: clampStringArray(entry.tags, BLUEPRINT_LIMITS.DIARY_TAGS_MAX, 48),
    attachmentNames: clampStringArray(
      entry.attachmentNames,
      BLUEPRINT_LIMITS.DIARY_ATTACHMENTS_MAX,
      120
    ),
    createdIso: clampString(entry.createdIso, BLUEPRINT_LIMITS.ISO_MAX, new Date().toISOString()),
    updatedIso: clampString(entry.updatedIso, BLUEPRINT_LIMITS.ISO_MAX, new Date().toISOString())
  };
}

export interface SanitizedTaskDocPayload {
  id: string;
  ownerId: string;
  title: string;
  prompt: string;
  cloudModelId: BackgroundAgentTask['cloudModelId'];
  cloudModelLabel: string;
  cloudProviderLabel: string;
  intervalId: BackgroundAgentTask['intervalId'];
  intervalLabel: string;
  intervalMs: number;
  status: 'running' | 'paused' | 'archived';
  ragEnabled: boolean;
  ragStrategyId: BackgroundAgentTask['ragStrategyId'];
  attachmentNames: string[];
  runCount: number;
  createdAtIso: string;
  lastRunIso: string;
  nextRunIso: string;
  latestOutput: string;
}

export function buildSanitizedTaskPayload(
  uid: string,
  task: BackgroundAgentTask
): SanitizedTaskDocPayload {
  const safeId = sanitizeFirestoreId(task.id, 'task');
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeIntervalMs = Math.min(86400000, Math.max(1000, Math.round(task.intervalMs || 15000)));
  const safeRunCount = Math.min(1000000, Math.max(0, Math.round(task.runCount || 0)));

  return {
    id: safeId,
    ownerId: safeUid,
    title: clampString(task.title, BLUEPRINT_LIMITS.TASK_TITLE_MAX, 'Background Agent Task'),
    prompt: clampString(task.prompt, BLUEPRINT_LIMITS.TASK_PROMPT_MAX, 'Monitor objective'),
    cloudModelId: ['claude-3-7-sonnet', 'gemini-2-5-pro', 'gpt-4o', 'grok-3'].includes(
      task.cloudModelId
    )
      ? task.cloudModelId
      : 'claude-3-7-sonnet',
    cloudModelLabel: clampString(task.cloudModelLabel, 64, 'Claude 3.7 Sonnet'),
    cloudProviderLabel: clampString(task.cloudProviderLabel, 64, 'Anthropic'),
    intervalId: ['15s', '1m', '5m', 'hourly'].includes(task.intervalId) ? task.intervalId : '1m',
    intervalLabel: clampString(task.intervalLabel, BLUEPRINT_LIMITS.LABEL_MAX, 'Every 1 min'),
    intervalMs: safeIntervalMs,
    status: task.status === 'paused' ? 'paused' : 'running',
    ragEnabled: Boolean(task.ragEnabled),
    ragStrategyId: ['hybrid-rrf', 'agentic', 'graph-rag', 'corrective', 'multimodal'].includes(
      task.ragStrategyId
    )
      ? task.ragStrategyId
      : 'hybrid-rrf',
    attachmentNames: clampStringArray(
      task.attachmentNames,
      BLUEPRINT_LIMITS.DIARY_ATTACHMENTS_MAX,
      120
    ),
    runCount: safeRunCount,
    createdAtIso: clampString(
      task.createdAtIso,
      BLUEPRINT_LIMITS.ISO_MAX,
      new Date().toISOString()
    ),
    lastRunIso: (task.lastRunIso || '').slice(0, BLUEPRINT_LIMITS.ISO_MAX),
    nextRunIso: clampString(task.nextRunIso, BLUEPRINT_LIMITS.ISO_MAX, new Date().toISOString()),
    latestOutput: (task.latestOutput || '').slice(0, BLUEPRINT_LIMITS.TASK_OUTPUT_MAX)
  };
}

export interface SanitizedCoreDataDocPayload {
  id: string;
  ownerId: string;
  managedObjectId: string;
  cloudKitRecordName: string;
  entityName: 'CDDocument';
  title: string;
  format: CoreDataManagedDocument['format'];
  assetKind: CoreDataManagedDocument['assetKind'];
  sizeKB: number;
  chunkCount: number;
  embeddingDim: number;
  dateAdded: string;
  updatedIso: string;
  summary: string;
  contentExcerpt: string;
  tags: string[];
  syncState: 'synced' | 'local';
}

export function buildSanitizedCoreDataPayload(
  uid: string,
  document: CoreDataManagedDocument
): SanitizedCoreDataDocPayload {
  const safeId = sanitizeFirestoreId(document.id, 'doc');
  const safeUid = sanitizeFirestoreId(uid, 'user');

  return {
    id: safeId,
    ownerId: safeUid,
    managedObjectId: clampString(
      document.managedObjectId,
      200,
      `x-coredata://CDDocument/${safeId}`
    ),
    cloudKitRecordName: clampString(document.cloudKitRecordName, 160, `CK-${safeId}`),
    entityName: 'CDDocument',
    title: clampString(document.title, BLUEPRINT_LIMITS.COREDATA_TITLE_MAX, 'Untitled Document'),
    format: ['PDF', 'TXT', 'EPUB', 'Markdown', 'Image', 'Audio', 'Note'].includes(document.format)
      ? document.format
      : 'TXT',
    assetKind: ['document', 'image', 'audio'].includes(document.assetKind)
      ? document.assetKind
      : 'document',
    sizeKB: Math.min(1000000, Math.max(0, Math.round(document.sizeKB || 1))),
    chunkCount: Math.min(100000, Math.max(0, Math.round(document.chunkCount || 1))),
    embeddingDim: Math.min(8192, Math.max(1, Math.round(document.embeddingDim || 128))),
    dateAdded: clampString(document.dateAdded, BLUEPRINT_LIMITS.LABEL_MAX, 'Today'),
    updatedIso: clampString(document.updatedIso, BLUEPRINT_LIMITS.ISO_MAX, new Date().toISOString()),
    summary: (document.summary || '').slice(0, BLUEPRINT_LIMITS.COREDATA_SUMMARY_MAX),
    contentExcerpt: (document.contentExcerpt || '').slice(0, BLUEPRINT_LIMITS.COREDATA_EXCERPT_MAX),
    tags: clampStringArray(document.tags, BLUEPRINT_LIMITS.COREDATA_TAGS_MAX, 48),
    syncState: 'synced'
  };
}

export interface SanitizedPreferencesPayload {
  id: 'app';
  ownerId: string;
  activeLlmId: string;
  activeWhisperId: string;
  ttsEngine: 'on-device' | 'secure-cloud';
  offlineOnly: boolean;
  localOnly: boolean;
  activeSttModelId: string;
  activeTextModelId: string;
  activeDictationModeId: string;
  translationEnabled: boolean;
  translationSourceLang: string;
  translationTargetLang: string;
  historyRetention: 'forever' | '30d' | 'none';
  overlayStyle: 'capsule' | 'panel';
  motionIntensity: 'reduced' | 'standard' | 'fluid';
  hapticFeedback: boolean;
  diarization: boolean;
  autoPunctuation: boolean;
  language: string;
  autoLearnDictionary: boolean;
  liveProviderId: string;
  enableCrewPlanner: boolean;
  enableOfficeDiary: boolean;
  enableScoutFeature: boolean;
}

export function buildSanitizedPreferencesPayload(
  uid: string,
  settings: AppSettings
): SanitizedPreferencesPayload {
  const effectiveLocalOnly = Boolean(settings.localOnly ?? settings.offlineOnly);
  return {
    id: 'app',
    ownerId: sanitizeFirestoreId(uid, 'user'),
    activeLlmId: clampString(settings.activeLlmId, 80, 'llama-3.2-3b-instruct'),
    activeWhisperId: clampString(settings.activeWhisperId, 80, 'whisper-large-v3-turbo'),
    ttsEngine: settings.ttsEngine === 'secure-cloud' ? 'secure-cloud' : 'on-device',
    offlineOnly: effectiveLocalOnly,
    localOnly: effectiveLocalOnly,
    activeSttModelId: clampString(settings.activeSttModelId, 80, 'whisper-tiny-local'),
    activeTextModelId: clampString(settings.activeTextModelId, 80, 'gemini-4-hydrogen'),
    activeDictationModeId: clampString(settings.activeDictationModeId, 64, 'clean-dictation'),
    translationEnabled: Boolean(settings.translationEnabled),
    translationSourceLang: clampString(settings.translationSourceLang, 32, 'Auto-detect'),
    translationTargetLang: clampString(settings.translationTargetLang, 32, 'Spanish'),
    historyRetention:
      settings.historyRetention === '30d' || settings.historyRetention === 'none'
        ? settings.historyRetention
        : 'forever',
    overlayStyle: settings.overlayStyle === 'panel' ? 'panel' : 'capsule',
    motionIntensity: ['reduced', 'standard', 'fluid'].includes(settings.motionIntensity)
      ? settings.motionIntensity
      : 'standard',
    hapticFeedback: Boolean(settings.hapticFeedback),
    diarization: Boolean(settings.diarization),
    autoPunctuation: Boolean(settings.autoPunctuation),
    language: clampString(settings.language, 24, 'en-US'),
    autoLearnDictionary: Boolean(settings.autoLearnDictionary),
    liveProviderId: clampString(settings.liveProviderId, 64, 'whisperkit-local'),
    enableCrewPlanner: Boolean(settings.enableCrewPlanner),
    enableOfficeDiary: Boolean(settings.enableOfficeDiary),
    enableScoutFeature: Boolean(settings.enableScoutFeature)
  };
}

// --- Firestore Operations ---

export async function ensureUserWorkspaceRoot(user: User): Promise<void> {
  const uid = sanitizeFirestoreId(user.uid, 'user');
  const userPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/profile`;

  const displayName = clampString(
    user.displayName || user.email?.split('@')[0],
    BLUEPRINT_LIMITS.DISPLAY_NAME_MAX,
    'Workspace User'
  );
  const photoURL = (user.photoURL || '').slice(0, BLUEPRINT_LIMITS.PHOTO_URL_MAX);
  const email = clampString(user.email, BLUEPRINT_LIMITS.EMAIL_MAX, 'verified@example.com');

  const userRef = doc(db, 'users', uid);
  try {
    const existingSnap = await getDoc(userRef);
    if (!existingSnap.exists()) {
      await setDoc(userRef, {
        uid,
        displayName,
        photoURL,
        role: 'member',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(userRef, {
        displayName,
        photoURL,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  const privateRef = doc(db, 'users', uid, 'private', 'profile');
  try {
    const existingPrivate = await getDoc(privateRef);
    if (!existingPrivate.exists()) {
      await setDoc(privateRef, {
        uid,
        email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else if (existingPrivate.data()?.email !== email) {
      await updateDoc(privateRef, {
        email,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }
}

// --- Diary Entries ---

export function subscribeDiaryEntries(
  uid: string,
  onEntries: (entries: OfficeDiaryEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const colPath = `users/${safeUid}/diaryEntries`;
  const q = query(collection(db, colPath), where('ownerId', '==', safeUid));

  return onSnapshot(
    q,
    (snapshot) => {
      const entries: OfficeDiaryEntry[] = snapshot.docs.map((snap) => {
        const data = snap.data();
        return {
          id: String(data.id || snap.id),
          dateIso: String(data.dateIso || getTodayIsoDate()),
          dateLabel: String(data.dateLabel || formatDiaryDateLabel(getTodayIsoDate())),
          timeLabel: String(data.timeLabel || ''),
          title: String(data.title || 'Untitled Note'),
          content: String(data.content || ''),
          category: (['Focus', 'Decision', 'Blocker', 'Note'].includes(data.category)
            ? data.category
            : 'Note') as OfficeDiaryEntry['category'],
          tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
          attachmentNames: Array.isArray(data.attachmentNames)
            ? data.attachmentNames.map(String)
            : [],
          createdIso: String(data.createdIso || new Date().toISOString()),
          updatedIso: String(data.updatedIso || new Date().toISOString())
        };
      });
      entries.sort((a, b) => b.createdIso.localeCompare(a.createdIso));
      onEntries(entries);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, colPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function saveDiaryEntryToFirestore(
  uid: string,
  entry: OfficeDiaryEntry
): Promise<void> {
  const payload = buildSanitizedDiaryPayload(uid, entry);
  const docPath = `users/${payload.ownerId}/diaryEntries/${payload.id}`;
  const ref = doc(db, 'users', payload.ownerId, 'diaryEntries', payload.id);

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(ref, {
        dateIso: payload.dateIso,
        dateLabel: payload.dateLabel,
        timeLabel: payload.timeLabel,
        title: payload.title,
        content: payload.content,
        category: payload.category,
        tags: payload.tags,
        attachmentNames: payload.attachmentNames,
        updatedIso: payload.updatedIso,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteDiaryEntryFromFirestore(uid: string, entryId: string): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeId = sanitizeFirestoreId(entryId, 'diary');
  const docPath = `users/${safeUid}/diaryEntries/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'diaryEntries', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// --- Background Agent Tasks ---

export function subscribeSchedulerTasks(
  uid: string,
  onTasks: (tasks: BackgroundAgentTask[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const colPath = `users/${safeUid}/schedulerTasks`;
  const q = query(collection(db, colPath), where('ownerId', '==', safeUid));

  return onSnapshot(
    q,
    (snapshot) => {
      const tasks: BackgroundAgentTask[] = snapshot.docs
        .map((snap) => {
          const d = snap.data();
          const rawStatus =
            d.status === 'paused' ? 'paused' : d.status === 'archived' ? 'archived' : 'running';
          return {
            id: String(d.id || snap.id),
            title: String(d.title || 'Background Task'),
            prompt: String(d.prompt || ''),
            cloudModelId: (d.cloudModelId || 'claude-3-7-sonnet') as BackgroundAgentTask['cloudModelId'],
            cloudModelLabel: String(d.cloudModelLabel || 'Claude 3.7 Sonnet'),
            cloudProviderLabel: String(d.cloudProviderLabel || 'Anthropic'),
            intervalId: (d.intervalId || '1m') as BackgroundAgentTask['intervalId'],
            intervalLabel: String(d.intervalLabel || 'Every 1 min'),
            intervalMs: Number(d.intervalMs || 60000),
            status: (rawStatus === 'paused' ? 'paused' : 'running') as BackgroundAgentTask['status'],
            ragEnabled: Boolean(d.ragEnabled),
            ragStrategyId: (d.ragStrategyId || 'hybrid-rrf') as BackgroundAgentTask['ragStrategyId'],
            attachmentNames: Array.isArray(d.attachmentNames) ? d.attachmentNames.map(String) : [],
            runCount: Number(d.runCount || 0),
            createdAtIso: String(d.createdAtIso || new Date().toISOString()),
            lastRunIso: d.lastRunIso ? String(d.lastRunIso) : null,
            nextRunIso: String(d.nextRunIso || new Date().toISOString()),
            latestOutput: String(d.latestOutput || ''),
            latestChunks: [],
            latestCitations: [],
            runHistory: [],
            _archived: rawStatus === 'archived'
          };
        })
        .filter((item) => !item._archived)
        .map(({ _archived, ...rest }) => rest);

      tasks.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
      onTasks(tasks);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, colPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function saveSchedulerTaskToFirestore(
  uid: string,
  task: BackgroundAgentTask
): Promise<void> {
  const payload = buildSanitizedTaskPayload(uid, task);
  const docPath = `users/${payload.ownerId}/schedulerTasks/${payload.id}`;
  const ref = doc(db, 'users', payload.ownerId, 'schedulerTasks', payload.id);

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else if (existingSnap.data()?.status !== 'archived') {
      await updateDoc(ref, {
        status: payload.status,
        ragEnabled: payload.ragEnabled,
        ragStrategyId: payload.ragStrategyId,
        runCount: payload.runCount,
        lastRunIso: payload.lastRunIso,
        nextRunIso: payload.nextRunIso,
        latestOutput: payload.latestOutput,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteSchedulerTaskFromFirestore(
  uid: string,
  taskId: string
): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeId = sanitizeFirestoreId(taskId, 'task');
  const docPath = `users/${safeUid}/schedulerTasks/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'schedulerTasks', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// --- CoreData Cloud-Synced Documents ---

export function subscribeCoreDataDocuments(
  uid: string,
  onDocs: (docs: CoreDataManagedDocument[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const colPath = `users/${safeUid}/coreDataDocuments`;
  const q = query(collection(db, colPath), where('ownerId', '==', safeUid));

  return onSnapshot(
    q,
    (snapshot) => {
      const docs: CoreDataManagedDocument[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        return {
          managedObjectId: String(d.managedObjectId || `x-coredata://CDDocument/${snap.id}`),
          cloudKitRecordName: String(d.cloudKitRecordName || `CK-${snap.id}`),
          entityName: 'CDDocument',
          id: String(d.id || snap.id),
          title: String(d.title || 'Document'),
          format: (d.format || 'TXT') as CoreDataManagedDocument['format'],
          assetKind: (d.assetKind || 'document') as CoreDataManagedDocument['assetKind'],
          sizeKB: Number(d.sizeKB || 1),
          chunkCount: Number(d.chunkCount || 1),
          embeddingDim: Number(d.embeddingDim || 128),
          dateAdded: String(d.dateAdded || 'Today'),
          updatedIso: String(d.updatedIso || new Date().toISOString()),
          summary: String(d.summary || ''),
          contentExcerpt: String(d.contentExcerpt || ''),
          tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
          syncState: 'synced'
        };
      });
      docs.sort((a, b) => b.updatedIso.localeCompare(a.updatedIso));
      onDocs(docs);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, colPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function saveCoreDataDocToFirestore(
  uid: string,
  document: CoreDataManagedDocument
): Promise<void> {
  const payload = buildSanitizedCoreDataPayload(uid, document);
  const docPath = `users/${payload.ownerId}/coreDataDocuments/${payload.id}`;
  const ref = doc(db, 'users', payload.ownerId, 'coreDataDocuments', payload.id);

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(ref, {
        title: payload.title,
        chunkCount: payload.chunkCount,
        updatedIso: payload.updatedIso,
        summary: payload.summary,
        contentExcerpt: payload.contentExcerpt,
        tags: payload.tags,
        syncState: payload.syncState,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteCoreDataDocFromFirestore(uid: string, docId: string): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeId = sanitizeFirestoreId(docId, 'doc');
  const docPath = `users/${safeUid}/coreDataDocuments/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'coreDataDocuments', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// --- User Preferences ---

export function subscribeUserPreferences(
  uid: string,
  onPrefs: (patch: Partial<AppSettings>) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const docPath = `users/${safeUid}/preferences/app`;
  const ref = doc(db, 'users', safeUid, 'preferences', 'app');

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      onPrefs({
        activeLlmId: typeof d.activeLlmId === 'string' ? d.activeLlmId : undefined,
        activeWhisperId: typeof d.activeWhisperId === 'string' ? d.activeWhisperId : undefined,
        ttsEngine:
          d.ttsEngine === 'secure-cloud' || d.ttsEngine === 'on-device'
            ? d.ttsEngine
            : undefined,
        offlineOnly: typeof d.offlineOnly === 'boolean' ? d.offlineOnly : undefined,
        localOnly: typeof d.localOnly === 'boolean' ? d.localOnly : undefined,
        activeSttModelId: typeof d.activeSttModelId === 'string' ? d.activeSttModelId : undefined,
        activeTextModelId: typeof d.activeTextModelId === 'string' ? d.activeTextModelId : undefined,
        activeDictationModeId:
          typeof d.activeDictationModeId === 'string' ? d.activeDictationModeId : undefined,
        translationEnabled:
          typeof d.translationEnabled === 'boolean' ? d.translationEnabled : undefined,
        translationSourceLang:
          typeof d.translationSourceLang === 'string' ? d.translationSourceLang : undefined,
        translationTargetLang:
          typeof d.translationTargetLang === 'string' ? d.translationTargetLang : undefined,
        historyRetention:
          d.historyRetention === 'forever' ||
          d.historyRetention === '30d' ||
          d.historyRetention === 'none'
            ? d.historyRetention
            : undefined,
        overlayStyle:
          d.overlayStyle === 'capsule' || d.overlayStyle === 'panel' ? d.overlayStyle : undefined,
        motionIntensity:
          d.motionIntensity === 'reduced' ||
          d.motionIntensity === 'standard' ||
          d.motionIntensity === 'fluid'
            ? d.motionIntensity
            : undefined,
        hapticFeedback: typeof d.hapticFeedback === 'boolean' ? d.hapticFeedback : undefined,
        diarization: typeof d.diarization === 'boolean' ? d.diarization : undefined,
        autoPunctuation: typeof d.autoPunctuation === 'boolean' ? d.autoPunctuation : undefined,
        language: typeof d.language === 'string' ? d.language : undefined,
        autoLearnDictionary:
          typeof d.autoLearnDictionary === 'boolean' ? d.autoLearnDictionary : undefined,
        liveProviderId:
          typeof d.liveProviderId === 'string'
            ? (d.liveProviderId as AppSettings['liveProviderId'])
            : undefined,
        enableCrewPlanner:
          typeof d.enableCrewPlanner === 'boolean' ? d.enableCrewPlanner : undefined,
        enableOfficeDiary:
          typeof d.enableOfficeDiary === 'boolean' ? d.enableOfficeDiary : undefined,
        enableScoutFeature:
          typeof d.enableScoutFeature === 'boolean' ? d.enableScoutFeature : undefined
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, docPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function saveUserPreferencesToFirestore(
  uid: string,
  settings: AppSettings
): Promise<void> {
  const payload = buildSanitizedPreferencesPayload(uid, settings);
  const docPath = `users/${payload.ownerId}/preferences/app`;
  const ref = doc(db, 'users', payload.ownerId, 'preferences', 'app');

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(ref, {
        activeLlmId: payload.activeLlmId,
        activeWhisperId: payload.activeWhisperId,
        ttsEngine: payload.ttsEngine,
        offlineOnly: payload.offlineOnly,
        localOnly: payload.localOnly,
        activeSttModelId: payload.activeSttModelId,
        activeTextModelId: payload.activeTextModelId,
        activeDictationModeId: payload.activeDictationModeId,
        translationEnabled: payload.translationEnabled,
        translationSourceLang: payload.translationSourceLang,
        translationTargetLang: payload.translationTargetLang,
        historyRetention: payload.historyRetention,
        overlayStyle: payload.overlayStyle,
        motionIntensity: payload.motionIntensity,
        hapticFeedback: payload.hapticFeedback,
        diarization: payload.diarization,
        autoPunctuation: payload.autoPunctuation,
        language: payload.language,
        autoLearnDictionary: payload.autoLearnDictionary,
        liveProviderId: payload.liveProviderId,
        enableCrewPlanner: payload.enableCrewPlanner,
        enableOfficeDiary: payload.enableOfficeDiary,
        enableScoutFeature: payload.enableScoutFeature,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// --- Immutable Account Identity & Callsigns ---

export async function loadAccountIdentityFromFirestore(
  uid: string
): Promise<UserIdentity | null> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const docPath = `users/${safeUid}/identity/account`;
  const ref = doc(db, 'users', safeUid, 'identity', 'account');

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const d = snap.data();
    const userId = String(d.userId || '');
    if (!isValidReadableUserId(userId)) return null;
    return {
      userId,
      createdAt: String(d.createdIso || new Date().toISOString()),
      authUid: safeUid,
      linkedProvider: d.linkedProvider === 'guest' ? 'guest' : 'google'
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
    return null;
  }
}

export async function saveAccountIdentityToFirestore(
  uid: string,
  identity: UserIdentity
): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const docPath = `users/${safeUid}/identity/account`;
  const ref = doc(db, 'users', safeUid, 'identity', 'account');
  const safeNanoId = isValidReadableUserId(identity.userId)
    ? identity.userId.trim()
    : generateReadableUserId();

  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      // Immutable once created; firestore.rules disallows update
      return;
    }
    await setDoc(ref, {
      id: 'account',
      ownerId: safeUid,
      userId: safeNanoId,
      linkedProvider: identity.linkedProvider === 'guest' ? 'guest' : 'google',
      createdIso: clampString(identity.createdAt, BLUEPRINT_LIMITS.ISO_MAX, new Date().toISOString()),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export function subscribeCallsigns(
  uid: string,
  onCallsigns: (items: Callsign[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const colPath = `users/${safeUid}/callsigns`;
  const q = query(collection(db, colPath), where('ownerId', '==', safeUid));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Callsign[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        return {
          id: String(d.id || snap.id),
          userId: String(d.userId || ''),
          displayName: String(d.displayName || 'Callsign'),
          avatar: String(d.avatar ?? '🧭'),
          isActive: Boolean(d.isActive),
          createdAt: String(d.createdIso || new Date().toISOString()),
          updatedAt: String(d.updatedIso || new Date().toISOString())
        };
      });
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onCallsigns(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, colPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function saveCallsignToFirestore(uid: string, callsign: Callsign): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeId = sanitizeFirestoreId(callsign.id, 'cs');
  const safeNanoId = isValidReadableUserId(callsign.userId)
    ? callsign.userId.trim()
    : generateReadableUserId();
  const docPath = `users/${safeUid}/callsigns/${safeId}`;
  const ref = doc(db, 'users', safeUid, 'callsigns', safeId);

  const displayName = clampString(callsign.displayName, 48, 'Callsign');
  const avatar = (callsign.avatar ?? '🧭').toString().trim().slice(0, 12);
  const createdIso = clampString(callsign.createdAt, BLUEPRINT_LIMITS.ISO_MAX, new Date().toISOString());
  const updatedIso = clampString(callsign.updatedAt, BLUEPRINT_LIMITS.ISO_MAX, new Date().toISOString());

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        id: safeId,
        ownerId: safeUid,
        userId: safeNanoId,
        displayName,
        avatar,
        isActive: Boolean(callsign.isActive),
        createdIso,
        updatedIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(ref, {
        displayName,
        avatar,
        isActive: Boolean(callsign.isActive),
        updatedIso,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteCallsignFromFirestore(uid: string, callsignId: string): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeId = sanitizeFirestoreId(callsignId, 'cs');
  const docPath = `users/${safeUid}/callsigns/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'callsigns', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// --- Nanobots & Run History ---

export function subscribeNanobots(
  uid: string,
  onNanobots: (bots: Nanobot[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const colPath = `users/${safeUid}/nanobots`;
  const q = query(collection(db, colPath), where('ownerId', '==', safeUid));

  return onSnapshot(
    q,
    (snapshot) => {
      const bots: Nanobot[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        const engine = ['pulse', 'atlas', 'nova'].includes(String(d.engine))
          ? (d.engine as Nanobot['engine'])
          : 'atlas';
        const styleId = [
          'researcher',
          'analyst',
          'scheduler',
          'writer',
          'inbox-admin',
          'developer'
        ].includes(String(d.styleId))
          ? (d.styleId as Nanobot['styleId'])
          : 'researcher';
        const cadence = ['once', 'daily', 'weekly', 'custom'].includes(String(d.cadence))
          ? (d.cadence as Nanobot['schedule']['cadence'])
          : 'daily';
        const status = [
          'idle',
          'scheduled',
          'running',
          'paused',
          'stopped',
          'completed',
          'failed'
        ].includes(String(d.status))
          ? (d.status as Nanobot['status'])
          : 'scheduled';

        return {
          id: String(d.id || snap.id),
          userId: String(d.userId || ''),
          name: String(d.name || 'Nanobot'),
          engine,
          styleId,
          modelId: String(d.modelId || 'atlas-gemini-flash'),
          taskPrompt: String(d.taskPrompt || ''),
          schedule: {
            cadence,
            startTime: String(d.startTime || '09:00'),
            notificationsEnabled: Boolean(d.notificationsEnabled),
            ...(d.nextRunIso ? { nextRunIso: String(d.nextRunIso) } : {})
          },
          status,
          sandboxId: String(d.sandboxId || `sbx-${snap.id}`),
          consentTimestampIso: String(d.consentTimestampIso || new Date().toISOString()),
          createdAt: String(d.createdIso || new Date().toISOString()),
          updatedAt: String(d.updatedIso || new Date().toISOString())
        };
      });
      bots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onNanobots(bots);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, colPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function saveNanobotToFirestore(uid: string, bot: Nanobot): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeId = sanitizeFirestoreId(bot.id, 'bot');
  const safeNanoId = isValidReadableUserId(bot.userId)
    ? bot.userId.trim()
    : generateReadableUserId();
  const safeSandboxId = sanitizeFirestoreId(bot.sandboxId, 'sbx');
  const docPath = `users/${safeUid}/nanobots/${safeId}`;
  const ref = doc(db, 'users', safeUid, 'nanobots', safeId);

  const payload = {
    id: safeId,
    ownerId: safeUid,
    userId: safeNanoId,
    name: clampString(bot.name, 60, 'Nanobot'),
    engine: ['pulse', 'atlas', 'nova'].includes(bot.engine) ? bot.engine : 'atlas',
    styleId: [
      'researcher',
      'analyst',
      'scheduler',
      'writer',
      'inbox-admin',
      'developer'
    ].includes(bot.styleId)
      ? bot.styleId
      : 'researcher',
    modelId: clampString(bot.modelId, 80, 'atlas-gemini-flash'),
    taskPrompt: clampString(bot.taskPrompt, BLUEPRINT_LIMITS.TASK_PROMPT_MAX, 'Execute task'),
    cadence: ['once', 'daily', 'weekly', 'custom'].includes(bot.schedule.cadence)
      ? bot.schedule.cadence
      : 'daily',
    startTime: clampString(bot.schedule.startTime, 16, '09:00'),
    notificationsEnabled: Boolean(bot.schedule.notificationsEnabled),
    nextRunIso: (bot.schedule.nextRunIso || '').slice(0, BLUEPRINT_LIMITS.ISO_MAX),
    status: [
      'idle',
      'scheduled',
      'running',
      'paused',
      'stopped',
      'completed',
      'failed'
    ].includes(bot.status)
      ? bot.status
      : 'scheduled',
    sandboxId: safeSandboxId,
    consentTimestampIso: clampString(
      bot.consentTimestampIso,
      BLUEPRINT_LIMITS.ISO_MAX,
      new Date().toISOString()
    ),
    createdIso: clampString(bot.createdAt, BLUEPRINT_LIMITS.ISO_MAX, new Date().toISOString()),
    updatedIso: clampString(bot.updatedAt, BLUEPRINT_LIMITS.ISO_MAX, new Date().toISOString())
  };

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      await updateDoc(ref, {
        name: payload.name,
        modelId: payload.modelId,
        taskPrompt: payload.taskPrompt,
        cadence: payload.cadence,
        startTime: payload.startTime,
        notificationsEnabled: payload.notificationsEnabled,
        nextRunIso: payload.nextRunIso,
        status: payload.status,
        updatedIso: payload.updatedIso,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteNanobotFromFirestore(uid: string, botId: string): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeId = sanitizeFirestoreId(botId, 'bot');
  const docPath = `users/${safeUid}/nanobots/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'nanobots', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export function subscribeNanobotRuns(
  uid: string,
  botId: string,
  onRuns: (runs: NanobotRun[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeBotId = sanitizeFirestoreId(botId, 'bot');
  const colPath = `users/${safeUid}/nanobots/${safeBotId}/runs`;
  const q = query(
    collection(db, colPath),
    where('ownerId', '==', safeUid),
    where('botId', '==', safeBotId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const runs: NanobotRun[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        const status = ['running', 'completed', 'failed', 'stopped'].includes(String(d.status))
          ? (d.status as NanobotRun['status'])
          : 'completed';
        return {
          id: String(d.id || snap.id),
          botId: String(d.botId || safeBotId),
          userId: String(d.userId || ''),
          startedAt: String(d.startedAt || new Date().toISOString()),
          ...(d.endedAt ? { endedAt: String(d.endedAt) } : {}),
          status,
          output: String(d.output || '')
        };
      });
      runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      onRuns(runs);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, colPath);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    }
  );
}

export async function saveNanobotRunToFirestore(uid: string, run: NanobotRun): Promise<void> {
  const safeUid = sanitizeFirestoreId(uid, 'user');
  const safeBotId = sanitizeFirestoreId(run.botId, 'bot');
  const safeRunId = sanitizeFirestoreId(run.id, 'run');
  const safeNanoId = isValidReadableUserId(run.userId)
    ? run.userId.trim()
    : generateReadableUserId();
  const docPath = `users/${safeUid}/nanobots/${safeBotId}/runs/${safeRunId}`;
  const ref = doc(db, 'users', safeUid, 'nanobots', safeBotId, 'runs', safeRunId);

  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      // Immutable audit run record; firestore.rules disallows update
      return;
    }
    await setDoc(ref, {
      id: safeRunId,
      botId: safeBotId,
      ownerId: safeUid,
      userId: safeNanoId,
      startedAt: clampString(run.startedAt, BLUEPRINT_LIMITS.ISO_MAX, new Date().toISOString()),
      endedAt: (run.endedAt || '').slice(0, BLUEPRINT_LIMITS.ISO_MAX),
      status: ['running', 'completed', 'failed', 'stopped'].includes(run.status)
        ? run.status
        : 'completed',
      output: (run.output || '').slice(0, BLUEPRINT_LIMITS.TASK_OUTPUT_MAX),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export { buildChunksFromWorkspaceAttachments };
