import { NextRequest, NextResponse } from "next/server";
import { count, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { unlockAttempts } from "@/lib/db/schema";
import {
  ATTEMPT_WINDOW_MINUTES,
  MAX_ATTEMPTS_PER_WINDOW,
  UNLOCK_COOKIE,
  isPasscodeEnabled,
  passcodeMatches,
  unlockToken,
} from "@/lib/auth/passcode";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function windowStart(): Date {
  return new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60_000);
}

export async function POST(req: NextRequest) {
  if (!isPasscodeEnabled()) {
    return NextResponse.json({ error: "パスコードは設定されていません。" }, { status: 400 });
  }

  const { passcode } = (await req.json()) as { passcode?: unknown };
  if (typeof passcode !== "string") {
    return NextResponse.json({ error: "パスコードが違います。" }, { status: 401 });
  }

  let recentFailures: number;
  try {
    const [row] = await db
      .select({ value: count() })
      .from(unlockAttempts)
      .where(gte(unlockAttempts.createdAt, windowStart()));
    recentFailures = row?.value ?? 0;
  } catch (err) {
    // Refusing to unlock while the limit can't be enforced costs nothing:
    // every screen behind this gate needs the same database, so a session
    // granted now would be useless anyway. Failing the other way would
    // quietly turn the rate limit off exactly when it is unverifiable.
    console.error("Could not read unlock attempts:", err);
    return NextResponse.json(
      { error: "いま確認できません。少ししてからもう一度お試しください。" },
      { status: 503 }
    );
  }

  if (recentFailures >= MAX_ATTEMPTS_PER_WINDOW) {
    return NextResponse.json(
      { error: `試行回数が上限に達しました。${ATTEMPT_WINDOW_MINUTES}分ほど待ってからお試しください。` },
      { status: 429 }
    );
  }

  if (!passcodeMatches(passcode)) {
    await db.insert(unlockAttempts).values({});
    const left = MAX_ATTEMPTS_PER_WINDOW - recentFailures - 1;
    return NextResponse.json(
      { error: `パスコードが違います。（あと${left}回）` },
      { status: 401 }
    );
  }

  // Getting it right clears the record, so yesterday's typos never count
  // against a later attempt. Rows older than the window are dead weight, so
  // this doubles as the only cleanup the table needs.
  await db.delete(unlockAttempts).where(lt(unlockAttempts.createdAt, new Date()));

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
