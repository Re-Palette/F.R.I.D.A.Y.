import { NextRequest, NextResponse } from "next/server";
import { UNLOCK_COOKIE, isPasscodeEnabled, passcodeMatches, unlockToken } from "@/lib/auth/passcode";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function POST(req: NextRequest) {
  if (!isPasscodeEnabled()) {
    return NextResponse.json({ error: "パスコードは設定されていません。" }, { status: 400 });
  }

  const { passcode } = (await req.json()) as { passcode?: unknown };
  if (typeof passcode !== "string" || !passcodeMatches(passcode)) {
    return NextResponse.json({ error: "パスコードが違います。" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(UNLOCK_COOKIE, unlockToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Long-lived on purpose: the point is to be asked once per device, so
    // that an installed app — or a page left open listening — is not
    // interrupted by a login screen later.
    maxAge: ONE_YEAR_SECONDS,
  });
  return res;
}
