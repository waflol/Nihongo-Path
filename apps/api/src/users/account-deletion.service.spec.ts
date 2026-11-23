import { describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { AccountDeletionService, DELETE_CONFIRM_PHRASE } from "./account-deletion.service.js";

const exec = <T>(v: T) => ({ exec: async () => v });

function setup(user: { role: string; passwordHash?: string | null } | null) {
  const id = new Types.ObjectId();
  const doc = user && { _id: id, ...user };
  const userModel = { findById: () => exec(doc), deleteOne: vi.fn(() => exec({})) };
  const gone = () => ({ deleteMany: vi.fn(() => exec({ deletedCount: 0 })) });
  const empty = () => ({ ...gone(), find: () => exec([]), updateMany: vi.fn(() => exec({})) });
  const svc = new AccountDeletionService(
    userModel as never, // user
    gone() as never, // account
    gone() as never, // session
    empty() as never, // deck
    empty() as never, // card
    gone() as never, // report
    gone() as never, // hvLog
    gone() as never, // progress
    gone() as never, // study
    gone() as never, // push
    empty() as never, // jobRecord
    gone() as never, // jobPage
    empty() as never, // audit
    empty() as never, // requestLog
    gone() as never, // feedback
    gone() as never, // quotaReservation
    gone() as never, // usageRecord
  );
  return { svc, userModel, caller: { sub: id.toString(), role: "USER" as const, lang: "vi" } };
}

describe("AccountDeletionService", () => {
  it("refuses SUPER_ADMIN and deletes nothing", async () => {
    const { svc, userModel, caller } = setup({ role: "SUPER_ADMIN" });
    await expect(
      svc.deleteMe({ ...caller, role: "USER" }, { confirm: DELETE_CONFIRM_PHRASE }),
    ).rejects.toThrow(/SUPER_ADMIN/);
    expect(userModel.deleteOne).not.toHaveBeenCalled();
  });

  it("uses the database role, not the token claim", async () => {
    const { svc, caller } = setup({ role: "SUPER_ADMIN" });
    // token claims USER but the DB says SUPER_ADMIN → still refused
    await expect(svc.deleteMe(caller, { confirm: DELETE_CONFIRM_PHRASE })).rejects.toThrow();
  });

  it("rejects a wrong confirmation phrase", async () => {
    const { svc, caller } = setup({ role: "USER" });
    await expect(svc.deleteMe(caller, { confirm: "xoa" })).rejects.toThrow(/xác nhận/);
  });

  it("requires the password when the account has one", async () => {
    const { svc, caller } = setup({ role: "USER", passwordHash: "salt$hash" });
    await expect(svc.deleteMe(caller, { confirm: DELETE_CONFIRM_PHRASE })).rejects.toThrow(/Mật khẩu/);
  });

  it("deletes an OAuth-only account with the phrase", async () => {
    const { svc, userModel, caller } = setup({ role: "USER", passwordHash: null });
    const r = await svc.deleteMe(caller, { confirm: DELETE_CONFIRM_PHRASE });
    expect(r.deleted).toBe(true);
    expect(userModel.deleteOne).toHaveBeenCalledOnce();
  });

  it("canSelfDelete is false only for SUPER_ADMIN", () => {
    expect(AccountDeletionService.canSelfDelete("SUPER_ADMIN")).toBe(false);
    expect(AccountDeletionService.canSelfDelete("ADMIN")).toBe(true);
    expect(AccountDeletionService.canSelfDelete("USER")).toBe(true);
  });
});
