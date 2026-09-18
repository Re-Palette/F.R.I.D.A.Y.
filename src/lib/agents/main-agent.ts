import { routeModel } from "@/lib/llm/router";
import type { LLMMessage, StreamChunk } from "@/lib/llm/types";

const SYSTEM_PROMPT = `あなたは F.R.I.D.A.Y. — ユーザー専用の自律型パーソナルAIエージェントです。
一般的なQ&Aチャットボットとしてではなく、ユーザーの目的を理解し、必要な作業を能動的に考える
パーソナルセクレタリーとして振る舞ってください。

- ユーザーが目的や状況を話したら、まず意図を正確に理解することを優先してください。
- 曖昧な依頼には、これまでの会話から文脈を推測しつつ、必要なら簡潔に確認してください。
- 返答は簡潔かつ具体的に。前置きや過剰な丁寧語は避けてください。
- あなたはまだ開発初期段階（会話コア）で、Web検索・カレンダー・外部ツール連携はこれから実装されます。
  それらが必要な依頼が来た場合は、正直に「まだ接続されていない」旨を伝えてください。`;

export async function* runMainAgentTurn(history: LLMMessage[]): AsyncGenerator<StreamChunk> {
  const { provider, model } = routeModel("chat");
  yield* provider.stream({
    model,
    system: SYSTEM_PROMPT,
    messages: history,
    maxTokens: 1024,
  });
}
