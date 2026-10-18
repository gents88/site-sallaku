import { applyDecorators, CanActivate, ExecutionContext, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GateFlag } from './feature-flags';
import { SettingsService } from './settings.service';

export const REQUIRED_FEATURE_KEY = 'requiredFeature';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: SettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flag = this.reflector.getAllAndOverride<GateFlag | undefined>(REQUIRED_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (flag) await this.settings.assertEnabled(flag);
    return true;
  }
}

/** L'endpoint risponde 503 quando il flag è spento dalla dashboard. Su classe o su metodo. */
export const RequireFeature = (flag: GateFlag) =>
  applyDecorators(SetMetadata(REQUIRED_FEATURE_KEY, flag), UseGuards(FeatureFlagGuard));
