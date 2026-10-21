import type { ServerEvent } from '@detektyw/shared';

interface Conn {
  userId: string;
  seat: number;
  send(data: string): void;
}

/** Pokoje WebSocket per gra (jedna instancja serwera). */
export class Realtime {
  private rooms = new Map<string, Set<Conn>>();

  join(gameId: string, conn: Conn) {
    let room = this.rooms.get(gameId);
    if (!room) this.rooms.set(gameId, (room = new Set()));
    room.add(conn);
    this.broadcast(gameId, { type: 'presence', online: this.online(gameId) });
  }

  leave(gameId: string, conn: Conn) {
    const room = this.rooms.get(gameId);
    if (!room) return;
    room.delete(conn);
    if (room.size === 0) this.rooms.delete(gameId);
    else this.broadcast(gameId, { type: 'presence', online: this.online(gameId) });
  }

  online(gameId: string): number[] {
    return [...new Set([...(this.rooms.get(gameId) ?? [])].map((c) => c.seat))].sort();
  }

  broadcast(gameId: string, event: ServerEvent) {
    const data = JSON.stringify(event);
    for (const c of this.rooms.get(gameId) ?? []) {
      try {
        c.send(data);
      } catch {
        /* zerwane połączenie – sprzątnie je obsługa close */
      }
    }
  }
}
