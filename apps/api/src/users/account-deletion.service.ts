import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Types, type Model } from "mongoose";
import { rm } from "node:fs/promises";
import { AuthSession, AuthSessionDocument } from "../auth/schemas/auth-session.schema.js";
import type { AuthUser } from "../auth/auth.types.js";
import { verifyPassword } from "../common/password.js";
import { Flashcard } from "../flashcards/schemas/card.schema.js";
import { CardReport } from "../flashcards/schemas/card-report.schema.js";
import { FlashcardDeck } from "../flashcards/schemas/deck.schema.js";
import { HanVietCheckLog } from "../flashcards/schemas/han-viet-check-log.schema.js";
import { PdfJobPage, PdfJobRecord } from "../import/schemas/pdf-job.schema.js";
import { AuditLog } from "../logs/audit-log.schema.js";
import { RequestLog } from "../logs/request-log.schema.js";
import { PushSubscription } from "../notifications/schemas/push-subscription.schema.js";
import { UserCardProgress } from "../srs/schemas/progress.schema.js";
import { StudySession } from "../srs/schemas/session.schema.js";
import { UserFeedback } from "../feedback/schemas/user-feedback.schema.js";
import { AuthAccount, AuthAccountDocument } from "./schemas/auth-account.schema.js";
import { User, UserDocument } from "./schemas/user.schema.js";

/** Exact phrase the caller must send, so a stray request can never delete an account. */
export const DELETE_CONFIRM_PHRASE = "XOA TAI KHOAN";

/** Counts of what was removed, returned so the UI / audit can show it. */
export interface AccountDeletionResult {
  deleted: true;
  removed: {
    decks: number;
    cards: number;
    progress: number;
    sessions: number;
    reports: number;
    feedback: number;
    pushSubscriptions: number;
    importJobs: number;
  };
}

/**
 * Self-service account deletion (Luật BVDLCN 91/2025/QH15 — quyền yêu cầu xóa;
 * App Store Guideline 5.1.1(v); Google Play Data Deletion Policy).
 *
 * Deletes the caller's personal data across every collection that references
 * the user, anonymises what must stay (audit actor, request-log user) and
 * revokes every session. **SUPER_ADMIN accounts cannot be deleted here**: the
 * last super admin would lock the platform out, so that role is removed by
 * an operator with database access only.
 */
@Injectable()
export class AccountDeletionService {
  private readonly log = new Logger(AccountDeletionService.name);

  constructor(
    @InjectModel(User.name) private readonly user: Model<UserDocument>,
    @InjectModel(AuthAccount.name) private readonly account: Model<AuthAccountDocument>,
    @InjectModel(AuthSession.name) private readonly session: Model<AuthSessionDocument>,
    @InjectModel(FlashcardDeck.name) private readonly deck: Model<FlashcardDeck>,
    @InjectModel(Flashcard.name) private readonly card: Model<Flashcard>,
    @InjectModel(CardReport.name) private readonly report: Model<CardReport>,
    @InjectModel(HanVietCheckLog.name) private readonly hvLog: Model<HanVietCheckLog>,
    @InjectModel(UserCardProgress.name) private readonly progress: Model<UserCardProgress>,
    @InjectModel(StudySession.name) private readonly study: Model<StudySession>,
    @InjectModel(PushSubscription.name) private readonly push: Model<PushSubscription>,
    @InjectModel(PdfJobRecord.name) private readonly jobRecord: Model<PdfJobRecord>,
    @InjectModel(PdfJobPage.name) private readonly jobPage: Model<PdfJobPage>,
    @InjectModel(AuditLog.name) private readonly audit: Model<AuditLog>,
    @InjectModel(RequestLog.name) private readonly requestLog: Model<RequestLog>,
    @InjectModel(UserFeedback.name) private readonly feedback: Model<UserFeedback>,
  ) {}

  /** Whether the self-service button / endpoint is allowed for this role. */
  static canSelfDelete(role: string): boolean {
    return role !== "SUPER_ADMIN";
  }

