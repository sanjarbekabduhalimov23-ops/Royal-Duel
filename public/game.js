'use strict';

// Catch any uncaught JS errors and show as toast once DOM is ready
window.addEventListener('error', e => {
  console.error('JS Error:', e.message, e.filename, e.lineno);
  try { toast('JS Error: ' + e.message, 'error'); } catch(_) {}
});

const socket = io(window.location.origin, { transports: ['websocket','polling'] });

// ── State ─────────────────────────────────────
let state       = null;
let myId        = null;
let selectedCardId = null;
let soundEnabled   = true;
let chosenMaxPlayers = 2;

const $ = id => document.getElementById(id);
const screens = { menu:$('screen-menu'), waiting:$('screen-waiting'), game:$('screen-game'), result:$('screen-result') };

function showScreen(n) { Object.values(screens).forEach(s => s.classList.remove('active')); screens[n].classList.add('active'); }

// ── Player-count picker ───────────────────────
// Use event delegation on document so it works even when buttons are hidden at load
document.addEventListener('click', e => {
  const btn = e.target.closest('.count-btn');
  if (!btn) return;
  document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  chosenMaxPlayers = parseInt(btn.dataset.count);
  // playSound safely after user gesture
  try { playSound('click'); } catch(_) {}
});

// ── Menu nav ──────────────────────────────────
function showMenuHome() {
  $('menu-home').style.display   = '';
  $('menu-create').style.display = 'none';
  $('menu-join').style.display   = 'none';
}
function on(id, ev, fn) { const el = $(id); if (el) el.addEventListener(ev, fn); else console.warn('Missing element:', id); }

on('btn-create-room', 'click', () => { playSound('click'); $('menu-home').style.display='none'; $('menu-create').style.display=''; $('create-name').focus(); });
on('btn-join-room',   'click', () => { playSound('click'); $('menu-home').style.display='none'; $('menu-join').style.display='';   $('join-name').focus(); });
on('btn-back-create', 'click', () => showMenuHome());
on('btn-back-join',   'click', () => showMenuHome());

on('btn-do-create', 'click', () => {
  const name = $('create-name').value.trim();
  if (!name) { toast('Please enter your name','error'); return; }
  playSound('click');
  socket.emit('create_room', { playerName: name, maxPlayers: chosenMaxPlayers });
});

on('btn-do-join', 'click', () => {
  const name = $('join-name').value.trim();
  const code = $('join-code').value.trim().toUpperCase();
  if (!name) { toast('Please enter your name','error'); return; }
  if (!code || code.length !== 6) { showJoinError('Enter a valid 6-character code'); return; }
  playSound('click');
  socket.emit('join_room', { playerName: name, roomCode: code });
});

['create-name','join-name','join-code'].forEach(id => {
  on(id, 'keydown', e => {
    if (e.key === 'Enter') { id === 'create-name' ? $('btn-do-create').click() : $('btn-do-join').click(); }
  });
});

function showJoinError(msg) {
  const el = $('join-error'); if (!el) return;
  el.textContent = msg; el.style.display = '';
  setTimeout(() => el.style.display='none', 4000);
}

// ── Waiting screen ────────────────────────────
on('btn-copy-code',   'click', () => {
  navigator.clipboard.writeText($('waiting-code').textContent).then(() => toast('Room code copied!','gold'));
  playSound('click');
});
on('btn-cancel-wait', 'click', () => {
  if (confirm('Cancel and return to menu?')) { socket.emit('leave_room'); showScreen('menu'); showMenuHome(); }
});

// ── Game buttons ──────────────────────────────
on('btn-leave',        'click', () => {
  if (confirm('Leave the game? The room will be closed.')) { socket.emit('leave_room'); showScreen('menu'); showMenuHome(); }
});
on('btn-leave-paused', 'click', () => { socket.emit('leave_room'); showScreen('menu'); showMenuHome(); });
on('btn-leave-result', 'click', () => { socket.emit('leave_room'); showScreen('menu'); showMenuHome(); });
on('btn-new-game',     'click', () => { playSound('click'); socket.emit('new_game'); });

on('btn-play-card', 'click', () => {
  if (!selectedCardId) return;
  playSound('play');
  socket.emit('play_card', { cardId: selectedCardId });
  selectedCardId = null;
  const hand = $('my-hand'); if (hand) hand.querySelectorAll('.card').forEach(el => el.classList.remove('selected'));
  updateActionButtons();
});

