import { ArgumentsHost, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter, ErrorSink } from './http-exception.filter';
import { FeatureUnavailableException } from '../settings/feature-flags';

function host(url = '/api/v1/search?q=x') {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const req = { method: 'GET', url, originalUrl: url, headers: { 'x-request-id': 'req-1' } };
  const h = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) } as unknown as ArgumentsHost;
  return { h, res };
}

describe('HttpExceptionFilter — registro errori', () => {
  let sink: jest.Mocked<ErrorSink>;
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    sink = { record: jest.fn().mockResolvedValue(undefined) };
    filter = new HttpExceptionFilter(sink);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('registra un errore non gestito come 500, con rotta, messaggio, stack e request id', () => {
    const { h, res } = host();
    filter.catch(new TypeError('x is undefined'), h);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(sink.record).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET', url: '/api/v1/search?q=x', status: 500, name: 'TypeError', message: 'x is undefined', requestId: 'req-1',
    }));
    expect(sink.record.mock.calls[0][0].stack).toContain('TypeError');
  });

  it('registra anche un 502 lanciato come HttpException', () => {
    filter.catch(new HttpException('upstream', HttpStatus.BAD_GATEWAY), host().h);
    expect(sink.record).toHaveBeenCalledWith(expect.objectContaining({ status: 502 }));
  });

  it('non registra i 4xx', () => {
    filter.catch(new BadRequestException('bad'), host().h);
    expect(sink.record).not.toHaveBeenCalled();
  });

  it('non registra i 503 voluti (funzione spenta o budget finito)', () => {
    const { h, res } = host();
    filter.catch(new FeatureUnavailableException('spento', 'chatbotEnabled'), h);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(sink.record).not.toHaveBeenCalled();
  });

  it('se il registro fallisce la risposta parte lo stesso', () => {
    sink.record.mockRejectedValue(new Error('mongo giù'));
    const { h, res } = host();
    expect(() => filter.catch(new Error('boom'), h)).not.toThrow();
    expect(res.json).toHaveBeenCalled();
  });

  it('senza registro (test, bootstrap) funziona come prima', () => {
    const { h, res } = host();
    new HttpExceptionFilter().catch(new Error('boom'), h);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
