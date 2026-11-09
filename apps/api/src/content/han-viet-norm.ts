/**
 * Canonicalise old/new Vietnamese tone placement on oa/oe/uy diphthongs so
 * "hoà" and "hòa" (or "thuỷ" and "thủy") are recognised as the same reading
 * while preserving the tone mark itself.
 */
export function canonTone(input: string): string {
  return input
    .normalize("NFC")
    .toLocaleLowerCase("vi")
    .trim()
    .replace(/oà/g, "òa")
    .replace(/oá/g, "óa")
    .replace(/oả/g, "ỏa")
    .replace(/oã/g, "õa")
    .replace(/oạ/g, "ọa")
    .replace(/oè/g, "òe")
    .replace(/oé/g, "óe")
    .replace(/oẻ/g, "ỏe")
    .replace(/oẽ/g, "õe")
    .replace(/oẹ/g, "ọe")
    .replace(/uỳ/g, "ùy")
    .replace(/uý/g, "úy")
    .replace(/uỷ/g, "ủy")
    .replace(/uỹ/g, "ũy")
    .replace(/uỵ/g, "ụy");
}

/**
 * Split a kanji's Hán Việt field (string separated by `/`, `,`, `;`, `|`, `·`,
 * `、`, newline, or an array of strings) into deduplicated lowercase readings.
 */
export function hanVietList(input: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(input) ? input.join("/") : String(input ?? "");
  const parts = raw
    .split(/[/,;|·、\n]+/)
    .map((s) => s.trim().toLocaleLowerCase("vi"))
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = canonTone(p);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/**
 * Normalise a kanji's Hán Việt readings into canonical `/`-joined lowercase
 * form (e.g. `"TRƯỜNG, trưởng"` → `"trường/trưởng"`, `["hành", "hạnh"]` → `"hành/hạnh"`).
 */
export function formatHanViet(input: string | string[] | null | undefined): string {
  return hanVietList(input).join("/");
}

/**
 * Normalise a Hán Việt reading (or `/`, `,` separated list of readings) for
 * search: lowercase, strip tone marks and diacritics, map đ→d, join multiple
 * readings with `/`. "HỌC" / "học" / "hoc" all become "hoc"; "hoà" and "hòa"
 * both become "hoa"; "trường, trưởng" becomes "truong/truong".
 * Server-side only — never trust a client value.
 */
export function hanVietNorm(input: string | string[] | null | undefined): string {
  const raw = Array.isArray(input) ? input.join("/") : String(input ?? "");
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .split(/[/,;|·、\s]+/)
    .filter(Boolean)
    .join("/");
}
