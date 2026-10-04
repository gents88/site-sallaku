import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { CreateProjectDto } from './create-project.dto';
import { CreateExperienceDto } from '../../experiences/dto/create-experience.dto';
import { ReorderDto } from '../../common/dto/reorder.dto';

/** Stessa configurazione di main.ts. */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const validate = (metatype: new () => object, value: unknown) => pipe.transform(value, { type: 'body', metatype });

const baseProject = { title: 'Portfolio CMS', description: 'A headless CMS built with NestJS.' };

describe('Project/Experience translations validation', () => {
  it('accepts case-study fields and per-language translations', async () => {
    const dto = await validate(CreateProjectDto, {
      ...baseProject,
      problem: 'Slow publishing', solution: 'Headless CMS', results: '-60% time',
      translations: { en: { title: 'Portfolio CMS', problem: 'Slow publishing' }, de: { description: 'Ein CMS' } },
    });
    expect(dto).toMatchObject({ translations: { en: { title: 'Portfolio CMS' } } });
  });

  it('rejects an unknown language key', async () => {
    await expect(validate(CreateProjectDto, { ...baseProject, translations: { xx: { title: 'x' } } }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unexpected field inside a translation', async () => {
    await expect(validate(CreateProjectDto, { ...baseProject, translations: { en: { slug: 'hack' } } }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('never lets an operator object reach Mongo: implicit conversion turns it into a plain string', async () => {
    const dto = (await validate(CreateProjectDto, { ...baseProject, translations: { en: { title: { $gt: '' } } } })) as CreateProjectDto;
    expect(typeof dto.translations?.en?.title).toBe('string');
  });

  it('validates experience translations the same way', async () => {
    const base = { company: 'Acme', role: 'Dev', startDate: '2022-01', description: 'Built many things.' };
    await expect(validate(CreateExperienceDto, { ...base, translations: { en: { role: 'Developer' } } })).resolves.toBeDefined();
    await expect(validate(CreateExperienceDto, { ...base, translations: { en: { company: 'X' } } }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('ReorderDto only accepts Mongo ids', async () => {
    await expect(validate(ReorderDto, { ids: ['507f1f77bcf86cd799439011'] })).resolves.toBeDefined();
    await expect(validate(ReorderDto, { ids: ['../etc'] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validate(ReorderDto, { ids: [] })).rejects.toBeInstanceOf(BadRequestException);
  });
});
