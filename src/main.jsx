import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Crown,
  Flame,
  Ghost,
  Lock,
  MessageCircle,
  MonitorUp,
  MousePointer2,
  Plus,
  RadioTower,
  Send,
  Sparkles,
  Timer,
  Users,
  X,
  Zap
} from 'lucide-react';
import './styles.css';

const THEMES = ['violet', 'cyan', 'acid', 'ember'];
const RANDOM_TABS = [
  'neon://arcade-pulse',
  'chaos://vote-lab',
  'stream://panic-room',
  'fake://search-results',
  'sys://lag-report',
  'dream://browser-afterparty'
];
const SEARCH_LINES = [
  'why is my browser haunted by democracy',
  'best tabs to open under pressure',
  'how to uninstall crowd decisions',
  'neon snacks near me',
  'can a popup feel remorse'
];

function connectUrl() {
  if (location.port === '5173') return 'ws://localhost:3001';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [userId, setUserId] = useState('');
  const [name, setName] = useState(localStorage.getItem('chaos:name') || '');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState(null);
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [effects, setEffects] = useState([]);
  const [tabs, setTabs] = useState([
    { id: 'home', title: 'Chaos Home', url: 'chaos://home' },
    { id: 'feed', title: 'Crowd Feed', url: 'vote://live-feed' }
  ]);
  const [activeTab, setActiveTab] = useState('home');
  const [urlValue, setUrlValue] = useState('chaos://home');
  const [scrollY, setScrollY] = useState(0);
  const [cursor, setCursor] = useState({ x: 52, y: 46 });
  const [popups, setPopups] = useState([]);
  const [chatText, setChatText] = useState('');
  const [theme, setTheme] = useState('violet');
  const [notice, setNotice] = useState('Waiting for the crowd to cause trouble...');

  useEffect(() => {
    const ws = new WebSocket(connectUrl());
    ws.addEventListener('open', () => setConnected(true));
    ws.addEventListener('close', () => setConnected(false));
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'hello') setUserId(msg.userId);
      if (msg.type === 'error') setError(msg.message);
      if (msg.type === 'joined') {
        setRoom(msg.room);
        setRole(msg.role);
        setError('');
      }
      if (msg.type === 'room:update') setRoom(msg.room);
      if (msg.type === 'chaos:action') applyChaos(msg.action);
      if (msg.type === 'system:event') applySystemEvent(msg.event);
    });
    setSocket(ws);
    return () => ws.close();
  }, []);

  const me = room?.users.find((user) => user.id === userId);
  const secondsLeft = room ? Math.max(0, Math.ceil((room.voteEndsAt - Date.now()) / 1000)) : 0;
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const tab = tabs.find((item) => item.id === activeTab);
    if (tab) setUrlValue(tab.url);
  }, [activeTab, tabs]);

  function send(type, payload = {}) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...payload }));
  }

  function createRoom() {
    localStorage.setItem('chaos:name', name);
    send('room:create', { name: name || 'Host' });
  }

  function joinRoom() {
    localStorage.setItem('chaos:name', name);
    send('room:join', { name: name || 'Crowd', code: joinCode });
  }

  function applyChaos(action) {
    setNotice(`${action.label} won the vote`);
    runAction(action.id);
  }

  function applySystemEvent(event) {
    setNotice(event.label);
    const mapped = {
      'Random tab appeared': 'open-tab',
      'Popup storm': 'popup',
      'Screen inversion mode': 'theme',
      'System lag detected': 'freeze',
      'Cursor delay increased': 'shake'
    };
    runAction(mapped[event.label] || ['glitch', 'shake', 'popup'][Math.floor(Math.random() * 3)]);
  }

  function runAction(actionId) {
    if (actionId === 'scroll-down') setScrollY((value) => Math.min(value + 280, 980));
    if (actionId === 'scroll-up') setScrollY((value) => Math.max(value - 260, 0));
    if (actionId === 'open-tab') openRandomTab();
    if (actionId === 'close-tab') closeActiveTab();
    if (actionId === 'type-text') typeRandomText();
    if (actionId === 'glitch') temporaryEffect('glitch', 2500);
    if (actionId === 'shake') temporaryEffect('shake', 1100);
    if (actionId === 'freeze') temporaryEffect('freeze', 2100);
    if (actionId === 'theme') setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
    if (actionId === 'popup') popupStorm();
    if (actionId === 'invert') temporaryEffect('invert', 5000);
    setCursor({ x: 18 + Math.random() * 66, y: 22 + Math.random() * 54 });
  }

  function temporaryEffect(name, duration) {
    setEffects((current) => [...new Set([...current, name])]);
    setTimeout(() => setEffects((current) => current.filter((effect) => effect !== name)), duration);
  }

  function openRandomTab() {
    const url = RANDOM_TABS[Math.floor(Math.random() * RANDOM_TABS.length)];
    const id = crypto.randomUUID();
    setTabs((current) => [...current, { id, title: url.split('://')[1], url }]);
    setActiveTab(id);
  }

  function closeActiveTab() {
    setTabs((current) => {
      if (current.length === 1) return current;
      const index = current.findIndex((tab) => tab.id === activeTab);
      const next = current.filter((tab) => tab.id !== activeTab);
      setActiveTab(next[Math.max(0, index - 1)]?.id || next[0].id);
      return next;
    });
  }

  function typeRandomText() {
    const line = SEARCH_LINES[Math.floor(Math.random() * SEARCH_LINES.length)];
    setUrlValue('');
    [...line].forEach((char, index) => {
      setTimeout(() => setUrlValue((value) => value + char), index * 28);
    });
  }

  function popupStorm() {
    const batch = Array.from({ length: 6 }, (_, index) => ({
      id: crypto.randomUUID(),
      title: ['Premium Chaos', 'Vote Applied', 'Lag Oracle', 'Streamer Mode'][index % 4],
      x: 9 + Math.random() * 58,
      y: 15 + Math.random() * 48
    }));
    setPopups(batch);
    setTimeout(() => setPopups([]), 3600);
  }

  function vote(actionId) {
    send('vote', { actionId });
  }

  function submitChat(event) {
    event.preventDefault();
    send('chat', { text: chatText });
    setChatText('');
  }

  if (!room) {
    return (
      <main className={`shell theme-${theme}`}>
        <section className="entry-panel glass">
          <div className="brand">
            <div className="brand-mark"><Zap size={32} /></div>
            <div>
              <p className="eyebrow">Fake browser party sim</p>
              <h1>Crowd Chaos Browser Game</h1>
            </div>
          </div>
          <p className="intro">
            One player pilots a simulated browser while the crowd votes every few seconds to mess with it in real time.
          </p>
          <div className="entry-grid">
            <label>
              Display name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="NeonPilot" />
            </label>
            <button className="primary" onClick={createRoom} disabled={!connected}>
              <Crown size={18} /> Create room
            </button>
            <label>
              Room code
              <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="A7K9Q" />
            </label>
            <button className="secondary" onClick={joinRoom} disabled={!connected || !joinCode.trim()}>
              <Users size={18} /> Join crowd
            </button>
          </div>
          <div className="status-line">
            <RadioTower size={16} /> {connected ? 'WebSocket online' : 'Connecting...'}
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className={`app theme-${theme} ${effects.join(' ')}`}>
      <section className="game-grid">
        <aside className="side glass">
          <RoomHeader room={room} role={role} me={me} connected={connected} />
          <VotePanel room={room} role={role} clock={clock} vote={vote} />
          <StorePanel />
        </aside>

        <section className="browser-wrap">
          <div className="notice"><Sparkles size={16} /> {notice}</div>
          <FakeBrowser
            tabs={tabs}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            closeActiveTab={closeActiveTab}
            urlValue={urlValue}
            setUrlValue={setUrlValue}
            scrollY={scrollY}
            cursor={cursor}
            popups={popups}
            role={role}
          />
        </section>

        <ChatPanel room={room} chatText={chatText} setChatText={setChatText} submitChat={submitChat} />
      </section>
    </main>
  );
}