on('btn-take-cards', 'click', () => {
  playSound('click');
  socket.emit('take_cards');
  selectedCardId = null;
  const hand = $('my-hand'); if (hand) hand.querySelectorAll('.card').forEach(el => el.classList.remove('selected'));
  updateActionButtons();
});

on('sound-toggle',   'click', () => {
  soundEnabled = !soundEnabled;
  $('sound-toggle').textContent = soundEnabled ? '🔊' : '🔇';
  toast(soundEnabled ? 'Sound On' : 'Sound Off');
});
on('fullscreen-btn', 'click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

// ── CARD CLICK — event delegation ────────────
$('my-hand').addEventListener('click', e => {
  const cardEl = e.target.closest('.card');
  if (!cardEl) return;
  const cardId = cardEl.dataset.cardId;
  if (!cardId) return;
  const canPlay = state && state.status === 'playing' && state.currentTurn === state.myId;
  if (!canPlay) { setGameMessage('Wait for your turn!','error'); toast('Wait for your turn!','error'); return; }
  selectedCardId = selectedCardId === cardId ? null : cardId;
  $('my-hand').querySelectorAll('.card').forEach(el =>
    el.dataset.cardId === selectedCardId ? el.classList.add('selected') : el.classList.remove('selected'));
  updateActionButtons();
  playSound('flip');
});

// ── Socket events ─────────────────────────────
socket.on('connect',    () => { myId = socket.id; setConnected(true); });
socket.on('disconnect', () => setConnected(false));
socket.on('reconnect',  () => { myId = socket.id; setConnected(true); });

socket.on('room_created', ({ roomCode, maxPlayers }) => {
  $('waiting-code').textContent = roomCode;
  renderLobbySlots({ roomCode, maxPlayers, players: { [socket.id]: { name: $('create-name').value.trim(), online:true, joinOrder:0 } } });
  showScreen('waiting');
  toast(`Room created for ${maxPlayers} players!`, 'gold');
});

socket.on('player_joined', ({ name, playerCount, maxPlayers }) => {
  toast(`${name} joined! (${playerCount}/${maxPlayers})`, 'gold');
  $('waiting-text').textContent = `${playerCount}/${maxPlayers} players joined…`;
});

socket.on('join_error',  ({ message }) => { showJoinError(message); toast(message,'error'); });

socket.on('game_started', () => {
  selectedCardId = null; playSound('deal');
  $('paused-overlay').style.display = 'none';
  showScreen('game');
});

socket.on('game_state', s => {
  const prev = state?.status;
  state = s; myId = s.myId;
  renderState(s, prev);
});

socket.on('action_error',        ({ message }) => { setGameMessage(message,'error'); toast(message,'error'); });
socket.on('player_disconnected', ({ name })    => { toast(`${name||'A player'} disconnected`,'error'); $('paused-overlay').style.display='flex'; });
socket.on('player_left',         ({ name })    => { toast(`${name||'A player'} left the game`,'error'); });
socket.on('room_closed',         ({ message }) => { toast(message,'error'); showScreen('menu'); showMenuHome(); });

function setConnected(ok) {
  $('conn-dot').className = 'conn-dot' + (ok ? '' : ' disconnected');
  $('conn-label').textContent = ok ? 'Connected' : 'Disconnected';
}

// ── Lobby slots ───────────────────────────────
function renderLobbySlots(s) {
  const el = $('lobby-slots');
  if (!el) return;
  const emojis = ['♠','♥','♦','♣'];
  el.innerHTML = '';
  const max = s.maxPlayers || 2;
  for (let i = 0; i < max; i++) {
    const pid = s.turnOrder ? s.turnOrder[i] : null;
    const p   = pid ? s.players[pid] : null;
    // fallback: find by joinOrder
    const fallback = !p ? Object.values(s.players||{}).find(pp => pp.joinOrder === i) : p;
    const div = document.createElement('div');
    div.className = 'lobby-slot ' + (fallback ? 'filled' : 'empty');
    div.innerHTML = fallback
      ? `<div class="slot-avatar">${emojis[i]}</div>
         <div class="slot-name">${fallback.name}</div>
         <div class="slot-status online">● Online</div>`
      : `<div class="slot-avatar" style="opacity:.3">?</div>
         <div class="slot-name" style="opacity:.4">Player ${i+1}</div>
         <div class="slot-status waiting-slot">Waiting…</div>`;
    el.appendChild(div);
  }
}

// ── Main render ───────────────────────────────
function renderState(s, prevStatus) {
  if (!s) return;
  const me = s.players[s.myId];

  // HUD
  $('hud-room-code').textContent = s.roomCode || '—';
  $('hud-round').textContent     = `Round ${s.round || 1}`;
  $('deck-count').textContent    = s.deckCount + ' cards';

  // My info
  $('my-name').textContent  = me ? me.name  : 'You';
  $('my-score').textContent = (me ? me.score : 0) + ' pts';

  // My role badge
  const roleBadge = $('my-role-badge');
  if (s.status === 'playing') {
    if (s.attackerId === s.myId)     { roleBadge.textContent = '⚔ Attacker'; roleBadge.className = 'role-badge attacker'; }
    else if (s.defenderId === s.myId){ roleBadge.textContent = '🛡 Defender'; roleBadge.className = 'role-badge defender'; }
    else                              { roleBadge.textContent = ''; roleBadge.className = 'role-badge'; }
  } else { roleBadge.textContent = ''; roleBadge.className = 'role-badge'; }

  // Deck visual
  const deckStack = $('deck-stack');
  let existingBack = deckStack.querySelector('.card');
  if (s.deckCount > 0 && !existingBack) {
    const b = document.createElement('div');
    b.className = 'card face-down card-layer';
    b.innerHTML = `<div class="card-inner"><div class="card-face card-front">${CardUtils.cardBackSVG()}</div><div class="card-face card-back">${CardUtils.cardBackSVG()}</div></div>`;
    deckStack.insertBefore(b, deckStack.querySelector('.deck-count-badge'));
  } else if (s.deckCount === 0 && existingBack) { existingBack.remove(); }

  // Trump
  const trumpSlot = $('trump-card-slot');
  trumpSlot.innerHTML = '';
  if (s.trumpCard) {
    const tEl = CardUtils.createCardElement(s.trumpCard);
    tEl.classList.add('trump-highlight');
    trumpSlot.appendChild(tEl);
  }

  // Play area
  const playArea = $('play-area');
  const emptyMsg = $('play-area-empty');
  playArea.innerHTML = '';
  playArea.appendChild(emptyMsg);
  if (s.table && s.table.length > 0) {
    emptyMsg.style.display = 'none';
    s.table.forEach(entry => {
      const cEl = CardUtils.createCardElement(entry.card);
      cEl.classList.add('playing');
      const lbl = document.createElement('div');
      lbl.style.cssText = 'position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:.58rem;color:var(--text-dim);white-space:nowrap;';
      const pp = s.players[entry.playerId];
      lbl.textContent = entry.playerId === s.myId ? 'You' : (pp ? pp.name : 'Opp');
      cEl.style.position = 'relative';
      cEl.appendChild(lbl);
      playArea.appendChild(cEl);
    });
  } else { emptyMsg.style.display = ''; }

  // Opponents row
  renderOpponents(s);

  // My hand
  renderMyHand(s);

  // Turn banner
  const isMyTurn = s.currentTurn === s.myId;
  const banner   = $('turn-banner');
  if (s.status === 'playing') {
    if (isMyTurn) {
      banner.textContent = s.phase === 'attack' ? '⚔ Your Turn — Attack!' : '🛡 Your Turn — Defend!';
      banner.className   = 'turn-banner your-turn';
    } else {
      const np = s.players[s.currentTurn];
      banner.textContent = np ? `${np.name}'s turn…` : "Opponent's turn…";
      banner.className   = 'turn-banner opp-turn';
    }
  } else if (s.status === 'paused') {
    banner.textContent = '⏸ Game Paused';
    banner.className   = 'turn-banner opp-turn';
  }

  // Game message
  if (s.roundResult) {
    if (s.roundResult.winner === s.myId) {
      setGameMessage(s.roundResult.type === 'defended' ? '✓ Round Won — Defence successful!' : '✓ Round Won — Opponent took the card!', 'success');
      playSound('win');
    } else {
      const wp = s.players[s.roundResult.winner];
      setGameMessage(`✗ Round Lost — ${wp ? wp.name : 'Opponent'} wins this round`, 'error');
      playSound('lose');
    }
  } else {
    if (isMyTurn) setGameMessage(s.phase === 'attack' ? 'Select a card to attack' : 'Select a card to defend, or click Take Cards', 'info');
    else { const np = s.players[s.currentTurn]; setGameMessage(`Waiting for ${np ? np.name : 'opponent'}…`, 'info'); }
  }

  updateActionButtons();
  if (s.status === 'finished' && prevStatus !== 'finished') setTimeout(() => showResult(s), 1200);
  $('paused-overlay').style.display = s.status === 'paused' ? 'flex' : 'none';
}

// ── Opponents row ─────────────────────────────
function renderOpponents(s) {
  const row = $('opponents-row');
  row.innerHTML = '';
  const opponents = (s.turnOrder || []).filter(pid => pid !== s.myId);
  opponents.forEach(pid => {
    const p = s.players[pid];
    if (!p) return;
    const isActive  = s.currentTurn === pid;
    const isAtk     = s.attackerId  === pid;
    const isDef     = s.defenderId  === pid;
    const panel = document.createElement('div');
    panel.className = 'opponent-panel' + (isActive ? ' active-turn' : '');

    let roleHTML = '';
    if (s.status === 'playing') {
      if (isAtk) roleHTML = '<div class="opp-role attacker">⚔ Attacking</div>';
      else if (isDef) roleHTML = '<div class="opp-role defender">🛡 Defending</div>';
    }

    panel.innerHTML = `
      <div class="opp-info">
        <div class="status-dot ${p.online ? '' : 'offline'}"></div>
        <div class="opp-name-text">${p.name}</div>
        <div class="opp-score-text">${p.score} pts</div>
      </div>
      ${roleHTML}
      <div class="opp-hand-mini" id="opp-hand-${pid}"></div>
    `;
    row.appendChild(panel);

    // Card backs
    const handEl = panel.querySelector(`#opp-hand-${pid}`);
    for (let i = 0; i < (p.cardCount || 0); i++) {
      const c = document.createElement('div');
      c.className = 'card face-down card-small';
      c.innerHTML = `<div class="card-inner"><div class="card-face card-front">${CardUtils.cardBackSVG()}</div><div class="card-face card-back">${CardUtils.cardBackSVG()}</div></div>`;
      handEl.appendChild(c);
    }
  });
}

// ── My hand ───────────────────────────────────
function renderMyHand(s) {
  const handEl   = $('my-hand');
  const isMyTurn = s.currentTurn === s.myId;
  const canPlay  = s.status === 'playing' && isMyTurn;
  const newIds   = new Set((s.myHand||[]).map(c => c.id));

  handEl.querySelectorAll('.card').forEach(el => { if (!newIds.has(el.dataset.cardId)) el.remove(); });

  (s.myHand||[]).forEach((card, i) => {
    let cEl = handEl.querySelector(`[data-card-id="${card.id}"]`);
    if (!cEl) {
      cEl = CardUtils.createCardElement(card, { selectable: canPlay });
      cEl.classList.add('dealing');
      cEl.style.animationDelay = `${i * 0.07}s`;
      cEl.style.cursor = canPlay ? 'pointer' : 'default';
      handEl.appendChild(cEl);
      cEl.draggable = canPlay;
      cEl.addEventListener('dragstart', e => {
        if (!state || state.currentTurn !== state.myId) { e.preventDefault(); return; }
        e.dataTransfer.setData('cardId', card.id);
        selectedCardId = card.id;
        setTimeout(() => cEl.classList.add('selected'), 0);
      });
      cEl.addEventListener('dragend', () => cEl.classList.remove('selected'));
    } else {
      cEl.style.cursor = canPlay ? 'pointer' : 'default';
      cEl.draggable    = canPlay;
      canPlay ? cEl.classList.add('selectable') : cEl.classList.remove('selectable');
    }
    card.id === selectedCardId ? cEl.classList.add('selected') : cEl.classList.remove('selected');
  });
}

function updateActionButtons() {
  const playBtn = $('btn-play-card');
  const takeBtn = $('btn-take-cards');
  if (!state) { playBtn.disabled = true; takeBtn.disabled = true; return; }
  const isMyTurn = state.currentTurn === myId;
  const canAct   = state.status === 'playing' && isMyTurn;
  playBtn.disabled = !canAct || !selectedCardId;
  takeBtn.disabled = !canAct || state.phase !== 'defense';
}

// Drag-drop onto play area
const playAreaEl = $('play-area');
playAreaEl.addEventListener('dragover',  e => { e.preventDefault(); playAreaEl.classList.add('drop-target'); });
playAreaEl.addEventListener('dragleave', () => playAreaEl.classList.remove('drop-target'));
playAreaEl.addEventListener('drop', e => {
  e.preventDefault(); playAreaEl.classList.remove('drop-target');
  const cid = e.dataTransfer.getData('cardId');
  if (cid) { selectedCardId = cid; $('btn-play-card').click(); }
});

// ── Result screen ─────────────────────────────
function showResult(s) {
  const pids   = s.turnOrder || Object.keys(s.players);
  const myScore = s.players[s.myId]?.score || 0;
  const iWon   = s.winner === s.myId;
  const isDraw = s.winner === 'draw';

  let outcomeClass, badgeClass, iconChar, titleText, subtitleText;
  if (isDraw) {
    outcomeClass = 'draw';    badgeClass = 'draw-badge';
    iconChar = '🤝'; titleText = 'Draw!';
    subtitleText = 'An honourable stalemate among rivals';
  } else if (iWon) {
    outcomeClass = 'victory'; badgeClass = 'victory-badge';
    iconChar = '👑'; titleText = 'Victory!';
    const taunts = ['You dominated the duel','The crown is yours','Flawless performance','A masterclass in cards','Unmatched skill!'];
    subtitleText = taunts[Math.floor(Math.random()*taunts.length)];
  } else {
    outcomeClass = 'defeat';  badgeClass = 'defeat-badge';
    iconChar = '💀'; titleText = 'Defeat!';
    const taunts = ['Better luck next time','The duel is lost','Revenge is one game away','The cards were against you','Rise and fight again'];
    subtitleText = taunts[Math.floor(Math.random()*taunts.length)];
  }

  $('result-icon').textContent    = iconChar;
  $('result-title').textContent   = titleText;
  $('result-title').className     = 'result-title ' + outcomeClass;
  $('result-subtitle').textContent = subtitleText;
  $('result-badge').textContent   = 'GAME OVER';
  $('result-badge').className     = 'result-badge ' + badgeClass;
  $('result-glow').className      = 'result-glow ' + outcomeClass + '-glow';

  // Sort by score descending
  const sorted = [...pids].sort((a,b) => (s.players[b]?.score||0) - (s.players[a]?.score||0));
  const rankEmoji  = ['👑','🥈','🥉','4️⃣'];
  const rankClass  = ['rank-1','rank-2','rank-3','rank-4'];
  const rankLabels = ['Champion','Runner-up','3rd Place','4th Place'];

  const n = pids.length;
  const board = $('result-scoreboard');
  board.className = `result-scoreboard players-${n}`;
  board.innerHTML = '';

  if (n === 2) {
    // Special 2-player layout with VS in middle
    const p0 = sorted[0], p1 = sorted[1];
    [p0, null, p1].forEach((pid, idx) => {
      if (pid === null) { const vs = document.createElement('div'); vs.className='score-vs'; vs.textContent='VS'; board.appendChild(vs); return; }
      const rank = sorted.indexOf(pid);
      const p    = s.players[pid];
      const card = document.createElement('div');
      card.className = `score-card ${rankClass[rank]}`;
      card.innerHTML = `
        <span class="score-card-crown">${rankEmoji[rank]}</span>
        <div class="score-card-name">${p?.name || 'Player'}</div>
        <div class="score-card-points" id="anim-score-${pid}">0</div>
        <div class="score-card-label">rounds won</div>
      `;
      board.appendChild(card);
      animateCounter(`anim-score-${pid}`, p?.score || 0, 900);
    });
  } else {
    sorted.forEach((pid, rank) => {
      const p    = s.players[pid];
      const card = document.createElement('div');
      card.className = `score-card ${rankClass[rank]}`;
      card.innerHTML = `
        <span class="score-card-crown">${rankEmoji[rank]}</span>
        <div class="score-card-name">${p?.name || 'Player'}</div>
        <div class="score-card-points" id="anim-score-${pid}">0</div>
        <div class="score-card-label">${rankLabels[rank]}</div>
      `;
      board.appendChild(card);
      animateCounter(`anim-score-${pid}`, p?.score || 0, 900);
    });
  }

  // Stats
  const total  = sorted.reduce((acc,pid) => acc + (s.players[pid]?.score||0), 0);
  const topScore = s.players[sorted[0]]?.score || 0;
  $('result-stats').innerHTML = `
    <div class="stat-item"><div class="stat-value">${s.round||0}</div><div class="stat-label">Rounds</div></div>
    <div class="stat-divider"></div>
    <div class="stat-item"><div class="stat-value">${n}</div><div class="stat-label">Players</div></div>
    <div class="stat-divider"></div>
    <div class="stat-item"><div class="stat-value">${total > 0 ? Math.round(myScore/total*100) : 0}%</div><div class="stat-label">Your Share</div></div>
  `;

  showScreen('result');

  if (isDraw)      { playSound('win'); }
  else if (iWon)   { playSound('victory'); spawnConfetti(); startParticles(true); }
  else             { playSound('defeat'); startParticles(false); }
}

function animateCounter(elId, target, duration) {
  const el = $(elId); if (!el) return;
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now-start)/duration, 1);
    el.textContent = Math.round((1-Math.pow(1-p,3)) * target);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

