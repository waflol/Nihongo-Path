import Link from "next/link";
import { CONTEXTS, THEMES, categoryName } from "@/lib/grammar-catalog";
import { parseJaMarkup } from "@/lib/grammar-markup";

export type GrammarExample = { sentence: string; translation: string; note?: string };

export type GrammarDetailData = {
  _id: string;
  label: string;
  meaning: string;
  structure?: string;
  coreExplanation?: string;
  forms?: string[];
  explanations?: string[];
  notes?: string[];
  compareWith?: { grammarId?: string; label: string; note?: string }[];
  senses?: { no: number; label?: string; explanation?: string; examples?: GrammarExample[] }[];
  examples?: GrammarExample[];
  level?: string;
  themeIds?: string[];
  contextIds?: string[];
};

/** Japanese text with its furigana set above the kanji and the pattern highlighted. */
export function JaText({ text }: { text: string }) {
  return (
    <>
      {parseJaMarkup(text).map((part, i) => {
        const body = part.rt ? (
          <ruby>
            {part.text}
            <rt className="select-none text-[0.55em] font-medium text-[var(--muted-foreground)]">{part.rt}</rt>
          </ruby>
        ) : (
          part.text
        );
        return part.mark ? (
          <strong key={i} className="font-bold text-[var(--primary)]">{body}</strong>
        ) : (
          <span key={i}>{body}</span>
        );
      })}
    </>
  );
}

function Examples({ items }: { items: GrammarExample[] }) {
  return (
    <div className="mt-3 space-y-4">
      {items.map((example, index) => (
        <div key={`${example.sentence}-${index}`} className="rounded-xl border border-[var(--border)] p-4">
          <p className="text-lg leading-loose text-[var(--foreground)]"><JaText text={example.sentence} /></p>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">{example.translation}</p>
          {example.note && <p className="mt-1 text-xs text-[var(--muted-foreground)]"><JaText text={example.note} /></p>}
        </div>
      ))}
    </div>
  );
}

const heading = "text-sm font-bold uppercase tracking-wider text-[var(--primary)]";

/** Full content of one grammar point; shared by the learner page and the admin review. */
export function GrammarDetail({ item }: { item: GrammarDetailData }) {
  const senses = item.senses ?? [];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] px-2 py-1 text-xs font-bold text-[var(--primary)]">{item.level}</span>
        {([["theme", THEMES, item.themeIds], ["context", CONTEXTS, item.contextIds]] as const).flatMap(([view, list, ids]) =>
          (ids ?? []).map((id) => (
            <Link key={`${view}-${id}`} href={`/learn/grammar?view=${view}&id=${id}`} className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]">
              {categoryName(list, id)}
            </Link>
          )),
        )}
      </div>
      <h1 className="mt-5 text-3xl font-bold leading-relaxed tracking-tight text-[var(--foreground)] sm:text-4xl"><JaText text={item.label} /></h1>
      <p className="mt-4 text-xl text-[var(--foreground)]">{item.meaning}</p>
      {item.coreExplanation && (
        <p className="mt-6 rounded-xl bg-[var(--background)] p-4 text-sm leading-7 text-[var(--muted-foreground)]">★ <JaText text={item.coreExplanation} /></p>
      )}
      {(item.structure || !!item.forms?.length) && (
        <section className="mt-8">
          <h2 className={heading}>Cấu trúc</h2>
          <div className="mt-3 space-y-2 rounded-xl bg-[var(--background)] p-4 text-base leading-loose">
            {item.structure && <p><JaText text={item.structure} /></p>}
            {item.forms?.map((form) => <p key={form}><JaText text={form} /></p>)}
          </div>
        </section>
      )}
      {!!item.explanations?.length && (
        <section className="mt-8">
          <h2 className={heading}>Giải thích</h2>
          <div className="mt-3 space-y-3 text-sm leading-7 text-[var(--foreground)]">
            {item.explanations.map((text, index) => <p key={index}><JaText text={text} /></p>)}
          </div>
        </section>
      )}
      {senses.length ? (
        senses.map((sense) => (
          <section key={sense.no} className="mt-8">
            <h2 className={heading}>{senses.length > 1 ? `Nghĩa ${sense.no}` : "Ví dụ"}{sense.label ? ` — ${sense.label}` : ""}</h2>
            {sense.explanation && <p className="mt-3 text-sm leading-7 text-[var(--foreground)]"><JaText text={sense.explanation} /></p>}
            <Examples items={sense.examples ?? []} />
          </section>
        ))
      ) : (
        <section className="mt-8">
          <h2 className={heading}>Ví dụ</h2>
          <Examples items={item.examples ?? []} />
        </section>
      )}
      {!!item.notes?.length && (
        <section className="mt-8">
          <h2 className={heading}>Lưu ý</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-[var(--foreground)]">
            {item.notes.map((text, index) => <li key={index}><JaText text={text} /></li>)}
          </ul>
        </section>
      )}
      {!!item.compareWith?.length && (
        <section className="mt-8">
          <h2 className={heading}>Mẫu dễ nhầm</h2>
          <div className="mt-3 space-y-3">
            {item.compareWith.map((other, index) => (
              <div key={index} className="rounded-xl border border-[var(--border)] p-4">
                <p className="font-semibold leading-loose text-[var(--foreground)]"><JaText text={other.label} /></p>
                {other.note && <p className="mt-1 text-sm leading-7 text-[var(--muted-foreground)]"><JaText text={other.note} /></p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
