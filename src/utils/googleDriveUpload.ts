import type { GoogleDriveUploadResult } from '../types/index.ts';
import { gatewayFetch, isLocalOnlyActive } from './networkGateway.ts';

export const GOOGLE_DRIVE_UPLOAD_URL =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType';

export function buildGoogleDriveMultipartBody(params: {
  fileName: string;
  mimeType: string;
  content: string | Uint8Array;
  boundary?: string;
}): { body: Blob | string; boundary: string; contentType: string } {
  const boundary = params.boundary || `nudge_drive_boundary_${Date.now().toString(36)}`;
  const safeName = params.fileName.replace(/[\r\n"]/g, '').trim() || 'nudge_export.txt';
  const metadataJson = JSON.stringify({
    name: safeName,
    mimeType: params.mimeType
  });

  const preamble =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataJson}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${params.mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;
  const contentType = `multipart/related; boundary=${boundary}`;

  if (typeof params.content === 'string') {
    return {
      boundary,
      contentType,
      body: `${preamble}${params.content}${closing}`
    };
  }

  const encoder = new TextEncoder();
  const payloadCopy = new Uint8Array(params.content.byteLength);
  payloadCopy.set(params.content);
  const blob = new Blob([encoder.encode(preamble), payloadCopy, encoder.encode(closing)], {
    type: contentType
  });
  return {
    boundary,
    contentType,
    body: blob
  };
}

export async function uploadFileToGoogleDrive(params: {
  accessToken: string | null | undefined;
  fileName: string;
  mimeType: string;
  content: string | Uint8Array;
  localOnly?: boolean;
}): Promise<GoogleDriveUploadResult> {
  if (params.localOnly || isLocalOnlyActive()) {
    throw new Error(
      'Google Drive upload is blocked while Local-Only Mode is enabled. Use Download to Device instead.'
    );
  }

  const token = (params.accessToken || '').trim();
  if (!token) {
    throw new Error(
      'Connect Google Drive first to authorize file uploads.'
    );
  }

  const { body, contentType } = buildGoogleDriveMultipartBody({
    fileName: params.fileName,
    mimeType: params.mimeType,
    content: params.content
  });

  const response = await gatewayFetch(GOOGLE_DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType
    },
    body,
    localOnlyOverride: Boolean(params.localOnly)
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Google Drive authorization expired or lacks permission. Reconnect Google Drive and retry.'
      );
    }
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Google Drive upload failed (${response.status})${detail ? `: ${detail.slice(0, 140)}` : '.'}`
    );
  }

  const data = (await response.json()) as {
    id?: string;
    name?: string;
    webViewLink?: string;
    mimeType?: string;
  };

  if (!data.id) {
    throw new Error('Google Drive did not return a file ID.');
  }

  return {
    id: data.id,
    name: data.name || params.fileName,
    webViewLink: data.webViewLink,
    mimeType: data.mimeType || params.mimeType,
    uploadedAtIso: new Date().toISOString()
  };
}