let particleRAF = null;
function startParticles(isVictory) {
  const canvas = $('result-canvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const colors = isVictory ? ['#c8a400','#f0d060','#fff5cc','#ffffff','#a855f7','#22c55e'] : ['#8B0000','#CC2200','#ff4444','#660000','#333'];
  const particles = Array.from({length: isVictory?120:60}, () => ({
    x: Math.random()*canvas.width,
    y: isVictory ? Math.random()*-canvas.height : Math.random()*canvas.height,
    vx: (Math.random()-.5)*(isVictory?4:1.5),
    vy: isVictory ? (Math.random()*4+2) : -(Math.random()*2+.5),
    size: Math.random()*(isVictory?8:4)+3,
    color: colors[Math.floor(Math.random()*colors.length)],
    rot: Math.random()*Math.PI*2, rotV: (Math.random()-.5)*.15,
    life: 1, decay: Math.random()*.006+.003,
    shape: isVictory && Math.random()>.5 ? 'rect':'circle'
  }));
  cancelAnimationFrame(particleRAF);
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let alive = false;
    particles.forEach(p => {
      if (p.life<=0) return; alive=true;
      ctx.save(); ctx.globalAlpha=p.life; ctx.fillStyle=p.color;
      ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      p.shape==='rect' ? ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*.6) : (ctx.beginPath(),ctx.arc(0,0,p.size/2,0,Math.PI*2),ctx.fill());
      ctx.restore();
      p.x+=p.vx; p.y+=p.vy; p.rot+=p.rotV;
      p.vy += isVictory ? .12 : -.02;
      p.life -= p.decay;
    });
    if (alive) particleRAF = requestAnimationFrame(draw);
  }
  draw();
}

