import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Nanobot, NanobotSandboxState } from '../types/index.ts';
import { getEngineSpec } from './nanobotCatalog.ts';

const SAFE_SEGMENT_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export class SandboxPolicyError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 403, code = 'SANDBOX_ACCESS_DENIED') {
    super(message);
    this.name = 'SandboxPolicyError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function sanitizeSandboxSegment(raw: string, label: string): string {
  const clean = (raw || '').trim();
  if (!clean || !SAFE_SEGMENT_PATTERN.test(clean)) {
    throw new SandboxPolicyError(
      `Invalid ${label} identifier for sandbox isolation policy.`,
      400,
      'INVALID_SANDBOX_IDENTIFIER'
    );
  }
  return clean;
}

export function buildSandboxId(botId: string): string {
  const cleanBot = sanitizeSandboxSegment(botId, 'botId');
  return `sbx-${cleanBot}`;
}

export function resolveBotSandboxDir(
  sandboxRootDir: string,
  userId: string,
  botId: string
): string {
  const safeUser = sanitizeSandboxSegment(userId, 'userId');
  const safeBot = sanitizeSandboxSegment(botId, 'botId');
  const rootResolved = path.resolve(sandboxRootDir);
  const target = path.resolve(rootResolved, safeUser, safeBot);
  if (!target.startsWith(`${rootResolved}${path.sep}`)) {
    throw new SandboxPolicyError(
      'Sandbox path escapes isolated root boundary.',
      403,
      'SANDBOX_PATH_ESCAPE'
    );
  }
  return target;
}

export interface SandboxAccessRequest {
  actorUserId: string;
  targetUserId: string;
  actorBotId: string;
  targetBotId: string;
  requestedSandboxId?: string;
  expectedSandboxId: string;
}

export function assertBotSandboxAccess(req: SandboxAccessRequest): void {
  const actorUser = sanitizeSandboxSegment(req.actorUserId, 'actorUserId');
  const targetUser = sanitizeSandboxSegment(req.targetUserId, 'targetUserId');
  const actorBot = sanitizeSandboxSegment(req.actorBotId, 'actorBotId');
  const targetBot = sanitizeSandboxSegment(req.targetBotId, 'targetBotId');

  if (actorUser !== targetUser) {
    throw new SandboxPolicyError(
      `User ${actorUser} cannot access sandbox owned by ${targetUser}.`,
      403,
      'CROSS_USER_SANDBOX_DENIED'
    );
  }

  if (actorBot !== targetBot) {
    throw new SandboxPolicyError(
      `Nanobot ${actorBot} is isolated and cannot read, write, or message sandbox of ${targetBot}.`,
      403,
      'CROSS_BOT_SANDBOX_DENIED'
    );
  }

  if (req.requestedSandboxId && req.requestedSandboxId !== req.expectedSandboxId) {
    throw new SandboxPolicyError(
      `Sandbox mismatch: requested ${req.requestedSandboxId}, expected ${req.expectedSandboxId}.`,
      403,
      'SANDBOX_ID_MISMATCH'
    );
  }
}

export async function provisionBotSandbox(
  sandboxRootDir: string,
  bot: Nanobot
): Promise<NanobotSandboxState> {
  const botDir = resolveBotSandboxDir(sandboxRootDir, bot.userId, bot.id);
  await fs.mkdir(botDir, { recursive: true });
  const engineSpec = getEngineSpec(bot.engine);
  const nowIso = new Date().toISOString();

  const initialState: NanobotSandboxState = {
    sandboxId: bot.sandboxId,
    botId: bot.id,
    userId: bot.userId,
    storagePath: path.join(bot.userId, bot.id),
    networkScope: engineSpec.networkScope,
    credentialScope: `scoped-token:${bot.userId}:${bot.id}`,
    memoryEntries: [
      {
        id: `mem-init-${Date.now()}`,
        timestamp: nowIso,
        summary: `Initialized isolated sandbox ${bot.sandboxId} for ${bot.name} (${engineSpec.name}).`
      }
    ],
    updatedAt: nowIso
  };

  await fs.writeFile(
    path.join(botDir, 'sandbox.json'),
    JSON.stringify(initialState, null, 2),
    'utf-8'
  );
  return initialState;
}

export async function readBotSandbox(
  sandboxRootDir: string,
  bot: Nanobot,
  actorUserId: string,
  actorBotId: string
): Promise<NanobotSandboxState> {
  assertBotSandboxAccess({
    actorUserId,
    targetUserId: bot.userId,
    actorBotId,
    targetBotId: bot.id,
    expectedSandboxId: bot.sandboxId
  });

  const botDir = resolveBotSandboxDir(sandboxRootDir, bot.userId, bot.id);
  const filePath = path.join(botDir, 'sandbox.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as NanobotSandboxState;
  } catch {
    return provisionBotSandbox(sandboxRootDir, bot);
  }
}

export async function appendBotSandboxMemory(
  sandboxRootDir: string,
  bot: Nanobot,
  actorUserId: string,
  actorBotId: string,
  summary: string
): Promise<NanobotSandboxState> {
  const cleanSummary = summary.trim().slice(0, 1200);
  if (!cleanSummary) {
    throw new SandboxPolicyError('Sandbox memory entry cannot be empty.', 400, 'EMPTY_MEMORY');
  }
  const current = await readBotSandbox(sandboxRootDir, bot, actorUserId, actorBotId);
  const nowIso = new Date().toISOString();
  const nextState: NanobotSandboxState = {
    ...current,
    memoryEntries: [
      {
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        summary: cleanSummary
      },
      ...current.memoryEntries
    ].slice(0, 40),
    updatedAt: nowIso
  };
  const botDir = resolveBotSandboxDir(sandboxRootDir, bot.userId, bot.id);
  await fs.mkdir(botDir, { recursive: true });
  await fs.writeFile(
    path.join(botDir, 'sandbox.json'),
    JSON.stringify(nextState, null, 2),
    'utf-8'
  );
  return nextState;
}

export async function wipeBotSandbox(
  sandboxRootDir: string,
  userId: string,
  botId: string
): Promise<void> {
  const botDir = resolveBotSandboxDir(sandboxRootDir, userId, botId);
  await fs.rm(botDir, { recursive: true, force: true });
}
