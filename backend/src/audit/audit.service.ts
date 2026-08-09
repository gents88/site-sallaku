import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

interface CreateAuditLogDto {
  actorId: string;
  actorEmail: string;
  method: string;
  path: string;
  resource?: string;
  description?: string;
  statusCode?: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
  ) {}

  /** Record a single admin action. Fire-and-forget safe — failures are swallowed. */
  async log(dto: CreateAuditLogDto): Promise<void> {
    try {
      await this.auditModel.create({
        actorId: dto.actorId,
        actorEmail: dto.actorEmail,
        method: dto.method,
        path: dto.path,
        resource: dto.resource ?? this.inferResource(dto.path),
        description: dto.description ?? `${dto.method} ${dto.path}`,
        statusCode: dto.statusCode ?? 0,
      });
    } catch {
      // Audit logging must never break the main request flow
    }
  }

  /** Return the last `limit` audit entries, optionally filtered by resource or actor. */
  async findRecent(opts: { limit?: number; resource?: string; actorId?: string } = {}): Promise<AuditLogDocument[]> {
    const { limit = 50, resource, actorId } = opts;
    const filter: Record<string, unknown> = {};
    if (resource) filter['resource'] = resource;
    if (actorId) filter['actorId'] = actorId;

    return this.auditModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200))
      .lean()
      .exec() as unknown as AuditLogDocument[];
  }

  private inferResource(path: string): string {
    const segments = path.replace(/^\/api\/v\d\//, '').split('/');
    return segments[0] ?? 'unknown';
  }
}
