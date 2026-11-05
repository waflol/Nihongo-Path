import { describe, expect, it } from "vitest";
import { AiExampleService, type AiTask } from "./ai-example.service.js";

type Parse = (text: string, batch: { id: number; task: AiTask; resolve: () => void }[]) => Map<number, { ja?: string; vi: string; matches?: boolean }>;
const parse = ((new AiExampleService({} as never) as unknown) as { parse: Parse }).parse.bind(
  new AiExampleService({} as never),
);

const translate: AiTask = { kind: "translate", ja: "犬が好きです。", term: "犬", meaning: "con chó" };
const write: AiTask = { kind: "write", term: "犬", reading: "いぬ", meaning: "con chó", pos: "noun" };
const batch = [
  { id: 1, task: translate, resolve: () => undefined },
  { id: 2, task: write, resolve: () => undefined },
];

describe("AiExampleService.parse", () => {
  it("keeps a translate item even when the model puts Vietnamese (or nothing) in `ja`", () => {
    const out = parse('{"items":[{"id":1,"ja":"Tôi thích chó.","vi":"Tôi thích chó.","matches":true}]}', batch);
    expect(out.get(1)).toEqual({ ja: undefined, vi: "Tôi thích chó.", matches: true });
    expect(parse('{"items":[{"id":1,"ja":"","vi":"Tôi thích chó.","matches":true}]}', batch).has(1)).toBe(true);
  });

  it("requires a short Japanese sentence for write items", () => {
    expect(parse('{"items":[{"id":2,"ja":"犬が走る。","vi":"Chó chạy."}]}', batch).get(2)?.ja).toBe("犬が走る。");
    expect(parse('{"items":[{"id":2,"ja":"The dog runs.","vi":"Chó chạy."}]}', batch).has(2)).toBe(false);
    expect(parse('{"items":[{"id":2,"vi":"Chó chạy."}]}', batch).has(2)).toBe(false);
  });

  it("drops unknown ids, empty or over-long translations, and unreadable text", () => {
    expect(parse('{"items":[{"id":9,"vi":"x"}]}', batch).size).toBe(0);
    expect(parse('{"items":[{"id":1,"vi":""}]}', batch).size).toBe(0);
    expect(parse(`{"items":[{"id":1,"vi":"${"a".repeat(251)}"}]}`, batch).size).toBe(0);
    expect(parse("không phải JSON", batch).size).toBe(0);
  });

  it("accepts fenced JSON and a bare array", () => {
    expect(parse('```json\n[{"id":1,"vi":"ok","matches":false}]\n```', batch).get(1)?.matches).toBe(false);
  });
});
