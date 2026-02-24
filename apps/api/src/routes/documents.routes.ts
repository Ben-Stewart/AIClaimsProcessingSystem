import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { DocumentUploadSchema, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, UserRole } from '@claims/shared';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { uploadFile, getPresignedUrl } from '../services/storage.service.js';
import { enqueueDocumentAnalysis } from '../jobs/queues.js';
import { createAuditEvent } from '../services/audit.service.js';

export const documentsRouter: Router = Router({ mergeParams: true });

documentsRouter.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype as typeof ALLOWED_MIME_TYPES[number])) {
      cb(null, true);
    } else {
      cb(new AppError(400, `File type ${file.mimetype} is not allowed`, 'INVALID_FILE_TYPE'));
    }
  },
});

// GET /api/claims/:claimId/documents
documentsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const documents = await prisma.document.findMany({
      where: { claimId: req.params.claimId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: documents });
  } catch (err) {
    next(err);
  }
});

// POST /api/claims/:claimId/documents
documentsRouter.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new AppError(400, 'No file provided', 'NO_FILE');

      const parsed = DocumentUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'Document type is required', 'VALIDATION_ERROR');
      }

      const claim = await prisma.claim.findUnique({
        where: { id: req.params.claimId },
        include: { policy: { select: { clientId: true } } },
      });
      if (!claim) throw new AppError(404, 'Claim not found', 'NOT_FOUND');

      if (req.user?.role === UserRole.CLIENT && claim.policy?.clientId !== req.user.userId) {
        throw new AppError(403, 'Access denied', 'FORBIDDEN');
      }

      const storageKey = await uploadFile(req.file, req.params.claimId);

      const document = await prisma.document.create({
        data: {
          claimId: req.params.claimId,
          type: parsed.data.type,
          originalName: req.file.originalname,
          storageKey,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          uploadedById: req.user!.userId,
        },
      });

      await enqueueDocumentAnalysis(document.id, req.params.claimId, parsed.data.type);

      await createAuditEvent({
        claimId: req.params.claimId,
        actorId: req.user!.userId,
        actorType: 'HUMAN',
        action: 'DOCUMENT_UPLOADED',
        details: { documentId: document.id, type: parsed.data.type, name: req.file.originalname },
      });

      res.status(201).json({ data: document });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/documents/:id/download
documentsRouter.get('/:id/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) throw new AppError(404, 'Document not found', 'NOT_FOUND');

    const url = await getPresignedUrl(document.storageKey);
    res.redirect(url);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/documents/:id
documentsRouter.delete('/:id', authorize(UserRole.ADJUSTER, UserRole.SUPERVISOR, UserRole.ADMIN), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!document) throw new AppError(404, 'Document not found', 'NOT_FOUND');

    await prisma.document.delete({ where: { id: req.params.id } });
    res.json({ data: { message: 'Document deleted' } });
  } catch (err) {
    next(err);
  }
});
