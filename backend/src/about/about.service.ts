import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { About, AboutDocument } from './schemas/about.schema';
import { UpdateAboutDto } from './dto/update-about.dto';
import { CacheService } from '../common/services/cache.service';

/** The about document changes at most a few times a year. */
const CACHE_KEY = 'about:public';
const CACHE_TTL_MS = 300_000; // 5 min

@Injectable()
export class AboutService {
  constructor(
    @InjectModel(About.name) private model: Model<AboutDocument>,
    private readonly cache: CacheService,
  ) {}

  /**
   * Public read — hit on every homepage render, so it goes through the
   * shared cache instead of Mongo. `lean()` because the result is only ever
   * serialised to JSON; hydrating a full Mongoose document just to stringify
   * it is wasted work.
   */
  async get(): Promise<unknown> {
    return this.cache.getOrSet(
      CACHE_KEY,
      async () => {
        const doc = await this.model.findOne().lean().exec();
        if (doc) return doc;
        // Seed an empty document on first access, then return it in the same
        // plain-object shape the lean() branch produces.
        const created = await this.model.create({});
        return created.toObject();
      },
      CACHE_TTL_MS,
    );
  }

  async update(dto: UpdateAboutDto): Promise<AboutDocument> {
    let doc = await this.model.findOne().exec();
    if (!doc) {
      const created = await this.model.create(dto);
      await this.cache.invalidate(CACHE_KEY);
      return created;
    }
    Object.assign(doc, dto);
    const saved = await doc.save();
    await this.cache.invalidate(CACHE_KEY);
    return saved;
  }
}
