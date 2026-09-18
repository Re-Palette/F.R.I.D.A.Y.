/**
 * Shared Google OAuth plumbing. FRIDAY has no login screen, so every Google
 * integration works the same way: a refresh token minted once, by hand, for
 * a particular account and set of scopes, exchanged here for short-lived
 * access tokens server-side.
 *
 * One OAuth client covers all of them — only the authorizing account and the
 * granted scopes differ per token, which is why Gmail needs its own refresh
 * token rather than reusing the calendar one (that was granted
 * calendar.readonly and nothing else).
 */

interface CachedToken {
  token: string;
  expiresAt: number;
}

// Keyed by refresh token: each account's access token expires separately.
const tokenCache = new Map<string, CachedToken>();

export function googleClientCredentials(): { clientId: string; clientSecret: string } | null {
  // GOOGLE_CALENDAR_* are the original names, kept working so an existing
  // deployment needs no changes when Gmail is added alongside.
  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export async function googleAccessToken(refreshToken: string): Promise<string> {
  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const credentials = googleClientCredentials();
  if (!credentials) throw new Error("Google OAuth client is not configured. See .env.example.");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: HTTP ${res.status}`);

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(refreshToken, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}
