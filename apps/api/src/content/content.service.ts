import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model, Types } from "mongoose";
import {
  type GrammarExample,
  type GrammarPointDocument,
} from "./schemas/grammar-point.schema.js";
import type { TextbookDocument } from "./schemas/textbook.schema.js";
import type { UnitDocument } from "./schemas/unit.schema.js";
import type { VocabularyDocument } from "./schemas/vocabulary.schema.js";
import { mapSuperHonkiSource } from "./grammar-source.js";
import { grammarTextbookFilter } from "./grammar-filter.js";

/** A stable page of results (P2-CONTENT-04). */
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ContentQuery {
  page?: number;
  limit?: number;
  status?: string;
  level?: string;
  textbookId?: string;
  themeId?: string;
  contextId?: string;
  unitId?: string;
  search?: string;
}

/**
 * Create/update input shapes mirror the public DTOs (JSON): reference ids are
 * `string` here and converted to `ObjectId` on the way into the model. This
 * keeps the service's boundary (what a controller receives) distinct from the
 * mongoose document types (what is stored).
 */
export interface TextbookInput {
  title: string;
  subtitle?: string;
  author?: string;
  level?: string;
  lang?: string;
  status?: string;
}

export interface UnitInput {
  textbookId: string;
  title: string;
  summary?: string;
  sortOrder?: number;
  lang?: string;
  status?: string;
}

export interface VocabularyInput {
  term: string;
  reading?: string;
  meaning: string;
  pos?: string;
  example?: string;
  exampleTranslation?: string;
  source?: string;
  tags?: string[];
  textbooks?: string[];
  units?: string[];
  lang?: string;
  status?: string;
}

export interface GrammarPointInput {
  label: string;
  meaning: string;
  structure?: string;
  usage?: string;
  pattern?: string;
  coreExplanation?: string;
  forms?: string[];
  explanations?: string[];
  notes?: string[];
  senses?: unknown[];
  groupNo?: number;
  groupJa?: string;
  groupVi?: string;
  themeIds?: string[];
  contextIds?: string[];
  textbookRefs?: unknown[];
  compareWith?: unknown[];
  sourceKey?: string;
  sourceProvider?: string;
  sourceUrl?: string;
  sourceVersion?: string;
  sourceHash?: string;
  examples?: GrammarExample[];
  level?: string;
  tags?: string[];
  textbooks?: string[];
  sortOrder?: number;
  lang?: string;
  status?: string;
}

/**
 * PATCH bodies are partial: only the keys the client sent are present.
 * The update methods therefore take `Partial<XInput>` and apply only
 * defined keys — an omitted field must never overwrite the stored value
 * (e.g. omitting `textbooks` must not clear the existing links).
 */

/** Drop `undefined` values so a partial update leaves omitted fields alone. */
function omitUndefined<T extends object>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) out[key] = val;
  }
  return out as Partial<T>;
}

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function toObjectIdArray(values: string[] | undefined): Types.ObjectId[] {
  return (values ?? []).map((v) => new Types.ObjectId(v));
}

/**
 * Learning-content reads and admin CRUD (P2-CONTENT-01..05).
 *
 * - Public reads are coerced to `status: PUBLISHED` — drafts never leak to the
 *   public listing (T-P2-09).
 * - Admin writes (controller-side `@ContentAdmin()`) may set any status.
 * - Pagination is stable (`_id`-descending), clamped to `[1, 100]`.
 */
@Injectable()
export class ContentService {
  constructor(
    @InjectModel("Textbook")
    private readonly textbook: Model<TextbookDocument>,
    @InjectModel("Unit")
    private readonly unit: Model<UnitDocument>,
    @InjectModel("Vocabulary")
    private readonly vocabulary: Model<VocabularyDocument>,
    @InjectModel("GrammarPoint")
    private readonly grammar: Model<GrammarPointDocument>,
  ) {}

