import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Interruttori del sito modificabili dalla dashboard, senza deploy. Tutti
 * pubblici (GET /system/flags): il frontend li legge per nascondere ciò che
 * è spento, il backend li applica con @RequireFeature.
 */
export interface FeatureFlags {
  /** Il sito pubblico mostra un avviso a tutta pagina (gli admin no). */
  maintenanceMode: boolean;
  maintenanceMessage: string;
  /** Strumenti /ai/* del Lab; il chatbot risponde con i messaggi predefiniti. */
  aiEnabled: boolean;
  chatbotEnabled: boolean;
  /** Richiesta "Vuoi parlare con Gent?" dal chatbot. */
  liveHandoffEnabled: boolean;
  registrationEnabled: boolean;
  newsletterSignupEnabled: boolean;
  contactFormEnabled: boolean;
}

export type BooleanFlag = { [K in keyof FeatureFlags]: FeatureFlags[K] extends boolean ? K : never }[keyof FeatureFlags];

export const DEFAULT_FEATURE_FLAGS: Readonly<FeatureFlags> = Object.freeze({
  maintenanceMode: false,
  maintenanceMessage: '',
  aiEnabled: true,
  chatbotEnabled: true,
  liveHandoffEnabled: true,
  registrationEnabled: true,
  newsletterSignupEnabled: true,
  contactFormEnabled: true,
});

export const BOOLEAN_FLAGS: readonly BooleanFlag[] = Object.freeze(
  (Object.keys(DEFAULT_FEATURE_FLAGS) as Array<keyof FeatureFlags>).filter(
    (k): k is BooleanFlag => typeof DEFAULT_FEATURE_FLAGS[k] === 'boolean',
  ),
);

export const MAINTENANCE_MESSAGE_MAX = 300;

/**
 * Valori salvati + default: una chiave assente, di tipo sbagliato o non più
 * esistente non rompe nulla, prende il default.
 */
export function mergeFlags(stored: unknown): FeatureFlags {
  const src = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_FEATURE_FLAGS } as FeatureFlags;
  for (const key of BOOLEAN_FLAGS) {
    if (typeof src[key] === 'boolean') out[key] = src[key] as boolean;
  }
  if (typeof src.maintenanceMessage === 'string') {
    out.maintenanceMessage = src.maintenanceMessage.trim().slice(0, MAINTENANCE_MESSAGE_MAX);
  }
  return out;
}

/**
 * 503 voluto (funzione spenta, budget AI finito): non è un guasto, quindi il
 * registro degli errori del server lo ignora.
 */
export class FeatureUnavailableException extends ServiceUnavailableException {
  constructor(message: string, readonly feature?: string) {
    super(feature ? { statusCode: 503, message, feature } : message);
  }
}

/** Flag che accendono/spengono un endpoint (la manutenzione è solo un avviso del frontend). */
export type GateFlag = Exclude<BooleanFlag, 'maintenanceMode'>;

export const FEATURE_DISABLED_MESSAGE: Record<GateFlag, string> = {
  aiEnabled: 'Gli strumenti AI sono temporaneamente disattivati.',
  chatbotEnabled: 'La chat è temporaneamente disattivata.',
  liveHandoffEnabled: 'La chat dal vivo è temporaneamente disattivata.',
  registrationEnabled: 'Le registrazioni sono temporaneamente chiuse.',
  newsletterSignupEnabled: 'Le iscrizioni alla newsletter sono temporaneamente chiuse.',
  contactFormEnabled: 'Il modulo di contatto è temporaneamente disattivato.',
};
