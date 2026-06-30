import {
  Injectable,
  BadRequestException,
  Logger,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import * as sharp from 'sharp';

type ImageFormat = 'jpeg' | 'png' | 'webp';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

@Injectable()
export class ImageConverter {
  private readonly logger = new Logger(ImageConverter.name);

  async toPng(buffer: Buffer): Promise<Buffer> {
    this.validate(buffer);
    return sharp(buffer).png().toBuffer();
  }

  async toJpg(buffer: Buffer, quality = 88): Promise<Buffer> {
    this.validate(buffer);
    return sharp(buffer).jpeg({ quality }).toBuffer();
  }

  async toWebp(buffer: Buffer, quality = 85): Promise<Buffer> {
    this.validate(buffer);
    return sharp(buffer).webp({ quality }).toBuffer();
  }

  async convert(buffer: Buffer, format: ImageFormat, quality?: number): Promise<Buffer> {
    this.validate(buffer);
    switch (format) {
      case 'png':
        return this.toPng(buffer);
      case 'jpeg':
        return this.toJpg(buffer, quality);
      case 'webp':
        return this.toWebp(buffer, quality);
      default:
        throw new BadRequestException(`Unsupported target format: ${format}`);
    }
  }

  async resize(
    buffer: Buffer,
    width: number,
    height: number,
    format: ImageFormat = 'png',
  ): Promise<Buffer> {
    this.validate(buffer);
    return sharp(buffer).resize(width, height, { fit: 'inside' }).toFormat(format).toBuffer();
  }

  async metadata(buffer: Buffer): Promise<sharp.Metadata> {
    this.validate(buffer);
    return sharp(buffer).metadata();
  }

  async validateMime(buffer: Buffer, allowedMimes?: string[]): Promise<string> {
    const meta = await sharp(buffer).metadata();
    const mimeMap: Record<string, string> = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    const mime = mimeMap[meta.format ?? ''] ?? 'application/octet-stream';
    const allowed = allowedMimes ?? ALLOWED_MIMES;
    if (!allowed.includes(mime)) {
      throw new UnsupportedMediaTypeException(`Image format not permitted: ${mime}`);
    }
    return mime;
  }

  private validate(buf: Buffer): void {
    if (buf.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image exceeds 20 MB limit');
    }
    if (buf.length === 0) {
      throw new BadRequestException('Empty image buffer');
    }
  }
}
