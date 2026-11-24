import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAudioDuration,
  formatFileSize,
  INITIAL_MEETING_SESSION,
  buildMeetingSessionFromAudio,
  compareMeetingSessions,
  deleteMeetingSessionFromList,
  recordDownloadedExportOnSession,
  retranscribeMeetingSession,
  sessionHasPlayableAudio,
  stripAudioFromMeetingSession
} from './meetingNotes.ts';
import {
  INITIAL_DICTIONARY_ENTRIES
} from '../data/mockData.ts';
import { LEGACY_ACTIVITY_MODELS } from './modelRegistry.ts';

test('formatAudioDuration and formatFileSize format cleanly', () => {
  assert.equal(formatAudioDuration(0), '00:00');
  assert.equal(formatAudioDuration(75), '01:15');
  assert.equal(formatAudioDuration(760), '12:40');
  assert.equal(formatFileSize(512 * 1024), '512 KB');
  assert.equal(formatFileSize(2.5 * 1024 * 1024), '2.5 MB');
});

test('buildMeetingSessionFromAudio creates initial and continuation ClaimCenter sessions', () => {
  const s1 = buildMeetingSessionFromAudio({
    fileName: 'fnol_kickoff.wav',
    fileSizeBytes: 2400000,
    durationSec: 420,
    sessionNumber: 1
  });

  assert.equal(s1.sessionNumber, 1);
  assert.equal(s1.parentSessionId, undefined);
  assert.equal(s1.audioDurationLabel, '07:00');
  assert.ok(s1.items.length >= 3);

  const s2 = buildMeetingSessionFromAudio({
    fileName: 'fnol_followup.m4a',
    fileSizeBytes: 1800000,
    durationSec: 310,
    previousSession: INITIAL_MEETING_SESSION,
    focusNote: 'Finalize $25k reserve ceiling',
    sessionNumber: 2
  });

  assert.equal(s2.sessionNumber, 2);
  assert.equal(s2.parentSessionId, INITIAL_MEETING_SESSION.id);
  assert.ok(s2.summary.includes('Finalize $25k reserve ceiling'));
  assert.ok(s2.items.some(i => i.text.includes('SIU referral')));
});

test('compareMeetingSessions accurately detects added, updated, resolved, and unchanged items', () => {
  const s2 = buildMeetingSessionFromAudio({
    fileName: 'claimcenter_fnol_followup_s2.m4a',
    fileSizeBytes: 3100000,
    durationSec: 555,
    previousSession: INITIAL_MEETING_SESSION,
    sessionNumber: 2
  });

  const comparison = compareMeetingSessions(INITIAL_MEETING_SESSION, s2);

  assert.equal(comparison.baseSessionId, INITIAL_MEETING_SESSION.id);
  assert.equal(comparison.continuationSessionId, s2.id);
  assert.ok(comparison.addedCount >= 2, 'Should detect newly added items');
  assert.ok(comparison.updatedCount >= 2, 'Should detect updated items');
  assert.ok(comparison.resolvedCount >= 1, 'Should detect resolved items');
  assert.ok(comparison.unchangedCount >= 1, 'Should detect unchanged items');

  const updated = comparison.diffs.find(d => d.changeType === 'updated');
  assert.ok(updated?.previousText);
  assert.ok(updated?.currentText);
  assert.notEqual(updated?.previousText, updated?.currentText);
});

test('short audio recordings keep highlight timestamps inside audio duration', () => {
  const shortSession = buildMeetingSessionFromAudio({
    fileName: 'quick_voice_memo.wav',
    fileSizeBytes: 64000,
    durationSec: 12,
    sessionNumber: 1,
    driveFileId: 'drive-rec-1'
  });

  assert.equal(shortSession.driveFileId, 'drive-rec-1');
  assert.equal(shortSession.audioDurationSec, 12);
  shortSession.highlights.forEach((h) => {
    const [mm, ss] = h.timestamp.split(':').map(Number);
    const total = mm * 60 + ss;
    assert.ok(total > 0 && total < 12, `Expected timestamp ${h.timestamp} inside 0..12s`);
  });
});

test('stripAudioFromMeetingSession removes audio while retaining notes and highlights', () => {
  assert.equal(sessionHasPlayableAudio(INITIAL_MEETING_SESSION), true);
  const stripped = stripAudioFromMeetingSession({
    ...INITIAL_MEETING_SESSION,
    audioUrl: 'blob:audio-1'
  });
  assert.equal(stripped.audioDeleted, true);
  assert.equal(stripped.audioUrl, undefined);
  assert.equal(stripped.driveFileId, undefined);
  assert.equal(stripped.items.length, INITIAL_MEETING_SESSION.items.length);
  assert.equal(stripped.highlights.length, INITIAL_MEETING_SESSION.highlights.length);
  assert.equal(sessionHasPlayableAudio(stripped), false);
});

