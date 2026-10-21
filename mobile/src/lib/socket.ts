import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, getToken } from './api';

let socket: Socket | null = null;
let socketToken: string | null = null;

export function getSocket(): Socket | null {
  const token = getToken();
  if (!token) { socket?.disconnect(); socket = null; return null; }
  if (socket && socketToken === token) return socket;
  socket?.disconnect();
  socketToken = token;
  socket = io(API_URL, { auth: { token }, transports: ['websocket'], reconnection: true, reconnectionDelayMax: 5000 });
  return socket;
}

export function disconnectSocket() { socket?.disconnect(); socket = null; socketToken = null; }

/** Subscribe to a socket event for the lifetime of the component. */
export function useSocketEvent<T = any>(event: string, handler: (payload: T) => void, deps: unknown[] = []) {
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    s.on(event, handler);
    return () => { s.off(event, handler); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps]);
}

export async function emitAck<T = any>(event: string, payload: unknown): Promise<T> {
  const s = getSocket();
  if (!s) throw new Error('not_connected');
  return s.timeout(30_000).emitWithAck(event, payload);
}
