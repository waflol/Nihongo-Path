/** Categories of imported grammar and the pure helpers that browse them. */
import { parseJaMarkup } from "./grammar-markup";

export interface GrammarIndexItem {
  _id: string;
  label: string;
  meaning: string;
  level?: string;
  status?: "DRAFT" | "PUBLISHED";
  sourceKey?: string;
  groupNo?: number;
  groupJa?: string;
  groupVi?: string;
  themeIds?: string[];
  contextIds?: string[];
  textbookRefs?: { textbookId: string; unitId: string; order?: number }[];
}

export interface Category {
  id: string;
  ja: string;
  vi: string;
}

export const LEVELS: Category[] = [
  { id: "N5", ja: "N5", vi: "Nền móng: câu cơ bản và trợ từ" },
  { id: "N4", ja: "N4", vi: "Mở rộng cách diễn đạt hằng ngày" },
  { id: "N3", ja: "N3", vi: "Diễn đạt tự nhiên hơn" },
  { id: "N2", ja: "N2", vi: "Ngữ pháp công việc và báo chí" },
  { id: "N1", ja: "N1", vi: "Mẫu cao cấp, văn viết trang trọng" },
];

const category = (id: string, ja: string, vi: string): Category => ({ id, ja, vi });

export const THEMES: Category[] = [
  category("thoi-gian", "時間", "Thời gian, trình tự"),
  category("nguyen-nhan", "原因", "Nguyên nhân, lý do"),
  category("muc-dich", "目的", "Mục đích, phương tiện"),
  category("dieu-kien", "条件", "Điều kiện, giả định"),
  category("nghich-tiep", "逆接", "Nghịch tiếp, nhượng bộ"),
  category("cam-xuc", "感情", "Cảm xúc, tâm trạng"),
  category("danh-gia", "評価", "Đánh giá, nhận xét"),
  category("so-sanh", "比較", "So sánh, đối chiếu"),
  category("pham-vi", "範囲", "Phạm vi, giới hạn, mốc"),
  category("can-cu", "根拠", "Căn cứ, tiêu chuẩn"),
  category("nhan-manh", "強調", "Nhấn mạnh, mức độ cực điểm"),
  category("liet-ke", "例示", "Liệt kê, nêu ví dụ"),
  category("bo-sung", "付加", "Bổ sung, đồng thời, song song"),
  category("trang-thai", "様子", "Trạng thái, dáng vẻ, khuynh hướng"),
  category("kha-nang", "可能・義務", "Khả năng, cần thiết, cấm đoán"),
  category("ket-qua", "結果", "Kết quả, kết cục"),
  category("bat-chap", "無視", "Bất chấp, phớt lờ"),
  category("chu-de", "話題", "Chủ đề, nêu đề tài"),
  category("y-chi", "意志", "Ý chí, dự định, đề nghị"),
  category("cho-nhan", "授受", "Cho nhận"),
  category("suy-doan", "推量・伝聞", "Suy đoán, truyền đạt"),
  category("the-thai", "受身・使役", "Bị động, sai khiến"),
];

export const CONTEXTS: Category[] = [
  category("hoi-thoai", "日常会話", "Hội thoại đời sống"),
  category("email", "メール・手紙", "Thư, email"),
  category("cong-ty", "会社", "Trong công ty"),
  category("phien-dich", "通訳", "Phiên dịch"),
  category("bao-chi", "新聞・ニュース", "Báo chí, tin tức"),
  category("van-ban", "論説・文章", "Văn bản, luận văn, bình luận"),
  category("van-hoc", "文学", "Văn học"),
];

export const BOOKS: Category[] = [
  category("minna", "みんなの日本語", "Minna no Nihongo"),
  category("shin-n3", "新完全マスター N3 文法", "Shin Kanzen Master N3"),
  category("shin-n2", "新完全マスター N2 文法", "Shin Kanzen Master N2"),
  category("shin-n1", "新完全マスター N1 文法", "Shin Kanzen Master N1"),
];

export type GrammarView = "level" | "theme" | "context" | "book" | "search";

export const VIEWS: { id: GrammarView; label: string; list: Category[] }[] = [
  { id: "level", label: "Cấp độ", list: LEVELS },
  { id: "theme", label: "Chủ đề", list: THEMES },
  { id: "context", label: "Bối cảnh", list: CONTEXTS },
  { id: "book", label: "Giáo trình", list: BOOKS },
  { id: "search", label: "Tìm kiếm", list: [] },
];

export const categoryName = (list: Category[], id: string) => list.find((c) => c.id === id)?.vi ?? id;

