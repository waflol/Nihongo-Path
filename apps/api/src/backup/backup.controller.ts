import { Body, Controller, ForbiddenException, Get, Post, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ArrayNotEmpty, ArrayUnique, IsArray, IsIn } from "class-validator";
import type { Response } from "express";
import { pipeline } from "node:stream";
import { createGzip } from "node:zlib";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { BACKUP_GROUPS, BackupService, GROUPS, type BackupGroup } from "./backup.service.js";

export class BackupDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(BACKUP_GROUPS, { each: true })
  groups: BackupGroup[];
}

@ApiTags("admin-backup")
@ApiBearerAuth()
@Controller("admin/backup")
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get("groups")
  @ContentAdmin()
  @ApiOperation({ summary: "Backup groups with document counts" })
  groups() {
    return this.backup.describe();
  }

  /** POST (not GET) so every download lands in the admin audit trail. */
  @Post()
  @ContentAdmin()
  @ApiOperation({ summary: "Download a gzip'd Extended-JSON backup of the chosen groups" })
  download(@Body() body: BackupDto, @CurrentUser() caller: AuthUser, @Res() res: Response) {
    if (body.groups.some((g) => GROUPS[g].superOnly) && caller.role !== "SUPER_ADMIN") {
      throw new ForbiddenException("Chỉ SUPER_ADMIN được sao lưu người dùng và nhật ký");
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="nihongo-backup-${stamp}.json.gz"`);
    res.setHeader("Cache-Control", "no-store");
    pipeline(this.backup.stream(body.groups, caller.sub), createGzip(), res, () => {
      // client abort / DB error mid-stream: pipeline already tore everything down
    });
  }
}
