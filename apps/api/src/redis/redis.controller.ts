import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query, ServiceUnavailableException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { RedisService } from "./redis.service.js";

/** Admin view of Redis: status, keys, running tasks, and clearing. */
@ApiTags("redis")
@ApiBearerAuth()
@Controller("admin/redis")
export class RedisController {
  constructor(private readonly redis: RedisService) {}

  /** Redis errors become a readable 503 instead of a bare 500. */
  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw new ServiceUnavailableException((e as Error).message);
    }
  }

  @Get("status")
  @ContentAdmin()
  @ApiOperation({ summary: "Redis connection status (version, memory, key count)" })
  status() {
    return this.redis.status();
  }

  @Get("summary")
  @ContentAdmin()
  @ApiOperation({ summary: "Counts: running tasks, cards waiting, saved answers" })
  summary() {
    return this.guard(() => this.redis.summary());
  }

  @Get("keys")
  @ContentAdmin()
  @ApiOperation({ summary: "One SCAN page of keys (type, TTL, size)" })
  keys(@Query("match") match?: string, @Query("cursor") cursor?: string, @Query("count") count?: string) {
    return this.guard(() => this.redis.scan(match?.trim() || "*", cursor || "0", Number(count) || 100));
  }

  @Get("key")
  @ContentAdmin()
  @ApiOperation({ summary: "Value of one key" })
  key(@Query("key") key?: string) {
    if (!key) throw new BadRequestException("key required");
    return this.guard(() => this.redis.inspect(key));
  }

  @Delete("key")
  @ContentAdmin()
  @ApiOperation({ summary: "Delete one key" })
  deleteKey(@Query("key") key?: string) {
    if (!key) throw new BadRequestException("key required");
    return this.guard(async () => ({ deleted: await this.redis.deleteKey(key) }));
  }

  @Post("delete-pattern")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "Delete every key matching a pattern (e.g. np:ai:*)" })
  deletePattern(@Body() body: { match?: string }) {
    const match = body?.match?.trim();
    if (!match || match === "*") throw new BadRequestException("Dùng 'Xoá toàn bộ' để làm trống Redis");
    return this.guard(async () => ({ deleted: await this.redis.deletePattern(match) }));
  }

  @Post("flush")
  @HttpCode(HttpStatus.OK)
  @ContentAdmin()
  @ApiOperation({ summary: "Empty the Redis database (FLUSHDB). Body must be { confirm: 'FLUSHDB' }" })
  flush(@Body() body: { confirm?: string }) {
    if (body?.confirm !== "FLUSHDB") throw new BadRequestException("Cần xác nhận FLUSHDB");
    return this.guard(async () => {
      await this.redis.flush();
      return { ok: true };
    });
  }

  @Get("tasks")
  @ContentAdmin()
  @ApiOperation({ summary: "Tasks running now (AI batches)" })
  tasks() {
    return this.guard(() => this.redis.runningTasks());
  }
}
