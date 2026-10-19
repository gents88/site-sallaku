import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BlogPublishedQueryDto } from './blog-published-query.dto';

const check = async (query: Record<string, unknown>) =>
  validate(plainToInstance(BlogPublishedQueryDto, query), { whitelist: true, forbidNonWhitelisted: true });

describe('BlogPublishedQueryDto', () => {
  it.each(['it', 'en', 'sq', 'pt', 'es', 'fr', 'de'])('accetta lang=%s', async lang => {
    expect(await check({ lang })).toEqual([]);
  });

  it('accetta la query senza lang (client vecchi)', async () => {
    expect(await check({ page: '1', limit: '50' })).toEqual([]);
  });

  it('rifiuta una lingua sconosciuta', async () => {
    const errors = await check({ lang: 'xx' });
    expect(errors.map(e => e.property)).toContain('lang');
  });
});