function RoomHeader({ room, role, me, connected }) {
  return (
    <div className="room-card">
      <div className="room-code">{room.code}</div>
      <div className="pill"><RadioTower size={14} /> {connected ? 'Live room' : 'Reconnecting'}</div>
      <div className="role">
        {role === 'player' ? <Crown size={18} /> : <Users size={18} />}
        <span>{me?.name || 'Guest'} is {role === 'player' ? 'Player' : 'Crowd'}</span>
      </div>
      <div className="user-stack">
        {room.users.map((user) => (
          <span key={user.id} className={user.role}>{user.role === 'player' ? 'Host' : 'Crowd'} · {user.name}</span>
        ))}
      </div>
    </div>
  );
}

function VotePanel({ room, role, clock, vote }) {
  const secondsLeft = Math.max(0, Math.ceil((room.voteEndsAt - clock) / 1000));
  const total = Object.values(room.voteCounts).reduce((sum, count) => sum + count, 0) || 1;
  return (
    <div className="vote-panel">
      <div className="panel-title"><Timer size={18} /> Round {room.round} · {secondsLeft}s</div>
      <div className="action-list">
        {room.actions.map((action) => {
          const count = room.voteCounts[action.id] || 0;
          return (
            <button key={action.id} className="vote-action" onClick={() => vote(action.id)} disabled={role !== 'crowd'}>
              <span>{action.label}</span>
              <small>{count} votes</small>
              <i style={{ width: `${(count / total) * 100}%` }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FakeBrowser({ tabs, activeTab, setActiveTab, closeActiveTab, urlValue, setUrlValue, scrollY, cursor, popups, role }) {
  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const cards = useMemo(() => [
    ['LIVE SIGNAL', 'Crowd sentiment is unstable. Democracy is currently touching the scroll wheel.'],
    ['TAB WEATHER', 'Expect sudden fake URLs, popup pressure, and short bursts of screen weirdness.'],
    ['PLAYER OBJECTIVE', 'Stay readable. Stay calm. Pretend the browser is supposed to do that.'],
    ['SYSTEM EVENT QUEUE', 'Automatic events may appear without a vote because the machine enjoys drama.'],
    ['FAKE SEARCH RESULTS', 'No real browser APIs are used. This entire surface is a safe simulation.']
  ], []);

  return (
    <div className="browser glass">
      <div className="browser-top">
        <div className="traffic"><b /><b /><b /></div>
        <button><ArrowLeft size={16} /></button>
        <button><ArrowRight size={16} /></button>
        <div className="url-field">
          <Lock size={14} />
          <input value={urlValue} onChange={(event) => setUrlValue(event.target.value)} />
        </div>
        <button><Plus size={16} /></button>
      </div>
      <div className="tabs">
        {tabs.map((tab) => (
          <button key={tab.id} className={tab.id === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
            <MonitorUp size={14} />
            <span>{tab.title}</span>
            <X size={12} onClick={(event) => { event.stopPropagation(); closeActiveTab(); }} />
          </button>
        ))}
      </div>
      <div className="viewport">
        <MousePointer2 className="cursor" style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }} />
        <div className="page" style={{ transform: `translateY(-${scrollY}px)` }}>
          <header className="page-hero">
            <p>SIMULATED TAB · {active.url}</p>
            <h2>{active.title}</h2>
            <div className="hero-meter"><span /></div>
          </header>
          <div className="content-grid">
            {cards.map(([title, body]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <div className="fake-terminal">
            <p>$ crowdctl vote --target browser</p>
            <p>majority action pending... role={role}</p>
            <p>rendering safe fake chaos inside viewport</p>
          </div>
        </div>
        {popups.map((popup) => (
          <div key={popup.id} className="popup" style={{ left: `${popup.x}%`, top: `${popup.y}%` }}>
            <Ghost size={18} />
            <strong>{popup.title}</strong>
            <span>Upgrade the chaos budget?</span>
          </div>
        ))}
      </div>
      <div className="freeze-screen"><Bot size={48} /><span>Frozen by crowd vote</span></div>
    </div>
  );
}

function ChatPanel({ room, chatText, setChatText, submitChat }) {
  return (
    <aside className="chat glass">
      <div className="panel-title"><MessageCircle size={18} /> Room chat</div>
      <div className="messages">
        {room.chat.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <strong>{message.name}</strong>
            <p>{message.text}</p>
          </div>
        ))}
      </div>
      <form onSubmit={submitChat}>
        <input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Send chaos commentary..." />
        <button><Send size={16} /></button>
      </form>
    </aside>
  );
}

function StorePanel() {
  return (
    <div className="store">
      <div className="panel-title"><Flame size={18} /> Unlocks</div>
      {['Premium Chaos Powers', 'Custom Event Packs', 'Private Rooms', 'Streamer Mode'].map((item) => (
        <div className="store-item" key={item}>
          <span>{item}</span>
          <small>UI only</small>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
