import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { ADMIN_PASSWORD_MIN } from './password-policy';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.configService.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.configService.get<string>('ADMIN_PASSWORD');
    const name = this.configService.get<string>('ADMIN_NAME', 'Gent Sallaku');

    if (!email || !password) {
      this.logger.log('ADMIN_EMAIL / ADMIN_PASSWORD not configured, skipping admin bootstrap');
      return;
    }

    if (password.length < ADMIN_PASSWORD_MIN) {
      this.logger.warn(
        `ADMIN_PASSWORD è di ${password.length} caratteri: per un account admin ne servono almeno ${ADMIN_PASSWORD_MIN}. ` +
          `Cambiala in ~/app/shared/backend.env (viene riapplicata a ogni avvio) e riavvia il backend.`,
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await this.usersService.upsertAdmin({
      name,
      email,
      passwordHash,
      role: 'admin',
    });

    this.logger.log(`Admin account ensured for ${email}`);
  }
}