import { NextResponse, type NextRequest } from "next/server";
import { UNLOCK_COOKIE, isPasscodeEnabled, isUnlocked } from "@/lib/auth/passcode";

/**
 * Next.js 16 renamed the middleware file convention to `proxy` — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 * It runs on the Node.js runtime by default, which is what lets the passcode
 * check below use node:crypto.
 */
export function proxy(request: NextRequest) {
  // No passcode configured means no gate at all, so adding this file changed
  // nothing for a deployment that hasn't opted in.
  if (!isPasscodeEnabled()) return;

  if (isUnlocked(request.cookies.get(UNLOCK_COOKIE)?.value)) return;

  // An API call can't follow a redirect into an HTML page and do anything
  // sensible with it, so it gets a status its caller can act on.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "ロックされています。" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Static assets are excluded so a locked app still renders its own unlock
  // screen, and the manifest stays readable so Chrome can still offer to
  // install it.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|manifest.webmanifest|unlock|api/unlock).*)",
  ],
};
