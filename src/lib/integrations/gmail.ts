import { googleAccessToken, googleClientCredentials } from "./google-oauth";

/**
 * Gmail. Needs its own refresh token (GOOGLE_GMAIL_REFRESH_TOKEN): the
 * calendar tokens were granted calendar.readonly and nothing else, and a
 * token's scopes are fixed when it is minted. Scopes wanted here are
 * gmail.readonly and gmail.send.
 *
 * One account only, deliberately. Reading several mailboxes is merely
 * convenient; sending from the wrong one is not recoverable, so which
 * account mail leaves from should be a single unambiguous setting.
 */

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export function isGmailConfigured(): boolean {
  return Boolean(googleClientCredentials() && process.env.GOOGLE_GMAIL_REFRESH_TOKEN);
}

async function token(): Promise<string> {
  const refreshToken = process.env.GOOGLE_GMAIL_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("Gmail is not configured. See .env.example.");
  return googleAccessToken(refreshToken);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    // Gmail puts the useful part in the body — a bare status hides whether
    // this is a missing scope, a bad address, or a quota problem.
    throw new Error(`Gmail API error: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

interface GmailPayloadPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPayloadPart[];
  headers?: Array<{ name: string; value: string }>;
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: GmailPayloadPart;
}

export interface EmailSummary {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
}

export interface EmailBody extends EmailSummary {
  body: string;
}

function header(message: GmailMessage, name: string): string {
  const found = message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? "";
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** First text/plain part, falling back to stripped HTML if that's all there is. */
function extractBody(part: GmailPayloadPart | undefined): string {
  if (!part) return "";

  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);

  for (const child of part.parts ?? []) {
    const found = extractBody(child);
    if (found) return found;
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBase64Url(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

function summarize(message: GmailMessage): EmailSummary {
  return {
    id: message.id,
    from: header(message, "From"),
    to: header(message, "To"),
    subject: header(message, "Subject") || "(件名なし)",
    date: header(message, "Date"),
    snippet: message.snippet ?? "",
  };
}

/** `query` is Gmail search syntax, the same as the search box (`from:`, `is:unread`, ...). */
export async function searchEmails(query: string, maxResults = 10): Promise<EmailSummary[]> {
  const params = new URLSearchParams({ q: query, maxResults: String(Math.min(maxResults, 25)) });
  const list = await call<{ messages?: Array<{ id: string }> }>(`/messages?${params}`);

  return Promise.all(
    (list.messages ?? []).map(async ({ id }) =>
      summarize(
        await call<GmailMessage>(
          `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
        )
      )
    )
  );
}

export async function readEmail(id: string): Promise<EmailBody> {
  const message = await call<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`);
  return { ...summarize(message), body: extractBody(message.payload) };
}

/** RFC 2047, so a Japanese subject line survives the trip. */
function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<string> {
  const mime = [
    `To: ${params.to}`,
    `Subject: ${encodeHeader(params.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(params.body, "utf8").toString("base64"),
  ].join("\r\n");

  const raw = Buffer.from(mime, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const sent = await call<{ id: string }>("/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  return sent.id;
}
