import { describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { AdminUsersService } from "./admin-users.service.js";

function setup(target: { role: string; status?: string }) {
  const id = new Types.ObjectId();
  const doc = { id: id.toString(), _id: id, status: "ACTIVE", ...target, save: vi.fn() };
  const updateMany = vi.fn().mockResolvedValue({ modifiedCount: 2 });
  const svc = new AdminUsersService(
    { findById: () => ({ exec: async () => doc }) } as never,
    { updateMany } as never,
    {} as never,
  );
  return { svc, doc, updateMany, id: doc.id };
}
const admin = { sub: "admin1", role: "ADMIN", lang: "vi" };
const sup = { sub: "super1", role: "SUPER_ADMIN", lang: "vi" };

describe("AdminUsersService", () => {
  it("suspending a user saves the status and revokes their sessions", async () => {
    const { svc, doc, updateMany, id } = setup({ role: "USER" });
    await svc.setStatus(admin, id, "SUSPENDED");
    expect(doc.status).toBe("SUSPENDED");
    expect(doc.save).toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledOnce();
  });

  it("re-activating does not touch sessions", async () => {
    const { svc, updateMany, id } = setup({ role: "USER", status: "SUSPENDED" });
    await svc.setStatus(admin, id, "ACTIVE");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("ADMIN cannot modify another admin; SUPER_ADMIN can", async () => {
    const a = setup({ role: "ADMIN" });
    await expect(a.svc.setStatus(admin, a.id, "SUSPENDED")).rejects.toThrow(/SUPER_ADMIN/);
    const b = setup({ role: "ADMIN" });
    await expect(b.svc.setStatus(sup, b.id, "SUSPENDED")).resolves.toBeDefined();
  });

  it("nobody can change their own account", async () => {
    const { svc, id } = setup({ role: "USER" });
    await expect(svc.setStatus({ ...admin, sub: id }, id, "SUSPENDED")).rejects.toThrow(/chính mình/);
  });

  it("role change revokes sessions and never touches a SUPER_ADMIN", async () => {
    const a = setup({ role: "USER" });
    await a.svc.setRole(sup, a.id, "ADMIN");
    expect(a.doc.role).toBe("ADMIN");
    expect(a.updateMany).toHaveBeenCalled();
    const b = setup({ role: "SUPER_ADMIN" });
    await expect(b.svc.setRole(sup, b.id, "USER")).rejects.toThrow();
  });
});
