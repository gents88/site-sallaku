import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTestimonialDto } from './create-testimonial.dto';

const base = { authorName: 'Mario Rossi', rating: 5, content: 'Ottimo lavoro, davvero consigliato.' };

async function check(extra: Record<string, unknown>) {
  const dto = plainToInstance(CreateTestimonialDto, { ...base, ...extra });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors };
}

describe('CreateTestimonialDto — linkedinUrl', () => {
  it('è facoltativo', async () => {
    const { errors, dto } = await check({});
    expect(errors).toEqual([]);
    expect(dto.linkedinUrl).toBeUndefined();
  });

  it('una stringa vuota (campo lasciato in bianco) equivale a nessun link', async () => {
    const { errors, dto } = await check({ linkedinUrl: '   ' });
    expect(errors).toEqual([]);
    expect(dto.linkedinUrl).toBeUndefined();
  });

  it.each([
    'linkedin.com/in/mario-rossi',
    'https://it.linkedin.com/in/mario-rossi/?trk=x',
    'www.linkedin.com/in/mario-rossi/details/experience/',
  ])('normalizza %s', async input => {
    const { errors, dto } = await check({ linkedinUrl: input });
    expect(errors).toEqual([]);
    expect(dto.linkedinUrl).toBe('https://www.linkedin.com/in/mario-rossi');
  });

  it.each([
    'https://linkedin.com.evil.example/in/mario-rossi',
    'https://www.linkedin.com/company/acme',
    'https://evil.example/in/mario-rossi',
    'javascript:alert(1)',
    'mario rossi',
  ])('rifiuta %s', async input => {
    const { errors } = await check({ linkedinUrl: input });
    expect(errors.map(e => e.property)).toContain('linkedinUrl');
  });

  it('il form pubblico non accetta i campi di verifica', async () => {
    const { errors } = await check({ verified: true });
    expect(errors.map(e => e.property)).toContain('verified');
  });
});
