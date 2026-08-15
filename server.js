'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }, pingTimeout: 30000, pingInterval: 10000 });

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

// ── Deck ──────────────────────────────────────
const SUITS = ['hearts','diamonds','clubs','spades'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_VALUES = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};

function createDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ suit:s, rank:r, id:`${r}_${s}` });
  return d;
}
function shuffle(d) {
  for (let i = d.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [d[i],d[j]] = [d[j],d[i]];
  }
  return d;
}
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join(''); }
  while (rooms[code]);
  return code;
}
function cardValue(c) { return RANK_VALUES[c.rank]; }
function canBeat(atk, def, trump) {
  if (def.suit === atk.suit) return cardValue(def) > cardValue(atk);
  if (def.suit === trump && atk.suit !== trump) return true;
  return false;
}

// ── Turn order ────────────────────────────────
function nextPlayerIndex(room, currentIdx) {
  const pids = room.turnOrder;
  let next = (currentIdx + 1) % pids.length;
  // skip offline players
  let tries = 0;
  while (!room.players[pids[next]]?.online && tries < pids.length) {
    next = (next + 1) % pids.length;
    tries++;
  }
  return next;
}
function nextPlayerId(room, currentId) {
  const idx = room.turnOrder.indexOf(currentId);
  return room.turnOrder[nextPlayerIndex(room, idx)];
}

// ── Deal ─────────────────────────────────────
function dealHands(room) {
  room.hands = {};
  const cardsEach = room.maxPlayers <= 2 ? 6 : room.maxPlayers === 3 ? 5 : 4;
  for (const pid of room.turnOrder) {
    room.hands[pid] = [];
    for (let i = 0; i < cardsEach && room.deck.length > 0; i++) room.hands[pid].push(room.deck.pop());
  }
}
function drawUntilFull(room) {
  const cardsEach = room.maxPlayers <= 2 ? 6 : room.maxPlayers === 3 ? 5 : 4;
  for (const pid of room.turnOrder) {
    while ((room.hands[pid]||[]).length < cardsEach && room.deck.length > 0)
      room.hands[pid].push(room.deck.pop());
  }
}

// ── State builder ─────────────────────────────
function buildStateFor(room, playerId) {
  const playerInfo = {};
  for (const [pid, pdata] of Object.entries(room.players)) {
    playerInfo[pid] = {
      name: pdata.name,
      online: pdata.online,
      score: room.scores[pid] || 0,
      cardCount: (room.hands[pid]||[]).length,
      joinOrder: pdata.joinOrder
    };
  }
  return {
    roomCode: room.code,
    myId: playerId,
    maxPlayers: room.maxPlayers,
    turnOrder: room.turnOrder,
    players: playerInfo,
    myHand: room.hands[playerId] || [],
    deckCount: room.deck.length,
    trumpCard: room.trumpCard,
    trumpSuit: room.trumpSuit,
    table: room.table,           // [{ playerId, card }]
    currentTurn: room.currentTurn,
    attackerId: room.attackerId,
    defenderId: room.defenderId,
    status: room.status,
    round: room.round,
    roundResult: room.roundResult,
    winner: room.winner,         // playerId | 'draw'
    phase: room.phase,           // 'attack' | 'defense'
    playerCount: Object.keys(room.players).length
  };
}

function broadcastState(room) {
  for (const [pid, pdata] of Object.entries(room.players)) {
    if (!pdata.socketId) continue;
    const sock = io.sockets.sockets.get(pdata.socketId);
    if (sock) sock.emit('game_state', buildStateFor(room, pid));
  }
}

