import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDriveAudioFile,
  clampSeekSeconds,
  createDriveAudioFile,
  createSyntheticMeetingWavBytes,
  filterDriveAudioFiles,
  getDriveStorageSummary,
  parseTimestampToSeconds,
  removeDriveAudioFile
} from './audioDrive.ts';

test('parseTimestampToSeconds parses MM:SS and HH:MM:SS cleanly', () => {
  assert.equal(parseTimestampToSeconds('00:00'), 0);
  assert.equal(parseTimestampToSeconds('02:14'), 134);
  assert.equal(parseTimestampToSeconds('07:48'), 468);
  assert.equal(parseTimestampToSeconds('1:02:03'), 3723);
  assert.equal(parseTimestampToSeconds('bad'), 0);
});

test('clampSeekSeconds constrains seek targets inside valid audio bounds', () => {
  assert.equal(clampSeekSeconds(-5, 100), 0);
  assert.equal(clampSeekSeconds(40, 100), 40);
  assert.equal(clampSeekSeconds(120, 100), 99.5);
});

test('createSyntheticMeetingWavBytes builds a valid RIFF WAVE header matching duration', () => {
  const bytes = createSyntheticMeetingWavBytes(5, 2);
  const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const wave = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  assert.equal(header, 'RIFF');
  assert.equal(wave, 'WAVE');
  assert.equal(bytes.length, 44 + 4000 * 5);
});

test('Drive folder CRUD and filtering tracks imported and recorded files', () => {
  const imported = createDriveAudioFile({
    id: 'a1',
    fileName: 'claimcenter_fnol_import.m4a',
    origin: 'imported',
    durationSec: 185,
    sizeBytes: 2400000,
    audioUrl: 'blob:1',
    linkedSessionTitle: 'FNOL Triage'
  });
  const recorded = createDriveAudioFile({
    id: 'a2',
    fileName: 'siu_recording_01.wav',
    origin: 'recorded',
    durationSec: 42,
    sizeBytes: 420000,
    audioUrl: 'blob:2',
    linkedSessionTitle: 'SIU Review'
  });

  let files = addDriveAudioFile([], imported);
  files = addDriveAudioFile(files, recorded);
  assert.equal(files.length, 2);
  assert.equal(files[0].id, 'a2');

  assert.equal(filterDriveAudioFiles(files, 'recorded', '').length, 1);
  assert.equal(filterDriveAudioFiles(files, 'imported', 'fnol').length, 1);
  assert.equal(filterDriveAudioFiles(files, 'all', 'subrogation').length, 0);

  const summary = getDriveStorageSummary(files);
  assert.equal(summary.count, 2);
  assert.equal(summary.totalBytes, 2820000);

  const afterDelete = removeDriveAudioFile(files, 'a1');
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].id, 'a2');
});
