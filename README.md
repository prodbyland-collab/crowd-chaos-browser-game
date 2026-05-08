# Crowd Chaos Browser Game

A fake browser simulation party game where one host plays the browser and the crowd votes in real time to unleash chaos. Everything happens safely inside the app UI.

## Features

- Room creation and join-by-code
- Host/player and crowd roles
- Simulated browser chrome with tabs, URL field, cursor, page content, and smooth scrolling
- WebSocket voting rounds every 8 seconds
- Majority chaos actions: scroll, tabs, fake typing, glitch, shake, freeze, theme shifts, popup spam
- Automatic random system events every 20-40 seconds
- Real-time chat with emoji-friendly messages
- Safe shared sandbox browser with allowlisted public internet pages
- Host-granted 30 second crowd control passes with instant revoke
- Sandbox strips scripts, forms, cookies, storage, and arbitrary navigation
- UI-only monetization placeholders for premium powers, event packs, private rooms, and streamer mode

## Safety Model

The app never controls a user's real browser, tabs, cookies, extensions, passwords, or logged-in accounts. The shared browser is a constrained in-app sandbox:

- only server-defined public allowlist destinations can load
- fetched pages are rendered through `/sandbox`
- scripts, forms, frames, arbitrary navigation, and storage are blocked
- crowd control must be granted by the host and expires automatically

## Run Locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The backend runs on port `3001` by default.

## Production

```bash
npm run build
npm start
```

The Node server serves the built React app and WebSocket endpoint from the same port.
