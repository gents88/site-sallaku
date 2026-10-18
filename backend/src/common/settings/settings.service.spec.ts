import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { SettingsService, FLAGS_TTL_MS } from './settings.service';
import { DEFAULT_FEATURE_FLAGS, FeatureUnavailableException, mergeFlags } from './feature-flags';
import { FeatureFlagGuard, REQUIRED_FEATURE_KEY } from './require-feature.decorator';

function makeModel(stored: Record<string, unknown> | null = null) {
  const findOneExec = jest.fn().mockResolvedValue(stored === null ? null : { key: 'feature-flags', value: stored });
  const updateExec = jest.fn().mockResolvedValue({ acknowledged: true });
  return {
    findOne: jest.fn(() => ({ lean: () => ({ exec: findOneExec }) })),
    updateOne: jest.fn(() => ({ exec: updateExec })),
    findOneExec,
    updateExec,
  };
}

describe('mergeFlags', () => {
  it('senza nulla di salvato restituisce i default', () => {
    expect(mergeFlags(undefined)).toEqual(DEFAULT_FEATURE_FLAGS);
    expect(mergeFlags('rotto')).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it('tiene i booleani salvati e ignora tipi sbagliati e chiavi sconosciute', () => {
    const flags = mergeFlags({ aiEnabled: false, chatbotEnabled: 'no', vecchioFlag: true });
    expect(flags.aiEnabled).toBe(false);
    expect(flags.chatbotEnabled).toBe(true);
    expect(flags).not.toHaveProperty('vecchioFlag');
  });

  it('ripulisce e tronca il messaggio di manutenzione', () => {
    expect(mergeFlags({ maintenanceMessage: '  torno presto  ' }).maintenanceMessage).toBe('torno presto');
    expect(mergeFlags({ maintenanceMessage: 'x'.repeat(500) }).maintenanceMessage).toHaveLength(300);
  });
});

describe('SettingsService', () => {
  it('legge i flag dal DB e li tiene in memoria per il TTL', async () => {
    const model = makeModel({ aiEnabled: false });
    const service = new SettingsService(model as never);
    const t0 = Date.now();

    expect((await service.getFlags(t0)).aiEnabled).toBe(false);
    await service.getFlags(t0 + FLAGS_TTL_MS - 1);
    expect(model.findOne).toHaveBeenCalledTimes(1);

    await service.getFlags(t0 + FLAGS_TTL_MS + 5_000);
    expect(model.findOne).toHaveBeenCalledTimes(2);
  });

  it('se Mongo non risponde usa i default invece di spegnere il sito', async () => {
    const model = makeModel();
    model.findOneExec.mockRejectedValue(new Error('mongo giù'));
    const service = new SettingsService(model as never);
    expect(await service.getFlags()).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it('updateFlags unisce la modifica, salva con upsert e aggiorna subito la cache', async () => {
    const model = makeModel({ chatbotEnabled: false });
    const service = new SettingsService(model as never);

    const next = await service.updateFlags({ aiEnabled: false }, 'admin@example.com');

    expect(next).toEqual(expect.objectContaining({ aiEnabled: false, chatbotEnabled: false }));
    expect(model.updateOne).toHaveBeenCalledWith(
      { key: 'feature-flags' },
      { $set: { value: next, updatedBy: 'admin@example.com' } },
      { upsert: true },
    );
    model.findOne.mockClear();
    expect((await service.getFlags()).aiEnabled).toBe(false);
    expect(model.findOne).not.toHaveBeenCalled();
  });

  it('assertEnabled lancia un 503 "voluto" quando il flag è spento', async () => {
    const service = new SettingsService(makeModel({ registrationEnabled: false }) as never);
    const err = await service.assertEnabled('registrationEnabled').catch((e) => e);
    expect(err).toBeInstanceOf(FeatureUnavailableException);
    expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(err.getResponse()).toEqual(expect.objectContaining({ feature: 'registrationEnabled' }));
    await expect(service.assertEnabled('aiEnabled')).resolves.toBeUndefined();
  });
});

describe('FeatureFlagGuard', () => {
  function context(): ExecutionContext {
    return { getHandler: () => () => undefined, getClass: () => class {} } as unknown as ExecutionContext;
  }

  it('lascia passare le rotte senza @RequireFeature senza leggere i flag', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const settings = { assertEnabled: jest.fn() };
    const guard = new FeatureFlagGuard(reflector, settings as never);
    await expect(guard.canActivate(context())).resolves.toBe(true);
    expect(settings.assertEnabled).not.toHaveBeenCalled();
  });

  it('blocca con 503 se il flag richiesto è spento', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('chatbotEnabled') } as unknown as Reflector;
    const service = new SettingsService(makeModel({ chatbotEnabled: false }) as never);
    const guard = new FeatureFlagGuard(reflector, service);
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(FeatureUnavailableException);
    expect((reflector.getAllAndOverride as jest.Mock).mock.calls[0][0]).toBe(REQUIRED_FEATURE_KEY);
  });
});
