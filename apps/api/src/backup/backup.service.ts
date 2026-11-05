import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { type Connection, mongo } from "mongoose";
import { Readable } from "node:stream";

export const BACKUP_GROUPS = ["content", "flashcards", "progress", "users", "logs"] as const;
export type BackupGroup = (typeof BACKUP_GROUPS)[number];

interface GroupDef {
  label: string;
  models: string[];
  /** Only SUPER_ADMIN may export it (personal data / sensitive). */
  superOnly: boolean;
}

/** Model names per group. `AuthSession` (refresh tokens) is never exported. */
export const GROUPS: Record<BackupGroup, GroupDef> = {
  content: { label: "Nội dung học (giáo trình, đơn vị, từ vựng, ngữ pháp)", models: ["Textbook", "Unit", "Vocabulary", "GrammarPoint"], superOnly: false },
  flashcards: { label: "Bộ thẻ & thẻ", models: ["FlashcardDeck", "Flashcard"], superOnly: false },
  progress: { label: "Tiến độ học (SRS, phiên học)", models: ["UserCardProgress", "StudySession"], superOnly: false },
  users: { label: "Người dùng (không gồm mật khẩu / phiên đăng nhập)", models: ["User", "AuthAccount"], superOnly: true },
  logs: { label: "Nhật ký (request, ứng dụng, thao tác admin, IP chặn/cho phép)", models: ["RequestLog", "AppLog", "AuditLog", "BlockedIp", "AllowedIp"], superOnly: true },
};

/** Fields stripped from every exported document. */
const STRIP: Record<string, string[]> = { User: ["passwordHash"] };

@Injectable()
export class BackupService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private modelsOf(group: BackupGroup) {
    return GROUPS[group].models
      .map((n) => this.connection.models[n])
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
  }

  async describe() {
    return Promise.all(
      BACKUP_GROUPS.map(async (key) => {
        const models = this.modelsOf(key);
        const counts = await Promise.all(models.map((m) => m.collection.estimatedDocumentCount().catch(() => 0)));
        return {
          key,
          label: GROUPS[key].label,
          superOnly: GROUPS[key].superOnly,
          collections: models.length,
          documents: counts.reduce((a, b) => a + b, 0),
        };
      }),
    );
  }

  /**
   * Streams one JSON document (`{ meta, collections: { name: [ ...EJSON ] } }`)
   * built incrementally from DB cursors, so memory stays flat on big data.
   * Extended JSON keeps ObjectIds / dates restorable.
   */
  stream(groups: BackupGroup[], by: string): Readable {
    const { EJSON } = mongo.BSON;
    const models = [...new Set(groups.flatMap((g) => this.modelsOf(g)))];
    const meta = {
      app: "nihongo-path",
      createdAt: new Date().toISOString(),
      createdBy: by,
      groups,
      format: "ejson",
    };
    async function* gen() {
      yield `{"meta":${JSON.stringify(meta)},"collections":{`;
      let firstCol = true;
      for (const m of models) {
        yield `${firstCol ? "" : ","}${JSON.stringify(m.collection.name)}:[`;
        firstCol = false;
        const strip = STRIP[m.modelName] ?? [];
        let first = true;
        for await (const doc of m.collection.find({})) {
          for (const f of strip) delete (doc as Record<string, unknown>)[f];
          yield `${first ? "" : ","}${EJSON.stringify(doc, { relaxed: false })}`;
          first = false;
        }
        yield "]";
      }
      yield "}}";
    }
    return Readable.from(gen());
  }
}
