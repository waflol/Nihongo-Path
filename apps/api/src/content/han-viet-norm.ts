/**
 * Normalise a Hán Việt reading for search: lowercase, strip tone marks and
 * diacritics, map đ→d. "HỌC" / "học" / "hoc" all become "hoc"; "hoà" and
 * "hòa" both become "hoa". Server-side only — never trust a client value.
 */
export function hanVietNorm(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim();
}
