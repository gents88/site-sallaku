import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { driver, type Config, type PopoverDOM } from 'driver.js';
import { AnalyticsTrackingService } from '../services/analytics-tracking.service';
import { AuthService } from '../services/auth.service';
import { ConsentService } from '../services/consent.service';
import { DrawerService } from '../services/drawer.service';
import { ONBOARDING_STEPS } from './onboarding-steps';
import { ONBOARDING_STORAGE_KEY, OnboardingTourService } from './onboarding-tour.service';

/** Driver.js finto: registra la config e simula gli hook che il servizio usa. */
const fake = vi.hoisted(() => {
  const state = { config: null as Config | null, activeIndex: 0 };
  const instance = {
    drive: vi.fn(),
    isLastStep: vi.fn(() => state.activeIndex === (state.config?.steps?.length ?? 1) - 1),
    destroy: vi.fn(() => {
      state.config?.onDestroyed?.(undefined, {}, { config: state.config, state: { activeIndex: state.activeIndex }, driver: instance as never, index: state.activeIndex });
    }),
  };
  return { state, instance };
});

vi.mock('driver.js', () => ({
  driver: vi.fn((config: Config) => {
    fake.state.config = config;
    return fake.instance;
  }),
}));

const hookOpts = () => ({ config: fake.state.config!, state: {}, driver: fake.instance as never, index: fake.state.activeIndex });

function fakePopover(): PopoverDOM {
  const footer = document.createElement('div');
  footer.appendChild(document.createElement('span'));
  const nextButton = document.createElement('button');
  footer.appendChild(nextButton);
  document.body.appendChild(footer);
  return { footer, nextButton } as unknown as PopoverDOM;
}

