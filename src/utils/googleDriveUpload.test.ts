import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGoogleDriveMultipartBody,
  uploadFileToGoogleDrive
} from './googleDriveUpload.ts';

test('buildGoogleDriveMultipartBody formats metadata and text payload cleanly', () => {
  const { body, boundary, contentType } = buildGoogleDriveMultipartBody({
    fileName: 'meeting "summary"\n.md',
    mimeType: 'text/markdown',
    content: '# Decisions\n- Ship Q3 release',
    boundary: 'test_boundary_42'
  });

  assert.equal(boundary, 'test_boundary_42');
  assert.equal(contentType, 'multipart/related; boundary=test_boundary_42');
  assert.equal(typeof body, 'string');
  assert.match(body as string, /"name":"meeting summary\.md"/);
  assert.match(body as string, /Content-Type: text\/markdown/);
  assert.match(body as string, /# Decisions/);
  assert.match(body as string, /--test_boundary_42--$/);
});

test('uploadFileToGoogleDrive blocks egress when Local-Only Mode is active', async () => {
  await assert.rejects(
    () =>
      uploadFileToGoogleDrive({
        accessToken: 'ya29.fake-token',
        fileName: 'notes.md',
        mimeType: 'text/markdown',
        content: 'test content',
        localOnly: true
      }),
    /Local-Only Mode/
  );
});

test('uploadFileToGoogleDrive rejects when access token is missing', async () => {
  await assert.rejects(
    () =>
      uploadFileToGoogleDrive({
        accessToken: '',
        fileName: 'notes.md',
        mimeType: 'text/markdown',
        content: 'test content',
        localOnly: false
      }),
    /Connect Google Drive/
  );
});
