import { KANJI_FAMILIES } from "./kanji-families.data.js";

export interface KanjiFamily {
  /** The shared component. */
  head: string;
  /** Hán Việt of the component; "" when it has none. */
  hanViet: string;
  chars: string[];
}

let parsed: KanjiFamily[] | null = null;

/** Every family, in A–Z Hán Việt order (the order of the data file). */
export function kanjiFamilies(): KanjiFamily[] {
  parsed ??= KANJI_FAMILIES.trim()
    .split("\n")
    .map((line) => {
      const [head, hanViet, members] = line.split("|");
      return { head, hanViet, chars: [...members] };
    });
  return parsed;
}

/**
 * The characters to study for `family` (a component, or "all"), family by family
 * in A–Z order. A character shared by several families keeps its first place.
 * Empty when there is no such family.
 */
export function familyStudyOrder(family: string): string[] {
  const list = family === "all" ? kanjiFamilies() : kanjiFamilies().filter((f) => f.head === family);
  return [...new Set(list.flatMap((f) => f.chars))];
}