export interface BrowseState {
  view: GrammarView;
  /** Selected category within the view; empty on the overview. */
  id: string;
  /** Lesson within a textbook. */
  unit: string;
  /** Level narrowing inside theme / context / search. */
  level: string;
  q: string;
}

export function parseBrowseState(params: { get(name: string): string | null }): BrowseState {
  const view = VIEWS.find((v) => v.id === params.get("view"))?.id ?? "level";
  const id = params.get("id") ?? "";
  return {
    view,
    id: VIEWS.find((v) => v.id === view)?.list.some((c) => c.id === id) ? id : "",
    unit: params.get("unit") ?? "",
    level: params.get("level") ?? "",
    q: params.get("q") ?? "",
  };
}

export function browseQuery(state: BrowseState): string {
  const query = new URLSearchParams();
  if (state.view !== "level") query.set("view", state.view);
  for (const key of ["id", "unit", "level", "q"] as const) if (state[key]) query.set(key, state[key]);
  const text = query.toString();
  return text ? `?${text}` : "";
}

export function inCategory(item: GrammarIndexItem, view: GrammarView, id: string): boolean {
  if (view === "level") return item.level === id;
  if (view === "theme") return !!item.themeIds?.includes(id);
  if (view === "context") return !!item.contextIds?.includes(id);
  if (view === "book") return !!item.textbookRefs?.some((r) => r.textbookId === id);
  return true;
}

const plain = (text: string) => parseJaMarkup(text).map((p) => p.text).join("").toLowerCase();

/** The points the current state lists (the overview pages list none). */
export function selectGrammar(items: GrammarIndexItem[], state: BrowseState): GrammarIndexItem[] {
  if (state.view !== "search" && !state.id) return [];
  const needle = state.q.trim().toLowerCase();
  return items.filter(
    (item) =>
      inCategory(item, state.view, state.id) &&
      (!state.level || state.view === "level" || item.level === state.level) &&
      (!state.unit || state.view !== "book" || item.textbookRefs?.some((r) => r.textbookId === state.id && r.unitId === state.unit)) &&
      (!needle || plain(item.label).includes(needle) || item.meaning.toLowerCase().includes(needle)),
  );
}

/** Lesson order: 0…50, then lettered reviews, then `2-1`-style parts, then the rest. */
export function compareUnits(a: string, b: string): number {
  const rank = (u: string) => (/^\d+$/.test(u) ? 0 : /^[A-Z]$/.test(u) ? 1 : /^\d+-\d+$/.test(u) ? 2 : 3);
  return rank(a) - rank(b) || a.localeCompare(b, "en", { numeric: true });
}

export function bookUnits(items: GrammarIndexItem[], bookId: string): string[] {
  const units = items.flatMap((i) => i.textbookRefs?.filter((r) => r.textbookId === bookId).map((r) => r.unitId) ?? []);
  return [...new Set(units)].sort(compareUnits);
}

export interface GrammarSection {
  key: string;
  title?: string;
  ja?: string;
  items: GrammarIndexItem[];
}

const sourceOrder = (a: GrammarIndexItem, b: GrammarIndexItem) =>
  (b.level ?? "").localeCompare(a.level ?? "") || (a.sourceKey ?? "").localeCompare(b.sourceKey ?? "", "en", { numeric: true });

/** Group the selected points: nuance groups in a level, lessons in a textbook. */
export function sectionGrammar(items: GrammarIndexItem[], state: BrowseState): GrammarSection[] {
  const sorted = [...items].sort(sourceOrder);
  if (state.view === "level") {
    const groups = new Map<number, GrammarIndexItem[]>();
    for (const item of sorted) groups.set(item.groupNo ?? 0, [...(groups.get(item.groupNo ?? 0) ?? []), item]);
    return [...groups]
      .sort(([a], [b]) => a - b)
      .map(([no, list]) => ({
        key: String(no),
        title: no ? `${no}. ${list[0].groupVi ?? "Nhóm"}` : "Khác",
        ja: list[0].groupJa,
        items: list,
      }));
  }
  if (state.view === "book") {
    const ref = (item: GrammarIndexItem, unit: string) =>
      item.textbookRefs?.find((r) => r.textbookId === state.id && r.unitId === unit);
    return bookUnits(sorted, state.id)
      .filter((unit) => !state.unit || unit === state.unit)
      .map((unit) => ({
        key: unit,
        title: `Bài ${unit}`,
        items: sorted.filter((i) => ref(i, unit)).sort((a, b) => (ref(a, unit)?.order ?? 0) - (ref(b, unit)?.order ?? 0)),
      }));
  }
  return sorted.length ? [{ key: "all", items: sorted }] : [];
}
