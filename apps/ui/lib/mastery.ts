/** Mastery levels of a studied card, as `GET /srs/stats` and `/srs/kanji-mastery` name them. */
export const MASTERY_LEVELS: Record<string, { label: string; hint: string; color: string }> = {
  hard: { label: "Khó nhớ", hint: "Hay quên / vừa quên", color: "#dc2626" },
  learning: { label: "Đang học", hint: "Giãn cách < 7 ngày", color: "#f59e0b" },
  young: { label: "Khá nhớ", hint: "7–20 ngày", color: "#3b82f6" },
  known: { label: "Đã thuộc", hint: "21–59 ngày", color: "#10b981" },
  mastered: { label: "Thuộc sâu", hint: "≥ 60 ngày", color: "#047857" },
};
