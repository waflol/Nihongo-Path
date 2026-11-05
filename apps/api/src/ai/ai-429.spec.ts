import { afterEach, describe, expect, it, vi } from "vitest";
import { AiExampleService, type AiTask } from "./ai-example.service.js";
import { providerById } from "./ai-providers.js";
import type { RuntimeAiService } from "./ai-services.service.js";

const svc: RuntimeAiService = {
  id: "or",
  label: "OpenRouter",
  provider: providerById("openrouter")!,
  model: "google/gemma-4-26b-a4b-it:free",
  key: "sk-or-secret-key",
  rpm: 600,
};
const task: AiTask = { kind: "translate", ja: "犬が好きです。", term: "犬", meaning: "chó" };

function run(response: Response) {
  vi.stubGlobal("fetch", async () => response);
  const services = { available: async () => [svc], reportOk: vi.fn(), reportFailure: vi.fn() };
  const s = new AiExampleService(services as never);
  const dispatch = (s as unknown as { dispatch: (b: unknown[]) => Promise<unknown> }).dispatch.bind(s);
  return dispatch([{ id: 1, task, resolve: () => undefined }]).then(() => services.reportFailure.mock.calls[0]);
}

afterEach(() => vi.unstubAllGlobals());

describe("HTTP 429 handling", () => {
  it("surfaces the provider's explanation and a per-day hint", async () => {
    const [id, kind, message] = await run(
      new Response(JSON.stringify({ error: { message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day" } }), { status: 429 }),
    );
    expect(id).toBe("or");
    expect(kind).toBe("rate");
    expect(message).toContain("free-models-per-day");
    expect(message).toContain("hết hạn mức theo ngày");
  });

  it("includes the upstream provider's text and waits until the reset time", async () => {
    const reset = Date.now() + 2 * 3600_000;
    const call = await run(
      new Response(
        JSON.stringify({ error: { message: "Provider returned error", metadata: { raw: "gemma is temporarily rate-limited upstream", headers: { "X-RateLimit-Reset": String(reset) } } } }),
        { status: 429 },
      ),
    );
    expect(call[2]).toContain("temporarily rate-limited upstream");
    expect(call[2]).toContain("quá tải");
    expect(call[3]).toBeGreaterThan(2 * 3600_000 - 5000);
    expect(call[3]).toBeLessThanOrEqual(2 * 3600_000);
  });

  it("honours Retry-After and never leaks the key", async () => {
    const call = await run(
      new Response(JSON.stringify({ error: "slow down sk-or-secret-key" }), { status: 429, headers: { "retry-after": "30" } }),
    );
    expect(call[3]).toBe(30_000);
    expect(call[2]).not.toContain("sk-or-secret-key");
    expect(call[2]).toContain("<key>");
  });

  it("keeps the old plain message when the body is empty", async () => {
    const call = await run(new Response("", { status: 429 }));
    expect(call[2]).toBe("rate limit / quota reached (HTTP 429)");
  });
});
