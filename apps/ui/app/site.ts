/**
 * Central site/brand config. Keep brand strings in ONE place so the
 * placeholder identity ("Nihongo Path") can be swapped without touching
 * layout/page code (spec §17.1 — name is a proposal, not approved).
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export const siteConfig = {
  // TODO(rebrand): replace with the approved brand name.
  name: "Nihongo Path",
  applicationName: "Nihongo Path",
  // Vietnamese UI by default (spec §2.7).
  locale: "vi_VN",
  // Short descriptions are drafts (spec §17.3).
  defaultDescription:
    "Học từ vựng, ngữ pháp và luyện nghe tiếng Nhật với flashcard, bài tập, phân tích câu và lộ trình ôn tập.",
  // Canonical/OG base only set once the production domain is decided.
  url: SITE_URL,
  tagline: "Học tiếng Nhật mỗi ngày, tiến bộ từng bước.",
} as const;
