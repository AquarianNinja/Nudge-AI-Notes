import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_PODCAST_EPISODES } from '../data/mockData.ts';
import {
  AUDIO_EXPORT_FORMATS,
  buildConvertedFileName,
  createEpisodeOverviewWavBytes,
  getAudioExportFormatSpec,
  inferAudioExtensionFromFileName,
  sanitizeAudioSourceExtension,
  sanitizeDownloadBaseName
} from './audioConversion.ts';

describe('audioConversion', () => {
  it('exposes mp3, wav, m4a, ogg, and flac export format specs', () => {
    const ids = AUDIO_EXPORT_FORMATS.map((f) => f.id);
    assert.deepEqual(ids, ['mp3', 'wav', 'm4a', 'ogg', 'flac']);
    assert.equal(getAudioExportFormatSpec('MP3')?.mimeType, 'audio/mpeg');
    assert.equal(getAudioExportFormatSpec('unknown'), null);
  });

  it('sanitizes filenames and extensions safely across target formats', () => {
    assert.equal(
      sanitizeDownloadBaseName('ClaimCenter FNOL & Subrogation Triage.wav'),
      'ClaimCenter_FNOL_Subrogation_Triage'
    );
    assert.equal(
      buildConvertedFileName('ClaimCenter FNOL & Subrogation Triage', 'm4a'),
      'ClaimCenter_FNOL_Subrogation_Triage.m4a'
    );
    assert.equal(sanitizeAudioSourceExtension('.WEBM'), 'webm');
    assert.equal(sanitizeAudioSourceExtension('../etc/passwd'), 'wav');
    assert.equal(inferAudioExtensionFromFileName('voice_note.webm'), 'webm');
    assert.equal(inferAudioExtensionFromFileName('recording', 'audio/ogg'), 'ogg');
  });

  it('synthesizes valid RIFF/WAVE PCM bytes for an Audio Overview episode', () => {
    const bytes = createEpisodeOverviewWavBytes(SAMPLE_PODCAST_EPISODES[0]);
    assert.ok(bytes.length > 44);
    assert.equal(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]), 'RIFF');
    assert.equal(String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]), 'WAVE');
  });
});
