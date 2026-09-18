import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/**
 * FRIDAY is single-user (Master Brief: personal agent, not multi-tenant).
 * We still keep a `users` row so every other table has a stable owner id
 * to reference, but there is exactly one row in practice.
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.email) return null;

  const email = session.user.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({ email, name: session.user.name ?? undefined })
    .returning();
  return created;
}
