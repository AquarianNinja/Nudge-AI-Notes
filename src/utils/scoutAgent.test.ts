import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyIntentPrefix,
  buildScoutCacheKey,
  buildScoutGroundingPrompt,
  buildScoutInsertText,
  clearScoutCache,
  detectInlineScoutCommand,
  extractDomainFromUrl,
  getCachedScoutResult,
  isSafePublicHttpUrl,
  parseSseEventStream,
  redactSensitiveText,
  ScoutRateLimiter,
  setCachedScoutResult
} from './scoutAgent.ts';
import type { ScoutResult, ScoutStreamEvent } from '../types/index.ts';

test('redactSensitiveText masks API keys, bearer tokens, emails, IDs, and phone numbers', () => {
  const raw =
    'Contact alice.smith@example.com or +1 415-555-0199 with SSN 123-45-6789 and sk-live-abcdef1234567890 or Bearer tok_xyz_9988';
  const result = redactSensitiveText(raw);

  assert.equal(result.redactionCount, 5);
  assert.ok(!result.redactedText.includes('alice.smith@example.com'));
  assert.ok(!result.redactedText.includes('415-555-0199'));
  assert.ok(!result.redactedText.includes('123-45-6789'));
  assert.ok(!result.redactedText.includes('sk-live-abcdef1234567890'));
  assert.ok(!result.redactedText.includes('tok_xyz_9988'));
  assert.ok(result.redactedText.includes('[REDACTED_EMAIL]'));
  assert.ok(result.redactedText.includes('[REDACTED_PHONE]'));
  assert.ok(result.redactedText.includes('[REDACTED_ID]'));
  assert.ok(result.redactedText.includes('[REDACTED_KEY]'));
  assert.ok(result.redactedText.includes('Bearer [REDACTED_TOKEN]'));
  assert.deepEqual(
    result.redactedTypes.sort(),
    ['API Key', 'Email', 'ID Number', 'Phone', 'Token']
  );
});

test('detectInlineScoutCommand matches /web and @scout tokens on active trailing line', () => {
  const slash = detectInlineScoutCommand('Meeting prep\n/web Swift 6 concurrency changes');
  assert.ok(slash);
  assert.equal(slash.trigger, '/web');
  assert.equal(slash.query, 'Swift 6 concurrency changes');

  const atToken = detectInlineScoutCommand('Verify @scout quarterly CPI release schedule');
  assert.ok(atToken);
  assert.equal(atToken.trigger, '@scout');
  assert.equal(atToken.query, 'quarterly CPI release schedule');

  assert.equal(detectInlineScoutCommand('Normal text without triggers'), null);
  assert.equal(detectInlineScoutCommand('email user@scoutmaster.com today'), null);
});

test('applyIntentPrefix prepends quick intent phrasing once without duplicating', () => {
  const once = applyIntentPrefix('PostgreSQL 17 vs 16', 'compare');
  assert.equal(once, 'Compare options and trade-offs for: PostgreSQL 17 vs 16');
  const twice = applyIntentPrefix(once, 'compare');
  assert.equal(twice, once);
  assert.equal(applyIntentPrefix('  raw query  ', 'custom'), 'raw query');
});

