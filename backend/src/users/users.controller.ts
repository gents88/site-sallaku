import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { AuditInterceptor } from '../audit/interceptors/audit.interceptor';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { UsersService } from './users.service';
import { CreateUserDto, SetPasswordDto, UpdateUserDto, UpdateUserRoleDto, UsersAdminQueryDto } from './dto/users-admin.dto';

interface AuthedRequest {
  user: { _id: unknown };
}

/** Gestione utenti per la dashboard admin (/dashboard/users). */
@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@UseInterceptors(AuditInterceptor)
@Controller('admin/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (admin)' })
  list(@Query() { page, limit, q, role }: UsersAdminQueryDto) {
    return this.users.findPaginated({ page: page ?? 1, limit: limit ?? 20, q, role });
  }

  @Post()
  @ApiOperation({ summary: 'Create a user (admin)' })
  create(@Body() dto: CreateUserDto) {
    return this.users.createByAdmin(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit name, email, phone, email verification (admin)' })
  update(@Param('id', ParseMongoIdPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.updateByAdmin(id, dto);
  }

  @Post(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password and end all sessions (admin)' })
  setPassword(@Param('id', ParseMongoIdPipe) id: string, @Body() dto: SetPasswordDto) {
    return this.users.setPasswordByAdmin(id, dto.password);
  }

  @Post(':id/revoke-sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Log the user out everywhere (admin; not self)' })
  revokeSessions(@Req() req: AuthedRequest, @Param('id', ParseMongoIdPipe) id: string) {
    return this.users.revokeSessions(String(req.user._id), id);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Change a user role (admin; not self, not the last admin)' })
  updateRole(@Req() req: AuthedRequest, @Param('id', ParseMongoIdPipe) id: string, @Body() dto: UpdateUserRoleDto) {
    return this.users.updateRole(String(req.user._id), id, dto.role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user (admin; not self, not the last admin)' })
  remove(@Req() req: AuthedRequest, @Param('id', ParseMongoIdPipe) id: string) {
    return this.users.removeByAdmin(String(req.user._id), id);
  }
}
