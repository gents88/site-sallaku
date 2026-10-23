import { BadRequestException } from '@nestjs/common';
import { SecuritySessionsService } from './security-sessions.service';

const ctx = { ip: '203.0.113.7', userAgent: 'x' };

function setup(revokeImpl: () => Promise<void> = () => Promise.resolve()) {
  const users = { revokeSessions: jest.fn(revokeImpl) };
  const security = { endAllSessions: jest.fn().mockResolvedValue(undefined), endSession: jest.fn().mockResolvedValue(undefined), record: jest.fn().mockResolvedValue(undefined) };
  return { service: new SecuritySessionsService(users as never, security as never), users, security };
}

describe('SecuritySessionsService.revoke', () => {
  it('chiude le sessioni di tutti i dispositivi dell’utente e lascia traccia nel registro', async () => {
    const { service, users, security } = setup();
    await service.revoke('admin1', 'user2', ctx);
    expect(users.revokeSessions).toHaveBeenCalledWith('admin1', 'user2');
    expect(security.endAllSessions).toHaveBeenCalledWith('user2');
    expect(security.record).toHaveBeenCalledWith('session_revoked', ctx, expect.objectContaining({ userId: 'user2' }));
  });

  it('non si può chiudere la propria sessione: nessuna traccia e nessuna sessione cancellata', async () => {
    const { service, security } = setup(() => Promise.reject(new BadRequestException('Use logout to end your own session')));
    await expect(service.revoke('admin1', 'admin1', ctx)).rejects.toThrow(BadRequestException);
    expect(security.endAllSessions).not.toHaveBeenCalled();
    expect(security.record).not.toHaveBeenCalled();
  });
});

describe('SecuritySessionsService.revokeOne', () => {
  it('chiude un solo dispositivo di un altro utente e lascia traccia', async () => {
    const { service, security } = setup();
    await service.revokeOne('admin1', 'sid-admin', 'user2', 'sid-tel', ctx);
    expect(security.endSession).toHaveBeenCalledWith('user2', 'sid-tel');
    expect(security.endAllSessions).not.toHaveBeenCalled();
    expect(security.record).toHaveBeenCalledWith('session_revoked', ctx, expect.objectContaining({ userId: 'user2' }));
  });

  it('un admin può chiudere un altro dispositivo del PROPRIO account', async () => {
    const { service, security } = setup();
    await service.revokeOne('admin1', 'sid-pc', 'admin1', 'sid-telefono-dimenticato', ctx);
    expect(security.endSession).toHaveBeenCalledWith('admin1', 'sid-telefono-dimenticato');
  });

  it('non può chiudere la sessione da cui sta lavorando: per quella c\'è il logout', async () => {
    const { service, security } = setup();
    await expect(service.revokeOne('admin1', 'sid-pc', 'admin1', 'sid-pc', ctx)).rejects.toThrow(BadRequestException);
    expect(security.endSession).not.toHaveBeenCalled();
    expect(security.record).not.toHaveBeenCalled();
  });

  it('con un token precedente al multi-dispositivo (sid ignoto) il proprio account non è bloccato per errore', async () => {
    const { service, security } = setup();
    await service.revokeOne('admin1', undefined, 'admin1', 'sid-qualsiasi', ctx);
    expect(security.endSession).toHaveBeenCalledWith('admin1', 'sid-qualsiasi');
  });
});
