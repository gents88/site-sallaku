import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ProfilePhotoComponent } from './profile-photo.component';

describe('ProfilePhotoComponent', () => {
  it('mostra la foto profilo in avif/webp con ripiego jpg, decorativa', () => {
    const fixture = TestBed.createComponent(ProfilePhotoComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(Array.from(el.querySelectorAll('source')).map(s => s.getAttribute('srcset'))).toEqual(['assets/profil.avif', 'assets/profil.webp']);
    const img = el.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('assets/profil-440.jpg');
    expect(img.getAttribute('alt')).toBe('');
  });
});
