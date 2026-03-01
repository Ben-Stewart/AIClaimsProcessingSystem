import { Router, Request, Response, NextFunction } from 'express';
import OpenAI from 'openai';
import { ServiceType } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { prisma } from '../config/database.js';

export const providersRouter: Router = Router();

providersRouter.use(authenticate);

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const VALID_SERVICE_TYPES = new Set<string>(Object.values(ServiceType));

// GET /api/providers/search?q=<name>&type=<serviceType>
providersRouter.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, type } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      res.status(400).json({ error: 'INVALID_QUERY', message: 'Query must be at least 2 characters' });
      return;
    }

    const serviceType = typeof type === 'string' && VALID_SERVICE_TYPES.has(type)
      ? (type as ServiceType)
      : undefined;

    // ── Cache-first: check DB before calling GPT ──────────────────
    const cached = await prisma.provider.findMany({
      where: {
        name: { contains: q.trim(), mode: 'insensitive' },
        ...(serviceType && { serviceType }),
      },
      take: 3,
      orderBy: { createdAt: 'asc' },
    });

    if (cached.length > 0) {
      res.json({ data: cached.map((p) => ({ name: p.name, address: p.address, phone: p.phone })) });
      return;
    }

    // ── Cache miss: generate with GPT then persist ─────────────────
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a healthcare provider directory assistant for a Canadian employee benefits claims system. Return JSON only.',
        },
        {
          role: 'user',
          content: `Search for a healthcare provider in Canada matching this name:

Provider name: ${q.trim()}
Service type: ${typeof type === 'string' ? type.replace(/_/g, ' ').toLowerCase() : 'healthcare'}

Return JSON with 1-3 results:
{
  "results": [
    {
      "name": "Full provider name with professional credentials (e.g. Dr. Jane Smith, RMT)",
      "address": "Full address — street number, street name, city, province, postal code",
      "phone": "(XXX) XXX-XXXX"
    }
  ]
}

Match providers plausibly located in Canada. Include appropriate credentials in the name.`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as {
      results?: Array<{ name: string; address: string; phone: string }>;
    };

    const results = parsed.results ?? [];

    // Persist each result so future searches are consistent
    if (serviceType && results.length > 0) {
      await Promise.allSettled(
        results.map((r) =>
          prisma.provider.upsert({
            where: { name_serviceType: { name: r.name, serviceType } },
            update: {},
            create: { name: r.name, serviceType, address: r.address, phone: r.phone },
          }),
        ),
      );
    }

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});
