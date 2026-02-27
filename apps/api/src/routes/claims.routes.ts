import { Router, Request, Response, NextFunction } from 'express';
import {
  CreateClaimSchema,
  UpdateClaimSchema,
  ApproveClaimSchema,
  DenyClaimSchema,
  RequestInfoSchema,
  ClaimsQuerySchema,
  ClaimStatus,
  UserRole,
} from '@claims/shared';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { generateClaimNumber } from '../utils/claimNumber.js';
import { createAuditEvent } from '../services/audit.service.js';
import { enqueuePipeline } from '../jobs/queues.js';

function isClient(req: Request) {
  return req.user?.role === UserRole.CLIENT;
}

export const claimsRouter: Router = Router();

claimsRouter.use(authenticate);

// GET /api/claims
claimsRouter.get('/', validateQuery(ClaimsQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, serviceType, adjusterId, page, limit, search, sortBy, sortDir } = req.query as any;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (isClient(req)) {
      // Clients only see claims for their own policy
      where.policy = { clientId: req.user!.userId };
    } else {
      if (adjusterId) where.adjusterId = adjusterId;
    }
    if (status) where.status = status;
    if (serviceType) where.serviceType = serviceType;
    if (search) {
      where.OR = [
        { claimNumber: { contains: search, mode: 'insensitive' } },
        { serviceDescription: { contains: search, mode: 'insensitive' } },
        { policy: { holderName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [claims, total] = await Promise.all([
      prisma.claim.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy ?? 'createdAt']: sortDir ?? 'desc' },
        include: {
          policy: { select: { policyNumber: true, holderName: true } },
          adjuster: { select: { id: true, name: true } },
          fraudAnalysis: { select: { riskLevel: true, riskScore: true } },
        },
      }),
      prisma.claim.count({ where }),
    ]);

    res.json({
      data: claims,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/claims
claimsRouter.post('/', validateBody(CreateClaimSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { policyNumber, serviceDate, serviceType, serviceDescription, lossAmount, provider } = req.body;

    const policy = await prisma.policy.findUnique({ where: { policyNumber } });
    if (!policy) throw new AppError(404, `Policy ${policyNumber} not found`, 'POLICY_NOT_FOUND');

    if (isClient(req) && policy.clientId !== req.user!.userId) {
      throw new AppError(403, 'You can only file claims against your own policy', 'FORBIDDEN');
    }

    const now = new Date();
    if (now < policy.effectiveDate || now > policy.expiryDate) {
      throw new AppError(400, 'Policy is not active at the time of incident', 'POLICY_INACTIVE');
    }

    const claimNumber = generateClaimNumber();

    const claim = await prisma.claim.create({
      data: {
        claimNumber,
        policyId: policy.id,
        serviceDate: new Date(serviceDate),
        serviceType,
        serviceDescription,
        lossAmount: lossAmount ? lossAmount : null,
        provider: provider ?? null,
        status: ClaimStatus.FNOL_RECEIVED,
      },
      include: { policy: true },
    });

    await createAuditEvent({
      claimId: claim.id,
      actorId: req.user!.userId,
      actorType: 'HUMAN',
      action: 'CLAIM_CREATED',
      details: { claimNumber, serviceType },
    });

    res.status(201).json({ data: claim });
  } catch (err) {
    next(err);
  }
});

// GET /api/claims/:id
claimsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const claim = await prisma.claim.findUnique({
      where: { id: req.params.id },
      include: {
        policy: true,
        adjuster: { select: { id: true, name: true, email: true } },
        documents: true,
        aiAssessment: true,
        fraudAnalysis: true,
        reimbursementRecommendation: true,
      },
    });

    if (!claim) throw new AppError(404, 'Claim not found', 'NOT_FOUND');

    if (isClient(req) && claim.policy?.clientId !== req.user!.userId) {
      throw new AppError(403, 'Access denied', 'FORBIDDEN');
    }

    res.json({ data: claim });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/claims/:id
claimsRouter.patch('/:id', authorize(UserRole.ADJUSTER, UserRole.SUPERVISOR, UserRole.ADMIN), validateBody(UpdateClaimSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const claim = await prisma.claim.findUnique({ where: { id: req.params.id } });
    if (!claim) throw new AppError(404, 'Claim not found', 'NOT_FOUND');

    const updated = await prisma.claim.update({
      where: { id: req.params.id },
      data: req.body,
    });

    await createAuditEvent({
      claimId: claim.id,
      actorId: req.user!.userId,
      actorType: 'HUMAN',
      action: 'CLAIM_UPDATED',
      details: req.body,
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// GET /api/claims/:id/timeline
claimsRouter.get('/:id/timeline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const claim = await prisma.claim.findUnique({
      where: { id: req.params.id },
      include: { policy: { select: { clientId: true } } },
    });
    if (!claim) throw new AppError(404, 'Claim not found', 'NOT_FOUND');

    if (isClient(req) && claim.policy?.clientId !== req.user!.userId) {
      throw new AppError(403, 'Access denied', 'FORBIDDEN');
    }

    const events = await prisma.auditEvent.findMany({
      where: { claimId: req.params.id },
      orderBy: { timestamp: 'asc' },
      include: { actor: { select: { name: true, role: true } } },
    });
    res.json({ data: events });
  } catch (err) {
    next(err);
  }
});

const TERMINAL_STATUSES = [ClaimStatus.APPROVED, ClaimStatus.DENIED, ClaimStatus.PAID, ClaimStatus.CLOSED];

// POST /api/claims/:id/approve
claimsRouter.post('/:id/approve', authorize(UserRole.ADJUSTER, UserRole.SUPERVISOR, UserRole.ADMIN), validateBody(ApproveClaimSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, notes } = req.body;
    const claim = await prisma.claim.findUnique({ where: { id: req.params.id } });
    if (!claim) throw new AppError(404, 'Claim not found', 'NOT_FOUND');
    if (TERMINAL_STATUSES.includes(claim.status)) throw new AppError(400, 'Claim is already in a terminal state', 'INVALID_STATE');

    const [updatedClaim] = await prisma.$transaction([
      prisma.claim.update({
        where: { id: req.params.id },
        data: { status: ClaimStatus.APPROVED, adjusterNotes: notes ?? claim.adjusterNotes },
      }),
      prisma.reimbursementRecommendation.upsert({
        where: { claimId: req.params.id },
        create: {
          claimId: req.params.id,
          recommendedAmount: amount,
          rangeLow: amount,
          rangeHigh: amount,
          methodology: 'Manual adjuster decision',
          comparableCount: 0,
          confidence: 1,
          adjusterDecision: amount,
          adjusterRationale: notes,
        },
        update: { adjusterDecision: amount, adjusterRationale: notes },
      }),
    ]);

    await createAuditEvent({
      claimId: req.params.id,
      actorId: req.user!.userId,
      actorType: 'HUMAN',
      action: 'CLAIM_APPROVED',
      details: { amount, notes },
    });

    res.json({ data: updatedClaim });
  } catch (err) {
    next(err);
  }
});

