import type { Callsign, UserIdentity } from '../types/index.ts';

const USER_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const USER_ID_PATTERN = /^NB-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export const CALLSIGN_AVATAR_OPTIONS = [
  '🧭',
  '⚡️',
  '🛰️',
  '🔮',
  '🛡️',
  '📝',
  '🌿',
  '🎯'
] as const;

function randomSegment(length: number): string {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * USER_ID_ALPHABET.length);
    result += USER_ID_ALPHABET[idx];
  }
  return result;
}

export function generateReadableUserId(): string {
  return `NB-${randomSegment(4)}-${randomSegment(4)}`;
}

export function isValidReadableUserId(userId: string): boolean {
  return USER_ID_PATTERN.test(userId.trim());
}

export function createUserIdentity(params?: {
  authUid?: string;
  linkedProvider?: 'google' | 'guest';
  existingUserId?: string;
  createdAt?: string;
}): UserIdentity {
  const nowIso = params?.createdAt || new Date().toISOString();
  const userId =
    params?.existingUserId && isValidReadableUserId(params.existingUserId)
      ? params.existingUserId
      : generateReadableUserId();
  return {
    userId,
    createdAt: nowIso,
    ...(params?.authUid ? { authUid: params.authUid } : {}),
    linkedProvider: params?.linkedProvider ?? (params?.authUid ? 'google' : 'guest')
  };
}

export function createCallsignItem(params: {
  id?: string;
  userId: string;
  displayName: string;
  avatar?: string;
  isActive?: boolean;
  existingCallsigns: readonly Callsign[];
  nowIso?: string;
}): { created: Callsign; callsigns: Callsign[] } {
  const cleanName = params.displayName.trim().slice(0, 48);
  if (!cleanName) {
    throw new Error('Callsign name cannot be empty.');
  }
  const nowIso = params.nowIso || new Date().toISOString();
  const shouldActivate =
    params.isActive !== undefined ? params.isActive : params.existingCallsigns.length === 0;
  const cleanAvatar = (params.avatar ?? '🧭').trim().slice(0, 12);

  const created: Callsign = {
    id:
      params.id?.trim() ||
      `cs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: params.userId,
    displayName: cleanName,
    avatar: cleanAvatar,
    isActive: shouldActivate,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  const nextList = shouldActivate
    ? [
        created,
        ...params.existingCallsigns.map((item) => ({
          ...item,
          isActive: false
        }))
      ]
    : [created, ...params.existingCallsigns];

  return { created, callsigns: nextList };
}

export function setActiveCallsign(
  callsigns: readonly Callsign[],
  targetId: string,
  nowIso: string = new Date().toISOString()
): Callsign[] {
  return callsigns.map((item) => ({
    ...item,
    isActive: item.id === targetId,
    updatedAt: item.id === targetId ? nowIso : item.updatedAt
  }));
}

export function updateCallsignItem(
  callsigns: readonly Callsign[],
  targetId: string,
  patch: { displayName?: string; avatar?: string; isActive?: boolean },
  nowIso: string = new Date().toISOString()
): Callsign[] {
  const nextName =
    patch.displayName !== undefined ? patch.displayName.trim().slice(0, 48) : undefined;
  if (patch.displayName !== undefined && !nextName) {
    throw new Error('Callsign name cannot be empty.');
  }

  let updatedList = callsigns.map((item) => {
    if (item.id !== targetId) {
      return patch.isActive ? { ...item, isActive: false } : item;
    }
    return {
      ...item,
      ...(nextName !== undefined ? { displayName: nextName } : {}),
      ...(patch.avatar !== undefined ? { avatar: patch.avatar.trim().slice(0, 12) } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      updatedAt: nowIso
    };
  });

  if (updatedList.length > 0 && !updatedList.some((item) => item.isActive)) {
    updatedList = updatedList.map((item, idx) =>
      idx === 0 ? { ...item, isActive: true, updatedAt: nowIso } : item
    );
  }
  return updatedList;
}

export function deleteCallsignItem(
  callsigns: readonly Callsign[],
  targetId: string,
  nowIso: string = new Date().toISOString()
): Callsign[] {
  const remaining = callsigns.filter((item) => item.id !== targetId);
  if (remaining.length > 0 && !remaining.some((item) => item.isActive)) {
    return remaining.map((item, idx) =>
      idx === 0 ? { ...item, isActive: true, updatedAt: nowIso } : item
    );
  }
  return remaining;
}
