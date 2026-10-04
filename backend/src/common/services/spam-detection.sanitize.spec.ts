import { SpamDetectionService } from './spam-detection.service';

/**
 * Esegue sanitize-html vero (non mockato): con il vecchio `import x from`
 * sanitizeContent lanciava sempre TypeError, e testimonianze/note
 * fallivano in produzione mentre i test — che lo mockavano — passavano.
 */
describe('SpamDetectionService.sanitizeContent (real sanitize-html)', () => {
  it('strips every tag and keeps the text', () => {
    const service = new SpamDetectionService();
    expect(service.sanitizeContent('<b>Ottimo</b> lavoro<script>alert(1)</script>')).toBe('Ottimo lavoro');
  });
});
