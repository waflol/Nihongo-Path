import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { ContentAdmin, Roles } from "../auth/decorators/roles.decorator.js";
import { attachAuditNote, type AuditRequest } from "../logs/audit-note.js";
import { AdminUsersService } from "./admin-users.service.js";
import { USER_STATUSES, type UserStatus } from "./schemas/user.schema.js";

export class ListUsersQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  /** Matches email or display name. */
  @IsOptional() @IsString() @MaxLength(100)
  q?: string;

  @IsOptional() @IsIn(["USER", "ADMIN", "SUPER_ADMIN"])
  role?: string;

  @IsOptional() @IsIn(USER_STATUSES)
  status?: string;
}

export class SetStatusDto {
  @IsIn(USER_STATUSES)
  status: UserStatus;
}

export class SetRoleDto {
  @IsIn(["USER", "ADMIN"])
  role: "USER" | "ADMIN";
}

export class CreateAdminDto {
  @IsEmail() @MaxLength(320)
  email: string;

  @IsString() @MinLength(8) @MaxLength(200)
  password: string;

  @IsOptional() @IsString() @MaxLength(120)
  displayName?: string;
}

export class SetPasswordDto {
  @IsString() @MinLength(8) @MaxLength(200)
  password: string;
}

@ApiTags("admin-users")
@ApiBearerAuth()
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get()
  @ContentAdmin()
  @ApiOperation({ summary: "List users with status, role and last activity" })
  list(@Query() query: ListUsersQuery) {
    return this.service.list(query);
  }

  @Get("summary")
  @ContentAdmin()
  @ApiOperation({ summary: "User counts: total / active / suspended / admins / online" })
  summary() {
    return this.service.summary();
  }

  @Post()
  @Roles("SUPER_ADMIN")
  @ApiOperation({ summary: "Create an ADMIN account with email + password (SUPER_ADMIN only)" })
  createAdmin(@Body() body: CreateAdminDto) {
    return this.service.createAdmin(body);
  }

  @Patch(":id/password")
  @ContentAdmin()
  @ApiOperation({ summary: "Set a new password for an account (logs it out everywhere)" })
  async setPassword(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: SetPasswordDto,
    @Req() req: AuditRequest,
  ) {
    // P5-ADMIN-03: record who reset which account's credential.
    attachAuditNote(req, {
      before: { id },
      after: { id, credential: "password" },
      summary: "password reset for a user account",
    });
    return this.service.setPassword(caller, id, body.password);
  }

  @Patch(":id/status")
  @ContentAdmin()
  @ApiOperation({ summary: "Suspend or re-activate an account (suspend also logs it out)" })
  async setStatus(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: SetStatusDto,
    @Req() req: AuditRequest,
  ) {
    // P5-ADMIN-03: before/after status snapshot for the audit row.
    const before = await this.service.readFields(id, ["status"]);
    attachAuditNote(req, {
      before: { id, status: before.status },
      after: { id, status: body.status },
      summary: `status: ${before.status ?? "?"} → ${body.status}`,
    });
    return this.service.setStatus(caller, id, body.status);
  }

  @Patch(":id/role")
  @Roles("SUPER_ADMIN")
  @ApiOperation({ summary: "Grant / revoke ADMIN (SUPER_ADMIN only; self-changes refused)" })
  async setRole(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Body() body: SetRoleDto,
    @Req() req: AuditRequest,
  ) {
    // P5-ADMIN-02/03: least-privilege enforced in the service (SUPER_ADMIN
    // only, self refused); the before/after snapshot lands in the audit row.
    const before = await this.service.readFields(id, ["role"]);
    attachAuditNote(req, {
      before: { id, role: before.role },
      after: { id, role: body.role },
      summary: `role: ${before.role ?? "?"} → ${body.role}`,
    });
    return this.service.setRole(caller, id, body.role);
  }

  @Post(":id/revoke-sessions")
  @ContentAdmin()
  @ApiOperation({ summary: "Force logout: revoke all of a user's refresh sessions" })
  async revokeSessions(
    @CurrentUser() caller: AuthUser,
    @Param("id") id: string,
    @Req() req: AuditRequest,
  ) {
    attachAuditNote(req, {
      before: { id },
      after: { id, revoked: "all sessions" },
      summary: "sessions revoked for a user account",
    });
    return this.service.revokeSessions(caller, id);
  }
}