  private normalize(query: Partial<ContentQuery>): {
    skip: number;
    limit: number;
    page: number;
  } {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20) || 20));
    return { skip: (page - 1) * limit, limit, page };
  }

  // ── Textbooks ─────────────────────────────────────────────────────

  async listTextbooks(query: ContentQuery): Promise<PageResult<TextbookDocument>> {
    const { skip, limit, page } = this.normalize(query);
    const filter: FilterQuery<TextbookDocument> = {};
    if (query.status) filter.status = query.status;
    if (query.level) filter.level = query.level;
    const [items, total] = await Promise.all([
      this.textbook
        .find(filter)
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.textbook.countDocuments(filter).exec(),
    ]);
    return { items, total, page, limit };
  }

  async getTextbook(id: string): Promise<TextbookDocument> {
    const doc = await this.textbook.findById(objectId(id)).exec();
    if (!doc) throw new NotFoundException("Textbook not found");
    return doc;
  }

  createTextbook(input: TextbookInput): Promise<TextbookDocument> {
    return this.textbook.create(input);
  }

  async updateTextbook(
    id: string,
    input: Partial<TextbookInput>,
  ): Promise<TextbookDocument> {
    const filter = { _id: objectId(id) };
    const doc = await this.textbook
      .findByIdAndUpdate(
        filter,
        omitUndefined(input),
        { new: true, runValidators: true },
      )
      .exec();
    if (!doc) throw new NotFoundException("Textbook not found");
    return doc;
  }

  async deleteTextbook(id: string): Promise<void> {
    const res = await this.textbook.deleteOne({ _id: objectId(id) }).exec();
    if (res.deletedCount === 0) throw new NotFoundException("Textbook not found");
  }

  // ── Units ─────────────────────────────────────────────────────────

  async listUnits(query: ContentQuery): Promise<PageResult<UnitDocument>> {
    const { skip, limit, page } = this.normalize(query);
    const filter: FilterQuery<UnitDocument> = {};
    if (query.textbookId) filter.textbook = objectId(query.textbookId);
    if (query.status) filter.status = query.status;
    const [items, total] = await Promise.all([
      this.unit
        .find(filter)
        .sort({ textbook: 1, sortOrder: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.unit.countDocuments(filter).exec(),
    ]);
    return { items, total, page, limit };
  }

  async getUnit(id: string): Promise<UnitDocument> {
    const doc = await this.unit.findById(objectId(id)).exec();
    if (!doc) throw new NotFoundException("Unit not found");
    return doc;
  }

  createUnit(input: UnitInput): Promise<UnitDocument> {
    const { textbookId, ...rest } = input;
    return this.unit.create({ ...rest, textbook: objectId(textbookId) });
  }

  async updateUnit(
    id: string,
    input: Partial<UnitInput>,
  ): Promise<UnitDocument> {
    const { textbookId, ...rest } = input;
    const update: Record<string, unknown> = { ...omitUndefined(rest) };
    // Map `textbookId` → the stored `textbook` ObjectId, but only when sent
    // — a partial update must not clobber the existing link.
    if (textbookId !== undefined) update.textbook = objectId(textbookId);
    const filter = { _id: objectId(id) };
    const doc = await this.unit
      .findByIdAndUpdate(
        filter,
        update,
        { new: true, runValidators: true },
      )
      .exec();
    if (!doc) throw new NotFoundException("Unit not found");
    return doc;
  }

  async deleteUnit(id: string): Promise<void> {
    const res = await this.unit.deleteOne({ _id: objectId(id) }).exec();
    if (res.deletedCount === 0) throw new NotFoundException("Unit not found");
  }

  // ── Vocabulary ────────────────────────────────────────────────────

  async listVocabulary(
    query: ContentQuery,
  ): Promise<PageResult<VocabularyDocument>> {
    const { skip, limit, page } = this.normalize(query);
    const filter: FilterQuery<VocabularyDocument> = {};
    if (query.status) filter.status = query.status;
    if (query.textbookId) filter.textbooks = objectId(query.textbookId);
    const [items, total] = await Promise.all([
      this.vocabulary
        .find(filter)
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.vocabulary.countDocuments(filter).exec(),
    ]);
    return { items, total, page, limit };
  }

  async getVocabulary(id: string): Promise<VocabularyDocument> {
    const doc = await this.vocabulary.findById(objectId(id)).exec();
    if (!doc) throw new NotFoundException("Vocabulary not found");
    return doc;
  }

  createVocabulary(input: VocabularyInput): Promise<VocabularyDocument> {
    const { textbooks, units, ...rest } = input;
    return this.vocabulary.create({
      ...rest,
      textbooks: toObjectIdArray(textbooks),
      units: toObjectIdArray(units),
    });
  }

  async updateVocabulary(
    id: string,
    input: Partial<VocabularyInput>,
  ): Promise<VocabularyDocument> {
    const { textbooks, units, ...rest } = input;
    const update: Record<string, unknown> = { ...omitUndefined(rest) };
    // Link arrays are only rewritten when explicitly sent (an empty array is
    // a deliberate "unlink all" and is kept); an omitted field is left alone.
    if (textbooks !== undefined) update.textbooks = toObjectIdArray(textbooks);
    if (units !== undefined) update.units = toObjectIdArray(units);
    const filter = { _id: objectId(id) };
    const doc = await this.vocabulary
      .findByIdAndUpdate(
        filter,
        update,
        { new: true, runValidators: true },
      )
      .exec();
    if (!doc) throw new NotFoundException("Vocabulary not found");
    return doc;
  }

  async deleteVocabulary(id: string): Promise<void> {
    const res = await this.vocabulary.deleteOne({ _id: objectId(id) }).exec();
    if (res.deletedCount === 0) throw new NotFoundException("Vocabulary not found");
  }

  // ── Grammar points ───────────────────────────────────────────────

  async listGrammar(query: ContentQuery): Promise<PageResult<GrammarPointDocument>> {
    const { skip, limit, page } = this.normalize(query);
    const filter: FilterQuery<GrammarPointDocument> = {};
    if (query.status) filter.status = query.status;
    if (query.level) filter.level = query.level;
    Object.assign(filter, grammarTextbookFilter(query.textbookId, query.unitId));
    if (query.themeId) filter.themeIds = query.themeId;
    if (query.contextId) filter.contextIds = query.contextId;
    if (query.search?.trim()) {
      const escaped = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { label: { $regex: escaped, $options: "i" } },
        { meaning: { $regex: escaped, $options: "i" } },
        { pattern: { $regex: escaped, $options: "i" } },
      ];
    }
    const [items, total] = await Promise.all([
      this.grammar
        .find(filter)
        .sort({ level: 1, sortOrder: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.grammar.countDocuments(filter).exec(),
    ]);
    return { items, total, page, limit };
  }

  async getGrammar(id: string): Promise<GrammarPointDocument> {
    const doc = await this.grammar.findById(objectId(id)).exec();
    if (!doc) throw new NotFoundException("Grammar point not found");
    return doc;
  }

  /** Public read: a draft is indistinguishable from a missing point (NP-1007). */
  async getPublishedGrammar(id: string): Promise<GrammarPointDocument> {
    const doc = Types.ObjectId.isValid(id)
      ? await this.grammar.findOne({ _id: objectId(id), status: "PUBLISHED" }).exec()
      : null;
    if (!doc) throw new NotFoundException("Grammar point not found");
    return doc;
  }

  /**
   * Every point with just the fields needed to browse by level, theme, context
   * and textbook lesson; the UI counts and groups them itself.
   */
  grammarIndex(status?: "DRAFT" | "PUBLISHED") {
    return this.grammar
      .find(status ? { status } : {})
      .select("label meaning level status sourceKey groupNo groupJa groupVi themeIds contextIds textbookRefs")
      .sort({ level: -1, sortOrder: 1, _id: 1 })
      .lean()
      .exec();
  }

  /** Facet counts across published grammar points, for the filter UI (NP-1007). */
  /** Preview a downloaded Super Honki source without mutating the database. */
  previewGrammarImport(source: string, version?: string) {
    const points = mapSuperHonkiSource(source, version);
    const keys = new Set(points.map((p) => `${p.sourceProvider}:${p.sourceKey}`));
    return { total: points.length, duplicateKeys: points.length - keys.size, levels: points.reduce<Record<string, number>>((a, p) => { a[p.level ?? ""] = (a[p.level ?? ""] ?? 0) + 1; return a; }, {}) };
  }

  /** Publish/unpublish one grammar point, preserving a small before snapshot for audit callers. */
  async setGrammarStatus(id: string, status: "DRAFT" | "PUBLISHED") {
    const before = await this.getGrammar(id);
    const after = await this.grammar.findByIdAndUpdate(objectId(id), { $set: { status } }, { new: true, runValidators: true }).exec();
    if (!after) throw new NotFoundException("Grammar point not found");
    return { before: before.toObject(), after: after.toObject() };
  }

  async grammarFacets(): Promise<{
    levels: Record<string, number>;
    themes: Record<string, number>;
    contexts: Record<string, number>;
  }> {
    const base: FilterQuery<GrammarPointDocument> = { status: "PUBLISHED" };
    const [byLevel, byTheme, byContext] = await Promise.all([
      this.grammar.aggregate<{ _id: string; n: number }>([
        { $match: base },
        { $group: { _id: "$level", n: { $sum: 1 } } },
      ]),
      this.grammar.aggregate<{ _id: string; n: number }>([
        { $match: base },
        { $unwind: "$themeIds" },
        { $group: { _id: "$themeIds", n: { $sum: 1 } } },
      ]),
      this.grammar.aggregate<{ _id: string; n: number }>([
        { $match: base },
        { $unwind: "$contextIds" },
        { $group: { _id: "$contextIds", n: { $sum: 1 } } },
      ]),
    ]);
    const fold = (rows: { _id: string | null; n: number }[]) => {
      const out: Record<string, number> = {};
      for (const r of rows) if (r._id) out[String(r._id)] = r.n;
      return out;
    };
    return { levels: fold(byLevel), themes: fold(byTheme), contexts: fold(byContext) };
  }

  createGrammar(input: GrammarPointInput): Promise<GrammarPointDocument> {
    const { textbooks, ...rest } = input;
    return this.grammar.create({
      ...rest,
      textbooks: toObjectIdArray(textbooks),
    });
  }

  async updateGrammar(
    id: string,
    input: Partial<GrammarPointInput>,
  ): Promise<GrammarPointDocument> {
    const { textbooks, ...rest } = input;
    const update: Record<string, unknown> = { ...omitUndefined(rest) };
    // `textbooks` is only rewritten when sent; omitted = leave existing links.
    if (textbooks !== undefined) update.textbooks = toObjectIdArray(textbooks);
    // A content edit pins the point against importer refreshes (ADR-grammar-source);
    // publishing alone does not.
    if (Object.keys(update).some((key) => key !== "status")) update.editedAt = new Date();
    const filter = { _id: objectId(id) };
    const doc = await this.grammar
      .findByIdAndUpdate(
        filter,
        update,
        { new: true, runValidators: true },
      )
      .exec();
    if (!doc) throw new NotFoundException("Grammar point not found");
    return doc;
  }

  async deleteGrammar(id: string): Promise<void> {
    const res = await this.grammar.deleteOne({ _id: objectId(id) }).exec();
    if (res.deletedCount === 0) throw new NotFoundException("Grammar point not found");
  }
}
