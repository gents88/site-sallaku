# Mobile Testing Guide

Guida per testare la responsività mobile e l'usabilità del portfolio su device reali.

## Prima di Testare

1. **Fare un build pulito**:
   ```bash
   npm run deploy:prep
   ```

2. **Aprire il file su un server locale** (o il sito live):
   - Live: `https://gentsallaku.it/`
   - Locale: `http://localhost:4200/` (se `ng serve` è attivo)

3. **Aprire DevTools Chrome/Safari** sul device:
   - Chrome: Menu → More Tools → Developer Tools (o F12)
   - Safari: Menu → Develop → Show Web Inspector

---

## Test Checklist - Hamburger Menu

### Tap Target Size
- ✓ Hamburger button deve avere **minimo 48x48px** (ora: 48x48px con padding 12px)
- ✓ Il pulsante deve essere facile da premere con un dito su mobile
- ✓ Deve avere feedback visivo (hover: background color, focus: outline)

**Come testare**:
1. Apri il sito su mobile (landscape e portrait)
2. Premi l'hamburger menu con il dito
3. Deve essere facile toccare, senza toccare altri elementi

### Animazione Menu Aperto
- ✓ Menu deve scorrere in giù smooth (0.3s ease-out)
- ✓ Deve avere `aria-expanded="true"` quando aperto, `"false"` quando chiuso
- ✓ Non deve avere flicker o lag

**Come testare**:
1. Premi l'hamburger
2. Vedi il menu scorrere da top con fade-in smooth
3. Premi di nuovo per chiudere

### Menu Links Tap Target
- ✓ Ogni link deve avere **minimo 48px di altezza** (ora: min-height 48px, padding 16px 24px)
- ✓ Margine tra i link: 12px (gap tra elementi)
- ✓ Font size su mobile: 1.1rem
- ✓ Testo centrato e leggibile

**Come testare**:
1. Apri il menu
2. Tocca ogni link (About, Tech Stack, Projects, etc.)
3. Deve essere facile colpire il bersaglio senza toccare link adiacenti

### Accessibility
- ✓ Hamburger ha `aria-label="Toggle navigation menu"`
- ✓ Menu ha `id="nav-menu"` e `role="navigation"`
- ✓ Hamburger ha `aria-expanded` che cambia tra true/false
- ✓ Focus ring visibile (outline blu) su tab

**Come testare**:
1. Apri DevTools
2. Elementi → Seleziona l'hamburger button
3. Verifica gli attributi ARIA nel code inspector
4. Premi Tab per navigare e vedi il focus ring blu

---

## Test Checklist - Navigation Links

### Account Button (Desktop)
- ✓ Tap target minimo 40px (ora: min-height 40px, padding 8px 12px)
- ✓ Focus ring visibile su focus-visible
- ✓ Scompare su mobile (display: none)

**Come testare**:
1. Su desktop (>900px): il pulsante "GS" (avatar account) deve essere facilmente cliccabile
2. Su mobile: il pulsante scompare, vedi solo il menu

### Focus Visibile
- ✓ Tutti i link devono avere focus ring **2px solid #4f6af5** (blu)
- ✓ Focus ring deve avere offset 2px da tutti i lati
- ✓ Deve essere chiaramente visibile

**Come testare**:
1. Premi Tab ripetutamente
2. Vedi il focus ring blu intorno agli elementi
3. Su mobile apri il menu e premi Tab tra i link

---

## Test Checklist - Responsività per Breakpoints

Testa su questi screen sizes (portrait e landscape):

### Small Mobile (< 480px)
- ✓ iPhone SE, iPhone 12 mini
- ✓ Hamburger visibile e funzionante
- ✓ Menu links ben spaziati
- ✓ Nessun overflow orizzontale
- ✓ Padding adeguato da bordi (24px)

**Come testare**:
```
Chrome DevTools → Device Mode → iPhone 12 mini (375x667)
```

### Medium Mobile (480px - 768px)
- ✓ iPhone 12, iPhone 13
- ✓ Hamburger funziona
- ✓ Layout fluido, nessun elemento tagliato
- ✓ Menu links leggibili

**Come testare**:
```
Chrome DevTools → Device Mode → iPhone 12 (390x844)
o
Google Pixel 5 (393x851)
```

