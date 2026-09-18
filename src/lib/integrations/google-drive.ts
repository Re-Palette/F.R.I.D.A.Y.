import { googleAccessToken, googleClientCredentials } from "./google-oauth";

/**
 * Google Drive, read-only. Its own refresh token, for the same reason Gmail
 * needs one: scopes are fixed when a token is minted, and neither the
 * calendar nor the Gmail token carries drive.readonly. Wanted scope:
 *   https://www.googleapis.com/auth/drive.readonly
 */

const API = "https://www.googleapis.com/drive/v3";

export function isDriveConfigured(): boolean {
  return Boolean(googleClientCredentials() && process.env.GOOGLE_DRIVE_REFRESH_TOKEN);
}

async function token(): Promise<string> {
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("Google Drive is not configured. See .env.example.");
  return googleAccessToken(refreshToken);
}

async function call<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!res.ok) {
    throw new Error(`Drive API error: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
}

/** `query` is free text; Drive's own operators are built around it here. */
export async function searchDriveFiles(query: string, maxResults = 10): Promise<DriveFile[]> {
  // Escaping matters: a single quote in the query would otherwise terminate
  // Drive's string literal and change the meaning of the search.
  const escaped = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const params = new URLSearchParams({
    q: `name contains '${escaped}' or fullText contains '${escaped}'`,
    pageSize: String(Math.min(maxResults, 25)),
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
  });
  const data = await call<{ files?: DriveFile[] }>(`/files?${params}`);
  return data.files ?? [];
}

// Google's own formats hold no bytes to download — they have to be exported.
const EXPORTABLE: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

const READABLE_DIRECTLY = /^text\/|^application\/(json|xml|javascript|x-yaml)/;

export interface DriveFileContent {
  file: DriveFile;
  text: string;
}

export async function readDriveFile(id: string): Promise<DriveFileContent> {
  const file = await call<DriveFile>(
    `/files/${encodeURIComponent(id)}?fields=id,name,mimeType,modifiedTime,webViewLink`
  );

  const exportAs = EXPORTABLE[file.mimeType];
  const path = exportAs
    ? `/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exportAs)}`
    : `/files/${encodeURIComponent(id)}?alt=media`;

  if (!exportAs && !READABLE_DIRECTLY.test(file.mimeType)) {
    // Better to say so than to hand the model a wall of decoded binary.
    return {
      file,
      text: `(${file.mimeType} は本文を取り出せない形式です。${file.webViewLink ?? ""})`,
    };
  }

  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!res.ok) {
    throw new Error(`Drive API error: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return { file, text: await res.text() };
}
