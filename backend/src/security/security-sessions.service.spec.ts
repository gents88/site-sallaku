import { BadRequestException } from '@nestjs/common';
import { SecuritySessionsService } from './security-sessions.service';

const ctx = { ip: '203.0.113.7', userAgent: 'x' };

function setup(revokeImpl: () => Promise<void> = () => Promise.resolve()) {
  const users = { revokeSessions: jest.fn(revokeImpl) };
  const security = { endSession: jest.fn().mockResolvedValue(undefined), record: jest.fn().mockResolvedValue(undefined) };
  return { service: new SecuritySessionsService(users as never, security as never), users, security };
}

describe('SecuritySessionsService.revoke', () => {
  it('revoca il refresh token, chiude la sessione e lascia traccia nel registro', async () => {
    const { service, users, security } = setup();
    await service.revoke('admin1', 'user2', ctx);
    expect(users.revokeSessions).toHaveBeenCalledWith('admin1', 'user2');
    expect(security.endSession).toHaveBeenCalledWith('user2');
    expect(security.record).toHaveBeenCalledWith('session_revoked', ctx, expect.objectContaining({ userId: 'user2' }));
  });

  it('non si può chiudere la propria sessione: nessuna traccia e nessuna sessione cancellata', async () => {
    const { service, security } = setup(() => Promise.reject(new BadRequestException('Use logout to end your own session')));
    await expect(service.revoke('admin1', 'admin1', ctx)).rejects.toThrow(BadRequestException);
    expect(security.endSession).not.toHaveBeenCalled();
    expect(security.record).not.toHaveBeenCalled();
  });
});