### Tablet (768px - 1024px)
- ✓ iPad (768x1024)
- ✓ A 900px il breakpoint passa a layout desktop
- ✓ Hamburger scompare, nav menu apparecchia
- ✓ Test in portrait e landscape

**Come testare**:
```
Chrome DevTools → Device Mode → iPad (768x1024)
```

### Landscape Mobile (480px - 920px height)
- ✓ Menu deve funzionare anche orizzontale
- ✓ Nessun overflow
- ✓ Tap target ancora grande

**Come testare**:
```
Chrome DevTools → Device Mode → Ruota a landscape
```

---

## Test Checklist - Interazione

### Scroll Events
- ✓ Navbar diventa semi-trasparente (scrolled class) dopo 50px di scroll
- ✓ Focus della navbar cambia mentre scorri (seleziona la sezione visibile)
- ✓ Su mobile non dovrebbe causare lag

**Come testare**:
1. Apri homepage su mobile
2. Scorri verso il basso
3. Vedi navbar background-color cambiare (non più trasparente, diventa scuro con blur)
4. Su device lento, verifica che lo scroll sia fluido

### Touch Responsiveness
- ✓ I pulsanti devono rispondere al tap in < 50ms
- ✓ Nessun ritardo CSS / JavaScript pesanti

**Come testare**:
1. Apri Chrome DevTools → Rendering
2. Mostra i frame rate durante il tap
3. Devono essere sopra 60fps

---

## Test Checklist - Specifico iOS vs Android

### iOS (Safari)
- ✓ Hamburger padding corretto (no rubber-band scroll)
- ✓ Focus ring visibile su iPad
- ✓ Touch highlight non interfewith con il design
- ✓ Nessun zoom su input (se presenti)

**Come testare**:
1. Apri il sito su Safari (iPhone/iPad)
2. Premi l'hamburger
3. Verifica che menu e buttons funzionino

### Android (Chrome)
- ✓ Hamburger funziona bene con Material Design
- ✓ Tap target raggiungibile facilmente
- ✓ Nessun ritardo nel rendering

**Come testare**:
1. Apri il sito su Chrome (Android phone)
2. Premi l'hamburger
3. Scorri e verifica che non ci siano jank

---

## Checklist Finale

### Funzionalità
- [ ] Hamburger apre/chiude menu smoothly
- [ ] Ogni link nel menu va alla pagina corretta
- [ ] Focus della navbar cambia correttamente mentre scrollo
- [ ] Close menu quando clicco su un link
- [ ] Close menu quando clicco fuori dal menu

### Dimensioni Tap
- [ ] Hamburger: 48x48px (padding 12px)
- [ ] Menu links: 48px+ altezza
- [ ] Account button: 40px+ altezza
- [ ] Nessun overlap tra elementi

### Accessibilità
- [ ] Focus ring visibile su tap (Tab)
- [ ] ARIA labels corretti
- [ ] Screen reader legge i menu items

### Performance
- [ ] Nessun lag/jank durante scroll
- [ ] Menu apre/chiude in < 300ms
- [ ] 60fps rendering su device lento

### Responsività
- [ ] Mobile < 480px: OK
- [ ] Mobile 480-768px: OK
- [ ] Tablet 768-1024px: OK
- [ ] Landscape: OK
- [ ] Desktop > 1024px: hamburger scompare, nav menu apparecchia

---

## Debugging Tips

### Se il menu non appare:
1. DevTools → Elements → Find `.nav-menu.open`
2. Controlla che `position: fixed`, `inset: 0 0 0 0`, `z-index: 999`
3. Controlla che `display: flex` e not `display: none`

### Se i tap target sono troppo piccoli:
1. DevTools → Elements → Seleziona l'elemento
2. Vedi le dimensioni nel box model
3. Deve essere ≥ 48px per tap, ≥ 40px per buttons

### Se il focus ring non appare:
1. Premi Tab (non click mouse)
2. Focus ring deve essere **2px solid #4f6af5**
3. Se non vedi, check DevTools → Computed → outline, outline-offset

### Se lo scroll è lento:
1. DevTools → Rendering → Paint flashing
2. Vedi se ci sono aree che flashano (repaint)
3. Scroll deve essere fuori dal path di paint

---

## Deploy & Go Live

Una volta testato su device reali e tutto OK:

```bash
npm run deploy:prep
# Upload dist/portfolio-frontend/browser/ a FileZilla → httpdocs/
# Verifica su https://gentsallaku.it/
```

Done! ✓
