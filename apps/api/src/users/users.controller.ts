import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Delete,
  Patch,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser, PublicUser } from "../auth/auth.types.js";
import { UsersService } from "./users.service.js";
import { AccountDeletionService } from "./account-deletion.service.js";

/** Own-profile self-service — no foreign ids, no role/status writes. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  /** BCP-47 tag; free-form for now (P2-CONTENT-05 / Q-21). */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  lang?: string;

  /** IANA time zone id, e.g. `Asia/Ho_Chi_Minh` (P3-SRS-05). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

/** Body of `DELETE /users/me`. */
export class DeleteAccountDto {
  /** Must equal `XOA TAI KHOAN`. */
  @IsString()
  confirm!: string;

  /** Required when the account has a password (email sign-up). */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  password?: string;
}

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly deletion: AccountDeletionService,
  ) {}

  @Get("me")
  @ApiOperation({ summary: "Read the caller's own profile" })
  @ApiResponse({ status: 200, description: "Own profile" })
  me(@CurrentUser() caller: AuthUser) {
    return this.usersService.me(caller);
  }

  @Patch("me")
  @ApiOperation({ summary: "Update the caller's own profile" })
  @ApiResponse({ status: 200, description: "Updated profile" })
  @HttpCode(HttpStatus.OK)
  updateMe(
    @CurrentUser() caller: AuthUser,
    @Body() body: UpdateProfileDto,
  ): Promise<PublicUser> {
    return this.usersService.updateProfile(caller, body);
  }

  @Delete("me")
  @ApiOperation({
    summary: "Permanently delete the caller's own account and personal data",
    description: "SUPER_ADMIN accounts are refused (403). Accounts with a password must send it.",
  })
  @ApiResponse({ status: 200, description: "Account and data deleted" })
  @ApiResponse({ status: 403, description: "SUPER_ADMIN cannot self-delete" })
  @HttpCode(HttpStatus.OK)
  deleteMe(@CurrentUser() caller: AuthUser, @Body() body: DeleteAccountDto) {
    return this.deletion.deleteMe(caller, body);
  }
}