describe('OnboardingTourService', () => {
  let consentDecided: ReturnType<typeof signal<boolean>>;
  let router: { url: string };
  let auth: { isLoggedIn: ReturnType<typeof signal<boolean>>; isAdmin: ReturnType<typeof signal<boolean>> };
  let drawer: { mode: ReturnType<typeof signal<'rail' | 'overlay'>>; railExpanded: ReturnType<typeof signal<boolean>>; open: ReturnType<typeof vi.fn>; toggleRail: ReturnType<typeof vi.fn> };
  let analytics: { trackClick: ReturnType<typeof vi.fn> };

  /** Monta nel DOM gli elementi bersaglio; quelli con data-hidden risultano non visibili. */
  function mountTargets(html: string) {
    document.body.innerHTML = html;
  }

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        { provide: ConsentService, useValue: { hasDecided: consentDecided } },
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: auth },
        { provide: DrawerService, useValue: drawer },
        { provide: AnalyticsTrackingService, useValue: analytics },
        { provide: TranslateService, useValue: { instant: (key: string, params?: Record<string, string>) => (params ? `${key}:${JSON.stringify(params)}` : key) } },
      ],
    });
    return TestBed.inject(OnboardingTourService);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    fake.state.config = null;
    fake.state.activeIndex = 0;
    vi.clearAllMocks();
    consentDecided = signal(false);
    router = { url: '/' };
    auth = { isLoggedIn: signal(false), isAdmin: signal(false) };
    drawer = {
      mode: signal('overlay'),
      railExpanded: signal(false),
      open: vi.fn(() => drawer.railExpanded.set(true)),
      toggleRail: vi.fn(() => drawer.railExpanded.update(v => !v)),
    };
    analytics = { trackClick: vi.fn() };
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      return (this.hasAttribute('data-hidden') ? [] : [{}]) as unknown as DOMRectList;
    });
    mountTargets('<main id="main-content"><section id="hero"></section></main><button class="cb-fab"></button>');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('avvio automatico al primo accesso', () => {
    it('aspetta la decisione sul consenso, poi parte dopo il ritardo', async () => {
      const tour = setup();
      tour.scheduleAutoStart();
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(5000);
      expect(fake.instance.drive).not.toHaveBeenCalled();

      consentDecided.set(true);
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(1499);
      expect(fake.instance.drive).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(fake.instance.drive).toHaveBeenCalledOnce();
      expect(tour.active()).toBe(true);
    });

    it('non parte se il flag hasSeenOnboarding è già presente', async () => {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
      consentDecided.set(true);
      const tour = setup();
      tour.scheduleAutoStart();
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(5000);
      expect(fake.instance.drive).not.toHaveBeenCalled();
    });

    it("non parte nell'area admin né per un admin loggato", async () => {
      consentDecided.set(true);
      router.url = '/en/dashboard/users';
      let tour = setup();
      tour.scheduleAutoStart();
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(5000);
      expect(fake.instance.drive).not.toHaveBeenCalled();
      // Non viene segnato come visto: un visitatore che poi va sul sito pubblico lo vedrà.
      expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();

      TestBed.resetTestingModule();
      router.url = '/';
      auth.isLoggedIn.set(true);
      auth.isAdmin.set(true);
      tour = setup();
      tour.scheduleAutoStart();
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(5000);
      expect(fake.instance.drive).not.toHaveBeenCalled();
    });
  });

  describe('chiusura e flag', () => {
    it('"Concludi" segna il tour come visto e traccia il completamento', async () => {
      const tour = setup();
      await tour.start();
      fake.state.activeIndex = ONBOARDING_STEPS.length - 1;
      fake.state.config!.onDoneClick!(undefined, {}, hookOpts());

      expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('true');
      expect(tour.active()).toBe(false);
      expect(analytics.trackClick).toHaveBeenCalledWith('onboarding', 'onboarding_completed');
    });

    it('"Salta tutorial" chiude il tour, segna il flag e traccia lo step di uscita', async () => {
      const tour = setup();
      await tour.start();
      fake.state.activeIndex = 2;
      const popover = fakePopover();
      fake.state.config!.onPopoverRender!(popover, hookOpts());

      const skip = popover.footer.querySelector<HTMLButtonElement>('.gs-tour__skip')!;
      expect(skip.textContent).toBe('onboarding.skip');
      expect(popover.footer.firstChild).toBe(skip);
      // Il focus iniziale va su "Avanti", non sul "Salta" appena inserito.
      await Promise.resolve();
      expect(document.activeElement).toBe(popover.nextButton);
      skip.click();

      expect(fake.instance.destroy).toHaveBeenCalled();
      expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe('true');
      expect(tour.active()).toBe(false);
      expect(analytics.trackClick).toHaveBeenCalledWith('onboarding', 'onboarding_skipped_step_3');
    });

    it("sull'ultimo step non c'è \"Salta\": resta solo \"Concludi\"", async () => {
      const tour = setup();
      await tour.start();
      fake.state.activeIndex = ONBOARDING_STEPS.length - 1;
      const popover = fakePopover();
      fake.state.config!.onPopoverRender!(popover, hookOpts());
      expect(popover.footer.querySelector('.gs-tour__skip')).toBeNull();
    });

    it('start() manuale riparte anche se il tour è già stato visto', async () => {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
      const tour = setup();
      await tour.start();
      expect(fake.instance.drive).toHaveBeenCalledOnce();
    });

    it('ignora un secondo start() mentre il tour è attivo', async () => {
      const tour = setup();
      await tour.start();
      await tour.start();
      expect(fake.instance.drive).toHaveBeenCalledOnce();
    });

    it('se Driver.js fallisce, la pagina resta usabile e il flag non viene scritto', async () => {
      vi.mocked(driver).mockImplementationOnce(() => {
        throw new Error('chunk load failed');
      });
      const tour = setup();
      await tour.start();
      expect(tour.active()).toBe(false);
      expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
    });
  });

  describe('configurazione di Driver.js', () => {
    it('usa le etichette tradotte per i pulsanti e nasconde la X', async () => {
      const tour = setup();
      await tour.start();
      const c = fake.state.config!;
      expect(c.nextBtnText).toBe('onboarding.next');
      expect(c.prevBtnText).toBe('onboarding.back');
      expect(c.doneBtnText).toBe('onboarding.done');
      expect(c.showButtons).toEqual(['next', 'previous']);
      // I segnaposto di Driver.js arrivano intatti nel testo di avanzamento.
      expect(c.progressText).toContain('{{current}}');
      expect(c.progressText).toContain('{{total}}');
    });

    it('evidenzia il primo candidato visibile e ricade sul popover centrato se nessuno lo è', async () => {
      mountTargets(`
        <aside id="app-sidebar" class="is-overlay" data-hidden></aside>
        <button class="nav-drawer-toggle" data-hidden></button>
        <nav class="bottom-tabbar"></nav>
        <main id="main-content"><section id="hero"></section></main>
        <button class="cb-fab"></button>`);
      const tour = setup();
      await tour.start();

      const steps = fake.state.config!.steps!;
      const byId = (id: string) => steps[ONBOARDING_STEPS.findIndex(s => s.id === id)];
      expect(steps).toHaveLength(ONBOARDING_STEPS.length);
      expect(byId('welcome').element).toBeUndefined();
      expect(byId('navigation').element).toBe(document.querySelector('.bottom-tabbar'));
      // Su mobile i gruppi della sidebar sono fuori schermo: spiegazione senza spotlight.
      expect(byId('group_ai').element).toBeUndefined();
      expect(byId('group_ai').popover!.side).toBeUndefined();
      expect(byId('main').element).toBe(document.getElementById('hero'));
      expect(byId('chatbot').element).toBe(document.querySelector('.cb-fab'));
      expect(byId('chatbot').popover!.title).toBe('onboarding.steps.chatbot.title');
    });

    it('su desktop espande la rail per il tour e la richiude alla fine', async () => {
      mountTargets(`
        <aside id="app-sidebar" class="is-rail"><div data-tour-group="ai"></div></aside>
        <main id="main-content"></main>
        <button class="cb-fab"></button>`);
      drawer.mode.set('rail');
      const tour = setup();
      const started = tour.start();
      await vi.advanceTimersByTimeAsync(400);
      await started;

      expect(drawer.open).toHaveBeenCalled();
      const steps = fake.state.config!.steps!;
      expect(steps[ONBOARDING_STEPS.findIndex(s => s.id === 'group_ai')].element).toBe(document.querySelector('[data-tour-group="ai"]'));
      expect(steps[ONBOARDING_STEPS.findIndex(s => s.id === 'navigation')].element).toBe(document.getElementById('app-sidebar'));

      fake.instance.destroy();
      expect(drawer.toggleRail).toHaveBeenCalledOnce();
      expect(drawer.railExpanded()).toBe(false);
    });

    it('non tocca la rail se era già espansa', async () => {
      drawer.mode.set('rail');
      drawer.railExpanded.set(true);
      const tour = setup();
      await tour.start();
      fake.instance.destroy();
      expect(drawer.open).not.toHaveBeenCalled();
      expect(drawer.toggleRail).not.toHaveBeenCalled();
    });

    it('aspetta il pulsante del chatbot caricato in @defer prima di costruire gli step', async () => {
      mountTargets('<main id="main-content"></main>');
      const tour = setup();
      const started = tour.start();
      await vi.advanceTimersByTimeAsync(100);
      expect(fake.instance.drive).not.toHaveBeenCalled();

      const fab = document.createElement('button');
      fab.className = 'cb-fab';
      document.body.appendChild(fab);
      await vi.advanceTimersByTimeAsync(0);
      await started;

      const chatbot = fake.state.config!.steps![ONBOARDING_STEPS.findIndex(s => s.id === 'chatbot')];
      expect(chatbot.element).toBe(fab);
    });
  });
});
