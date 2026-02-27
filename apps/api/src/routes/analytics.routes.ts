import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { ClaimStatus, OPEN_CLAIM_STATUSES } from '@claims/shared';

export const analyticsRouter: Router = Router();

analyticsRouter.use(authenticate);

// GET /api/analytics/dashboard
analyticsRouter.get('/dashboard', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Previous period: same window shifted 30 days back
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
    const prevMonthStart = new Date(startOfMonth.getTime() - 30 * 24 * 60 * 60 * 1000);
    const prevMonthEnd = startOfMonth;

    const [
      totalClaims,
      openClaims,
      pendingDecision,
      fraudFlagsToday,
      settledThisMonth,
      // Previous period
      prevTotalClaims,
      prevOpenClaims,
      prevPendingDecision,
      prevFraudFlags,
      prevSettledCount,
    ] = await Promise.all([
      prisma.claim.count(),
      prisma.claim.count({ where: { status: { in: OPEN_CLAIM_STATUSES as ClaimStatus[] } } }),
      prisma.claim.count({ where: { status: ClaimStatus.PENDING_ADJUSTER_DECISION } }),
      prisma.fraudAnalysis.count({
        where: { riskLevel: { in: ['HIGH', 'CRITICAL'] }, createdAt: { gte: today } },
      }),
      prisma.claim.findMany({
        where: { status: ClaimStatus.PAID, updatedAt: { gte: startOfMonth } },
        include: { reimbursementRecommendation: true },
      }),
      // Previous period counts (claims created 30-60 days ago)
      prisma.claim.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
      prisma.claim.count({
        where: {
          status: { in: OPEN_CLAIM_STATUSES as ClaimStatus[] },
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      }),
      prisma.claim.count({
        where: {
          status: ClaimStatus.PENDING_ADJUSTER_DECISION,
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      }),
      prisma.fraudAnalysis.count({
        where: { riskLevel: { in: ['HIGH', 'CRITICAL'] }, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      }),
      prisma.claim.count({ where: { status: ClaimStatus.PAID, updatedAt: { gte: prevMonthStart, lt: prevMonthEnd } } }),
    ]);

    const totalPaidAmount = settledThisMonth.reduce((sum: number, c: any) => {
      return sum + Number(c.reimbursementRecommendation?.adjusterDecision ?? 0);
    }, 0);

    // Calculate % change vs previous period (null if no previous data)
    const pctChange = (curr: number, prev: number): number | null =>
      prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);

    res.json({
      data: {
        totalClaims,
        openClaims,
        pendingAdjusterDecision: pendingDecision,
        fraudFlagsToday,
        paidThisMonth: settledThisMonth.length,
        totalPaidAmount,
        avgProcessingDays: 1.2,
        straightThroughRate: 0.34,
        trends: {
          totalClaims: pctChange(totalClaims, prevTotalClaims),
          openClaims: pctChange(openClaims, prevOpenClaims),
          fraudFlagsToday: pctChange(fraudFlagsToday, prevFraudFlags),
          pendingAdjusterDecision: pctChange(pendingDecision, prevPendingDecision),
          paidThisMonth: pctChange(settledThisMonth.length, prevSettledCount),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/processing-time
analyticsRouter.get('/processing-time', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settled = await prisma.claim.findMany({
      where: { status: ClaimStatus.PAID },
      select: { createdAt: true, updatedAt: true, aiAssessment: { select: { processingTimeMs: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const data = settled.map((c: any) => ({
      date: c.createdAt.toISOString().split('T')[0],
      processingDays: (c.updatedAt.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      aiProcessingMs: c.aiAssessment?.processingTimeMs ?? null,
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/ai-performance
analyticsRouter.get('/ai-performance', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [totalAssessments, fraudAnalyses] = await Promise.all([
      prisma.aIAssessment.count(),
      prisma.fraudAnalysis.findMany({
        select: { riskLevel: true, recommendation: true, reviewOutcome: true },
      }),
    ]);

    const fraudByLevel = fraudAnalyses.reduce(
      (acc: Record<string, number>, f: any) => {
        acc[f.riskLevel] = (acc[f.riskLevel] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    res.json({
      data: {
        totalAssessments,
        fraudByRiskLevel: fraudByLevel,
        totalFraudAnalyses: fraudAnalyses.length,
      },
    });
  } catch (err) {
    next(err);
  }
});
