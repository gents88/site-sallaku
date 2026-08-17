import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Cloudflare Turnstile verification, guarding the public forms (contact,
 * notes, testimonials) against automated submissions on top of the existing
 * honeypot + rate-limiting.
 *
 * No-op by design when `TURNSTILE_SECRET_KEY` isn't configured — same
 * pattern as CacheService's Redis fallback: the site keeps working before
 * the admin sets up Cloudflare Turnstile keys, it just runs without this
 * extra layer until then.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly secretKey?: string;

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.get<string>('TURNSTILE_SECRET_KEY');
    if (!this.secretKey) {
      this.logger.warn('TURNSTILE_SECRET_KEY not set — Turnstile verification is a no-op until configured.');
    }
  }

  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (!this.secretKey) return true;
    if (!token) return false;

    try {
      const body = new URLSearchParams({ secret: this.secretKey, response: token });
      if (remoteIp) body.set('remoteip', remoteIp);

      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        this.logger.warn(`Turnstile verify endpoint returned ${res.status}`);
        return false;
      }

      const data = (await res.json()) as TurnstileVerifyResponse;
      if (!data.success) {
        this.logger.debug(`Turnstile rejected token: ${(data['error-codes'] ?? []).join(', ')}`);
      }
      return data.success === true;
    } catch (err) {
      this.logger.warn('Turnstile verify request failed', err instanceof Error ? err.message : err);
      return false;
    }
  }
}
