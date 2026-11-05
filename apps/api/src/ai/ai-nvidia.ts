import { ConflictException } from "@nestjs/common";
import type { AiModelInfo } from "./ai-models.js";
import { suitableForTranslation } from "./ai-models.js";

const NGC = "https://api.ngc.nvidia.com/v2/search/catalog/resources/ENDPOINT";

/** `nimType` values behind the filters of https://build.nvidia.com/models. */
const FREE = "nim_type_preview"; // "Free Endpoint"
const PARTNER = "nim_type_upgrade_available"; // "Partner Endpoint"

/** One endpoint from the build.nvidia.com catalog. */
export interface NvidiaEndpoint {
  /** `publisher/name`, e.g. `google/gemma-4-31b-it`. */
  id: string;
  free: boolean;
  partner: boolean;
  /** Lower-cased catalog tags (`chat`, `text-to-text`, `tts`, …). */
  tags: string[];
}

/** Tags of models that read and write text: chat, instruct and translation models. */
const TEXT_TAGS = new Set(["chat", "text-to-text", "text translation", "neural machine translation"]);

const norm = (s: string) => s.toLowerCase().replace(/[._]/g, "-");

interface NgcResource {
  name?: string;
  labels?: { key?: string; values?: string[] }[];
}
interface NgcPage {
  resultPageTotal?: number;
  results?: { resources?: NgcResource[] }[];
}

async function ngcPage(nimType: string, page: number): Promise<NgcPage> {
  const q = JSON.stringify({ query: `nimType:${nimType}`, page, pageSize: 100 });
  const res = await fetch(`${NGC}?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as NgcPage;
}

/** The free + partner endpoints exactly as build.nvidia.com lists them. */
export async function fetchNvidiaCatalog(): Promise<NvidiaEndpoint[]> {
  const byId = new Map<string, NvidiaEndpoint>();
  try {
    for (const [type, field] of [[FREE, "free"], [PARTNER, "partner"]] as const) {
      for (let page = 0; page < 10; page++) {
        const data = await ngcPage(type, page);
        for (const r of data.results?.flatMap((g) => g.resources ?? []) ?? []) {
          const publisher = r.labels?.find((l) => l.key === "publisher")?.values?.[0];
          if (!r.name || !publisher) continue;
          const id = `${publisher}/${r.name}`;
          const tags = (r.labels ?? []).filter((l) => l.key === "general").flatMap((l) => l.values ?? []).map((t) => t.toLowerCase());
          const cur = byId.get(id) ?? { id, free: false, partner: false, tags };
          cur[field] = true;
          byId.set(id, cur);
        }
        if (page + 1 >= (data.resultPageTotal ?? 1)) break;
      }
    }
  } catch (err) {
    throw new ConflictException(`Không tải được danh sách từ build.nvidia.com: ${(err as Error).message}`);
  }
  return [...byId.values()];
}

/**
 * The text models from the catalog, with the id the chat API accepts. The
 * catalog's names differ from the API's in punctuation sometimes (`glm-5-3-flash`
 * vs `glm-5.3-flash`), so a name is matched to the API's `/models` ids ignoring
 * `.`, `_` and `-`; one with no match is kept (flagged) rather than hidden.
 */
export function nvidiaModels(catalog: NvidiaEndpoint[], apiIds: string[], defaultModel: string): AiModelInfo[] {
  const api = new Map(apiIds.map((i) => [norm(i), i]));
  const out: AiModelInfo[] = [];
  for (const e of catalog) {
    if (!e.tags.some((t) => TEXT_TAGS.has(t))) continue;
    const callable = api.get(norm(e.id));
    const id = callable ?? e.id;
    if (!suitableForTranslation(id)) continue;
    const notes: string[] = [];
    if (e.free && e.partner) notes.push("Free Endpoint, cũng có Partner Endpoint");
    else if (e.free) notes.push("Free Endpoint");
    else notes.push("Partner Endpoint — chạy trên hạ tầng đối tác, có thể tính phí");
    if (!callable) notes.push("không có trong API /models — có thể chưa gọi được");
    out.push({
      id,
      tier: e.free ? "free" : "unknown",
      basis: "exact",
      note: notes.join(" · "),
      isDefault: id === defaultModel,
    });
  }
  const rank = (m: AiModelInfo) => (m.isDefault ? 0 : /translate/i.test(m.id) ? 1 : m.tier === "free" ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}
