import { Module, Global } from '@nestjs/common';
import { MailService } from './mail.service';

/** Global so any module can inject MailService without re-importing */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