// ── Start / restart ───────────────────────────
function startGame(room) {
  // Use two decks for 4 players so there's enough cards
  room.deck = room.maxPlayers >= 4 ? shuffle([...createDeck(),...createDeck()]) : shuffle(createDeck());
  room.trumpCard = room.deck[0];
  room.trumpSuit = room.trumpCard.suit;
  room.table = [];
  room.round = 0;
  room.scores = {};
  room.roundResult = null;
  room.winner = null;
  room.phase = 'attack';
  room.turnOrder = Object.keys(room.players).sort((a,b) => room.players[a].joinOrder - room.players[b].joinOrder);
  for (const pid of room.turnOrder) room.scores[pid] = 0;
  dealHands(room);
  room.currentTurn = room.turnOrder[0];
  room.attackerId  = room.turnOrder[0];
  room.defenderId  = room.turnOrder[1] || room.turnOrder[0];
  room.status = 'playing';
}

// ── Game-over check ───────────────────────────
function checkGameOver(room) {
  if (room.deck.length === 0) {
    const allEmpty = room.turnOrder.every(pid => (room.hands[pid]||[]).length === 0);
    if (allEmpty) {
      room.status = 'finished';
      const sorted = [...room.turnOrder].sort((a,b) => (room.scores[b]||0) - (room.scores[a]||0));
      const top = room.scores[sorted[0]] || 0;
      const tied = sorted.filter(p => (room.scores[p]||0) === top);
      room.winner = tied.length === 1 ? tied[0] : 'draw';
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────
// Socket.IO
// ─────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[+] ${socket.id}`);

  // CREATE ROOM
  socket.on('create_room', ({ playerName, maxPlayers }) => {
    if (!playerName) return;
    const name = String(playerName).trim().slice(0,20) || 'Host';
    const max  = [2,3,4].includes(Number(maxPlayers)) ? Number(maxPlayers) : 2;
    const code = generateRoomCode();
    rooms[code] = {
      code, maxPlayers: max,
      players: { [socket.id]: { name, online:true, socketId:socket.id, joinOrder:0 } },
      deck:[], hands:{}, scores:{}, trumpCard:null, trumpSuit:null,
      table:[], currentTurn:null, attackerId:null, defenderId:null,
      turnOrder:[], status:'waiting', round:0,
      roundResult:null, winner:null, phase:'attack'
    };
    socket.join(code);
    socket.data.roomCode = code;
    console.log(`[create] ${code} max=${max} by ${name}`);
    socket.emit('room_created', { roomCode: code, maxPlayers: max });
    broadcastState(rooms[code]);
  });

  // JOIN ROOM
  socket.on('join_room', ({ playerName, roomCode }) => {
    if (!playerName || !roomCode) return;
    const name = String(playerName).trim().slice(0,20) || 'Player';
    const code = String(roomCode).trim().toUpperCase();
    const room = rooms[code];
    if (!room)                             { socket.emit('join_error',{message:'ROOM NOT FOUND'}); return; }
    const count = Object.keys(room.players).length;
    if (count >= room.maxPlayers)          { socket.emit('join_error',{message:'ROOM IS FULL'}); return; }
    if (room.status !== 'waiting')         { socket.emit('join_error',{message:'GAME ALREADY STARTED'}); return; }

    const joinOrder = count;
    room.players[socket.id] = { name, online:true, socketId:socket.id, joinOrder };
    socket.join(code);
    socket.data.roomCode = code;
    console.log(`[join] ${code} by ${name} (${joinOrder+1}/${room.maxPlayers})`);

    const newCount = Object.keys(room.players).length;
    io.to(code).emit('player_joined', { name, playerCount: newCount, maxPlayers: room.maxPlayers });

    if (newCount === room.maxPlayers) {
      startGame(room);
      io.to(code).emit('game_started');
    }
    broadcastState(room);
  });

  // PLAY CARD
  socket.on('play_card', ({ cardId }) => {
    const code = socket.data.roomCode;
    const pid  = socket.id;
    const room = rooms[code];
    if (!room || room.status !== 'playing') return;
    if (room.currentTurn !== pid) { socket.emit('action_error',{message:'NOT YOUR TURN'}); return; }

    const hand = room.hands[pid] || [];
    const cardIdx = hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) { socket.emit('action_error',{message:'CARD NOT IN HAND'}); return; }

    if (room.phase === 'attack') {
      const [card] = hand.splice(cardIdx,1);
      room.table = [{ playerId:pid, card }];
      room.attackerId = pid;
      room.defenderId = nextPlayerId(room, pid);
      room.phase = 'defense';
      room.currentTurn = room.defenderId;
      broadcastState(room);

    } else if (room.phase === 'defense') {
      if (room.table.length !== 1) return;
      const atkCard = room.table[0].card;
      const defCard = hand[cardIdx];
      if (!canBeat(atkCard, defCard, room.trumpSuit)) {
        socket.emit('action_error',{message:'CANNOT BEAT THAT CARD'}); return;
      }
      hand.splice(cardIdx,1);
      room.table.push({ playerId:pid, card:defCard });

      // Defender wins round
      room.scores[pid] = (room.scores[pid]||0) + 1;
      room.roundResult = { winner:pid, type:'defended' };
      room.round++;
      room.phase = 'attack';
      drawUntilFull(room);

      if (!checkGameOver(room)) {
        // Defender becomes next attacker
        room.attackerId  = pid;
        room.defenderId  = nextPlayerId(room, pid);
        room.currentTurn = pid;
        setTimeout(() => { room.roundResult = null; broadcastState(room); }, 2500);
      }
      broadcastState(room);
    }
  });

  // TAKE CARDS (give up defense)
  socket.on('take_cards', () => {
    const code = socket.data.roomCode;
    const pid  = socket.id;
    const room = rooms[code];
    if (!room || room.status !== 'playing') return;
    if (room.phase !== 'defense' || room.currentTurn !== pid) return;
    if (room.table.length !== 1) return;

    const atkId = room.table[0].playerId;
    room.scores[atkId] = (room.scores[atkId]||0) + 1;
    room.hands[pid].push(room.table[0].card);
    room.roundResult = { winner:atkId, type:'taken' };
    room.table = [];
    room.round++;
    room.phase = 'attack';
    drawUntilFull(room);

    if (!checkGameOver(room)) {
      // Attacker stays; next defender is next after attacker
      room.attackerId  = atkId;
      room.defenderId  = nextPlayerId(room, atkId);
      room.currentTurn = atkId;
      setTimeout(() => { room.roundResult = null; broadcastState(room); }, 2500);
    }
    broadcastState(room);
  });

  // NEW GAME
  socket.on('new_game', () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || Object.keys(room.players).length < 2) return;
    startGame(room);
    io.to(code).emit('game_started');
    broadcastState(room);
  });

  // LEAVE
  socket.on('leave_room', () => handleLeave(socket, false));
  socket.on('disconnect', () => { console.log(`[-] ${socket.id}`); handleLeave(socket, true); });

  function handleLeave(socket, isDisconnect) {
    const code = socket.data.roomCode;
    const pid  = socket.id;
    if (!code || !rooms[code]) return;
    const room = rooms[code];

    if (isDisconnect) {
      if (room.players[pid]) room.players[pid].online = false;
      io.to(code).emit('player_disconnected', { name: room.players[pid]?.name, playerId: pid });
      if (room.status === 'playing') room.status = 'paused';
      broadcastState(room);
    } else {
      socket.leave(code);
      delete room.players[pid];
      const remaining = Object.keys(room.players).length;
      if (remaining === 0) {
        delete rooms[code];
      } else {
        io.to(code).emit('player_left', { name: room.players[pid]?.name || 'A player', remaining });
        if (remaining < 2) {
          room.status = 'waiting';
          io.to(code).emit('room_closed', { message: 'NOT ENOUGH PLAYERS' });
          delete rooms[code];
        }
      }
    }
    socket.data.roomCode = null;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Royal Duel running → http://localhost:${PORT}`));
