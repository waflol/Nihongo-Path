import { afterEach, describe, expect, it, vi } from "vitest";
import { AiExampleService, type AiTask } from "./ai-example.service.js";
import { providerById } from "./ai-providers.js";
import type { RuntimeAiService } from "./ai-services.service.js";

const cf = providerById("cloudflare")!;
const accountUrl = cf.baseUrlTemplate!.replace("{accountId}", "a".repeat(32));

const translatorSvc: RuntimeAiService = {
  id: "cf-m2m",
  label: "CF m2m100",
  provider: { ...cf, baseUrl: accountUrl },
  model: "@cf/meta/m2m100-1.2b",
  key: "tok",
  rpm: 600,
};
const chatSvc: RuntimeAiService = { ...translatorSvc, id: "cf-llama", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" };

type Item = { id: number; task: AiTask; resolve: () => void };
const translate = (id: number, ja: string): Item => ({ id, task: { kind: "translate", ja, term: "犬", meaning: "chó" }, resolve: () => undefined });
const write = (id: number): Item => ({ id, task: { kind: "write", term: "犬", reading: "いぬ", meaning: "chó", pos: "noun" }, resolve: () => undefined });

function makeService(list: RuntimeAiService[]) {
  const services = { available: async () => list, reportOk: vi.fn(), reportFailure: vi.fn(), saveBench: vi.fn() };
  const svc = new AiExampleService(services as never);
  const dispatch = (svc as unknown as { dispatch: (b: Item[]) => Promise<Map<number, { ja?: string; vi: string }>> }).dispatch.bind(svc);
  return { services, dispatch };
}

const calls: { url: string; body: unknown }[] = [];
function stubFetch() {
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url.includes("/ai/run/")) {
      return new Response(JSON.stringify({ result: { translated_text: `VI:${body.text}` }, success: true }), { status: 200 });
    }
    // chat-style call: answer every item in the prompt
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ id: 2, ja: "犬が走る。", vi: "Chó chạy." }] }) } }] }),
      { status: 200 },
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe("translate-only service", () => {
  it("calls the native ai/run endpoint with ja → vi and returns the translation", async () => {
    stubFetch();
    const { dispatch } = makeService([translatorSvc]);
    const out = await dispatch([translate(1, "犬が好きです。")]);
    expect(out.get(1)?.vi).toBe("VI:犬が好きです。");
    expect(calls[0].url).toBe(`${accountUrl.replace(/\/ai\/v1$/, "")}/ai/run/@cf/meta/m2m100-1.2b`);
    expect(calls[0].body).toEqual({ text: "犬が好きです。", source_lang: "ja", target_lang: "vi" });
  });

  it("takes only translate items; the sentence to write goes on to the next chat service", async () => {
    stubFetch();
    const { dispatch, services } = makeService([translatorSvc, chatSvc]);
    const out = await dispatch([translate(1, "犬が好きです。"), write(2)]);
    expect(out.get(1)?.vi).toBe("VI:犬が好きです。");
    expect(out.get(2)?.ja).toBe("犬が走る。");
    // the chat service was asked only for the leftover write item
    const chatCall = calls.find((c) => c.url.endsWith("/chat/completions"))!;
    const prompt = (chatCall.body as { messages: { content: string }[] }).messages[0].content;
    expect(prompt).toContain('"task":"write"');
    expect(prompt).not.toContain("犬が好きです");
    expect(services.reportOk).toHaveBeenCalledTimes(2);
  });

  it("a translator alone leaves write items unanswered", async () => {
    stubFetch();
    const { dispatch } = makeService([translatorSvc]);
    const out = await dispatch([write(2)]);
    expect(out.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("reports a failure with Cloudflare's own message and moves on", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ errors: [{ message: "AiError: model not enabled" }] }), { status: 400 }));
    const { dispatch, services } = makeService([translatorSvc]);
    const out = await dispatch([translate(1, "犬が好きです。")]);
    expect(out.size).toBe(0);
    expect(services.reportFailure).toHaveBeenCalledWith("cf-m2m", "auth", expect.stringContaining("AiError: model not enabled"), undefined);
  });
});
