import type { AppSettings } from '../types/index.ts';

export class LocalOnlyBlockedError extends Error {
  readonly code = 'LOCAL_ONLY_BLOCKED' as const;
  readonly targetUrl: string;

  constructor(targetUrl: string, detail?: string) {
    super(
      detail ||
        `Blocked outbound network call (${targetUrl}) because Local-Only Mode is enabled.`
    );
    this.name = 'LocalOnlyBlockedError';
    this.targetUrl = targetUrl;
  }
}

export interface NetworkFirewallEvent {
  blockedCount: number;
  lastBlockedUrl: string | null;
  lastBlockedAtIso: string | null;
}

const CLOUD_ROUTE_PREFIXES = [
  '/api/search/cloud',
  '/api/scout/stream',
  '/api/dictation/transcribe',
  '/api/dictation/translate',
  '/api/scheduler/tasks'
] as const;

let globalLocalOnly = false;
let blockedCount = 0;
let lastBlockedUrl: string | null = null;
let lastBlockedAtIso: string | null = null;
let installedFirewall = false;
let originalGlobalFetch: typeof fetch | null = null;
const firewallListeners = new Set<(event: NetworkFirewallEvent) => void>();

function notifyFirewallListeners() {
  const snapshot: NetworkFirewallEvent = {
    blockedCount,
    lastBlockedUrl,
    lastBlockedAtIso
  };
  for (const listener of firewallListeners) {
    try {
      listener(snapshot);
    } catch {
      // ignore listener errors
    }
  }
}

export function subscribeNetworkFirewall(
  listener: (event: NetworkFirewallEvent) => void
): () => void {
  firewallListeners.add(listener);
  listener({ blockedCount, lastBlockedUrl, lastBlockedAtIso });
  return () => {
    firewallListeners.delete(listener);
  };
}

export function getBlockedRequestsCount(): number {
  return blockedCount;
}

export function getNetworkFirewallSnapshot(): NetworkFirewallEvent {
  return { blockedCount, lastBlockedUrl, lastBlockedAtIso };
}

export function resetNetworkFirewallStats(): void {
  blockedCount = 0;
  lastBlockedUrl = null;
  lastBlockedAtIso = null;
  notifyFirewallListeners();
}

export function isLocalOnlyActive(
  settings?: Pick<AppSettings, 'localOnly' | 'offlineOnly'> | null
): boolean {
  if (settings) {
    return Boolean(settings.localOnly || settings.offlineOnly);
  }
  return globalLocalOnly;
}

export function setGlobalLocalOnlyPolicy(enabled: boolean): void {
  globalLocalOnly = Boolean(enabled);
}

export function getGlobalLocalOnlyPolicy(): boolean {
  return globalLocalOnly;
}

export function isLoopbackOrPrivateUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local')
    ) {
      return true;
    }
    if (host.startsWith('10.') || host.startsWith('192.168.')) {
      return true;
    }
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function evaluateOutboundUrlPolicy(
  rawUrl: string,
  localOnly: boolean = globalLocalOnly,
  currentOrigin?: string
): { allowed: boolean; reason?: string; isSameOrigin: boolean; pathname: string } {
  const cleanUrl = String(rawUrl || '').trim();
  if (!cleanUrl) {
    return { allowed: false, reason: 'Empty URL', isSameOrigin: false, pathname: '' };
  }

  // Relative path inside our app
  if (cleanUrl.startsWith('/')) {
    const pathname = cleanUrl.split('?')[0];
    if (
      localOnly &&
      CLOUD_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    ) {
      return {
        allowed: false,
        isSameOrigin: true,
        pathname,
        reason: `Cloud route ${pathname} is blocked in Local-Only Mode.`
      };
    }
    return { allowed: true, isSameOrigin: true, pathname };
  }

  let parsed: URL;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    return { allowed: false, reason: 'Invalid URL', isSameOrigin: false, pathname: cleanUrl };
  }

  // Allow blob/data URLs (local recordings / Worker bundles)
  if (parsed.protocol === 'blob:' || parsed.protocol === 'data:') {
    return { allowed: true, isSameOrigin: true, pathname: parsed.pathname };
  }

  const origin =
    currentOrigin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);

  if (origin && parsed.origin === origin) {
    if (
      localOnly &&
      CLOUD_ROUTE_PREFIXES.some(
        (prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)
      )
    ) {
      return {
        allowed: false,
        isSameOrigin: true,
        pathname: parsed.pathname,
        reason: `Cloud route ${parsed.pathname} is blocked in Local-Only Mode.`
      };
    }
    return { allowed: true, isSameOrigin: true, pathname: parsed.pathname };
  }

  if (localOnly) {
    if (isLoopbackOrPrivateUrl(cleanUrl)) {
      return { allowed: true, isSameOrigin: false, pathname: parsed.pathname };
    }
    return {
      allowed: false,
      isSameOrigin: false,
      pathname: parsed.pathname,
      reason: `External network call to ${parsed.hostname} is blocked in Local-Only Mode.`
    };
  }

  return { allowed: true, isSameOrigin: false, pathname: parsed.pathname };
}

