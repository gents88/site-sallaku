import { ExecutionContext, HttpException } from '@nestjs/common';
import { MaxBodySizeGuard } from './max-body-size.guard';

const MB = 1024 * 1024;

function contextWith(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ headers }) }) } as unknown as ExecutionContext;
}

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (err) {
    return (err as HttpException).getStatus();
  }
  return undefined;
}

describe('MaxBodySizeGuard', () => {
  const guard = new (MaxBodySizeGuard(10 * MB))();

  it('lascia passare una richiesta sotto il tetto', () => {
    expect(guard.canActivate(contextWith({ 'content-length': String(5 * MB) }))).toBe(true);
  });

  it('accetta esattamente il tetto', () => {
    expect(guard.canActivate(contextWith({ 'content-length': String(10 * MB) }))).toBe(true);
  });

  it('rifiuta con 413 oltre il tetto', () => {
    expect(statusOf(() => guard.canActivate(contextWith({ 'content-length': String(10 * MB + 1) })))).toBe(413);
  });

  it('rifiuta con 411 senza Content-Length (chunked)', () => {
    expect(statusOf(() => guard.canActivate(contextWith({})))).toBe(411);
  });

  it('rifiuta un Content-Length non numerico o a zero', () => {
    expect(statusOf(() => guard.canActivate(contextWith({ 'content-length': 'abc' })))).toBe(411);
    expect(statusOf(() => guard.canActivate(contextWith({ 'content-length': '0' })))).toBe(411);
  });

  it('usa il primo valore se l\'header arriva come array', () => {
    expect(statusOf(() => guard.canActivate(contextWith({ 'content-length': [String(20 * MB)] })))).toBe(413);
  });
});
