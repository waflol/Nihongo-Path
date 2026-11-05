import type { AiProvider } from "./ai-providers.js";

/** One model a provider offers, with a free / paid hint. */
export interface AiModelInfo {
  id: string;
  /** `free` = no cost on a free key / free tier; `paid` = billed; `unknown` = can't tell. */
  tier: "free" | "paid" | "unknown";
  /**
   * `exact` = the provider publishes the price (OpenRouter); `estimate` = our
   * rule of thumb from the provider's free-tier policy — check its pricing page.
   */
  basis: "exact" | "estimate";
  /** Human price hint, e.g. `$0.20 vào · $0.60 ra / 1M token`. */
  price?: string;
  note?: string;
  /** Task-specific translator: translates only (no sentence writing, no sense check). */
  translationOnly?: boolean;
  /** The provider's recommended default, when it is still offered. */
  isDefault?: boolean;
}

/** Models that cannot write a sentence (images, speech, embeddings, …). */
const NOT_TEXT =
  /(embed|tts|image|imagen|veo|lyria|transcribe|whisper|robotics|nano-banana|omni|customtools|live|audio|speech|moderation|guard|rerank|ocr|dall|stable-diffusion|flux)/i;

/**
 * What we use models for is translating / writing short Japanese ↔ Vietnamese
 * example sentences, so only general chat models are offered. Left out: code,
 * vision, safety/guard, reasoning ("thinking" — slow, noisy output), base
 * (non-instruct), legacy, and models under 8B parameters (weak Japanese).
 */
const UNSUITED =
  /(code|coder|codestral|starcoder|devstral|vision|(^|[-/_])vl([-_:]|$)|vlm|pixtral|llava|paligemma|fuyu|nvlm|guard|safety|shield|topic-control|reward|(^|[-/_])rm([-_]|$)|judge|r1|reasoning|reasoner|thinking|qwq|magistral|(^|[-/_])o[13]([-_]|$)|(^|[-/_])base([-_]|$)|-pt([-_]|$)|llama-?2|bloom|falcon|vicuna|chatqa|sea-lion|deplot|kosmos|diffusion|detector|calibration|cosmos|mixtral-8x\d+b-v0|nemoretriever|parse|clip|vila|neva|palmyra-(med|fin))/i;

/** Purpose-built translators: kept at any size and listed first. */
const TRANSLATOR = /(translate|nllb|madlad|seamless)/i;

/** Smallest parameter count (billions) worth offering. */
const MIN_PARAMS_B = 8;

/** Total parameters in billions when the id says so (`70b`, `31b-it`, `30b-a3b`); else undefined. */
function paramsB(id: string): number | undefined {
  const m = /(?:^|[^a-z0-9.])e?(\d+(?:\.\d+)?)b(?![a-z])/i.exec(id);
  return m ? Number(m[1]) : undefined;
}

export function suitableForTranslation(id: string): boolean {
  if (TRANSLATOR.test(id)) return true;
  if (NOT_TEXT.test(id) || UNSUITED.test(id)) return false;
  const b = paramsB(id);
  return b === undefined || b >= MIN_PARAMS_B;
}

const per1M = (v: string): string => {
  const n = Number(v) * 1_000_000;
  return n < 0.01 ? "$0" : `$${n < 1 ? n.toFixed(2) : n.toFixed(1)}`;
};

/** Gemini: no price in the list API — a rule of thumb from its free tier. */
function geminiTier(id: string): Pick<AiModelInfo, "tier" | "note"> {
  if (/lite|flash/i.test(id)) {
    return { tier: "free", note: "Flash / Flash-Lite thường có gói miễn phí (giới hạn theo phút và ngày)" };
  }
  if (/pro/i.test(id)) {
    return { tier: "paid", note: "Bản Pro thường tính phí hoặc gói miễn phí rất hạn chế" };
  }
  return { tier: "unknown" };
}

