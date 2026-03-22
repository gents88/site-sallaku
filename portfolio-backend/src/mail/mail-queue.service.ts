import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

interface ContactJobPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
  contactId?: string;
}

@Injectable()
export class MailQueueService implements OnModuleInit {
  private readonly logger = new Logger(MailQueueService.name);
  private inProcess = false;
  private queue: ContactJobPayload[] = [];
  private readonly useRedis: boolean;

  constructor(private mail: MailService, private cfg: ConfigService) {
    this.useRedis = !!this.cfg.get<string>('REDIS_URL');
    if (this.useRedis) {
      this.logger.log('REDIS_URL detected — production queueing enabled (Bull expected).');
      // If Bull is installed and configured the queue initialization could go here.
      // For portability we default to an in-process fallback if Bull is not available.
    } else {
      this.logger.log('No REDIS_URL — using in-process mail queue fallback.');
    }
  }

  onModuleInit() {
    // start background processor loop for in-process queue
    if (!this.useRedis) this.processLoop();
  }

  async enqueueContact(payload: ContactJobPayload) {
    if (this.useRedis) {
      // TODO: add Bull queue push when redis is available. For now push to local queue.
      this.logger.debug('enqueueContact: REDIS requested but Bull not wired — falling back to in-process push');
    }

    this.queue.push(payload);
    // ensure processor is running
    if (!this.inProcess) this.processLoop();
  }

  private async processLoop() {
    if (this.inProcess) return;
    this.inProcess = true;

    while (this.queue.length) {
      const job = this.queue.shift();
      if (!job) break;
      try {
        this.logger.log(`Processing contact job for ${job.email}`);
        const delivery = await this.mail.sendContactNotification(job);
        if (!delivery.success) {
          this.logger.error(`Contact notification failed for ${job.email} — will retry later`);
          // naive retry: push back to queue tail for retry
          this.queue.push(job);
        } else {
          this.logger.log(`Contact notification delivered for ${job.email}`);
          // best-effort auto-reply
          void this.mail.sendContactAutoReply(job.name, job.email);
        }
      } catch (err) {
        this.logger.error('Error while processing contact job', err as any);
        // requeue with backoff: place at tail
        this.queue.push(job);
      }
      // small delay to avoid CPU spin under burst
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    this.inProcess = false;
  }
}
