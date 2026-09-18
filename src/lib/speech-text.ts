/**
 * Turning a written reply into something worth listening to.
 *
 * Replies are written to be read: bullets, bold, dates as 9/20, times as
 * 14:00, links, the odd emoji. Handed to a speech engine as-is, "9/20" is
 * read as a division, "14:00" as a pair of numbers, "- " as a minus sign,
 * and a URL takes twenty seconds to spell out. None of that is the voice's
 * fault and none of it can be fixed by choosing a better one.
 *
 * So the text is rewritten before it is spoken — dates and times into the
 * words a person would say, markup and links out altogether. The subtitle
 * still shows the original, so nothing is lost from what you can see; this
 * only changes what goes to the speaker.
 *
 * Everything here is a pure string transform, which is what lets it be
 * tested properly (see scripts/test-speech-text.ts) rather than checked by
 * listening to it.
 */

export interface ReadingRule {
  /** The written form, matched literally and case-insensitively. */
  from: string;
  /** What to say instead — normally kana, which no engine can misread. */
  to: string;
}

/**
 * Readings the app can't guess and no engine gets right.
 *
 * Only its own name is built in: every other proper noun belongs to whoever
 * is using this, so those come from NEXT_PUBLIC_SPEECH_READINGS instead of
 * being guessed at here — a wrong reading shipped as a default is worse
 * than the letter-by-letter one it replaced.
 */
const BUILT_IN_READINGS: ReadingRule[] = [
  { from: "F.R.I.D.A.Y.", to: "フライデー" },
  { from: "F.R.I.D.A.Y", to: "フライデー" },
];

/**
 * Extra readings, as `書き方=よみかた` pairs separated by commas or newlines:
 *
 *   NEXT_PUBLIC_SPEECH_READINGS="Re-Palette=リパレット,日下部=くさかべ"
 *
 * Public on purpose — it is pronunciation, not a secret, and the browser is
 * where the text is prepared. A term containing a comma or an equals sign
 * can't be expressed; nothing needing one has come up.
 */
export function parseReadings(raw: string | undefined): ReadingRule[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      if (eq <= 0) return null;
      const from = pair.slice(0, eq).trim();
      const to = pair.slice(eq + 1).trim();
      return from && to ? { from, to } : null;
    })
    .filter((rule): rule is ReadingRule => rule !== null);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Longest first, so "F.R.I.D.A.Y." wins over "F.R.I.D.A.Y". */
function applyReadings(text: string, readings: ReadingRule[]): string {
  return [...readings]
    .sort((a, b) => b.from.length - a.from.length)
    .reduce(
      (acc, { from, to }) => acc.replace(new RegExp(escapeRegExp(from), "gi"), to),
      text
    );
}

const MONTH_DAY = /(?<![\d/年])(\d{1,2})\/(\d{1,2})(?![\d/])/g;
const FULL_DATE = /(?<!\d)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)/g;
const CLOCK = /(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/g;

function stripMarkup(text: string): string {
  return (
    text
      // Whole code blocks: nobody wants a shell command read out.
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]*)`/g, "$1")
      // Link text is the part worth hearing; the URL never is.
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s*([-*_])\1{2,}\s*$/gm, "")
      .replace(/^\s*#{1,6}\s*/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/^\s*[-*+・]\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
  );
}

function spellNumbers(text: string): string {
  return (
    text
      // 1,200 is one number, not two — and the comma is audible.
      .replace(/(?<=\d),(?=\d{3}(?!\d))/g, "")
      .replace(FULL_DATE, (_m, y, mo, d) => `${y}年${Number(mo)}月${Number(d)}日`)
      .replace(MONTH_DAY, (match, mo, d) => {
        const month = Number(mo);
        const day = Number(d);
        // Anything outside a real date is far more likely to be a fraction,
        // a ratio or a version number, and should be left alone.
        return month >= 1 && month <= 12 && day >= 1 && day <= 31
          ? `${month}月${day}日`
          : match;
      })
      .replace(CLOCK, (match, h, m) => {
        const hour = Number(h);
        const minute = Number(m);
        if (hour > 23 || minute > 59) return match;
        return minute === 0 ? `${hour}時` : `${hour}時${minute}分`;
      })
  );
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const URL = /\bhttps?:\/\/\S+/g;
// Everything left that is decoration rather than language. Kept deliberately
// short: a symbol removed wrongly is a word lost, while one left in is at
// worst a stray "きごう".
const DECORATION = /[*_#`|>]/g;

export function toSpeakable(
  text: string,
  readings: ReadingRule[] = BUILT_IN_READINGS
): string {
  let out = stripMarkup(text);

  out = out.replace(URL, "リンク");
  out = out.replace(EMAIL, "メールアドレス");

  // Before the number rules, so a reading may contain digits of its own, and
  // after the markup is gone, so a term isn't hidden behind an asterisk.
  out = applyReadings(out, readings);

  out = spellNumbers(out);

  // The calendar writes a place as "@ 渋谷"; read out, "アットマーク" is not
  // what that means. Anything that was an address is already gone above.
  out = out.replace(/\s*@\s*/g, "、");
  out = out.replace(/\s*[〜~]\s*/g, "から");

  out = out.replace(/\p{Extended_Pictographic}/gu, "");
  out = out.replace(DECORATION, "");

  // A line break is a full stop as far as the ear is concerned: without this
  // a list runs together into one breathless sentence.
  out = out.replace(/[:：]\s*(?=\n|$)/g, "。");
  out = out.replace(/[ \t]*\n+[ \t]*/g, "。");
  out = out.replace(/[:：]/g, "、");

  return out
    .replace(/[、。]\s*。/g, "。")
    .replace(/。{2,}/g, "。")
    .replace(/、{2,}/g, "、")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[。、\s]+/, "")
    .trim();
}

/** The readings this deployment should use: the built-in one plus any configured. */
export function configuredReadings(): ReadingRule[] {
  return [...BUILT_IN_READINGS, ...parseReadings(process.env.NEXT_PUBLIC_SPEECH_READINGS)];
}
