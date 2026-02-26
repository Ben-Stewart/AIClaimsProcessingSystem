import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { WS_EVENTS, UserRole } from '@claims/shared';
import { prisma } from '../config/database.js';
import type { AuthPayload } from '../middleware/auth.js';

let io: SocketServer;

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));

    // Allow worker internal connection without JWT
    if (token === env.WORKER_INTERNAL_TOKEN) {
      socket.data.isWorker = true;
      return next();
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    // Worker relay: broadcast job/claim events to the appropriate claim room
    socket.on('worker:broadcast', (payload: { claimId: string; event: string; data: unknown }) => {
      if (!socket.data.isWorker) return;
      emitToClaimRoom(payload.claimId, payload.event, payload.data);
    });

    socket.on(WS_EVENTS.SUBSCRIBE_CLAIM, async (claimId: string) => {
      if (socket.data.isWorker) return;
      const user = socket.data.user as AuthPayload;
      if (user.role === UserRole.CLIENT) {
        const claim = await prisma.claim.findUnique({
          where: { id: claimId },
          include: { policy: { select: { clientId: true } } },
        });
        if (!claim || claim.policy?.clientId !== user.userId) return;
      }
      socket.join(`claim:${claimId}`);
    });

    socket.on(WS_EVENTS.UNSUBSCRIBE_CLAIM, (claimId: string) => {
      if (socket.data.isWorker) return;
      socket.leave(`claim:${claimId}`);
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

export function getIo(): SocketServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export function emitToClaimRoom(claimId: string, event: string, data: unknown) {
  getIo().to(`claim:${claimId}`).emit(event, data);
}
