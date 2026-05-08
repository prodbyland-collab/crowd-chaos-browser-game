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
  { id: 'popup', label: 'Popup storm' },
  { id: 'public-scroll-down', label: 'Public browser scroll down' },
  { id: 'public-scroll-up', label: 'Public browser scroll up' },
  { id: 'public-wikipedia', label: 'Public browser: Wikipedia' },
  { id: 'public-nasa', label: 'Public browser: NASA' },
  { id: 'public-mdn', label: 'Public browser: MDN' },
  { id: 'public-map', label: 'Public browser: OpenStreetMap' }
];

const SAFE_SITES = [
  { id: 'example', title: 'Example Domain', url: 'https://example.com' },
  { id: 'wikipedia', title: 'Wikipedia Main Page', url: 'https://www.wikipedia.org' },
  { id: 'nasa', title: 'NASA', url: 'https://www.nasa.gov' },
  { id: 'mdn', title: 'MDN Web Docs', url: 'https://developer.mozilla.org' },
  { id: 'openstreetmap', title: 'OpenStreetMap', url: 'https://www.openstreetmap.org' },
  { id: 'archive', title: 'Internet Archive', url: 'https://archive.org' }
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
app.get('/sandbox', async (req, res) => {
  const site = safeSiteFor(req.query.site);
  if (!site) {
    res.status(403).send('<h1>Destination blocked</h1><p>This sandbox only opens allowlisted public pages.</p>');
    return;
  }

  try {
    const response = await fetch(site.url, {
      headers: {
        'User-Agent': 'CrowdChaosSandbox/1.0',
        Accept: 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      res.status(415).send('<h1>Preview unavailable</h1><p>The sandbox only previews HTML pages.</p>');
      return;
    }

    const html = await response.text();
    res
      .setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src https: data:; style-src https: 'unsafe-inline'; font-src https: data:; media-src https:; frame-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"
      )
      .type('html')
      .send(sanitizeSandboxHtml(html, site.url));
  } catch {
    res.status(502).send('<h1>Sandbox fetch failed</h1><p>The public page could not be loaded right now.</p>');
  }
});
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
    sandbox: {
      siteId: SAFE_SITES[0].id,
      url: SAFE_SITES[0].url,
      title: SAFE_SITES[0].title,
      scrollY: 0,
      controllerId: null,
      controlExpiresAt: null
    },
    chat: [],
    createdAt: Date.now()
  };
  rooms.set(code, room);
  scheduleVote(room);
  scheduleSystemEvent(room);
  return room;
}

function publicRoom(room) {
  expireControl(room);
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
    safeSites: SAFE_SITES,
    sandbox: {
      ...room.sandbox,
      controllerName: room.sandbox.controllerId ? room.users.get(room.sandbox.controllerId)?.name || 'Controller' : null
    },
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
    executeVotedAction(room, action);
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

function executeVotedAction(room, action) {
  const siteByAction = {
    'public-wikipedia': 'wikipedia',
    'public-nasa': 'nasa',
    'public-mdn': 'mdn',
    'public-map': 'openstreetmap'
  };

  if (action === 'public-scroll-down') {
    room.sandbox.scrollY = Math.min(1800, room.sandbox.scrollY + 420);
  }

  if (action === 'public-scroll-up') {
    room.sandbox.scrollY = Math.max(0, room.sandbox.scrollY - 420);
  }

  if (siteByAction[action]) {
    const site = safeSiteFor(siteByAction[action]);
    room.sandbox.siteId = site.id;
    room.sandbox.url = site.url;
    room.sandbox.title = site.title;
    room.sandbox.scrollY = 0;
  }
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

function isHost(room, userId) {
  return room.hostId === userId;
}

function canControlSandbox(room, userId) {
  expireControl(room);
  return isHost(room, userId) || room.sandbox.controllerId === userId;
}

function expireControl(room) {
  if (room.sandbox.controlExpiresAt && room.sandbox.controlExpiresAt <= Date.now()) {
    room.sandbox.controllerId = null;
    room.sandbox.controlExpiresAt = null;
  }
}

function safeSiteFor(urlOrId) {
  const requested = String(urlOrId || '').trim();
  return SAFE_SITES.find((site) => site.id === requested || site.url === requested);
}

function sanitizeSandboxHtml(html, baseUrl) {
  const withoutScripts = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<form\b[^>]*>/gi, '<div data-blocked-form="true">')
    .replace(/<\/form>/gi, '</div>')
    .replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, '');
  const base = `<base href="${baseUrl}">`;
  const banner = `
    <style>
      body { padding-top: 52px !important; }
      .crowd-chaos-sandbox-banner {
        position: fixed; z-index: 2147483647; inset: 0 0 auto 0;
        min-height: 42px; padding: 10px 14px;
        color: #001018; background: linear-gradient(90deg, #39d3ff, #b352ff);
        font: 700 14px system-ui, sans-serif;
      }
      .crowd-chaos-sandbox-banner small { opacity: .82; margin-left: 10px; }
    </style>
    <div class="crowd-chaos-sandbox-banner">
      Crowd Chaos Safe Sandbox
      <small>Scripts, forms, cookies, storage, and arbitrary navigation are blocked.</small>
    </div>
  `;
  if (withoutScripts.match(/<head[^>]*>/i)) {
    return withoutScripts.replace(/<head[^>]*>/i, (match) => `${match}${base}${banner}`);
  }
  return `<!doctype html><html><head>${base}${banner}</head><body>${withoutScripts}</body></html>`;
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
      if (!currentRoom.users.has(userId)) return;
      if (ACTIONS.some((action) => action.id === message.actionId)) {
        currentRoom.votes.set(userId, message.actionId);
        sync(currentRoom);
      }
      return;
    }

    if (message.type === 'control:grant') {
      if (!isHost(currentRoom, userId)) return;
      const target = currentRoom.users.get(message.targetUserId);
      if (!target || target.role !== 'crowd') return;
      currentRoom.sandbox.controllerId = target.id;
      currentRoom.sandbox.controlExpiresAt = Date.now() + 30000;
      broadcast(currentRoom, {
        type: 'system:event',
        event: { label: `${target.name} received sandbox control for 30 seconds`, at: Date.now() }
      });
      sync(currentRoom);
      return;
    }

    if (message.type === 'control:revoke') {
      if (!isHost(currentRoom, userId)) return;
      currentRoom.sandbox.controllerId = null;
      currentRoom.sandbox.controlExpiresAt = null;
      sync(currentRoom);
      return;
    }

    if (message.type === 'sandbox:navigate') {
      if (!canControlSandbox(currentRoom, userId)) return;
      const site = safeSiteFor(message.siteId || message.url);
      if (!site) {
        send(ws, { type: 'error', message: 'That destination is outside the sandbox allowlist' });
        return;
      }
      currentRoom.sandbox.siteId = site.id;
      currentRoom.sandbox.url = site.url;
      currentRoom.sandbox.title = site.title;
      currentRoom.sandbox.scrollY = 0;
      broadcast(currentRoom, {
        type: 'system:event',
        event: { label: `Sandbox navigated to ${site.title}`, at: Date.now() }
      });
      sync(currentRoom);
      return;
    }

    if (message.type === 'sandbox:scroll') {
      if (!canControlSandbox(currentRoom, userId)) return;
      const delta = Math.max(-500, Math.min(500, Number(message.delta) || 0));
      currentRoom.sandbox.scrollY = Math.max(0, Math.min(1800, currentRoom.sandbox.scrollY + delta));
      sync(currentRoom);
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
