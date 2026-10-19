import { FormControl } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { isSafeLinkedinProfileUrl, linkedinProfileValidator, normalizeLinkedinProfileUrl } from './linkedin-url';

const OK = 'https://www.linkedin.com/in/mario-rossi';

describe('normalizeLinkedinProfileUrl', () => {
  it.each([
    'https://www.linkedin.com/in/mario-rossi',
    'linkedin.com/in/mario-rossi',
    'www.linkedin.com/in/mario-rossi/',
    'https://it.linkedin.com/in/mario-rossi?trk=x#top',
    'HTTP://LINKEDIN.COM/in/mario-rossi/details/experience',
  ])('normalizza %s', input => expect(normalizeLinkedinProfileUrl(input)).toBe(OK));

  it.each([
    'https://linkedin.com.evil.example/in/mario-rossi',
    'https://notlinkedin.com/in/mario-rossi',
    'https://www.linkedin.com/company/acme',
    'https://user:pass@www.linkedin.com/in/mario-rossi',
    'https://www.linkedin.com:8443/in/mario-rossi',
    'https://www.linkedin.com/in/ab',
    'javascript://www.linkedin.com/in/mario-rossi',
    'mario rossi',
    '',
  ])('rifiuta %s', input => expect(normalizeLinkedinProfileUrl(input)).toBeNull());
});

describe('linkedinProfileValidator', () => {
  it('il campo vuoto è valido (facoltativo)', () => {
    expect(linkedinProfileValidator(new FormControl(''))).toBeNull();
    expect(linkedinProfileValidator(new FormControl('   '))).toBeNull();
    expect(linkedinProfileValidator(new FormControl(null))).toBeNull();
  });

  it('accetta un profilo e rifiuta altri link', () => {
    expect(linkedinProfileValidator(new FormControl('linkedin.com/in/mario-rossi'))).toBeNull();
    expect(linkedinProfileValidator(new FormControl('https://evil.example/in/mario-rossi'))).toEqual({ linkedin: true });
  });
});

describe('isSafeLinkedinProfileUrl', () => {
  it('vero solo per l\'URL già normalizzato', () => {
    expect(isSafeLinkedinProfileUrl(OK)).toBe(true);
    expect(isSafeLinkedinProfileUrl('linkedin.com/in/mario-rossi')).toBe(false);
    expect(isSafeLinkedinProfileUrl('https://www.linkedin.com/in/mario-rossi/')).toBe(false);
    expect(isSafeLinkedinProfileUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeLinkedinProfileUrl(undefined)).toBe(false);
  });
});