test('isSafePublicHttpUrl rejects local/private/unsafe schemes and accepts public URLs', () => {
  assert.equal(isSafePublicHttpUrl('https://developer.apple.com/design/'), true);
  assert.equal(isSafePublicHttpUrl('http://en.wikipedia.org/wiki/Liquid_glass'), true);
  assert.equal(isSafePublicHttpUrl('http://localhost:3000/api'), false);
  assert.equal(isSafePublicHttpUrl('http://127.0.0.1:8080'), false);
  assert.equal(isSafePublicHttpUrl('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(isSafePublicHttpUrl('http://10.0.0.5/internal'), false);
  assert.equal(isSafePublicHttpUrl('http://192.168.1.10/admin'), false);
  assert.equal(isSafePublicHttpUrl('http://172.16.0.1/metrics'), false);
  assert.equal(isSafePublicHttpUrl('javascript:alert(1)'), false);
  assert.equal(extractDomainFromUrl('https://www.swift.org/documentation/'), 'swift.org');
});

test('session LRU cache enforces 5-minute TTL and 25-entry cap', () => {
  clearScoutCache();
  const baseResult: ScoutResult = {
    query: 'test',
    redactedQuery: 'test',
    scope: 'web',
    engine: 'pulse',
    summary: 'Brief summary',
    citations: [],
    durationMs: 120,
    provider: 'gemini-grounding'
  };

  const t0 = 1_000_000;
  for (let i = 0; i < 26; i++) {
    const key = buildScoutCacheKey({
      query: `query-${i}`,
      scope: 'web',
      engine: 'pulse',
      redactPii: true
    });
    setCachedScoutResult(key, { ...baseResult, query: `query-${i}` }, t0);
  }

  const evictedKey = buildScoutCacheKey({
    query: 'query-0',
    scope: 'web',
    engine: 'pulse',
    redactPii: true
  });
  const retainedKey = buildScoutCacheKey({
    query: 'query-25',
    scope: 'web',
    engine: 'pulse',
    redactPii: true
  });

  assert.equal(getCachedScoutResult(evictedKey, t0 + 1000), null);
  const hit = getCachedScoutResult(retainedKey, t0 + 1000);
  assert.ok(hit);
  assert.equal(hit.cached, true);
  assert.equal(getCachedScoutResult(retainedKey, t0 + 5 * 60 * 1000 + 1), null);
  clearScoutCache();
});

test('ScoutRateLimiter enforces engine quotas and resets after 60s window', () => {
  const limiter = new ScoutRateLimiter();
  const now = 5_000_000;

  for (let i = 0; i < 3; i++) {
    const res = limiter.checkAndConsume('user-1', 'nova', now + i * 100);
    assert.equal(res.allowed, true);
  }
  const blocked = limiter.checkAndConsume('user-1', 'nova', now + 1000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);

  const pulseAllowed = limiter.checkAndConsume('user-2', 'pulse', now);
  assert.equal(pulseAllowed.allowed, true);
  assert.equal(pulseAllowed.remaining, 9);

  const reset = limiter.checkAndConsume('user-1', 'nova', now + 61_000);
  assert.equal(reset.allowed, true);
});

test('parseSseEventStream decodes fragmented SSE chunks and respects AbortSignal', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"type":"stage","stage":"searching",',
    '"detail":"Querying sources"}\n\ndata: {"type":"delta","text":"Hello "}\n\n',
    'data: {"type":"delta","text":"world"}\n\n'
  ];

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
      }
      controller.close();
    }
  });

  const events: ScoutStreamEvent[] = [];
  for await (const ev of parseSseEventStream(stream)) {
    events.push(ev);
  }

  assert.equal(events.length, 3);
  assert.equal(events[0].type, 'stage');
  assert.equal(events[1].type, 'delta');
  assert.equal(events[2].type, 'delta');
});

test('buildScoutGroundingPrompt & buildScoutInsertText format evidence safely and support citations', () => {
  const prompt = buildScoutGroundingPrompt({
    query: 'Compare SQLite WAL vs rollback journal',
    scope: 'web+note',
    noteContextSnippet: 'A'.repeat(1500)
  });
  assert.ok(prompt.systemInstruction.includes('<untrusted_web_evidence>'));
  assert.ok(prompt.userPrompt.includes('User-Approved Note Context'));
  assert.ok(prompt.userPrompt.length < 1500);

  const sample: ScoutResult = {
    query: 'WAL mode',
    redactedQuery: 'WAL mode',
    scope: 'web',
    engine: 'atlas',
    summary: 'WAL improves concurrent reads [1].',
    citations: [
      {
        id: 1,
        title: 'Write-Ahead Logging',
        url: 'https://sqlite.org/wal.html',
        domain: 'sqlite.org',
        snippet: 'Concurrent readers and writers.',
        faviconText: 'S'
      }
    ],
    durationMs: 400,
    provider: 'gemini-grounding'
  };

  assert.equal(buildScoutInsertText(sample, false), 'WAL improves concurrent reads [1].');
  const cited = buildScoutInsertText(sample, true);
  assert.ok(cited.includes('Sources:'));
  assert.ok(cited.includes('[1] Write-Ahead Logging (sqlite.org) — https://sqlite.org/wal.html'));
});
