import { describe, expect, it } from 'vitest';
import { fileExtension, labToolIdForUrl, labToolsAccepting, workspaceInput } from './lab-tools';

const ids = (list: { id: string }[]) => list.map(e => e.id);

describe('lab-tools', () => {
  describe('labToolsAccepting', () => {
    it('suggests the PDF tools for a PDF, excluding the tool it came from', () => {
      expect(ids(labToolsAccepting({ kind: 'file', filename: 'report.PDF' }, 'viewer')))
        .toEqual(['pdf-summary', 'pdf-translate', 'ocr', 'pdf-editor', 'convert']);
    });

    it('suggests the text tools for a text result (e.g. after OCR)', () => {
      expect(ids(labToolsAccepting({ kind: 'text' }, 'ocr'))).toEqual(['ai-formatter', 'editor']);
    });

    it('sends images to OCR and the converter only', () => {
      expect(ids(labToolsAccepting({ kind: 'file', filename: 'scan.jpeg' }))).toEqual(['ocr', 'convert']);
    });

    it('falls back to the MIME type when the file name has no extension', () => {
      expect(ids(labToolsAccepting({ kind: 'file', filename: 'documento', mime: 'application/pdf' }))).toContain('pdf-translate');
    });

    it('offers only the converter for unknown formats', () => {
      expect(ids(labToolsAccepting({ kind: 'file', filename: 'slides.pptx' }))).toEqual(['convert']);
    });
  });

  it('fileExtension handles dots, case and missing extensions', () => {
    expect(fileExtension('a.b.DOCX')).toBe('docx');
    expect(fileExtension('.env')).toBe('');
    expect(fileExtension('fine.')).toBe('');
    expect(fileExtension('x', 'image/png')).toBe('png');
  });

  it('workspaceInput maps workspace items', () => {
    expect(workspaceInput({ kind: 'text', filename: 'ocr.txt' })).toEqual({ kind: 'text' });
    expect(workspaceInput({ kind: 'file', filename: 'a.pdf', mime: 'application/pdf' }))
      .toEqual({ kind: 'file', filename: 'a.pdf', mime: 'application/pdf' });
  });

  it('labToolIdForUrl recognises tool pages in every language, not the /lab index', () => {
    expect(labToolIdForUrl('/lab/ocr')).toBe('ocr');
    expect(labToolIdForUrl('/en/lab/pdf-translate?x=1#y')).toBe('pdf-translate');
    expect(labToolIdForUrl('/lab/i-miei-file')).toBe('my-files');
    expect(labToolIdForUrl('/lab')).toBeNull();
    expect(labToolIdForUrl('/lab/sconosciuto')).toBeNull();
    expect(labToolIdForUrl('/blog/lab/ocr')).toBeNull();
  });
});
