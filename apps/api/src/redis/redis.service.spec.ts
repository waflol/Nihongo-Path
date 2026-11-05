import { describe, expect, it } from "vitest";
import RedisMock from "ioredis-mock";
import { RedisService, maskRedisUrl } from "./redis.service.js";

function make() {
  const svc = new RedisService();
  const client = new RedisMock();
  svc.useClient(client as never);
  return { svc, client };
}

describe("RedisService", () => {
  it("masks the password in the URL", () => {
    expect(maskRedisUrl("redis://:secret@host:6379/0")).toBe("redis://***@host:6379/0");
    expect(maskRedisUrl("redis://localhost:6379")).toBe("redis://localhost:6379");
  });

  it("stores JSON under the np: prefix with a TTL and reads it back", async () => {
    const { svc, client } = make();
    await svc.setJson("ai:res:abc", { vi: "chó" }, 60);
    expect(await client.get("np:ai:res:abc")).toBe('{"vi":"chó"}');
    expect(await client.ttl("np:ai:res:abc")).toBeGreaterThan(0);
    expect(await svc.getJson("ai:res:abc")).toEqual({ vi: "chó" });
    await svc.del("ai:res:abc");
    expect(await svc.getJson("ai:res:abc")).toBeNull();
  });

  it("scans keys with type, ttl and size", async () => {
    const { svc, client } = make();
    await client.set("np:a", "hello", "EX", 100);
    await client.hset("np:h", { x: "1", y: "2" });
    const { keys } = await svc.scan("np:*", "0", 100);
    const byKey = Object.fromEntries(keys.map((k) => [k.key, k]));
    expect(byKey["np:a"]).toMatchObject({ type: "string", size: 5 });
    expect(byKey["np:a"].ttl).toBeGreaterThan(0);
    expect(byKey["np:h"]).toMatchObject({ type: "hash", size: 2, ttl: -1 });
  });

  it("inspects, deletes by key and by pattern, and flushes", async () => {
    const { svc, client } = make();
    await client.set("np:ai:res:1", JSON.stringify({ vi: "a" }));
    await client.set("np:ai:res:2", "x");
    await client.set("other", "y");
    expect((await svc.inspect("np:ai:res:1")).value).toContain('"vi": "a"');
    expect(await svc.deleteKey("np:ai:res:2")).toBe(1);
    await client.set("np:ai:res:3", "z");
    expect(await svc.deletePattern("np:ai:res:*")).toBe(2);
    expect(await client.get("other")).toBe("y");
    await svc.flush();
    expect(await client.dbsize()).toBe(0);
  });

  it("lists running tasks and reports status", async () => {
    const { svc } = make();
    await svc.setJson("ai:task:t1", { id: "t1", service: "A" }, 60);
    expect(await svc.runningTasks()).toEqual([{ id: "t1", service: "A" }]);
    const st = await svc.status();
    expect(st.connected).toBe(true);
    expect(st.keys).toBe(1);
  });

  it("names keys as running / waiting / done and counts them", async () => {
    const { svc } = make();
    await svc.setJson("ai:task:t1", { service: "Gemini", words: ["犬", "猫"], items: 2 }, 60);
    await svc.setJson("ai:queue", { count: 7, words: ["水"] }, 60);
    await svc.setJson("ai:res:abc", { vi: "chó", term: "犬" }, 60);
    const { keys } = await svc.scan("np:*", "0", 100);
    const by = Object.fromEntries(keys.map((k) => [k.key, k]));
    expect(by["np:ai:task:t1"]).toMatchObject({ state: "running", label: "Gemini · 犬、猫" });
    expect(by["np:ai:queue"]).toMatchObject({ state: "waiting" });
    expect(by["np:ai:queue"].label).toContain("7 thẻ đang đợi");
    expect(by["np:ai:res:abc"]).toMatchObject({ state: "done", label: "犬 → chó" });
    expect(await svc.summary()).toEqual({ running: 1, waiting: 7, done: 1 });
  });

  it("is a quiet no-op without REDIS_URL", async () => {
    delete process.env.REDIS_URL;
    const svc = new RedisService();
    await svc.setJson("k", 1, 10);
    expect(await svc.getJson("k")).toBeNull();
    expect(await svc.status()).toMatchObject({ configured: false, connected: false });
    await expect(svc.flush()).rejects.toThrow(/REDIS_URL/);
  });
});