test('deleteMeetingSessionFromList cleanly updates active and base session IDs including empty state', () => {
  const s2 = buildMeetingSessionFromAudio({
    fileName: 's2.m4a',
    fileSizeBytes: 1200000,
    durationSec: 200,
    previousSession: INITIAL_MEETING_SESSION,
    sessionNumber: 2
  });

  const afterRemoveS2 = deleteMeetingSessionFromList(
    [INITIAL_MEETING_SESSION, s2],
    s2.id,
    INITIAL_MEETING_SESSION.id,
    s2.id
  );
  assert.equal(afterRemoveS2.sessions.length, 1);
  assert.equal(afterRemoveS2.nextCurrentId, INITIAL_MEETING_SESSION.id);
  assert.equal(afterRemoveS2.nextBaseId, INITIAL_MEETING_SESSION.id);

  const afterRemoveAll = deleteMeetingSessionFromList(
    afterRemoveS2.sessions,
    INITIAL_MEETING_SESSION.id,
    afterRemoveS2.nextBaseId,
    afterRemoveS2.nextCurrentId
  );
  assert.equal(afterRemoveAll.sessions.length, 0);
  assert.equal(afterRemoveAll.nextCurrentId, '');
});

test('retranscribeMeetingSession updates ASR model attribution, speaker IDs, and notes', () => {
  const deepgramModel = LEGACY_ACTIVITY_MODELS.find(m => m.id === 'deepgram-nova-3-diarize')!;
  const claudeNotes = LEGACY_ACTIVITY_MODELS.find(m => m.id === 'claude-sonnet-4-notes')!;

  const updated = retranscribeMeetingSession({
    session: INITIAL_MEETING_SESSION,
    transcriptionModel: deepgramModel,
    approach: 'cloud',
    notesModel: claudeNotes,
    notesApproach: 'cloud',
    regenerateNotes: true,
    speakerIdEnabled: true,
    speakerLabels: ['Maya (Architect)', 'Alex (Tech Lead)', 'Priya (Claims Ops)'],
    dictionaryEntries: INITIAL_DICTIONARY_ENTRIES
  });

  assert.match(updated.generatedBy?.transcriptionSummary || '', /Cloud · Deepgram Nova-3/);
  assert.match(updated.generatedBy?.notesSummary || '', /Cloud · Claude Sonnet 4/);
  assert.ok(updated.highlights.length >= INITIAL_MEETING_SESSION.highlights.length);
  assert.match(updated.summary, /Re-transcribed via Deepgram Nova-3/);
});

test('recordDownloadedExportOnSession prepends new exports and deduplicates matching kind + format', () => {
  const initialCount = INITIAL_MEETING_SESSION.downloadedExports?.length || 0;
  assert.ok(initialCount >= 3, 'Initial session should seed distinct transcript formats');

  const withPdfNotes = recordDownloadedExportOnSession(INITIAL_MEETING_SESSION, {
    id: 'exp-pdf-notes',
    kind: 'notes',
    format: 'pdf',
    fileName: 'claimcenter_fnol_notes.pdf',
    exportedAt: 'Just now',
    sizeBytes: 4200
  });

  assert.equal(withPdfNotes.downloadedExports?.length, initialCount + 1);
  assert.equal(withPdfNotes.downloadedExports?.[0].kind, 'notes');
  assert.equal(withPdfNotes.downloadedExports?.[0].format, 'pdf');

  // Re-exporting an existing kind + format updates and moves it to the front without duplicating
  const withUpdatedMarkdown = recordDownloadedExportOnSession(withPdfNotes, {
    id: 'exp-md-transcript-v2',
    kind: 'transcript',
    format: 'markdown',
    fileName: 'claimcenter_fnol_transcript_v2.md',
    exportedAt: 'Just now',
    sizeBytes: 2100
  });

  assert.equal(withUpdatedMarkdown.downloadedExports?.length, initialCount + 1);
  assert.equal(withUpdatedMarkdown.downloadedExports?.[0].id, 'exp-md-transcript-v2');
  assert.equal(
    withUpdatedMarkdown.downloadedExports?.filter(
      e => e.kind === 'transcript' && e.format === 'markdown'
    ).length,
    1
  );

  // Chronological exportHistory keeps every export event rather than deduplicating
  const initialHistoryCount = INITIAL_MEETING_SESSION.exportHistory?.length || 0;
  assert.equal(withUpdatedMarkdown.exportHistory?.length, initialHistoryCount + 2);
  assert.equal(withUpdatedMarkdown.exportHistory?.[0].fileName, 'claimcenter_fnol_transcript_v2.md');
  assert.equal(withUpdatedMarkdown.exportHistory?.[1].format, 'pdf');
});


