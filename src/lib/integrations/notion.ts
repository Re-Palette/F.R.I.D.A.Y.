import { Client } from "@notionhq/client";

let cached: Client | null = null;

function getClient(): Client {
  if (cached) return cached;
  const token = process.env.NOTION_API_KEY;
  if (!token) {
    throw new Error("NOTION_API_KEY is not set. See .env.example for how to create a Notion integration.");
  }
  cached = new Client({ auth: token });
  return cached;
}

export function isNotionConfigured(): boolean {
  return Boolean(process.env.NOTION_API_KEY && process.env.NOTION_PARENT_PAGE_ID);
}

export interface NotionPageResult {
  pageId: string;
  url: string | null;
}

/**
 * Creates a page under the configured parent page (Master Brief §11: Notion
 * as a Creation Agent output destination). Lazily reads env vars on first
 * real call rather than at module load — see the same pattern/rationale in
 * src/lib/db/client.ts (a module-scope throw here would crash `next build`,
 * not just requests that actually need Notion).
 */
export async function createNotionPage(title: string, markdown: string): Promise<NotionPageResult> {
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  if (!parentPageId) {
    throw new Error("NOTION_PARENT_PAGE_ID is not set. See .env.example.");
  }

  const client = getClient();
  const response = await client.pages.create({
    parent: { page_id: parentPageId },
    properties: {
      title: { title: [{ type: "text", text: { content: title } }] },
    },
    markdown,
  });

  return {
    pageId: response.id,
    url: "url" in response ? response.url : null,
  };
}

export interface NotionCheckStep {
  name: string;
  ok: boolean;
  detail: string;
}

export interface NotionCheckResult {
  ok: boolean;
  steps: NotionCheckStep[];
  /** What to do about it, when something is wrong. */
  hint?: string;
}

/** Notion's errors carry a code; the message alone doesn't say what to fix. */
function notionErrorCode(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : "unknown";
}

function pageTitleOf(page: unknown): string {
  try {
    const properties = (page as { properties?: Record<string, unknown> }).properties ?? {};
    for (const value of Object.values(properties)) {
      const title = (value as { title?: Array<{ plain_text?: string }> }).title;
      if (Array.isArray(title) && title.length) {
        return title.map((part) => part.plain_text ?? "").join("").trim() || "（無題）";
      }
    }
  } catch {
    // A page whose title can't be read is still a page that was reachable,
    // which is the thing being checked.
  }
  return "（タイトル不明）";
}

/**
 * Whether Notion is actually connected, step by step.
 *
 * Four things have to be true and they fail in ways that look identical
 * from the outside — "Notionに保存できませんでした" covers a missing key, a
 * revoked token, a page id from the wrong workspace, and the one that
 * catches everyone: an integration that exists but was never connected to
 * the page it is meant to write into. Notion deliberately answers
 * object_not_found for both "no such page" and "you can't see it", so the
 * check has to say which are ruled out rather than guess between them.
 *
 * `write` actually creates a page and puts it straight in the trash, which
 * is the only thing that proves the integration may write rather than only
 * read.
 */
export async function checkNotion(write = false): Promise<NotionCheckResult> {
  const steps: NotionCheckStep[] = [];
  const token = process.env.NOTION_API_KEY;
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

  steps.push({
    name: "設定",
    ok: Boolean(token && parentPageId),
    detail: !token
      ? "NOTION_API_KEY が設定されていません。"
      : !parentPageId
        ? "NOTION_PARENT_PAGE_ID が設定されていません。"
        : "NOTION_API_KEY と NOTION_PARENT_PAGE_ID の両方が設定されています。",
  });
  if (!token || !parentPageId) {
    return {
      ok: false,
      steps,
      hint: "Vercel の Settings → Environment Variables で両方を設定し、Redeploy してください。",
    };
  }

  const client = getClient();

  try {
    const me = await client.users.me({});
    const name = "name" in me && me.name ? me.name : "（名前なし）";
    steps.push({ name: "トークン", ok: true, detail: `インテグレーション「${name}」として認証されました。` });
  } catch (err) {
    const code = notionErrorCode(err);
    steps.push({ name: "トークン", ok: false, detail: `認証に失敗しました (${code})。` });
    return {
      ok: false,
      steps,
      hint:
        code === "unauthorized"
          ? "NOTION_API_KEY が無効か失効しています。https://www.notion.so/my-integrations で発行し直してください。"
          : // The client reports its own code when the response never came
            // from Notion at all, which is a network problem rather than a
            // credential one — worth saying, so the token isn't blamed and
            // needlessly rotated.
            code === "notionhq_client_response_error"
            ? "Notion からの応答そのものが返ってきていません。トークンではなく、ネットワークや送信先の制限が原因の可能性が高いです。"
            : `Notion への接続自体に失敗しています (${code})。`,
    };
  }

  try {
    const page = await client.pages.retrieve({ page_id: parentPageId });
    steps.push({
      name: "保存先ページ",
      ok: true,
      detail: `「${pageTitleOf(page)}」を読み取れました。`,
    });
  } catch (err) {
    const code = notionErrorCode(err);
    steps.push({ name: "保存先ページ", ok: false, detail: `ページを取得できませんでした (${code})。` });
    return {
      ok: false,
      steps,
      hint:
        code === "object_not_found"
          ? "トークンは有効なので、原因はほぼ確実に「インテグレーションがそのページに接続されていない」ことです。" +
            "Notion で対象ページを開き、右上「…」→「接続」→ 作成したインテグレーションを選んでください。" +
            "（NOTION_PARENT_PAGE_ID が別ワークスペースのページIDである場合も同じエラーになります。）"
          : code === "validation_error"
            ? "NOTION_PARENT_PAGE_ID の形式が不正です。ページURL末尾の32桁の英数字を入れてください。"
            : `ページの取得に失敗しました (${code})。`,
    };
  }

  if (!write) {
    return {
      ok: true,
      steps,
      hint: "読み取りまで確認できました。実際に書き込めるかまで試すには ?write=1 を付けてください。",
    };
  }

  try {
    const created = await client.pages.create({
      parent: { page_id: parentPageId },
      properties: { title: { title: [{ type: "text", text: { content: "F.R.I.D.A.Y. 接続テスト" } }] } },
      markdown: "このページは接続確認のために作成され、すぐにゴミ箱へ移動されます。",
    });
    // Straight to the trash: the point was that it could be created, not
    // that it should stay.
    await client.pages.update({ page_id: created.id, in_trash: true });
    steps.push({
      name: "書き込み",
      ok: true,
      detail: "テストページを作成し、ゴミ箱に移動しました。",
    });
    return { ok: true, steps };
  } catch (err) {
    const code = notionErrorCode(err);
    steps.push({ name: "書き込み", ok: false, detail: `書き込めませんでした (${code})。` });
    return {
      ok: false,
      steps,
      hint:
        code === "restricted_resource"
          ? "インテグレーションに書き込み権限がありません。https://www.notion.so/my-integrations で Capabilities の「Insert content」を有効にしてください。"
          : `書き込みに失敗しました (${code})。`,
    };
  }
}