function spawnConfetti() {
  const colors = ['#c8a400','#f0d060','#CC2200','#22c55e','#ffffff','#a855f7','#3b82f6'];
  for (let i=0;i<100;i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.cssText = `left:${Math.random()*100}vw;top:-20px;background:${colors[Math.floor(Math.random()*colors.length)]};width:${5+Math.random()*9}px;height:${5+Math.random()*9}px;border-radius:${Math.random()>.4?'50%':'2px'};animation-duration:${2.5+Math.random()*2.5}s;animation-delay:${Math.random()*2}s;z-index:3;`;
    screens.result.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

function setGameMessage(msg, type='info') {
  const el = $('game-message'); el.textContent = msg; el.className = 'game-message ' + type;
}

function toast(msg, type='') {
  const el = document.createElement('div');
  el.className = 'toast' + (type?' '+type:''); el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ── Web Audio ─────────────────────────────────
let audioCtx = null;
function getCtx() { if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; }

function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getCtx(), now = ctx.currentTime;
    const note = (freq, t, dur, wave='sine', vol=0.12) => {
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type=wave; o.frequency.setValueAtTime(freq,t);
      g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+dur);
      o.start(t); o.stop(t+dur);
    };
    switch(type) {
      case 'click':   note(880,now,.1,'sine',.15); break;
      case 'flip':    note(600,now,.12,'triangle',.12); break;
      case 'play':    note(330,now,.2,'square',.1); break;
      case 'deal':    [0,1,2,3,4,5].forEach(i=>note(400+i*30,now+i*.12,.1,'triangle',.1)); break;
      case 'win':     [523,659,784].forEach((f,i)=>note(f,now+i*.12,.25,'sine',.15)); break;
      case 'lose':    [784,659,523,392].forEach((f,i)=>note(f,now+i*.13,.2,'sawtooth',.1)); break;
      case 'victory': [523,659,784,1047].forEach((f,i)=>note(f,now+i*.15,.4,'sine',.18)); break;
      case 'defeat':  [392,330,262,196].forEach((f,i)=>note(f,now+i*.18,.3,'sawtooth',.12)); break;
    }
  } catch(e) {}
}
