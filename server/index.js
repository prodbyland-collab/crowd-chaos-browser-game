import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const VOTE_SECONDS = 8;

const ACTIONS = [
  { id: 'scroll-down', label: 'Scroll down' },
  { id: 'scroll-up', label: 'Scroll up' },
  { id: 'open-tab', label: 'Open random tab' },
  { id: 'close-tab', label: 'Close tab' },
  { id: 'type-text', label: 'Type random search' },
  { id: 'glitch', label: 'Trigger glitch' },
  { id: 'shake', label: 'Shake window' },
  { id: 'freeze', label: 'Freeze screen' },
  { id: 'theme', label: 'Change theme' },
  { id: 'popup', label: 'Popup storm' }
];

const SYSTEM_EVENTS = [
  'System lag detected',
  'Random tab appeared',
  'Cursor delay increased',
  'Popup storm',
  'Screen inversion mode',
  'Memory leak cosplay',
  'Search bar gained opinions'
];

const rooms = new Map();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(join(__dirname, '..', 'dist')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
app.get(/.*/, (_req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return rooms.has(code) ? roomCode() : code;
}

function createRoom(hostId) {
  const code = roomCode();
  const room = {
    code,
    hostId,
    users: new Map(),
    votes: new Map(),
    voteEndsAt: Date.now() + VOTE_SECONDS * 1000,
    voteTimer: null,
    systemTimer: null,
    round: 1,
    lastResult: null,
    chat: [],
    createdAt: Date.now()
  };
  rooms.set(code, room);
  scheduleVote(room);
  scheduleSystemEvent(room);
  return room;
}

function publicRoom(room) {
  const voteCounts = ACTIONS.reduce((acc, action) => {
    acc[action.id] = 0;
    return acc;
  }, {});
  for (const action of room.votes.values()) voteCounts[action] = (voteCounts[action] || 0) + 1;

  return {
    code: room.code,
    hostId: room.hostId,
    users: [...room.users.values()].map(({ id, name, role }) => ({ id, name, role })),
    actions: ACTIONS,
    voteCounts,
    voteEndsAt: room.voteEndsAt,
    round: room.round,
    lastResult: room.lastResult,
    chat: room.chat.slice(-60)
  };
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(room, payload) {
  for (const user of room.users.values()) send(user.ws, payload);
}

function sync(room) {
  broadcast(room, { type: 'room:update', room: publicRoom(room) });
}

function winningAction(room) {
  const counts = new Map();
  for (const action of room.votes.values()) counts.set(action, (counts.get(action) || 0) + 1);
  if (!counts.size) return ACTIONS[Math.floor(Math.random() * ACTIONS.length)].id;

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const bestCount = sorted[0][1];
  const tied = sorted.filter(([, count]) => count === bestCount).map(([action]) => action);
  return tied[Math.floor(Math.random() * tied.length)];
}

function scheduleVote(room) {
  clearTimeout(room.voteTimer);
  room.voteEndsAt = Date.now() + VOTE_SECONDS * 1000;
  room.voteTimer = setTimeout(() => {
    const action = winningAction(room);
    const actionMeta = ACTIONS.find((item) => item.id === action);
    room.lastResult = {
      id: action,
      label: actionMeta?.label || action,
      at: Date.now(),
      votes: room.votes.size
    };
    room.votes.clear();
    room.round += 1;
    broadcast(room, { type: 'chaos:action', action: room.lastResult });
    scheduleVote(room);
    sync(room);
  }, VOTE_SECONDS * 1000);
}

function scheduleSystemEvent(room) {
  clearTimeout(room.systemTimer);
  const delay = 20000 + Math.floor(Math.random() * 20000);
  room.systemTimer = setTimeout(() => {
    const event = SYSTEM_EVENTS[Math.floor(Math.random() * SYSTEM_EVENTS.length)];
    broadcast(room, { type: 'system:event', event: { label: event, at: Date.now() } });
    scheduleSystemEvent(room);
  }, delay);
}

function cleanup(room) {
  if (room.users.size > 0) return;
  clearTimeout(room.voteTimer);
  clearTimeout(room.systemTimer);
  rooms.delete(room.code);
}

wss.on('connection', (ws) => {
  const userId = crypto.randomUUID();
  let currentRoom = null;

  send(ws, { type: 'hello', userId });

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', message: 'Invalid message payload' });
      return;
    }

    if (message.type === 'room:create') {
      currentRoom = createRoom(userId);
      currentRoom.users.set(userId, {
        id: userId,
        name: cleanName(message.name, 'Host'),
        role: 'player',
        ws
      });
      send(ws, { type: 'joined', userId, room: publicRoom(currentRoom), role: 'player' });
      sync(currentRoom);
      return;
    }

    if (message.type === 'room:join') {
      const code = String(message.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: 'error', message: 'Room not found' });
        return;
      }
      currentRoom = room;
      room.users.set(userId, {
        id: userId,
        name: cleanName(message.name, 'Crowd'),
        role: userId === room.hostId ? 'player' : 'crowd',
        ws
      });
      send(ws, { type: 'joined', userId, room: publicRoom(room), role: room.users.get(userId).role });
      sync(room);
      return;
    }

    if (!currentRoom) {
      send(ws, { type: 'error', message: 'Join a room first' });
      return;
    }

    if (message.type === 'vote') {
      if (currentRoom.users.get(userId)?.role !== 'crowd') return;
      if (ACTIONS.some((action) => action.id === message.actionId)) {
        currentRoom.votes.set(userId, message.actionId);
        sync(currentRoom);
      }
      return;
    }

    if (message.type === 'chat') {
      const user = currentRoom.users.get(userId);
      const text = String(message.text || '').trim().slice(0, 240);
      if (!text) return;
      currentRoom.chat.push({
        id: crypto.randomUUID(),
        userId,
        name: user?.name || 'Guest',
        role: user?.role || 'crowd',
        text,
        at: Date.now()
      });
      sync(currentRoom);
    }
  });

  ws.on('close', () => {
    if (!currentRoom) return;
    currentRoom.users.delete(userId);
    if (currentRoom.hostId === userId) {
      const next = [...currentRoom.users.values()][0];
      currentRoom.hostId = next?.id || null;
      if (next) next.role = 'player';
    }
    sync(currentRoom);
    cleanup(currentRoom);
  });
});

function cleanName(value, fallback) {
  return String(value || fallback).trim().slice(0, 24) || fallback;
}

server.listen(PORT, () => {
  console.log(`Crowd Chaos server running on http://localhost:${PORT}`);
});
