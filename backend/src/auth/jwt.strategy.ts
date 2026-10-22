import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  /** Presente ('refresh') solo sui refresh token; gli access token non lo hanno. */
  type?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload) {
    // Il refresh token è firmato con lo stesso segreto e dura più a lungo: senza
    // questo controllo un refresh rubato varrebbe come access token e la scadenza
    // breve di quest'ultimo non servirebbe a nulla.
    if (payload.type === 'refresh') throw new UnauthorizedException('Refresh token cannot be used as access token');
    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('Token is no longer valid');
    return { _id: user._id, email: user.email, role: user.role, name: user.name };
  }
}
