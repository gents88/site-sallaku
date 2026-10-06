import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Foto profilo di Gent (la stessa della home), che riempie il contenitore
 * tondo in cui viene messa: avatar della card di login e, da admin, della
 * navbar, della finestra account e della chat dell'assistente.
 * Decorativa: il nome è sempre scritto accanto, quindi alt vuoto.
 */
@Component({
  selector: 'app-profile-photo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <picture>
      <source srcset="assets/profil.avif" type="image/avif" />
      <source srcset="assets/profil.webp" type="image/webp" />
      <img src="assets/profil-440.jpg" alt="" width="440" height="440" decoding="async" />
    </picture>
  `,
  styles: [`
    :host, picture, img { display: block; width: 100%; height: 100%; }
    img { border-radius: 50%; object-fit: cover; object-position: center top; }
  `],
})
export class ProfilePhotoComponent {}
