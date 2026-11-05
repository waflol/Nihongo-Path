import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { AuthUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { ContentAdmin, Roles } from "../auth/decorators/roles.decorator.js";
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

  @Patch(":id/status")
  @ContentAdmin()
  @ApiOperation({ summary: "Suspend or re-activate an account (suspend also logs it out)" })
  setStatus(@CurrentUser() caller: AuthUser, @Param("id") id: string, @Body() body: SetStatusDto) {
    return this.service.setStatus(caller, id, body.status);
  }

  @Patch(":id/role")
  @Roles("SUPER_ADMIN")
  @ApiOperation({ summary: "Grant / revoke ADMIN (SUPER_ADMIN only)" })
  setRole(@CurrentUser() caller: AuthUser, @Param("id") id: string, @Body() body: SetRoleDto) {
    return this.service.setRole(caller, id, body.role);
  }

  @Post(":id/revoke-sessions")
  @ContentAdmin()
  @ApiOperation({ summary: "Force logout: revoke all of a user's refresh sessions" })
  revokeSessions(@CurrentUser() caller: AuthUser, @Param("id") id: string) {
    return this.service.revokeSessions(caller, id);
  }
}
