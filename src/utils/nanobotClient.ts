import type {
  Callsign,
  Nanobot,
  NanobotEngineId,
  NanobotRun,
  NanobotSandboxState,
  NanobotSchedule,
  NanobotStatus,
  NanobotStyleId,
  UserIdentity
} from '../types/index.ts';
import { gatewayFetch } from './networkGateway.ts';

async function parseJsonResponse<T>(resp: Response): Promise<T> {
  const data = (await resp.json().catch(() => ({}))) as T & { error?: string };
  if (!resp.ok) {
    throw new Error(data.error || `Request failed with status ${resp.status}`);
  }
  return data;
}

export async function initBackendIdentity(params: {
  scopeKey: string;
  authUid?: string;
  linkedProvider?: 'google' | 'guest';
  preferredExistingUserId?: string;
  guestScopeKey?: string;
}): Promise<{ identity: UserIdentity; callsigns: Callsign[] }> {
  const resp = await gatewayFetch('/api/identity/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return parseJsonResponse(resp);
}

export async function createCallsignRequest(params: {
  userId: string;
  displayName: string;
  avatar?: string;
  isActive?: boolean;
}): Promise<{ callsign: Callsign; callsigns: Callsign[] }> {
  const resp = await gatewayFetch('/api/callsigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return parseJsonResponse(resp);
}

export async function updateCallsignRequest(
  callsignId: string,
  params: {
    userId: string;
    displayName?: string;
    avatar?: string;
    isActive?: boolean;
  }
): Promise<{ callsigns: Callsign[] }> {
  const resp = await gatewayFetch(`/api/callsigns/${encodeURIComponent(callsignId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return parseJsonResponse(resp);
}

export async function deleteCallsignRequest(
  callsignId: string,
  userId: string
): Promise<{ removedId: string; callsigns: Callsign[] }> {
  const resp = await gatewayFetch(
    `/api/callsigns/${encodeURIComponent(callsignId)}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
  return parseJsonResponse(resp);
}

export async function fetchNanobotsRequest(
  userId: string
): Promise<{ nanobots: Nanobot[]; runs: NanobotRun[] }> {
  const resp = await gatewayFetch(`/api/nanobots?userId=${encodeURIComponent(userId)}`);
  return parseJsonResponse(resp);
}

export async function createNanobotRequest(params: {
  userId: string;
  name: string;
  engine: NanobotEngineId;
  styleId: NanobotStyleId;
  modelId: string;
  taskPrompt: string;
  schedule: NanobotSchedule;
  consentTimestampIso: string;
  runImmediately?: boolean;
}): Promise<{ nanobot: Nanobot; runs: NanobotRun[]; nanobots: Nanobot[] }> {
  const resp = await gatewayFetch('/api/nanobots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return parseJsonResponse(resp);
}

export async function updateNanobotRequest(
  botId: string,
  params: {
    userId: string;
    name?: string;
    modelId?: string;
    taskPrompt?: string;
    schedule?: NanobotSchedule;
    status?: NanobotStatus;
  }
): Promise<{ nanobot: Nanobot }> {
  const resp = await gatewayFetch(`/api/nanobots/${encodeURIComponent(botId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return parseJsonResponse(resp);
}

export async function rerunNanobotRequest(
  botId: string,
  userId: string
): Promise<{ nanobot: Nanobot; run: NanobotRun }> {
  const resp = await gatewayFetch(`/api/nanobots/${encodeURIComponent(botId)}/rerun`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  return parseJsonResponse(resp);
}

export async function deleteNanobotRequest(
  botId: string,
  userId: string
): Promise<{ removedId: string; sandboxWiped: boolean }> {
  const resp = await gatewayFetch(
    `/api/nanobots/${encodeURIComponent(botId)}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
  return parseJsonResponse(resp);
}

export async function fetchNanobotSandboxRequest(
  botId: string,
  userId: string,
  actorBotId: string = botId
): Promise<{ sandbox: NanobotSandboxState }> {
  const resp = await gatewayFetch(
    `/api/nanobots/${encodeURIComponent(botId)}/sandbox?userId=${encodeURIComponent(
      userId
    )}&actorBotId=${encodeURIComponent(actorBotId)}`
  );
  return parseJsonResponse(resp);
}
