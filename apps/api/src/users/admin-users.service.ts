import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { type FilterQuery, type Model, Types } from "mongoose";
import { hashPassword } from "../common/password.js";
import type { AuthUser } from "../auth/auth.types.js";
import { AuthSession } from "../auth/schemas/auth-session.schema.js";
import { AuthAccount } from "./schemas/auth-account.schema.js";
import { type UserStatus, User } from "./schemas/user.schema.js";

/** A session minted this recently ≈ the user is online (access TTL is ~15 min). */
const ONLINE_MS = 20 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface ListUsersInput {
  page?: number;
  limit?: number;
  q?: string;
  role?: string;
  status?: string;
}

/** Admin user management. Hierarchy: only SUPER_ADMIN may touch admin accounts. */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(AuthSession.name) private readonly sessions: Model<AuthSession>,
    @InjectModel(AuthAccount.name) private readonly accounts: Model<AuthAccount>,
  ) {}

  async list(input: ListUsersInput) {
    const page = input.page ?? 1;
    const limit = input.limit ?? 20;
    const filter: FilterQuery<User> = {};
    if (input.role) filter.role = input.role;
    if (input.status) filter.status = input.status;
    if (input.q) {
      const re = { $regex: escapeRegex(input.q), $options: "i" };
      filter.$or = [{ email: re }, { displayName: re }];
    }

    const [rows, total] = await Promise.all([
      this.users.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.users.countDocuments(filter),
    ]);

    const ids = rows.map((r) => r._id);
    const now = new Date();
    const [activity, providers] = await Promise.all([
      this.sessions.aggregate<{ _id: Types.ObjectId; last: Date; live: number }>([
        { $match: { user: { $in: ids } } },
        {
          $group: {
            _id: "$user",
            last: { $max: "$createdAt" },
            live: {
              $sum: {
                $cond: [{ $and: [{ $eq: [{ $ifNull: ["$revokedAt", null] }, null] }, { $gt: ["$expiresAt", now] }] }, 1, 0],
              },
            },
          },
        },
      ]),
      this.accounts.find({ user: { $in: ids } }, { user: 1, provider: 1 }).lean(),
    ]);
    const act = new Map(activity.map((a) => [a._id.toString(), a]));
    const prov = new Map<string, string[]>();
    for (const a of providers) {
      const k = a.user.toString();
      prov.set(k, [...(prov.get(k) ?? []), a.provider]);
    }

    return {
      page,
      limit,
      total,
      items: rows.map((u) => {
        const a = act.get(u._id.toString());
        return {
          id: u._id.toString(),
          email: u.email ?? null,
          displayName: u.displayName ?? null,
          role: u.role,
          status: u.status,
          lang: u.lang,
          providers: prov.get(u._id.toString()) ?? [],
          createdAt: u.createdAt,
          lastActiveAt: a?.last ?? null,
          online: Boolean(a && u.status === "ACTIVE" && now.getTime() - a.last.getTime() < ONLINE_MS),
          activeSessions: a?.live ?? 0,
        };
      }),
    };
  }

  async summary() {
    const now = Date.now();
    const [total, suspended, admins, newWeek, online] = await Promise.all([
      this.users.countDocuments({}),
      this.users.countDocuments({ status: "SUSPENDED" }),
      this.users.countDocuments({ role: { $in: ["ADMIN", "SUPER_ADMIN"] } }),
      this.users.countDocuments({ createdAt: { $gte: new Date(now - 7 * DAY_MS) } }),
      this.sessions.distinct("user", { createdAt: { $gte: new Date(now - ONLINE_MS) } }),
    ]);
    return { total, active: total - suspended, suspended, admins, newLast7d: newWeek, online: online.length };
  }

  /** Loads the target and enforces the caller/target hierarchy. */
  private async target(caller: AuthUser, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("User not found");
    const doc = await this.users.findById(id).exec();
    if (!doc) throw new NotFoundException("User not found");
    if (doc.id === caller.sub) {
      throw new BadRequestException("Không thể tự thay đổi tài khoản của chính mình");
    }
    if (doc.role !== "USER" && caller.role !== "SUPER_ADMIN") {
      throw new ForbiddenException("Chỉ SUPER_ADMIN được thao tác trên tài khoản quản trị");
    }
    return doc;
  }

  private revokeAll(userId: Types.ObjectId) {
    return this.sessions.updateMany({ user: userId, revokedAt: { $eq: null } }, { $set: { revokedAt: new Date() } });
  }

  async setStatus(caller: AuthUser, id: string, status: UserStatus) {
    const doc = await this.target(caller, id);
    doc.status = status;
    await doc.save();
    // Suspending also logs the user out everywhere (no refresh possible).
    if (status === "SUSPENDED") await this.revokeAll(doc._id);
    return { id, status };
  }

  async setRole(caller: AuthUser, id: string, role: "USER" | "ADMIN") {
    const doc = await this.target(caller, id);
    if (doc.role === "SUPER_ADMIN") {
      throw new ForbiddenException("Không đổi role của SUPER_ADMIN qua API");
    }
    doc.role = role;
    await doc.save();
    // Force re-login so the new role lands in the access token.
    await this.revokeAll(doc._id);
    return { id, role };
  }

  async createAdmin(input: { email: string; password: string; displayName?: string }) {
    const email = input.email.trim().toLowerCase();
    if (await this.users.exists({ email })) throw new ConflictException("Email đã tồn tại");
    const doc = await this.users.create({
      email,
      role: "ADMIN",
      status: "ACTIVE",
      lang: "vi",
      displayName: input.displayName?.trim() || undefined,
      passwordHash: await hashPassword(input.password),
    });
    const link = await this.accounts.create({
      provider: "email",
      providerAccountId: email,
      user: doc._id,
      manual: true,
    });
    await this.users.updateOne({ _id: doc._id }, { $set: { authAccounts: [link._id] } });
    return { id: doc.id, email, role: "ADMIN" as const };
  }

  async setPassword(caller: AuthUser, id: string, password: string) {
    const doc = await this.target(caller, id);
    if (!doc.email) throw new BadRequestException("Tài khoản không có email");
    doc.passwordHash = await hashPassword(password);
    await doc.save();
    // Ensure an email credential link exists (e.g. OAuth-only accounts), then force re-login.
    const has = await this.accounts.exists({ provider: "email", providerAccountId: doc.email });
    if (!has) {
      const link = await this.accounts.create({
        provider: "email",
        providerAccountId: doc.email,
        user: doc._id,
        manual: true,
      });
      await this.users.updateOne({ _id: doc._id }, { $addToSet: { authAccounts: link._id } });
    }
    await this.revokeAll(doc._id);
    return { id };
  }

  async revokeSessions(caller: AuthUser, id: string) {
    const doc = await this.target(caller, id);
    const res = await this.revokeAll(doc._id);
    return { id, revoked: res.modifiedCount };
  }
}
