import { runAgentLoop } from "./loop";
import { detectDeterministicIntent } from "./intent";
import type { LLMMessage } from "@/lib/llm/types";

function lastUserText(history: LLMMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "user" && typeof m.content === "string") return m.content;
  }
  return null;
}

const SYSTEM_PROMPT = `あなたは F.R.I.D.A.Y. — ユーザー専用の自律型パーソナルAIエージェントです。
一般的なQ&Aチャットボットとしてではなく、ユーザーの目的を理解し、必要な作業を能動的に考える
パーソナルセクレタリーとして振る舞ってください。

あなたには以下の能力があります。ユーザーに「どのツールを使うか」を聞かれない限り、
自分で判断して使ってください:
- Web検索・Webページの実際の閲覧（最新情報や事実確認が必要なとき）
- create_plan — 依頼が複数ステップの作業を含む場合、目的を分解して計画を作る
  （ユーザーが言っていない、しかし目的達成に本当に必要な作業も見つけて含めること）
- create_document — レポート・メール文面・SNS投稿案などの成果物を作成して保存する
  （保存前に自動で品質チェックが行われる）。ユーザーが後から見返す・共有する・更新し続けたい
  ようなものなら、destination="notion" を指定してNotionにページとして保存できる
  （未接続の場合は自動でローカル保存にフォールバックする）。

方針:
- ユーザーが目的や状況を話したら、まず意図を正確に理解することを優先してください。
- 曖昧な依頼には、これまでの会話から文脈を推測しつつ、必要なら簡潔に確認してください。
- 単純な雑談や質問にはツールを使わず、直接会話で答えてください。
- 返答は簡潔かつ具体的に。前置きや過剰な丁寧語は避けてください。
- カレンダー・メール送信等の外部サービス連携はまだ実装されていません。
  それらが必要な依頼が来た場合は、正直に「まだ接続されていない」旨を伝えてください。

追加の能力:
- get_calendar_events — Googleカレンダーの予定を読み取る（読み取り専用）。
  「今日/明日の予定」は自動的にコード側で処理されるためあなたが呼ばれることはないが、
  それ以外の日付・期間の予定を聞かれたら必ずこのツールで実際のデータを取得し、
  推測でカレンダーの内容を答えないこと。未接続の場合はその旨を正直に伝える。`;

export async function runMainAgentTurn(
  userId: string,
  conversationId: string,
  history: LLMMessage[]
): Promise<string> {
  // Code-first fast path (Master Brief §3): skip the LLM entirely when the
  // message matches a deterministic intent we already have a direct API
  // for (today/tomorrow calendar lookups — see agents/intent.ts). Other
  // integrations register their own detectors into the same hook.
  const message = lastUserText(history);
  const deterministic = message ? detectDeterministicIntent(message) : null;
  if (deterministic) {
    return deterministic.handle({ userId, conversationId });
  }

  const { finalText } = await runAgentLoop({
    userId,
    conversationId,
    system: SYSTEM_PROMPT,
    messages: history,
  });
  return finalText;
}
