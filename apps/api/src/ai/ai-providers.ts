/**
 * Catalog of AI services an admin can add (free tiers are enough for example
 * sentences). Only these presets are offered — an admin picks one, pastes an
 * API key and may change the model — so the server never calls an arbitrary
 * URL. Two wire formats: Google's `generateContent` and the OpenAI-style
 * `/chat/completions` that most others copy.
 *
 * Model names and free quotas change over time; the admin page has a "Test"
 * button that checks a key/model before it is relied on.
 */
export interface AiProvider {
  id: string;
  name: string;
  kind: "gemini" | "openai" | "anthropic";
  /** OpenAI-style base URL (unused for `gemini`). */
  baseUrl: string;
  defaultModel: string;
  /** Sensible default requests per minute for a free key. */
  defaultRpm: number;
  /** Where to create a key. */
  keyUrl: string;
  /** Where the provider lists prices / free-tier limits. */
  pricingUrl: string;
  /** `/models` answers without a key, so the list can load before one is pasted. */
  publicModels?: boolean;
  /** Fixed hint for every listed model (paid APIs). Default: free-tier estimate. */
  tierHint?: "paid" | "unknown";
  /** `false` = list every text model (the admin picks it deliberately); default = translation-suitable only. */
  suitabilityFilter?: boolean;
  /** Admin-supplied endpoint (local server / any OpenAI- or Anthropic-style API). */
  custom?: boolean;
  /** Model ids that are known not to be chat models (rejected when adding the service). */
  nonChat?: RegExp;
  /** Task-specific translation models: they only translate (no chat), via the native `ai/run` API. */
  translators?: string[];
  /** Models that exist but cannot do Japanese → Vietnamese (rejected when adding the service). */
  notJaVi?: RegExp;
  /** Base URL with `{accountId}` filled in at creation (Cloudflare). */
  baseUrlTemplate?: string;
  /** No `/models` endpoint: offer these ids instead. */
  staticModels?: string[];
  note: string;
}

export const AI_PROVIDERS: readonly AiProvider[] = [
  {
    id: "gemini",
    name: "Google Gemini (AI Studio)",
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-3.8-flash",
    defaultRpm: 10,
    keyUrl: "https://aistudio.google.com/apikey",
    pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    note: "Gói miễn phí, chất lượng tiếng Việt tốt.",
  },
  {
    id: "groq",
    name: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    defaultRpm: 20,
    keyUrl: "https://console.groq.com/keys",
    pricingUrl: "https://groq.com/pricing",
    note: "Rất nhanh, gói miễn phí có giới hạn theo phút và theo ngày.",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    defaultRpm: 10,
    keyUrl: "https://openrouter.ai/keys",
    pricingUrl: "https://openrouter.ai/models?max_price=0",
    publicModels: true,
    note: "Có các mô hình đuôi :free; hạn mức thấp.",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    kind: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "google/gemma-4-31b-it",
    defaultRpm: 10,
    keyUrl: "https://build.nvidia.com/settings/api-keys",
    pricingUrl: "https://build.nvidia.com/models",
    publicModels: true,
    note: "Nhiều mô hình mở, gói miễn phí tính bằng credit/hạn mức của tài khoản NVIDIA Developer.",
  },
  {
    id: "cohere",
    name: "Cohere",
    kind: "openai",
    baseUrl: "https://api.cohere.ai/compatibility/v1",
    defaultModel: "command-a-03-2025",
    defaultRpm: 20,
    keyUrl: "https://dashboard.cohere.com/api-keys",
    pricingUrl: "https://cohere.com/pricing",
    note: "Khoá trial miễn phí, không cần thẻ — chỉ dùng phi thương mại, khoảng 1.000 lệnh gọi/tháng.",
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    kind: "openai",
    baseUrl: "",
    baseUrlTemplate: "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1",
    defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    defaultRpm: 20,
    keyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    pricingUrl: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
    publicModels: true,
    nonChat: /(whisper|melotts|bge-|embedding|resnet|distilbert|detr|flux|stable-diffusion|sdxl|llava|uform|text-to-image)/i,
    translators: ["@cf/meta/m2m100-1.2b"],
    // English → 22 Indic languages only (the other model of Cloudflare's Translation task).
    notJaVi: /indictrans2/i,
    staticModels: [
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "@cf/google/gemma-3-12b-it",
      "@cf/mistralai/mistral-small-3.1-24b-instruct",
      "@cf/meta/llama-3.1-8b-instruct",
      "@cf/meta/m2m100-1.2b",
    ],
    note: "10.000 neurons miễn phí/ngày, hết thì dừng (không tính tiền). Cần Account ID và API token có quyền Workers AI.",
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    defaultRpm: 30,
    keyUrl: "https://platform.openai.com/api-keys",
    pricingUrl: "https://openai.com/api/pricing",
    tierHint: "paid",
    suitabilityFilter: false,
    note: "Trả phí theo token — cần nạp tiền vào tài khoản OpenAI.",
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-5-5",
    defaultRpm: 30,
    keyUrl: "https://console.anthropic.com/settings/keys",
    pricingUrl: "https://www.anthropic.com/pricing",
    tierHint: "paid",
    suitabilityFilter: false,
    note: "Trả phí theo token — cần nạp credit; Haiku là lựa chọn rẻ và nhanh.",
  },
  {
    id: "custom",
    name: "Tuỳ chỉnh (máy cục bộ / API khác)",
    kind: "openai",
    baseUrl: "",
    defaultModel: "",
    defaultRpm: 30,
    keyUrl: "",
    pricingUrl: "",
    tierHint: "unknown",
    suitabilityFilter: false,
    custom: true,
    publicModels: true,
    note: "Ollama, LM Studio, vLLM, hoặc bất kỳ API kiểu OpenAI / Anthropic. Khoá API có thể để trống với máy cục bộ.",
  },
];

export const providerById = (id: string): AiProvider | undefined =>
  AI_PROVIDERS.find((p) => p.id === id);
