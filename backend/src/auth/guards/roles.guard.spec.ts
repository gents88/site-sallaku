import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../decorators/roles.decorator';

function makeContext(user: { role?: string } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
    guard = new RolesGuard(reflector);
  });

  it('allows access when no roles are required on the route', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(makeContext({ role: 'user' }))).toBe(true);
  });

  it('allows access when required roles is an empty array', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(makeContext({ role: 'user' }))).toBe(true);
  });

  it('allows access when the user has one of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.Admin]);

    expect(guard.canActivate(makeContext({ role: 'admin' }))).toBe(true);
  });

  it('denies access when the user does not have any required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.Admin]);

    expect(() => guard.canActivate(makeContext({ role: 'user' }))).toThrow(ForbiddenException);
  });

  it('denies access when there is no user on the request', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.Admin]);

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
