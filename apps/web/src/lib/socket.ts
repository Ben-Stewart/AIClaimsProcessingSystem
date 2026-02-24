import { io, Socket } from 'socket.io-client';
import { WS_EVENTS } from '@claims/shared';
import { getAccessToken } from './api.js';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      auth: { token: getAccessToken() },
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) {
    s.auth = { token: getAccessToken() };
    s.connect();
  }
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function subscribeToClaimUpdates(claimId: string) {
  getSocket().emit(WS_EVENTS.SUBSCRIBE_CLAIM, claimId);
}

export function unsubscribeFromClaimUpdates(claimId: string) {
  getSocket().emit(WS_EVENTS.UNSUBSCRIBE_CLAIM, claimId);
}
