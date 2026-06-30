import { Injectable, BadRequestException, Logger } from '@nestjs/common';

const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'application/'];
const MAX_BASE64_BYTES = 20 * 1024 * 1024;

@Injectable()
export class Base64Converter {
  private readonly logger = new Logger(Base64Converter.name);

  decode(base64: string): { buffer: Buffer; mimeType: string } {
    let mimeType = 'application/octet-stream';
    let raw = base64.trim();

    if (raw.startsWith('data:')) {
      const semi = raw.indexOf(';');
      const comma = raw.indexOf(',');
      if (semi === -1 || comma === -1) {
        throw new BadRequestException('Malformed data URI');
      }
      mimeType = raw.slice(5, semi);
      raw = raw.slice(comma + 1);
    }

    if (!/^[A-Za-z0-9+/=]+$/.test(raw)) {
      throw new BadRequestException('Invalid base64 data');
    }

    const buffer = Buffer.from(raw, 'base64');

    if (buffer.length > MAX_BASE64_BYTES) {
      throw new BadRequestException('Decoded data exceeds 20 MB limit');
    }

    return { buffer, mimeType };
  }

  encode(buffer: Buffer, mimeType = 'application/octet-stream'): string {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  encodeRaw(buffer: Buffer): string {
    return buffer.toString('base64');
  }

  validateMime(mime: string, allowedPrefixes = ALLOWED_MIME_PREFIXES): void {
    const ok = allowedPrefixes.some((p) => mime.startsWith(p));
    if (!ok) {
      throw new BadRequestException(`MIME type not allowed: ${mime}`);
    }
  }
}
