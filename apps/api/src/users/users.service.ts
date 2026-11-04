import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Types, type Model } from "mongoose";
import { CONTENT_ADMIN } from "../common/roles.js";
import type { AuthUser, PublicUser } from "../auth/auth.types.js";
import { USER_STATUSES, User, UserDocument } from "./schemas/user.schema.js";

/** Updatable profile fields (P2-USER-01). Role/status are not self-service. */
export interface UpdateProfileInput {
  displayName?: string;
  lang?: string;
  /** IANA time zone, validated against the built-in DB (P3-SRS-05). */
  timezone?: string;
}

/**
 * Own-profile access only. Every read is scoped to the caller's user id
 * (from the verified access token) — a foreign id is rejected with 403/404,
 * never 200 (T-P2-06, IDOR).
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly user: Model<UserDocument>,
  ) {}

  /** Map a document to its safe public shape (no password hash, no raw ObjectId). */
  private toPublic(doc: UserDocument): PublicUser {
    return {
      id: doc.id,
      email: doc.email ?? null,
      displayName: doc.displayName ?? null,
      role: doc.role,
      lang: doc.lang,
      timezone: doc.timezone,
      status: doc.status,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  /** Read the caller's own profile. Suspended accounts are locked out. */
  async me(caller: AuthUser): Promise<PublicUser> {
    const doc = await this.findById(caller.sub);
    this.assertActive(doc);
    return this.toPublic(doc);
  }

  /**
   * Update the caller's own profile. `roles`/`status` are deliberately not
   * writable through this path (least privilege, spec §12).
   */
  async updateProfile(
    caller: AuthUser,
    input: UpdateProfileInput,
  ): Promise<PublicUser> {
    const doc = await this.findById(caller.sub);
    this.assertActive(doc);

    if (input.displayName !== undefined) {
      doc.displayName = input.displayName.trim();
    }
    if (input.lang !== undefined) {
      doc.lang = input.lang.trim().toLowerCase();
    }
    if (input.timezone !== undefined) {
      doc.timezone = this.assertValidTimezone(input.timezone);
    }

    await doc.save();
    return this.toPublic(doc);
  }

  /**
   * Validate an IANA time zone id against Node's built-in database
   * (P3-SRS-05 — SRS day boundaries run in the profile's zone). A zone
   * missing from the runtime DB would silently fall back to UTC, so reject
   * it with a clear 400 instead.
   */
  private assertValidTimezone(value: string): string {
    const zone = value.trim();
    try {
      // Throws RangeError for unknown zones.
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
    } catch {
      throw new BadRequestException(`Unknown time zone: ${zone}`);
    }
    return zone;
  }

  /**
   * Resolve a user document, refusing to read across accounts. The caller is
   * always compared against the target id unless the caller is an admin.
   */
  async findById(id: string): Promise<UserDocument> {
    let objectId: Types.ObjectId;
    try {
      objectId = new Types.ObjectId(id);
    } catch {
      throw new NotFoundException("User not found");
    }
    const doc = await this.user.findById(objectId).exec();
    if (!doc) {
      throw new NotFoundException("User not found");
    }
    return doc;
  }

  /**
   * Authorize a self-access or admin action against a target user. Throws
   * 403 for a non-admin caller whose target is not themselves (IDOR guard).
   */
  assertCanAccess(caller: AuthUser, targetId: string): void {
    if (caller.sub !== targetId && !CONTENT_ADMIN.includes(caller.role)) {
      throw new ForbiddenException("Cannot access another account");
    }
  }

  /** Suspended accounts are locked out at the profile boundary. */
  assertActive(doc: UserDocument): void {
    if (doc.status !== USER_STATUSES[0]) {
      throw new ForbiddenException("Account is not active");
    }
  }

  /** Admin bootstrap (P2-USER-02) — promote an existing user, no auto-seed. */
  async promoteToAdmin(admin: AuthUser, targetId: string): Promise<PublicUser> {
    this.assertCanAccess(admin, targetId);
    if (!CONTENT_ADMIN.includes(admin.role)) {
      throw new ForbiddenException("Admin role required");
    }
    const target = await this.findById(targetId);
    target.role = "ADMIN";
    await target.save();
    return this.toPublic(target);
  }
}
