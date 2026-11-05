import { Type } from "class-transformer";
import { IsIP, IsIn, IsInt, IsOptional, Matches, IsString, Max, MaxLength, Min } from "class-validator";

export const RANGES = ["day", "week", "month"] as const;
export type Range = (typeof RANGES)[number];

/** `?range=day|week|month` — last 24 h / 7 days / 30 days. */
export class RangeQuery {
  @IsOptional()
  @IsIn(RANGES)
  range?: Range;

  /** A specific day, `YYYY-MM-DD` (Asia/Ho_Chi_Minh); overrides `range`. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}

export class ListLogsQuery extends RangeQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Substring match on the request path. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(["GET", "POST", "PUT", "PATCH", "DELETE"])
  method?: string;

  @IsOptional()
  @IsIn(["2xx", "3xx", "4xx", "5xx"])
  statusClass?: string;
}

export class ListAppLogsQuery extends RangeQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Substring match on message / context. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(["log", "warn", "error"])
  level?: string;
}

export class ExportQuery extends RangeQuery {
  @IsIn(["requests", "app", "audit"])
  type: "requests" | "app" | "audit";

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(["GET", "POST", "PUT", "PATCH", "DELETE"])
  method?: string;

  @IsOptional()
  @IsIn(["2xx", "3xx", "4xx", "5xx"])
  statusClass?: string;

  @IsOptional()
  @IsIn(["log", "warn", "error"])
  level?: string;
}

export class ListAuditQuery extends RangeQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Substring match on the path. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(["POST", "PUT", "PATCH", "DELETE"])
  method?: string;
}

export class AllowIpDto {
  @IsIP()
  ip: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class BlockIpDto {
  @IsIP()
  ip: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  /** Block duration in minutes; omit for a permanent block. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60 * 24 * 365)
  minutes?: number;
}

export class SimulateDto {
  /** Number of requests the fake client sends. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  requests: number;

  /** Gap between fake requests (ms); 0 = all at once. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60000)
  intervalMs?: number;
}
