/**
 * One-time helper to obtain a Google Calendar refresh token without giving
 * FRIDAY its own in-app OAuth login screen (the app has none, by design —
 * see src/lib/integrations/google-calendar.ts). Run this locally once;
 * paste the printed refresh token into .env.local and Vercel's env vars.
 *
 * Requires GOOGLE_CALENDAR_CLIENT_ID/GOOGLE_CALENDAR_CLIENT_SECRET already
 * set (a Google Cloud OAuth client with the Calendar API enabled and
 * http://localhost:53682/callback added as an authorized redirect URI).
 */
import http from "node:http";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

async function main() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET before running this.");
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  console.log("\nOpen this URL in your browser and approve access:\n");
  console.log(authUrl.toString());
  console.log("\nWaiting for the redirect to http://localhost:53682/callback ...");

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "", REDIRECT_URI);
      const authCode = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.end(authCode ? "Success — you can close this tab." : `Error: ${error ?? "no code received"}`);
      server.close();
      if (authCode) resolve(authCode);
      else reject(new Error(error ?? "No authorization code received."));
    });
    server.listen(PORT);
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });

  const data = (await tokenRes.json()) as { refresh_token?: string; error?: string; error_description?: string };
  if (!data.refresh_token) {
    console.error(data);
    throw new Error(
      "No refresh_token in the response. If you've authorized this app before, revoke access at " +
        "https://myaccount.google.com/permissions and try again — Google only returns a refresh " +
        "token on the first consent."
    );
  }

  console.log("\nGOOGLE_CALENDAR_REFRESH_TOKEN=" + data.refresh_token);
  console.log("\nAdd this to .env.local and to Vercel's environment variables.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
