import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const CHUNK_MAX = 450; // MyMemory safe limit for anonymous use

@Injectable()
export class TranslationService {
  async translate(text: string, from: string, to: string): Promise<string> {
    const safeText = text.trim();
    if (!safeText) return '';

    const chunks = this.splitChunks(safeText, CHUNK_MAX);
    const translated: string[] = [];

    for (const chunk of chunks) {
      const url = `${MYMEMORY_URL}?q=${encodeURIComponent(chunk)}&langpair=${from}|${to}`;
      let res: Response;
      try {
        res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      } catch {
        throw new ServiceUnavailableException('Translation service is unreachable.');
      }

      if (!res.ok) {
        throw new ServiceUnavailableException('Translation service returned an error.');
      }

      const json = (await res.json()) as { responseStatus: number; responseData?: { translatedText?: string }; responseDetails?: string };

      if (json.responseStatus !== 200) {
        throw new ServiceUnavailableException(json.responseDetails || 'Translation failed.');
      }

      translated.push(json.responseData?.translatedText ?? chunk);
    }

    return translated.join('\n\n');
  }

  private splitChunks(text: string, max: number): string[] {
    if (text.length <= max) return [text];

    const chunks: string[] = [];
    const paragraphs = text.split(/\n\n+/);
    let current = '';

    for (const para of paragraphs) {
      if (para.length > max) {
        if (current) { chunks.push(current.trim()); current = ''; }
        // Split long paragraph by sentence
        const sentences = para.match(/[^.!?]+[.!?]+[\s]*/g) ?? [para];
        for (const sentence of sentences) {
          if ((current + sentence).length > max) {
            if (current) chunks.push(current.trim());
            current = sentence;
          } else {
            current += sentence;
          }
        }
      } else if (current && (current + '\n\n' + para).length > max) {
        chunks.push(current.trim());
        current = para;
      } else {
        current = current ? current + '\n\n' + para : para;
      }
    }

    if (current.trim()) chunks.push(current.trim());
    return chunks.filter(Boolean);
  }
}
