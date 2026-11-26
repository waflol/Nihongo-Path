import { NotFoundException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { ContentService } from "./content.service.js";
import { AdminContentQuery, PublicContentQuery } from "./dto/content.dto.js";

function serviceWith(findOne: ReturnType<typeof vi.fn>) {
  const service = Object.create(ContentService.prototype) as ContentService;
  Object.assign(service, { grammar: { findOne } });
  return service;
}

const strict = { whitelist: true, forbidNonWhitelisted: true };

describe("grammar draft isolation", () => {
  const id = "6b0817685fe8725b34fe6330";

  it("only looks up PUBLISHED points for public reads", async () => {
    const findOne = vi.fn(() => ({ exec: async () => null }));
    await expect(serviceWith(findOne).getPublishedGrammar(id)).rejects.toThrow(NotFoundException);
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ status: "PUBLISHED" }));
  });

  it("answers 404 for a malformed id without querying", async () => {
    const findOne = vi.fn();
    await expect(serviceWith(findOne).getPublishedGrammar("abc")).rejects.toThrow(NotFoundException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it("accepts a status filter on admin lists only", () => {
    expect(validateSync(plainToInstance(AdminContentQuery, { status: "DRAFT" }), strict)).toHaveLength(0);
    expect(validateSync(plainToInstance(AdminContentQuery, { status: "X" }), strict)).toHaveLength(1);
    expect(validateSync(plainToInstance(PublicContentQuery, { status: "DRAFT" }), strict)).toHaveLength(1);
  });
});

describe("grammar admin edits", () => {
  function editor() {
    const findByIdAndUpdate = vi.fn((..._args: unknown[]) => ({ exec: async () => ({}) }));
    const service = Object.create(ContentService.prototype) as ContentService;
    Object.assign(service, { grammar: { findByIdAndUpdate } });
    return { service, findByIdAndUpdate };
  }

  it("pins a content edit against re-import", async () => {
    const { service, findByIdAndUpdate } = editor();
    await service.updateGrammar("6b0817685fe8725b34fe6330", { meaning: "mới" });
    expect(findByIdAndUpdate.mock.calls[0][1]).toHaveProperty("editedAt");
  });

  it("does not pin a publication change", async () => {
    const { service, findByIdAndUpdate } = editor();
    await service.updateGrammar("6b0817685fe8725b34fe6330", { status: "PUBLISHED" });
    expect(findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty("editedAt");
  });
});
