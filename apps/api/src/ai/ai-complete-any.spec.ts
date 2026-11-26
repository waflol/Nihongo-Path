import { describe, expect, it, vi } from "vitest";
import { AiExampleService } from "./ai-example.service.js";

function serviceWith(answers: Record<string, string | Error>) {
  const reportOk = vi.fn();
  const svc = Object.create(AiExampleService.prototype) as Record<string, unknown>;
  svc.services = { available: async () => Object.keys(answers).map((id) => ({ id })), reportOk, reportFailure: vi.fn() };
  svc.isTranslator = () => false;
  svc.complete = async (s: { id: string }) => {
    const a = answers[s.id];
    if (a instanceof Error) throw a;
    return { text: a };
  };
  const ask = () =>
    (svc as unknown as AiExampleService).completeAny("p", { temperature: 0, purpose: "exam-import" }, (text) => ({
      value: text,
      ok: text === "good",
    }));
  return { ask, reportOk };
}

describe("AiExampleService.completeAny", () => {
  it("moves to the next service when one fails", async () => {
    await expect(serviceWith({ a: new Error("HTTP 503"), b: "good" }).ask()).resolves.toEqual({ answered: true, value: "good" });
  });

  it("returns an unusable answer after two services, without asking a third", async () => {
    const h = serviceWith({ a: "bad1", b: "bad2", c: "good" });
    await expect(h.ask()).resolves.toEqual({ answered: true, value: "bad1" });
    expect(h.reportOk).toHaveBeenCalledTimes(2);
  });

  it("asks for the services in the order of the task it was given", async () => {
    const asked: unknown[] = [];
    const svc = Object.create(AiExampleService.prototype) as Record<string, unknown>;
    svc.services = { available: async (task?: string) => (asked.push(task), []) };
    const ai = svc as unknown as AiExampleService;
    await ai.completeAny("p", { temperature: 0, purpose: "exam-import", task: "ocr-exam" }, (t) => ({ value: t, ok: true }));
    await ai.ocrExamPageText(Buffer.from(""), 1);
    await ai.ocrVocabPage(Buffer.from(""), 1);
    expect(asked).toEqual(["ocr-exam", "ocr-exam", "ocr-vocab"]);
  });

  it("says nobody answered, so the caller can wait and retry", async () => {
    await expect(serviceWith({ a: new Error("HTTP 503") }).ask()).resolves.toEqual({ answered: false, error: "HTTP 503" });
    await expect(serviceWith({}).ask()).resolves.toMatchObject({ answered: false });
  });
});
