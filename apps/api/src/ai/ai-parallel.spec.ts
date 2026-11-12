import { afterEach, describe, expect, it, vi } from "vitest";
import { AiExampleService, type AiTask } from "./ai-example.service.js";
import { providerById } from "./ai-providers.js";
import type { RuntimeAiService } from "./ai-services.service.js";

const base: RuntimeAiService = {
  id: "a",
  label: "A",
  provider: providerById("openrouter")!,
  model: "m",
  key: "k",
  rpm: 6000,
};
const A = base;
const B: RuntimeAiService = { ...base, id: "b", label: "B", provider: { ...base.provider, baseUrl: "https://b.example/v1" } };
const task = (i: number): AiTask => ({ kind: "translate", ja: `文${i}`, term: "犬", meaning: "chó" });

let active = 0;
let maxActive = 0;
const hits: Record<string, number> = {};

function stubFetch(failHost?: string) {
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    if (failHost && url.includes(failHost)) return new Response("{}", { status: 503 });
    active++;
    maxActive = Math.max(maxActive, active);
    const host = new URL(url).host;
    hits[host] = (hits[host] ?? 0) + 1;
    await new Promise((r) => setTimeout(r, 30));
    active--;
    const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages[0].content;
    const items = JSON.parse(prompt.split("ITEMS:\n")[1]) as { id: number }[];
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: items.map((i) => ({ id: i.id, vi: "ok", matches: true })) }) } }] }),
      { status: 200 },
    );
  });
}

function make(list: RuntimeAiService[]) {
  const services = { available: async () => list, reportOk: vi.fn(), reportFailure: vi.fn() };
  return { svc: new AiExampleService(services as never), services };
}

afterEach(() => {
  vi.unstubAllGlobals();
  active = 0;
  maxActive = 0;
  for (const k of Object.keys(hits)) delete hits[k];
});

describe("parallel dispatch", () => {
  it("runs batches on two ready services at the same time", async () => {
    stubFetch();
    const { svc } = make([A, B]);
    const out = await Promise.all(Array.from({ length: 20 }, (_, i) => svc.run(task(i))));
    expect(out.every((r) => r?.vi === "ok")).toBe(true);
    expect(maxActive).toBe(2);
    expect(Object.keys(hits).length).toBe(2);
  });

  it("moves a batch to the next ready service when the first fails", async () => {
    stubFetch("openrouter.ai");
    const { svc, services } = make([A, B]);
    const out = await Promise.all(Array.from({ length: 10 }, (_, i) => svc.run(task(i))));
    expect(out.every((r) => r?.vi === "ok")).toBe(true);
    expect(services.reportFailure).toHaveBeenCalledWith("a", "transient", expect.any(String), undefined);
    expect(hits["b.example"]).toBe(1);
  });

  it("leaves the cards empty when no service is ready", async () => {
    stubFetch();
    const { svc } = make([]);
    expect(await svc.run(task(1))).toBeNull();
  });
});

describe("saved results", () => {
  it("asks the AI once per task and serves repeats from the saved answer", async () => {
    stubFetch();
    const store = new Map<string, unknown>();
    const cache = {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, r: unknown) => void store.set(k, r),
      backfillTerm: async () => undefined,
    };
    const services = { available: async () => [A], reportOk: vi.fn(), reportFailure: vi.fn() };
    const svc = new AiExampleService(services as never, undefined, cache as never);
    expect((await svc.run(task(1)))?.vi).toBe("ok");
    expect((await svc.run(task(1)))?.vi).toBe("ok");
    expect(hits["openrouter.ai"]).toBe(1);
    expect(svc.reused).toBe(1);
  });

  it("does not save a failed attempt, so it is tried again later", async () => {
    stubFetch("openrouter.ai");
    const store = new Map<string, unknown>();
    const cache = { get: async (k: string) => store.get(k) ?? null, set: async (k: string, r: unknown) => void store.set(k, r), backfillTerm: async () => undefined };
    const services = { available: async () => [A], reportOk: vi.fn(), reportFailure: vi.fn() };
    const svc = new AiExampleService(services as never, undefined, cache as never);
    expect(await svc.run(task(1))).toBeNull();
    expect(store.size).toBe(0);
  });
});
