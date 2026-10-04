import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageLimitDto } from '../../common/dto/pagination.dto';
import { Role } from '../../auth/decorators/roles.decorator';

export class UsersAdminQueryDto extends PageLimitDto {
  @ApiPropertyOptional({ description: 'Cerca in nome, email, telefono' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsIn(Object.values(Role))
  role?: Role;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: Role })
  @IsIn(Object.values(Role))
  role: Role;
}
