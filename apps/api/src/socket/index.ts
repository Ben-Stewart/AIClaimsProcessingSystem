import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { WS_EVENTS } from '@claims/shared';

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
    try {
      jwt.verify(token, env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on(WS_EVENTS.SUBSCRIBE_CLAIM, (claimId: string) => {
      socket.join(`claim:${claimId}`);
    });

    socket.on(WS_EVENTS.UNSUBSCRIBE_CLAIM, (claimId: string) => {
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
