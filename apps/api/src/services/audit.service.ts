import { prisma } from '../config/database.js';

interface CreateAuditEventParams {
  claimId: string;
  actorId?: string;
  actorType: 'HUMAN' | 'AI_SYSTEM';
  action: string;
  details: Record<string, unknown>;
}

export async function createAuditEvent(params: CreateAuditEventParams) {
  return prisma.auditEvent.create({
    data: {
      claimId: params.claimId,
      actorId: params.actorId ?? null,
      actorType: params.actorType,
      action: params.action,
      details: params.details as any,
    },
  });
}
