import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * A single shared passcode in front of the whole app, off unless
 * APP_PASSCODE is set — with it unset nothing below ever runs and the
 * deployment behaves exactly as it did before.
 *
 * This gates *access*, which the Approval Queue deliberately does not: that
 * one constrains what the agent may do on its own, this one constrains who
 * can reach it at all. It is one secret shared by every device, not per-user
 * identity — enough for a personal deployment, not a basis for multi-user.
 */

export const UNLOCK_COOKIE = "friday_unlock";

// Constant, so the cookie is a pure function of the passcode: changing
// APP_PASSCODE invalidates every device's cookie at once, which is the only
// "log out everywhere" this design needs.
const TOKEN_MESSAGE = "friday-unlock-v1";

export function isPasscodeEnabled(): boolean {
  return Boolean(process.env.APP_PASSCODE);
}

/** Unforgeable without the passcode, and derivable from it alone. */
export function unlockToken(): string {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) throw new Error("APP_PASSCODE is not set.");
  return createHmac("sha256", passcode).update(TOKEN_MESSAGE).digest("hex");
}

// Hashing first makes both sides the same length, so the comparison stays
// constant-time instead of returning early — and reveals nothing about how
// long the secret is.
function secureEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest()
  );
}

export function isUnlocked(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  return secureEqual(cookieValue, unlockToken());
}

export function passcodeMatches(candidate: string): boolean {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return false;
  return secureEqual(candidate, passcode);
}

/**
 * Failed attempts are counted over a sliding window, which is what makes a
 * passcode a person can remember safe here: ten tries per quarter hour is
 * roughly a thousand guesses a day, so even a modest wordlist takes
 * centuries, while a typo or two costs nothing.
 */
export const ATTEMPT_WINDOW_MINUTES = 15;
export const MAX_ATTEMPTS_PER_WINDOW = 10;
