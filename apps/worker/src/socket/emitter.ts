import { io as SocketClient } from 'socket.io-client';
import { env } from '../config/env.js';

// The worker emits events to the API server's Socket.io instance
// which then broadcasts to connected clients
const socket = SocketClient(env.API_URL, {
  auth: { token: process.env.WORKER_INTERNAL_TOKEN ?? 'worker-internal' },
  reconnection: true,
  reconnectionDelay: 1000,
});

socket.on('connect', () => console.log('Worker connected to API socket'));
socket.on('connect_error', (err) => console.error('Worker socket error:', err.message));

export function emitJobEvent(claimId: string, event: string, data: unknown) {
  socket.emit('worker:broadcast', { claimId, event, data });
}
