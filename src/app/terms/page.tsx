import type { Metadata } from "next";
import { Panel } from "@/components/ui/Panel";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "利用規約 — F.R.I.D.A.Y." };

/** Public, for the same reason as the privacy policy — see src/proxy.ts. */
const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: "対象",
    body: "F.R.I.D.A.Y. は個人が自分専用に運用しているアシスタントです。一般に提供されているサービスではなく、運用者本人以外の利用を想定していません。",
  },
  {
    title: "アカウント",
    body: "利用者の登録はありません。アクセスはパスコードで制限されています。",
  },
  {
    title: "無保証",
    body: "本アプリは現状有姿で提供されます。可用性・正確性について保証はなく、予告なく停止・変更されることがあります。応答内容の正確性も保証されません。",
  },
  {
    title: "責任の範囲",
    body: "本アプリの利用によって生じた損害について、運用者は責任を負いません。",
  },
  {
    title: "外部サービス",
    body: "本アプリは Google、Anthropic、Notion、ElevenLabs、Open-Meteo 等の外部サービスを利用します。各サービスの利用条件は、それぞれの提供者の規約に従います。",
  },
  {
    title: "変更",
    body: "本規約は予告なく変更されることがあります。",
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-10">
      <PageHeader label="利用規約" />
      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <Panel key={section.title} className="px-5 py-4">
            <h2 className="font-[family-name:var(--font-hud)] text-[11px] tracking-[0.18em] text-[var(--hud-orange)]">
              {section.title}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-fg">{section.body}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
