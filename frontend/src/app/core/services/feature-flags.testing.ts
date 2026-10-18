import { Provider, computed, signal } from '@angular/core';
import { DEFAULT_FEATURE_FLAGS, FeatureFlags, FeatureFlagsService } from './feature-flags.service';

/** Solo per i test: FeatureFlagsService senza HttpClient, con flag pilotabili. */
export function provideFeatureFlagsStub(overrides: Partial<FeatureFlags> = {}): Provider {
  const flags = signal<FeatureFlags>({ ...DEFAULT_FEATURE_FLAGS, ...overrides });
  const pick = <K extends keyof FeatureFlags>(k: K) => computed(() => flags()[k]);
  return {
    provide: FeatureFlagsService,
    useValue: {
      flags,
      loaded: signal(true),
      maintenanceMode: pick('maintenanceMode'),
      chatbotEnabled: pick('chatbotEnabled'),
      liveHandoffEnabled: pick('liveHandoffEnabled'),
      newsletterSignupEnabled: pick('newsletterSignupEnabled'),
      registrationEnabled: pick('registrationEnabled'),
      contactFormEnabled: pick('contactFormEnabled'),
      aiEnabled: pick('aiEnabled'),
      refresh: () => undefined,
      update: () => undefined,
    },
  };
}
