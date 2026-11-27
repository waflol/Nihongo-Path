/** The two faces of a grammar flashcard: the pattern, then meaning, usage and examples. */
import type { ReactNode } from "react";
import { JaMarkup } from "@/components/learn/furigana";

export interface GrammarCardDetail {
  forms: string[];
  coreExplanation?: string;
  explanations: string[];
  notes: string[];
  examples: { sentence: string; translation?: string; note?: string }[];
}

const HINT = "Nhấn Space / bấm vào thẻ để lật";

export function GrammarFront({ pattern, showReading }: { pattern: string; showReading: boolean }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center">
      <p lang="ja" className="break-words text-3xl font-semibold leading-relaxed text-white drop-shadow-sm sm:text-4xl">
        <JaMarkup text={pattern} showReading={showReading} markClass="" rtClass="text-white/80" />
      </p>
      <p className="mt-5 text-xs text-white/70">{HINT}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--primary)]">{title}</h3>
      <div className="mt-1 space-y-1.5">{children}</div>
    </section>
  );
}

export function GrammarBack({
  meaning,
  detail,
  showReading,
  examples,
}: {
  meaning: string;
  detail?: GrammarCardDetail;
  showReading: boolean;
  /** The example list (with its audio buttons); null when examples are switched off. */
  examples: ReactNode;
}) {
  const ja = (text: string) => <JaMarkup text={text} showReading={showReading} />;
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center text-left">
      <p className="break-words px-8 text-center text-xl font-semibold text-[var(--foreground)] sm:text-2xl">{meaning}</p>
      {detail && (detail.forms.length > 0 || detail.coreExplanation || detail.explanations.length > 0 || detail.notes.length > 0) && (
        <Section title="Cách dùng">
          {detail.forms.length > 0 && (
            <ul className="rounded-lg bg-[var(--background)] px-3 py-2 text-base leading-8 text-[var(--foreground)]">
              {detail.forms.map((f, i) => (
                <li key={i}>{ja(f)}</li>
              ))}
            </ul>
          )}
          {detail.coreExplanation && (
            <p className="text-sm leading-7 text-[var(--foreground)]">★ {ja(detail.coreExplanation)}</p>
          )}
          {detail.explanations.map((t, i) => (
            <p key={i} className="text-sm leading-7 text-[var(--foreground)]">{ja(t)}</p>
          ))}
          {detail.notes.map((t, i) => (
            <p key={i} className="text-sm leading-7 text-[var(--muted-foreground)]">Lưu ý: {ja(t)}</p>
          ))}
        </Section>
      )}
      {examples}
      <p className="mt-5 text-center text-xs text-[var(--muted-foreground)]">{HINT}</p>
    </div>
  );
}