/** Normalise a provider's `/models` answer into text-capable models + tags. */
export function normaliseModels(provider: AiProvider, raw: unknown): AiModelInfo[] {
  const out: AiModelInfo[] = [];
  // Providers whose models the admin picks deliberately (OpenAI, custom…) are
  // not narrowed to "translation-suitable"; only non-chat models are dropped.
  const keep = (id: string) =>
    provider.suitabilityFilter === false ? !/(embed|rerank|whisper|tts|dall-e|moderation|image)/i.test(id) : suitableForTranslation(id);
  if (provider.staticModels) {
    return provider.staticModels.map((id) => ({
      id,
      tier: "free" as const,
      basis: "estimate" as const,
      note: provider.translators?.includes(id)
        ? "Model chuyên dịch (m2m100, 100 ngôn ngữ): chỉ dịch câu Nhật→Việt, không viết câu ví dụ và không kiểm tra nghĩa của từ"
        : "Danh sách gợi ý (nhà cung cấp không có API liệt kê) — bấm Kiểm tra để chắc",
      translationOnly: provider.translators?.includes(id) || undefined,
      isDefault: id === provider.defaultModel,
    }));
  }
  if (provider.kind === "anthropic") {
    const list = (raw as { data?: { id?: string; display_name?: string }[] }).data ?? [];
    for (const m of list) {
      if (!m.id) continue;
      out.push({ id: m.id, tier: "paid", basis: "estimate", note: m.display_name ?? "Tính phí theo token" });
    }
  } else if (provider.kind === "gemini") {
    const list = (raw as { models?: { name?: string; supportedGenerationMethods?: string[] }[] }).models ?? [];
    for (const m of list) {
      const id = (m.name ?? "").replace(/^models\//, "");
      if (!id || !keep(id)) continue;
      if (m.supportedGenerationMethods && !m.supportedGenerationMethods.includes("generateContent")) continue;
      out.push({ id, basis: "estimate", ...geminiTier(id) });
    }
  } else {
    const list =
      (raw as {
        data?: {
          id?: string;
          pricing?: { prompt?: string; completion?: string };
          architecture?: { input_modalities?: string[]; output_modalities?: string[] };
        }[];
      }).data ?? [];
    for (const m of list) {
      const id = m.id ?? "";
      if (!id || !keep(id)) continue;
      // OpenRouter states modalities: keep models that read and write text only.
      const arch = m.architecture;
      if (arch && (!arch.output_modalities?.every((o) => o === "text") || !arch.input_modalities?.includes("text"))) continue;
      if (provider.id === "openrouter") {
        const p = Number(m.pricing?.prompt);
        const c = Number(m.pricing?.completion);
        if (Number.isFinite(p) && Number.isFinite(c)) {
          const free = p === 0 && c === 0;
          out.push({
            id,
            tier: free ? "free" : "paid",
            basis: "exact",
            price: free ? undefined : `${per1M(m.pricing!.prompt!)} vào · ${per1M(m.pricing!.completion!)} ra / 1M token`,
          });
          continue;
        }
      }
      if (provider.tierHint) {
        out.push({
          id,
          tier: provider.tierHint,
          basis: "estimate",
          note: provider.tierHint === "paid" ? "Tính phí theo token" : undefined,
        });
        continue;
      }
      // Groq / NVIDIA publish a rate-limited free tier for their catalog.
      out.push({
        id,
        tier: "free",
        basis: "estimate",
        note: "Có gói miễn phí (giới hạn theo phút/ngày); vượt giới hạn hoặc dùng gói trả phí sẽ tính tiền",
      });
    }
  }
  // The provider's default first, then free, then unknown, then paid; alphabetical within.
  const rank = (m: AiModelInfo) => (m.id === provider.defaultModel ? 0 : TRANSLATOR.test(m.id) ? 0.5 : m.tier === "free" ? 1 : m.tier === "unknown" ? 2 : 3);
  for (const m of out) {
    if (m.id === provider.defaultModel) m.isDefault = true;
    if (TRANSLATOR.test(m.id)) m.note = m.note ? `Chuyên dịch · ${m.note}` : "Mô hình chuyên dịch";
  }
  return out.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}
