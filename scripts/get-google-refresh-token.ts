/**
 * One-time helper to obtain a Google refresh token without giving FRIDAY its
 * own in-app OAuth login screen (it has none, by design — see
 * src/lib/integrations/google-oauth.ts). Run it locally, then paste the
 * printed line into .env.local and Vercel's environment variables.
 *
 *   pnpm google:token calendar     → GOOGLE_CALENDAR_REFRESH_TOKEN
 *   pnpm google:token calendar 2   → GOOGLE_CALENDAR_REFRESH_TOKEN_2
 *   pnpm google:token gmail        → GOOGLE_GMAIL_REFRESH_TOKEN
 *   pnpm google:token drive        → GOOGLE_DRIVE_REFRESH_TOKEN
 *
 * It used to hardcode the calendar scope, so minting a Gmail or Drive token
 * meant editing this file first — and a token minted with the wrong scopes
 * fails later, at the call site, with an error that says nothing about how
 * it was obtained.
 *
 * Requires an OAuth client with http://localhost:53682/callback as an
 * authorized redirect URI, and the relevant API enabled for the project.
 */
import http from "node:http";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

interface Target {
  scopes: string[];
  envVar: string;
  /** Asks the API which account this is, so the wrong one is caught now. */
  whoami: (accessToken: string) => Promise<string>;
}

async function getJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Record<string, unknown>;
}

const TARGETS: Record<string, Target> = {
  calendar: {
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    envVar: "GOOGLE_CALENDAR_REFRESH_TOKEN",
    async whoami(token) {
      const data = await getJson("https://www.googleapis.com/calendar/v3/calendars/primary", token);
      return String(data.id ?? "(unknown)");
    },
  },
  gmail: {
    // compose is what drafts.create needs; readonly and send alone return 403.
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/gmail.send",
    ],
    envVar: "GOOGLE_GMAIL_REFRESH_TOKEN",
    async whoami(token) {
      const data = await getJson("https://gmail.googleapis.com/gmail/v1/users/me/profile", token);
      return String(data.emailAddress ?? "(unknown)");
    },
  },
  drive: {
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    envVar: "GOOGLE_DRIVE_REFRESH_TOKEN",
    async whoami(token) {
      const data = await getJson("https://www.googleapis.com/drive/v3/about?fields=user", token);
      const user = data.user as { emailAddress?: string } | undefined;
      return String(user?.emailAddress ?? "(unknown)");
    },
  },
};

async function main() {
  const which = process.argv[2];
  const account = process.argv[3];
  const target = which ? TARGETS[which] : undefined;

  if (!target) {
    console.error(`Usage: pnpm google:token <${Object.keys(TARGETS).join("|")}> [account number]\n`);
    console.error("  pnpm google:token calendar     → GOOGLE_CALENDAR_REFRESH_TOKEN");
    console.error("  pnpm google:token calendar 2   → GOOGLE_CALENDAR_REFRESH_TOKEN_2");
    process.exit(1);
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or the GOOGLE_CALENDAR_* equivalents) in .env.local first."
    );
  }

  const envVar = account && account !== "1" ? `${target.envVar}_${account}` : target.envVar;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", target.scopes.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  // Without this, Google returns no refresh token at all on a re-authorization.
  authUrl.searchParams.set("prompt", "consent");

  console.log(`\n→ ${envVar}`);
  console.log(`  scopes: ${target.scopes.join("\n          ")}\n`);
  console.log("Open this URL and approve access AS THE ACCOUNT THIS TOKEN IS FOR:\n");
  console.log(authUrl.toString());
  console.log(`\nWaiting for the redirect to ${REDIRECT_URI} ...`);

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

  const data = (await tokenRes.json()) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!data.refresh_token) {
    console.error(data);
    throw new Error("No refresh_token in the response — see the error above.");
  }

  // Which account did you actually click? With two of them, this is the
  // mistake worth catching here rather than in production a week later.
  if (data.access_token) {
    try {
      console.log(`\n✓ authorized as: ${await target.whoami(data.access_token)}`);
    } catch (err) {
      console.log(`\n(could not confirm the account: ${(err as Error).message})`);
    }
  }

  console.log(`\n${envVar}=${data.refresh_token}`);
  console.log("\nPut this in .env.local AND in Vercel → Settings → Environment Variables, then redeploy.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
