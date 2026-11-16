import {
  BadRequestException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import webpush, { WebPushError } from "web-push";
import type { AuthUser } from "../auth/auth.types.js";
import { SrsService } from "../srs/srs.service.js";
import { localDayKey } from "../srs/srs.days.js";
import { User, type UserDocument } from "../users/schemas/user.schema.js";
import { isAllowedPushEndpoint } from "./push-endpoint.js";
import { PushSubscription, type PushSubscriptionDocument } from "./schemas/push-subscription.schema.js";

/** How often the reminder pass runs. Reminders land within this window after the chosen hour. */
const TICK_MS = 5 * 60_000;

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** VAPID keys from the env, or null when Web Push is not configured. */
export function readPushConfig(): PushConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT?.trim() || "mailto:admin@nihongo-path.local",
  };
}

export interface SubscribeInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  hour: number;
  timezone: string;
  userAgent?: string;
}

/** What the notification shows; read by public/sw.js in apps/ui. */
interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Daily review reminder over Web Push (docs/plans/plan-pwa.md, P2).
 *
 * Every TICK_MS it looks for subscriptions whose local hour has passed and
 * that have not had today's pass yet, claims each one atomically (so a
 * restart or an overlapping tick never sends twice), and sends
 * "N từ cần ôn hôm nay" when the user has words due. Nothing due → no
 * notification, but the day is still marked done.
 */
@Injectable()
export class NotificationsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly config: PushConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectModel(PushSubscription.name)
    private readonly subs: Model<PushSubscriptionDocument>,
    @InjectModel(User.name)
    private readonly users: Model<UserDocument>,
    private readonly srs: SrsService,
  ) {
    const config = readPushConfig();
    // The module is only built when the keys exist (notifications.module.ts).
    if (!config) throw new Error("NotificationsService needs VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY");
    this.config = config;
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    // First pass shortly after boot, so a restart at 20:03 still sends 20:00's reminders.
    setTimeout(() => void this.tick(), 30_000).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  get publicKey(): string {
    return this.config.publicKey;
  }

  async subscribe(caller: AuthUser, input: SubscribeInput): Promise<{ hour: number; timezone: string }> {
    if (!isAllowedPushEndpoint(input.endpoint)) {
      throw new BadRequestException("Địa chỉ push không hợp lệ");
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
    } catch {
      throw new BadRequestException(`Unknown time zone: ${input.timezone}`);
    }
    // Same browser → same endpoint: update in place (also moves it to the
    // account now signed in on that browser).
    await this.subs.updateOne(
      { endpoint: input.endpoint },
      {
        $set: {
          user: new Types.ObjectId(caller.sub),
          p256dh: input.p256dh,
          auth: input.auth,
          hour: input.hour,
          timezone: input.timezone,
          userAgent: input.userAgent?.slice(0, 300) ?? null,
        },
        // A fresh subscription after today's hour should not fire right away.
        $setOnInsert: { lastSentDay: localDayKey(Date.now(), input.timezone) },
      },
      { upsert: true },
    );
    return { hour: input.hour, timezone: input.timezone };
  }

  /** The caller's subscription for this browser, if any. */
  async find(caller: AuthUser, endpoint: string): Promise<{ hour: number; timezone: string } | null> {
    const doc = await this.subs
      .findOne({ endpoint, user: new Types.ObjectId(caller.sub) })
      .select("hour timezone")
      .lean()
      .exec();
    return doc ? { hour: doc.hour, timezone: doc.timezone } : null;
  }

  async unsubscribe(caller: AuthUser, endpoint: string): Promise<void> {
    await this.subs.deleteOne({ endpoint, user: new Types.ObjectId(caller.sub) });
  }

  /** Send a test notification to this browser's subscription right now. */
  async sendTest(caller: AuthUser, endpoint: string): Promise<void> {
    const doc = await this.subs.findOne({ endpoint, user: new Types.ObjectId(caller.sub) }).exec();
    if (!doc) throw new BadRequestException("Trình duyệt này chưa bật nhắc ôn tập");
    const due = await this.dueCount(doc.user);
    const ok = await this.send(doc, {
      title: "Nihongo Path — thông báo thử",
      body: due > 0 ? `Thông báo đã hoạt động. Hiện bạn có ${due} từ cần ôn.` : "Thông báo đã hoạt động.",
      url: "/learn/review",
      tag: "test",
    });
    if (!ok) throw new BadRequestException("Không gửi được — hãy tắt rồi bật lại nhắc ôn tập");
  }

  /** One reminder pass. Public for tests; normally driven by the timer. */
  async tick(now = Date.now()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const candidates = await this.subs.find({}).select("_id hour timezone lastSentDay").lean().exec();
      const dueCounts = new Map<string, number>();
      for (const c of candidates) {
        let today: string;
        let hour: number;
        try {
          today = localDayKey(now, c.timezone);
          hour = localHour(now, c.timezone);
        } catch {
          continue; // zone validated on write; skip anything odd
        }
        if (c.lastSentDay === today || hour < c.hour) continue;

        // Claim today's pass for this device; another tick/process loses the race.
        const claimed = await this.subs
          .findOneAndUpdate(
            { _id: c._id, lastSentDay: { $ne: today } },
            { $set: { lastSentDay: today } },
            { new: true },
          )
          .exec();
        if (!claimed) continue;

        const userKey = String(claimed.user);
        let due = dueCounts.get(userKey);
        if (due === undefined) {
          due = await this.dueCount(claimed.user);
          dueCounts.set(userKey, due);
        }
        if (due <= 0) continue;
        await this.send(claimed, {
          title: "Đến giờ ôn tập rồi!",
          body: `Hôm nay bạn có ${due} từ cần ôn. Chỉ mất vài phút thôi.`,
          url: "/learn/review",
          tag: "review-reminder",
        });
      }
    } catch (err) {
      this.logger.error(`reminder pass failed: ${(err as Error).message}`, (err as Error).stack);
    } finally {
      this.running = false;
    }
  }

  /** Words due today for one user, from the same queue the review page uses. */
  private async dueCount(userId: Types.ObjectId): Promise<number> {
    const user = await this.users.findById(userId).select("role lang status").lean().exec();
    if (!user || (user as { status?: string }).status === "disabled") return 0;
    const caller: AuthUser = { sub: String(userId), role: user.role, lang: user.lang ?? "vi" };
    const queue = await this.srs.getQueue(caller, "all", undefined, 1, "review");
    return queue.counts.due;
  }

  /** Deliver one push. Drops the subscription when the push service says it is gone. */
  private async send(doc: PushSubscriptionDocument, payload: PushPayload): Promise<boolean> {
    try {
      await webpush.sendNotification(
        { endpoint: doc.endpoint, keys: { p256dh: doc.p256dh, auth: doc.auth } },
        JSON.stringify(payload),
        { TTL: 6 * 3600, urgency: "normal", topic: payload.tag },
      );
      return true;
    } catch (err) {
      if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
        await this.subs.deleteOne({ _id: doc._id });
        this.logger.log(`removed expired push subscription ${String(doc._id)}`);
      } else {
        this.logger.warn(`push send failed: ${(err as Error).message}`);
      }
      return false;
    }
  }
}

/** Local wall-clock hour (0–23) of `epochMs` in `timeZone`. */
function localHour(epochMs: number, timeZone: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" })
    .formatToParts(epochMs)
    .find((p) => p.type === "hour")?.value;
  return Number(h ?? 0);
}
