# Royal Duel ♠ ♥ ♦ ♣

A real-time 2-player online card game built with Node.js, Express, and Socket.IO.

---

## Requirements

- Node.js 16 or higher
- npm 7 or higher

---

## Installation & Running Locally

```bash
# 1. Enter the project folder
cd royal-duel

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

Open your browser at:

```
http://localhost:3000
```

---

## How to Play

### Creating a Room

1. Open `http://localhost:3000` in your browser.
2. Click **Create Room**.
3. Enter your name and click **Create Room**.
4. A 6-character room code will appear (e.g. `AB3Z7K`).
5. Click **Copy Room Code** and share it with your opponent.
6. Wait for your opponent to join — the game starts automatically.

### Joining a Room

1. Open `http://localhost:3000` in a second browser tab, window, or on a different device.
2. Click **Join Room**.
3. Enter your name and the 6-character room code you received.
4. Click **Join Game**.
5. The game starts immediately if the room exists and has space.

---

## Game Rules

### Setup

- Each player receives **6 cards**.
- The remaining cards form the **draw pile**.
- The bottom card of the deck is revealed as the **Trump card** — its suit is the **trump suit** for the whole game.

### Turn Structure

- **Attacker** plays any card face-up to the battle area.
- **Defender** must either:
  - Play a **higher card of the same suit**, OR
  - Play any **trump card** (if the attack card is not trump), OR
  - Click **Take Cards** to concede the round (take the attack card into their hand).

### Scoring

- If the **defender successfully beats** the attack card → defender scores **1 point**, becomes the next attacker.
- If the **defender takes** the attack card → attacker scores **1 point**, attacker stays attacker.

### Drawing

After each round, both players draw cards until they have 6 (if the deck has enough cards).

### Card Values

| Card | Value |
|------|-------|
| 2–10 | Face value (2–10) |
| J    | 11 |
| Q    | 12 |
| K    | 13 |
| A    | 14 |

Trump suit beats any non-trump suit regardless of rank.

### Winning

The game ends when the deck is empty **and** both players have no cards left.

The player with the **most points wins**.

---

## Two Players on Different Computers

For two players on the same Wi-Fi network:

1. Find your local IP address:
   - **macOS/Linux**: `ifconfig | grep inet`
   - **Windows**: `ipconfig`
2. Start the server with `npm start`.
3. Player 1 opens `http://<your-local-ip>:3000`.
4. Player 2 opens the same URL on their device.

For players on the internet, deploy to a cloud service (see Deployment below).

---

## Deployment

The frontend automatically connects to whatever server origin serves it — no hardcoded `localhost`.

### Render (free tier, recommended)

1. Push your project to a GitHub repository.
2. Go to [render.com](https://render.com) and create a **New Web Service**.
3. Connect your GitHub repo.
4. Set:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Environment**: Node
5. Click **Deploy**. Render provides a public HTTPS URL.
6. Share the URL — both players open it in their browsers.

### Railway

1. Push your project to GitHub.
2. Go to [railway.app](https://railway.app) and click **New Project → Deploy from GitHub Repo**.
3. Select your repo. Railway auto-detects Node.js.
4. Set the start command to `node server.js` if not detected.
5. Railway provides a public domain automatically.

### Fly.io

1. Install the Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Login: `fly auth login`
3. From the project folder: `fly launch` (follow prompts, select a region)
4. Deploy: `fly deploy`
5. Your app will be live at `https://<your-app>.fly.dev`

---

## Project Structure

```
royal-duel/
├── package.json      — dependencies and npm scripts
├── server.js         — Express + Socket.IO server (authoritative game logic)
├── README.md
└── public/
    ├── index.html    — all screens (menu, waiting, game, result)
    ├── style.css     — premium casino visual design
    ├── game.js       — Socket.IO client, UI, animations, sound
    └── cards.js      — SVG card generation (full 52-card deck)
```

---

## Features

- Real-time multiplayer via Socket.IO WebSockets
- Private rooms with 6-character codes
- Server-authoritative game state (cheating prevented)
- Private hands — opponents never see your cards
- Trump suit mechanic
- Attack / Defend round system
- Score tracking
- Drag-and-drop or click-to-play
- Card flip and deal animations
- Web Audio API sounds (no external files)
- Confetti on victory
- Responsive layout (desktop, tablet, mobile)
- Reconnect handling
- Toast notifications
- Connection status indicator
- Sound on/off toggle
- Fullscreen mode
