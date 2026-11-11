import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import { KanjiService } from "./kanji.service.js";

export type MaziiSyncStatus = "running" | "paused" | "done" | "cancelled";

export interface MaziiSyncLog {
  at: number;
  char: string;
  ok: boolean;
  message: string;
}

export interface MaziiSyncJob {
  id: string;
  status: MaziiSyncStatus;
  total: number;
  done: number;
  ok: number;
  failed: number;
  current: string;
  startedAt: number;
  finishedAt?: number;
  log: MaziiSyncLog[];
}

const DELAY_MS = 400;
const MAX_LOG = 1000;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Background "update Hán Việt / On / Kun from Mazii" run. In memory, one job at
 * a time: the admin UI polls `current()`, so the run survives page changes and
 * can be paused, resumed or cancelled.
 */
@Injectable()
export class MaziiSyncService {
  private readonly logger = new Logger(MaziiSyncService.name);
  private job: MaziiSyncJob | null = null;
  private cancelFlag = false;

  constructor(private readonly kanji: KanjiService) {}

  current(): MaziiSyncJob | null {
    return this.job;
  }

  start(chars: string[]): MaziiSyncJob {
    if (this.job && (this.job.status === "running" || this.job.status === "paused")) {
      throw new ConflictException("Đang có một lượt cập nhật Mazii chạy");
    }
    const list = [...new Set(chars.map((c) => c.trim()).filter(Boolean))];
    if (list.length === 0) throw new BadRequestException("Chưa chọn chữ Kanji nào");
    const job: MaziiSyncJob = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      status: "running",
      total: list.length,
      done: 0,
      ok: 0,
      failed: 0,
      current: "",
      startedAt: Date.now(),
      log: [],
    };
    this.job = job;
    this.cancelFlag = false;
    void this.run(job, list);
    return job;
  }

  pause(): MaziiSyncJob {
    const job = this.active();
    if (job.status === "running") job.status = "paused";
    return job;
  }

  resume(): MaziiSyncJob {
    const job = this.active();
    if (job.status === "paused") job.status = "running";
    return job;
  }

  cancel(): MaziiSyncJob {
    const job = this.active();
    this.cancelFlag = true;
    return job;
  }

  /** Drop a finished job (its card on the UI). */
  dismiss(): void {
    if (this.job && this.job.status !== "running" && this.job.status !== "paused") this.job = null;
  }

  private active(): MaziiSyncJob {
    if (!this.job || (this.job.status !== "running" && this.job.status !== "paused")) {
      throw new BadRequestException("Không có lượt cập nhật Mazii nào đang chạy");
    }
    return this.job;
  }

  private push(job: MaziiSyncJob, char: string, ok: boolean, message: string) {
    job.log.push({ at: Date.now(), char, ok, message });
    if (job.log.length > MAX_LOG) job.log.splice(0, job.log.length - MAX_LOG);
  }

  private async run(job: MaziiSyncJob, chars: string[]): Promise<void> {
    try {
      for (const char of chars) {
        while (job.status === "paused" && !this.cancelFlag) await wait(300);
        if (this.cancelFlag) break;
        job.current = char;
        try {
          const m = await this.kanji.syncFromMazii(char);
          job.ok++;
          this.push(
            job,
            char,
            true,
            `Hán Việt: ${m.hanViet || "—"} · On: ${m.onyomi.join(" ") || "—"} · Kun: ${m.kunyomi.join(" ") || "—"}`,
          );
        } catch (err) {
          job.failed++;
          this.push(job, char, false, err instanceof Error ? err.message : "Lỗi không rõ");
        }
        job.done++;
        await wait(DELAY_MS);
      }
    } catch (err) {
      this.logger.error(`Mazii sync crashed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      job.status = this.cancelFlag ? "cancelled" : "done";
      job.current = "";
      job.finishedAt = Date.now();
    }
  }
}