export function assertOutboundAllowed(
  rawUrl: string,
  localOnly: boolean = globalLocalOnly
): void {
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const verdict = evaluateOutboundUrlPolicy(rawUrl, localOnly, currentOrigin);
  if (!verdict.allowed) {
    blockedCount += 1;
    lastBlockedUrl = rawUrl;
    lastBlockedAtIso = new Date().toISOString();
    notifyFirewallListeners();
    throw new LocalOnlyBlockedError(rawUrl, verdict.reason);
  }
}

export async function gatewayFetch(
  input: RequestInfo | URL,
  init?: RequestInit & { localOnlyOverride?: boolean }
): Promise<Response> {
  const urlString =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  const effectiveLocalOnly =
    init?.localOnlyOverride !== undefined ? init.localOnlyOverride : globalLocalOnly;

  assertOutboundAllowed(urlString, effectiveLocalOnly);

  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  if (effectiveLocalOnly) {
    headers.set('X-Local-Only', '1');
  }

  const fetchImpl = originalGlobalFetch || globalThis.fetch.bind(globalThis);
  return fetchImpl(input, {
    ...init,
    headers
  });
}

export function installFetchLocalOnlyFirewall(
  target?: { fetch?: typeof fetch }
): boolean {
  const isDefaultWindow = !target;
  if (isDefaultWindow && installedFirewall) {
    return true;
  }

  const hostObj: ({ fetch?: typeof fetch } & Record<string, unknown>) | undefined =
    (target as ({ fetch?: typeof fetch } & Record<string, unknown>) | undefined) ||
    (typeof window !== 'undefined'
      ? (window as unknown as { fetch?: typeof fetch } & Record<string, unknown>)
      : undefined);

  if (!hostObj || typeof hostObj.fetch !== 'function') {
    return false;
  }

  const baseFetch = hostObj.fetch.bind(hostObj) as typeof fetch;
  if (isDefaultWindow && !originalGlobalFetch) {
    originalGlobalFetch = baseFetch;
  }

  const wrappedFetch: typeof fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const urlString =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    assertOutboundAllowed(urlString, globalLocalOnly);

    const headers = new Headers(
      init?.headers || (input instanceof Request ? input.headers : undefined)
    );
    if (globalLocalOnly && urlString.startsWith('/')) {
      headers.set('X-Local-Only', '1');
    }

    return baseFetch(input, {
      ...init,
      headers
    });
  };

  try {
    // Walk hostObj and its prototype chain in case fetch is defined as a getter-only property
    let desc = Object.getOwnPropertyDescriptor(hostObj, 'fetch');
    if (!desc) {
      const proto = Object.getPrototypeOf(hostObj);
      if (proto) {
        desc = Object.getOwnPropertyDescriptor(proto, 'fetch');
      }
    }

    const ownDesc = Object.getOwnPropertyDescriptor(hostObj, 'fetch');
    if (ownDesc && !ownDesc.configurable && (ownDesc.get && !ownDesc.set || ownDesc.writable === false)) {
      // Host runtime locked window.fetch as non-configurable read-only;
      // app routes still use gatewayFetch() + server X-Local-Only middleware cleanly.
      return false;
    }

    if (desc && ((desc.get && !desc.set) || desc.writable === false)) {
      Object.defineProperty(hostObj, 'fetch', {
        value: wrappedFetch,
        writable: true,
        configurable: true,
        enumerable: ownDesc?.enumerable ?? desc.enumerable ?? true
      });
    } else {
      hostObj.fetch = wrappedFetch;
    }

    if (isDefaultWindow) {
      installedFirewall = true;
    }
    return true;
  } catch {
    return false;
  }
}