// POST /api/claims/:id/deny
claimsRouter.post('/:id/deny', authorize(UserRole.ADJUSTER, UserRole.SUPERVISOR, UserRole.ADMIN), validateBody(DenyClaimSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason, notes } = req.body;
    const claim = await prisma.claim.findUnique({ where: { id: req.params.id } });
    if (!claim) throw new AppError(404, 'Claim not found', 'NOT_FOUND');
    if (TERMINAL_STATUSES.includes(claim.status)) throw new AppError(400, 'Claim is already in a terminal state', 'INVALID_STATE');

    const updated = await prisma.claim.update({
      where: { id: req.params.id },
      data: { status: ClaimStatus.DENIED, adjusterNotes: `DENIAL REASON: ${reason}\n${notes ?? ''}` },
    });

    await createAuditEvent({
      claimId: req.params.id,
      actorId: req.user!.userId,
      actorType: 'HUMAN',
      action: 'CLAIM_DENIED',
      details: { reason, notes },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/claims/:id/request-info
claimsRouter.post('/:id/request-info', authorize(UserRole.ADJUSTER, UserRole.SUPERVISOR, UserRole.ADMIN), validateBody(RequestInfoSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, requiredDocuments } = req.body;
    const updated = await prisma.claim.update({
      where: { id: req.params.id },
      data: { status: ClaimStatus.PENDING_ADDITIONAL_INFO },
    });

    await createAuditEvent({
      claimId: req.params.id,
      actorId: req.user!.userId,
      actorType: 'HUMAN',
      action: 'INFO_REQUESTED',
      details: { message, requiredDocuments },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/claims/:id/escalate
claimsRouter.post('/:id/escalate', authorize(UserRole.ADJUSTER, UserRole.SUPERVISOR, UserRole.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.claim.update({
      where: { id: req.params.id },
      data: { status: ClaimStatus.FRAUD_REVIEW },
    });

    await createAuditEvent({
      claimId: req.params.id,
      actorId: req.user!.userId,
      actorType: 'HUMAN',
      action: 'ESCALATED_SIU',
      details: req.body,
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/claims/:id/ai/reanalyze
claimsRouter.post('/:id/ai/reanalyze', authorize(UserRole.ADJUSTER, UserRole.SUPERVISOR, UserRole.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const claim = await prisma.claim.findUnique({ where: { id: req.params.id } });
    if (!claim) throw new AppError(404, 'Claim not found', 'NOT_FOUND');

    await enqueuePipeline(req.params.id, 'NORMAL');

    await createAuditEvent({
      claimId: req.params.id,
      actorId: req.user!.userId,
      actorType: 'HUMAN',
      action: 'AI_REANALYSIS_REQUESTED',
      details: {},
    });

    res.json({ data: { message: 'AI reanalysis queued' } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/claims/:id
claimsRouter.delete('/:id', authorize(UserRole.ADJUSTER, UserRole.SUPERVISOR, UserRole.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const claim = await prisma.claim.findUnique({ where: { id: req.params.id } });
    if (!claim) throw new AppError(404, 'Claim not found', 'NOT_FOUND');

    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { claimId: req.params.id } }),
      prisma.auditEvent.create({
        data: {
          claimId: req.params.id,
          actorId: req.user!.userId,
          actorType: 'HUMAN',
          action: 'CLAIM_DELETED',
          details: { claimNumber: claim.claimNumber, status: claim.status } as any,
        },
      }),
      prisma.claim.delete({ where: { id: req.params.id } }),
    ]);

    res.json({ data: { message: 'Claim deleted' } });
  } catch (err) {
    next(err);
  }
});
