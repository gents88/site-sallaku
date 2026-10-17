import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppSetting, AppSettingDocument } from './app-setting.schema';
import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_DISABLED_MESSAGE,
  FeatureFlags,
  FeatureUnavailableException,
  GateFlag,
  mergeFlags,
} from './feature-flags';

const FLAGS_KEY = 'feature-flags';
/** Ogni richiesta pubblica protetta legge i flag: in memoria, riletti dal DB al massimo ogni 15 s. */
export const FLAGS_TTL_MS = 15_000;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cached: { at: number; flags: FeatureFlags } | null = null;
  private inFlight: Promise<FeatureFlags> | null = null;

  constructor(@InjectModel(AppSetting.name) private readonly model: Model<AppSettingDocument>) {}

  async getFlags(now = Date.now()): Promise<FeatureFlags> {
    if (this.cached && now - this.cached.at < FLAGS_TTL_MS) return this.cached.flags;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.load()
      .then((flags) => {
        this.cached = { at: Date.now(), flags };
        return flags;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  async isEnabled(flag: GateFlag): Promise<boolean> {
    return (await this.getFlags())[flag];
  }

  /** 503 (non un guasto, vedi FeatureUnavailableException) se il flag è spento. */
  async assertEnabled(flag: GateFlag): Promise<void> {
    if (!(await this.isEnabled(flag))) {
      throw new FeatureUnavailableException(FEATURE_DISABLED_MESSAGE[flag], flag);
    }
  }

  async updateFlags(patch: Partial<FeatureFlags>, actorEmail = ''): Promise<FeatureFlags> {
    const current = await this.load();
    const next = mergeFlags({ ...current, ...patch });
    await this.model
      .updateOne({ key: FLAGS_KEY }, { $set: { value: next, updatedBy: actorEmail } }, { upsert: true })
      .exec();
    this.cached = { at: Date.now(), flags: next };
    this.logger.log(`Feature flags aggiornati da ${actorEmail || 'sconosciuto'}: ${JSON.stringify(patch)}`);
    return next;
  }

  /**
   * Se il DB non risponde si tengono gli ultimi flag noti (o i default): un
   * guasto di Mongo non deve spegnere mezzo sito.
   */
  private async load(): Promise<FeatureFlags> {
    try {
      const doc = await this.model.findOne({ key: FLAGS_KEY }).lean().exec();
      return mergeFlags(doc?.value);
    } catch (err) {
      this.logger.warn(`Lettura feature flags fallita: ${(err as Error).message}`);
      return this.cached?.flags ?? { ...DEFAULT_FEATURE_FLAGS };
    }
  }
}
