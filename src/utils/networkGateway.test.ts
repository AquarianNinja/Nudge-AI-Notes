import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LocalOnlyBlockedError,
  assertOutboundAllowed,
  evaluateOutboundUrlPolicy,
  getBlockedRequestsCount,
  installFetchLocalOnlyFirewall,
  isLoopbackOrPrivateUrl,
  resetNetworkFirewallStats,
  setGlobalLocalOnlyPolicy
} from './networkGateway.ts';

test('isLoopbackOrPrivateUrl identifies localhost and LAN hosts accurately', () => {
  assert.equal(isLoopbackOrPrivateUrl('http://127.0.0.1:8000/v1/audio/transcriptions'), true);
  assert.equal(isLoopbackOrPrivateUrl('http://localhost:11434/api/chat'), true);
  assert.equal(isLoopbackOrPrivateUrl('http://192.168.1.45:8080/v1'), true);
  assert.equal(isLoopbackOrPrivateUrl('https://api.openai.com/v1/chat/completions'), false);
  assert.equal(isLoopbackOrPrivateUrl('not-a-url'), false);
});

test('evaluateOutboundUrlPolicy blocks cloud routes and external domains under Local-Only Mode', () => {
  assert.equal(evaluateOutboundUrlPolicy('/api/dictation/translate', true).allowed, false);
  assert.equal(evaluateOutboundUrlPolicy('/api/dictation/transcribe', true).allowed, false);
  assert.equal(evaluateOutboundUrlPolicy('/api/search/cloud', true).allowed, false);
  assert.equal(evaluateOutboundUrlPolicy('/api/scout/stream', true).allowed, false);
  assert.equal(evaluateOutboundUrlPolicy('/api/scheduler/tasks/task-1/run', true).allowed, false);

  // Relative local vector-db route and loopback servers remain allowed
  assert.equal(evaluateOutboundUrlPolicy('/api/vector-db/query', true).allowed, true);
  assert.equal(evaluateOutboundUrlPolicy('/api/health', true).allowed, true);
  assert.equal(
    evaluateOutboundUrlPolicy('http://127.0.0.1:11434/v1/chat/completions', true).allowed,
    true
  );

  // External public APIs are blocked when Local-Only is enabled, allowed otherwise
  assert.equal(evaluateOutboundUrlPolicy('https://api.groq.com/openai/v1', true).allowed, false);
  assert.equal(evaluateOutboundUrlPolicy('https://api.groq.com/openai/v1', false).allowed, true);
});

test('assertOutboundAllowed throws LocalOnlyBlockedError and tracks blocked attempt count', () => {
  resetNetworkFirewallStats();
  setGlobalLocalOnlyPolicy(true);

  assert.throws(
    () => assertOutboundAllowed('/api/dictation/translate', true),
    (err: unknown) =>
      err instanceof LocalOnlyBlockedError && err.code === 'LOCAL_ONLY_BLOCKED'
  );
  assert.equal(getBlockedRequestsCount(), 1);

  assert.throws(
    () => assertOutboundAllowed('https://api.deepgram.com/v1/listen', true),
    LocalOnlyBlockedError
  );
  assert.equal(getBlockedRequestsCount(), 2);

  // Clean up global policy state
  setGlobalLocalOnlyPolicy(false);
  resetNetworkFirewallStats();
});

test('installFetchLocalOnlyFirewall safely handles getter-only configurable and non-configurable fetch descriptors', async () => {
  const stubResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
  const stubFetch = (async () => stubResponse) as typeof fetch;

  // Case 1: getter-only configurable window.fetch (like AI Studio preview iframes)
  const configurableHost: { fetch?: typeof fetch } = {};
  Object.defineProperty(configurableHost, 'fetch', {
    get: () => stubFetch,
    configurable: true
  });
  assert.equal(installFetchLocalOnlyFirewall(configurableHost), true);

  setGlobalLocalOnlyPolicy(true);
  await assert.rejects(
    () => configurableHost.fetch!('https://api.openai.com/v1/chat/completions'),
    LocalOnlyBlockedError
  );
  const okResp = await configurableHost.fetch!('/api/health');
  assert.equal(okResp.status, 200);
  setGlobalLocalOnlyPolicy(false);
  resetNetworkFirewallStats();

  // Case 2: completely frozen non-configurable getter-only window.fetch never throws
  const lockedHost: { fetch?: typeof fetch } = {};
  Object.defineProperty(lockedHost, 'fetch', {
    get: () => stubFetch,
    configurable: false
  });
  assert.equal(installFetchLocalOnlyFirewall(lockedHost), false);
});
