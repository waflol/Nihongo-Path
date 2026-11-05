import { describe, expect, it } from "vitest";
import { mongo, type Connection } from "mongoose";
import { BackupService } from "./backup.service.js";

const { ObjectId } = mongo;

function fakeModel(modelName: string, name: string, docs: Record<string, unknown>[]) {
  return {
    modelName,
    collection: {
      name,
      estimatedDocumentCount: async () => docs.length,
      find: () => (async function* () { for (const d of docs) yield { ...d }; })(),
    },
  };
}

async function read(stream: AsyncIterable<string | Buffer>) {
  let out = "";
  for await (const c of stream) out += c.toString();
  return out;
}

describe("BackupService", () => {
  const id = new ObjectId();
  const connection = {
    models: {
      Textbook: fakeModel("Textbook", "textbooks", [{ _id: id, title: "Minna", at: new Date(0) }]),
      Unit: fakeModel("Unit", "units", []),
      User: fakeModel("User", "users", [{ _id: id, email: "a@b.c", passwordHash: "salt$hash" }]),
    },
  } as unknown as Connection;
  const svc = new BackupService(connection);

  it("streams valid JSON with Extended JSON types, skipping missing models", async () => {
    const json = JSON.parse(await read(svc.stream(["content"], "u1")));
    expect(json.meta.groups).toEqual(["content"]);
    expect(Object.keys(json.collections)).toEqual(["textbooks", "units"]);
    expect(json.collections.textbooks[0]._id).toEqual({ $oid: id.toString() });
    expect(json.collections.textbooks[0].at).toEqual({ $date: { $numberLong: "0" } });
    expect(json.collections.units).toEqual([]);
  });

  it("never exports password hashes", async () => {
    const text = await read(svc.stream(["users"], "u1"));
    expect(text).not.toContain("passwordHash");
    expect(text).toContain("a@b.c");
  });

  it("counts documents per group", async () => {
    const groups = await svc.describe();
    expect(groups.find((g) => g.key === "content")?.documents).toBe(1);
    expect(groups.find((g) => g.key === "flashcards")?.collections).toBe(0);
  });
});
