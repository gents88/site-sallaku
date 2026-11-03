import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuditModule } from '../audit/audit.module';
import { User, UserSchema } from './schemas/user.schema';
import { AuthSession, AuthSessionSchema } from '../security/schemas/auth-session.schema';
import { SavedResult, SavedResultSchema } from '../saved-results/schemas/saved-result.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      // Le sessioni vivono qui solo per chiuderle quando cambiano password, ruolo o l'utente sparisce.
      { name: AuthSession.name, schema: AuthSessionSchema },
      // I file salvati si cancellano insieme all'account (DELETE /auth/me).
      { name: SavedResult.name, schema: SavedResultSchema },
    ]),
    AuditModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
