import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';
import { SecuritySessionsService } from './security-sessions.service';
import { SecurityEvent, SecurityEventSchema } from './schemas/security-event.schema';
import { AuthSession, AuthSessionSchema } from './schemas/auth-session.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: SecurityEvent.name, schema: SecurityEventSchema },
      { name: AuthSession.name, schema: AuthSessionSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [SecurityController],
  providers: [SecurityService, SecuritySessionsService],
  exports: [SecurityService],
})
export class SecurityModule {}
