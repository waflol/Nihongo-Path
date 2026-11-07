import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import type { AuthUser } from "../auth/auth.types.js";
import { FlashcardsService } from "./flashcards.service.js";
import type { FlashcardDocument } from "./schemas/card.schema.js";
import {
  REPORT_STATUSES,
  type CardReportDocument,
  type ReportKind,
  type ReportStatus,
} from "./schemas/card-report.schema.js";

/** Max open reports one user may file per day (anti-spam). */
const DAILY_LIMIT = 30;

@Injectable()
export class CardReportsService {
  constructor(
    @InjectModel("CardReport") private readonly reports: Model<CardReportDocument>,
    @InjectModel("Flashcard") private readonly cards: Model<FlashcardDocument>,
    private readonly flashcards: FlashcardsService,
  ) {}

  async create(
    caller: AuthUser,
    cardId: string,
    input: { kind: ReportKind; message?: string; suggestion?: string },
  ) {
    if (!Types.ObjectId.isValid(cardId)) throw new NotFoundException("Card not found");
    const message = (input.message ?? "").trim();
    const suggestion = (input.suggestion ?? "").trim();
    if (!message && !suggestion) {
      throw new BadRequestException("Hãy mô tả lỗi hoặc nhập bản sửa đề xuất");
    }
    const card = await this.cards.findById(cardId).exec();
    if (!card) throw new NotFoundException("Card not found");
    const deck = await this.flashcards.getDeck(caller, String(card.deck));
    if (!deck.shared) {
      throw new ForbiddenException("Chỉ báo lỗi cho thẻ của bộ thẻ chung");
    }
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const recent = await this.reports.countDocuments({
      user: new Types.ObjectId(caller.sub),
      createdAt: { $gte: since },
    });
    if (recent >= DAILY_LIMIT) {
      throw new ForbiddenException("Bạn đã gửi quá nhiều báo lỗi hôm nay");
    }
    // Same user, same card, same kind, still open → update instead of duplicating.
    const doc = await this.reports.findOneAndUpdate(
      {
        user: new Types.ObjectId(caller.sub),
        card: card._id,
        kind: input.kind,
        status: "OPEN",
      },
      {
        $set: {
          message,
          suggestion,
          deck: card.deck,
          cardFront: card.front,
          cardBack: card.back,
          cardHanViet: card.hanViet ?? "",
          deckTitle: deck.title,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return { id: String(doc._id) };
  }

  /** Admin: list reports, newest first. */
  async adminList(status?: string) {
    const filter: Record<string, unknown> = {};
    if (status && (REPORT_STATUSES as readonly string[]).includes(status)) {
      filter.status = status;
    }
    const docs = await this.reports
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(300)
      .populate("user", "email displayName")
      .lean()
      .exec();
    return docs.map((d) => {
      const u = d.user as unknown as { email?: string; displayName?: string } | null;
      return {
        id: String(d._id),
        cardId: String(d.card),
        deckId: String(d.deck),
        deckTitle: d.deckTitle,
        kind: d.kind,
        message: d.message,
        suggestion: d.suggestion,
        cardFront: d.cardFront,
        cardBack: d.cardBack,
        cardHanViet: d.cardHanViet,
        status: d.status,
        reporter: u?.displayName || u?.email || "—",
        createdAt: (d as unknown as { createdAt?: Date }).createdAt,
      };
    });
  }

  async adminSetStatus(id: string, status: ReportStatus) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("Report not found");
    const doc = await this.reports
      .findByIdAndUpdate(id, { $set: { status } }, { new: true })
      .exec();
    if (!doc) throw new NotFoundException("Report not found");
    return { id: String(doc._id), status: doc.status };
  }
}
