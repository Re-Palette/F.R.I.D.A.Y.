import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import { ChatView } from "@/components/ChatView";

export default async function ChatPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, user.id)))
    .limit(1);
  if (!conversation) notFound();

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  return (
    <ChatView
      conversationId={id}
      initialMessages={history.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
    />
  );
}