  async deleteMe(
    caller: AuthUser,
    input: { confirm: string; password?: string },
  ): Promise<AccountDeletionResult> {
    // Role comes from the database, not the (possibly stale) token claim.
    if (!Types.ObjectId.isValid(caller.sub)) throw new NotFoundException("User not found");
    const doc = await this.user.findById(caller.sub).exec();
    if (!doc) throw new NotFoundException("User not found");

    if (!AccountDeletionService.canSelfDelete(doc.role)) {
      throw new ForbiddenException(
        "Tài khoản SUPER_ADMIN không thể tự xóa; liên hệ người vận hành hệ thống.",
      );
    }
    if (input.confirm !== DELETE_CONFIRM_PHRASE) {
      throw new BadRequestException("Cụm xác nhận không đúng.");
    }
    // Accounts that have a password must re-enter it (a stolen access token
    // alone must not be enough to wipe an account). OAuth-only accounts have
    // no password; for them the typed phrase plus a live session is the check.
    if (doc.passwordHash) {
      const ok = input.password
        ? await verifyPassword(input.password, doc.passwordHash)
        : false;
      if (!ok) throw new UnauthorizedException("Mật khẩu không đúng.");
    }

    const uid = doc._id as Types.ObjectId;
    const uidStr = uid.toString();

    // 1. Personal decks → their cards, per-deck logs, and every other user's
    //    progress/reports on those cards (nobody can reach them any more).
    const decks = await this.deck.find({ user: uid, shared: { $ne: true } }, { _id: 1 }).exec();
    const deckIds = decks.map((d) => d._id);
    let cards = 0;
    if (deckIds.length > 0) {
      const cardIds = (await this.card.find({ deck: { $in: deckIds } }, { _id: 1 }).exec()).map(
        (c) => c._id,
      );
      if (cardIds.length > 0) {
        await this.progress.deleteMany({ card: { $in: cardIds } }).exec();
        await this.report.deleteMany({ card: { $in: cardIds } }).exec();
      }
      cards = (await this.card.deleteMany({ deck: { $in: deckIds } }).exec()).deletedCount ?? 0;
      await this.hvLog.deleteMany({ deck: { $in: deckIds } }).exec();
      await this.deck.deleteMany({ _id: { $in: deckIds } }).exec();
    }

    // 2. Everything else keyed by this user.
    const progress = (await this.progress.deleteMany({ user: uid }).exec()).deletedCount ?? 0;
    const sessions = (await this.study.deleteMany({ user: uid }).exec()).deletedCount ?? 0;
    const reports = (await this.report.deleteMany({ user: uid }).exec()).deletedCount ?? 0;
    const feedback = (await this.feedback.deleteMany({ user: uid }).exec()).deletedCount ?? 0;
    const pushSubscriptions = (await this.push.deleteMany({ user: uid }).exec()).deletedCount ?? 0;

    // 3. Import jobs (user is stored as a string) + their pages + the file on disk.
    const jobs = await this.jobRecord.find({ user: uidStr }, { _id: 1, filePath: 1 }).exec();
    for (const j of jobs) {
      await this.jobPage.deleteMany({ job: String(j._id) }).exec();
      if (j.filePath) await rm(j.filePath, { force: true }).catch(() => undefined);
    }
    await this.jobRecord.deleteMany({ user: uidStr }).exec();

    // 4. Logs we must keep (security / audit) are anonymised, not deleted.
    await this.audit.updateMany({ actor: uid }, { $unset: { actor: "" } }).exec();
    await this.requestLog.updateMany({ user: uid }, { $unset: { user: "" } }).exec();

    // 5. Identity last: sessions (refresh tokens), linked accounts, the user.
    await this.session.deleteMany({ user: uid }).exec();
    await this.account.deleteMany({ user: uid }).exec();
    await this.user.deleteOne({ _id: uid }).exec();

    // Written after the anonymising step, with no user id: proves the deletion
    // happened (accountability) without keeping the identity.
    this.log.log(`Account deleted (decks=${deckIds.length}, cards=${cards}, progress=${progress})`);

    return {
      deleted: true,
      removed: {
        decks: deckIds.length,
        cards,
        progress,
        sessions,
        reports,
        feedback,
        pushSubscriptions,
        importJobs: jobs.length,
      },
    };
  }
}
