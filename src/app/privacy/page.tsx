import type { Metadata } from "next";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "プライバシーポリシー — F.R.I.D.A.Y." };

/**
 * Public on purpose — see the matcher in src/proxy.ts.
 *
 * Google's consent screen links here, and a privacy policy that needs a
 * password to read is not a privacy policy. It is also the only page in
 * this app written for someone other than its owner.
 *
 * Everything below is a statement about what the code actually does. If a
 * data flow changes, this changes with it.
 */
const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: "このアプリについて",
    body: [
      "F.R.I.D.A.Y. は個人が自分専用に運用しているパーソナルアシスタントです。一般公開されたサービスではなく、利用者は運用者本人ひとりだけです。アクセスはパスコードで制限されています。",
    ],
  },
  {
    title: "取り扱う情報",
    body: [
      "・アプリ内での会話（音声認識で文字にしたものと、入力した文章）",
      "・Google カレンダーの予定（読み取りのみ）",
      "・Gmail のメール（読み取り、下書きの作成。送信は本人が都度承認したときだけ）",
      "・Google Drive のファイル（読み取りのみ）",
      "・GitHub のリポジトリ情報（読み取りのみ）",
      "・会話から抽出した、本人に関する覚え書き",
    ],
  },
  {
    title: "情報の保存先",
    body: [
      "会話・作成物・覚え書きは、運用者が管理する PostgreSQL データベース（Neon）に保存されます。アプリは Vercel 上で動作しています。",
    ],
  },
  {
    title: "外部に送信される情報",
    body: [
      "返答を生成するため、会話の内容と、上記サービスから取得した情報が Anthropic (Claude API) に送信されます。",
      "読み上げを有効にしている場合、返答の文章が ElevenLabs に送信されます。",
      "音声入力はブラウザ標準の音声認識機能を使うため、ブラウザ（Chrome 等）の仕様に従って音声が各ブラウザの音声認識サービスに送信されます。",
      "資料の保存先に Notion を指定している場合、その資料が Notion に送信されます。",
      "天気は Open-Meteo から取得します。送信されるのは設定ファイルに固定された地点の座標のみで、端末の位置情報は使用しません。",
    ],
  },
  {
    title: "しないこと",
    body: [
      "・情報の販売、第三者への提供",
      "・広告目的の利用",
      "・アクセス解析ツールや追跡技術の設置",
      "・運用者本人以外への開示",
    ],
  },
  {
    title: "Google のデータの利用について",
    body: [
      "Google のユーザーデータの利用は、Google API サービスのユーザーデータに関するポリシー（限定的使用の要件を含む）に従います。取得した情報は、本人に対してアシスタントとして応答する目的にのみ使用します。",
    ],
  },
  {
    title: "アクセス権の取り消し",
    body: [
      "Google アカウントの「セキュリティ」→「サードパーティ製のアプリとサービス」（https://myaccount.google.com/permissions）から、いつでもこのアプリのアクセス権を取り消せます。取り消した時点で、カレンダー・Gmail・Drive の読み取りはできなくなります。",
    ],
  },
  {
    title: "保存期間と削除",
    body: [
      "保存された会話・覚え書きは、運用者が削除するまで保持されます。覚え書きはアプリ内の「記憶」画面から個別に削除できます。",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <PageHeader label="プライバシーポリシー" />
      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <Panel key={section.title} className="px-5 py-4">
            <h2 className="font-[family-name:var(--font-hud)] text-[11px] tracking-[0.18em] text-[var(--hud-orange)]">
              {section.title}
            </h2>
            <div className="mt-2 space-y-1.5">
              {section.body.map((line) => (
                <p key={line} className="text-[13px] leading-relaxed text-fg">
                  {line}
                </p>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
