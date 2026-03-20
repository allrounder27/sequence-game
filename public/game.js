/* ============================================================
   SEQUENCE — Multiplayer Client (Socket.IO)
   Supports 2, 3, 4, 6 players with teams
   ============================================================ */

const socket = io();

// ── State ───────────────────────────────────────────────────
let myIndex       = -1;
let selectedCard  = -1;
let validMoves    = [];
let lastState     = null;
let isHorizontalView = false;
let myRoomCode    = null;
let myName        = null;
let lastMoveHighlight = null;
let lastMoveTimeout   = null;
let selectedPlayerCount = 2;

// ── Card Image Helper ───────────────────────────────────────
function getCardImageUrl(card) {
    if (!card || card === 'FREE') return null;
    const suit  = card.slice(-1);
    let value   = card.slice(0, -1);
    const suitMap = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
    const valueMap = {
        'A': 'ace', '2': '2', '3': '3', '4': '4', '5': '5',
        '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
        'J': 'jack', 'Q': 'queen', 'K': 'king'
    };
    return `/cards/${valueMap[value]}_of_${suitMap[suit]}.png`;
}

// ── DOM ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const lobbyOverlay     = $('lobbyOverlay');
const lobbyStep1       = $('lobbyStep1');
const lobbyWaiting     = $('lobbyWaiting');
const lobbyJoin        = $('lobbyJoin');
const lobbyError       = $('lobbyError');
const nameInput        = $('nameInput');
const codeInput        = $('codeInput');
const roomCodeDisplay  = $('roomCodeDisplay');
const gameScreen       = $('gameScreen');
const gameBoard        = $('gameBoard');
const myHand           = $('myHand');
const turnLabel        = $('turnLabel');
const gameMessage      = $('gameMessage');
const deckCount        = $('deckCount');
const roomCodeSmall    = $('roomCodeSmall');
const winModal         = $('winModal');
const disconnectModal  = $('disconnectModal');

// ── Player Count Info ───────────────────────────────────────
const COUNT_INFO = {
    2: '2 players · 2 teams · 7 cards each',
    3: '3 players · 3 teams · 6 cards each',
    4: '4 players · 2 teams · 6 cards each',
    6: '6 players · 3 teams · 5 cards each'
};

// ── Lobby Logic ─────────────────────────────────────────────

// Player count picker
document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedPlayerCount = parseInt(btn.dataset.count);
        $('playerCountInfo').querySelector('span').textContent = COUNT_INFO[selectedPlayerCount];
    });
});

$('btnCreate').addEventListener('click', () => {
    const name = nameInput.value.trim() || 'Player 1';
    myName = name;
    socket.emit('createRoom', { name, maxPlayers: selectedPlayerCount });
});

$('btnJoinShow').addEventListener('click', () => {
    if (!nameInput.value.trim()) nameInput.value = 'Player 2';
    lobbyStep1.classList.add('hidden');
    lobbyJoin.classList.remove('hidden');
    lobbyError.classList.add('hidden');
    setTimeout(() => codeInput.focus(), 100);
});

codeInput?.addEventListener('input', () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length === 4) {
        socket.emit('peekRoom', code);
    } else {
        $('lobbyRoomInfo').classList.add('hidden');
    }
});

$('btnBack').addEventListener('click', () => {
    lobbyJoin.classList.add('hidden');
    lobbyStep1.classList.remove('hidden');
    lobbyError.classList.add('hidden');
});

$('btnJoin').addEventListener('click', () => {
    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim() || 'Player 2';
    if (code.length !== 4) {
        showLobbyError('Enter a 4-letter room code.');
        return;
    }
    myName = name;
    socket.emit('joinRoom', { code, name });
});

codeInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btnJoin').click();
});
nameInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btnCreate').click();
});

$('btnCopyCode').addEventListener('click', () => {
    const code = roomCodeDisplay.textContent;
    navigator.clipboard.writeText(code).then(() => {
        $('btnCopyCode').textContent = '✓ Copied!';
        setTimeout(() => $('btnCopyCode').textContent = '📋 Copy Code', 1500);
    });
});

$('btnNewGame').addEventListener('click', () => {
    if (lastState && !lastState.gameOver) {
        $('newGameModal').classList.add('active');
    } else {
        socket.emit('requestNewGame');
    }
});

$('btnConfirmNew').addEventListener('click', () => {
    $('newGameModal').classList.remove('active');
    socket.emit('requestNewGame');
});

$('btnCancelNew').addEventListener('click', () => {
    $('newGameModal').classList.remove('active');
});

$('btnPlayAgain').addEventListener('click', () => {
    winModal.classList.remove('active');
    socket.emit('requestNewGame');
});

function showLobbyError(msg) {
    lobbyError.textContent = msg;
    lobbyError.classList.remove('hidden');
}

// ── Toggle View ─────────────────────────────────────────────
$('btnToggleView').addEventListener('click', () => {
    isHorizontalView = !isHorizontalView;
    gameBoard.classList.toggle('horizontal-view', isHorizontalView);
    $('btnToggleView').textContent = isHorizontalView ? '🔄 Vertical' : '🔄 Horizontal';
});

// ── Socket Events ───────────────────────────────────────────

socket.on('roomCreated', ({ code, playerIndex, maxPlayers }) => {
    myIndex = playerIndex;
    myRoomCode = code;
    roomCodeDisplay.textContent = code;
    lobbyStep1.classList.add('hidden');
    lobbyWaiting.classList.remove('hidden');
    lobbyError.classList.add('hidden');
    updateLobbyPlayerList([myName], maxPlayers);
});

socket.on('roomJoined', ({ code, playerIndex, maxPlayers }) => {
    myIndex = playerIndex;
    myRoomCode = code;
});

socket.on('roomInfo', ({ maxPlayers, currentCount, playerNames }) => {
    const info = $('lobbyRoomInfo');
    info.classList.remove('hidden');
    info.textContent = `${maxPlayers}-player game · ${currentCount}/${maxPlayers} joined`;
});

socket.on('lobbyUpdate', ({ currentCount, maxPlayers, playerNames }) => {
    updateLobbyPlayerList(playerNames, maxPlayers);
    $('waitingText').textContent = `Waiting for players (${currentCount}/${maxPlayers})`;
});

function updateLobbyPlayerList(names, maxPlayers) {
    const list = $('lobbyPlayerList');
    list.innerHTML = '';
    for (let i = 0; i < maxPlayers; i++) {
        const div = document.createElement('div');
        div.className = 'lobby-player-item' + (i < names.length ? ' joined' : '');
        div.textContent = i < names.length ? names[i] : `Waiting...`;
        list.appendChild(div);
    }
}

socket.on('error', msg => {
    showLobbyError(msg);
});

socket.on('gameStart', state => {
    lobbyOverlay.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    renderState(state);
});

socket.on('gameState', state => {
    renderState(state);
});

socket.on('validMoves', data => {
    selectedCard = data.cardIdx;
    validMoves = data.moves;
    highlightValidMoves();
    highlightSelectedCard();
});

socket.on('message', msg => {
    gameMessage.textContent = msg;
});

socket.on('playerLeft', name => {
    $('disconnectText').textContent = `${name} left the game.`;
    disconnectModal.classList.add('active');
});

// ── Auto-Rejoin on Reconnect ─────────────────────────────────
socket.on('connect', () => {
    if (myRoomCode && myName && gameScreen && !gameScreen.classList.contains('hidden')) {
        console.log('Reconnected — attempting rejoin room', myRoomCode);
        socket.emit('rejoinRoom', { code: myRoomCode, name: myName });
    }
});

socket.on('disconnect', () => {
    console.log('Socket disconnected, will auto-reconnect...');
});

// ── Rendering ───────────────────────────────────────────────

function darkenColor(hex, factor = 0.3) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgb(${Math.floor(r*factor)}, ${Math.floor(g*factor)}, ${Math.floor(b*factor)})`;
}

function renderState(state) {
    lastState = state;
    selectedCard = -1;
    validMoves = [];

    // Set team color CSS variables
    if (state.teamColors) {
        state.teamColors.forEach((color, i) => {
            document.documentElement.style.setProperty(`--team${i}`, color);
            document.documentElement.style.setProperty(`--team${i}-dark`, darkenColor(color));
        });
    }

    // Track last move for highlight
    if (state.lastMove) {
        const lm = state.lastMove;
        if (!lastMoveHighlight || lastMoveHighlight.row !== lm.row || lastMoveHighlight.col !== lm.col) {
            lastMoveHighlight = { row: lm.row, col: lm.col };
            if (lastMoveTimeout) clearTimeout(lastMoveTimeout);
            lastMoveTimeout = setTimeout(() => {
                lastMoveHighlight = null;
                const el = gameBoard.querySelector('.last-move-highlight');
                if (el) el.classList.remove('last-move-highlight');
            }, 5000);
        }
    } else {
        lastMoveHighlight = null;
    }

    renderBoard(state);
    renderMyHand(state);
    renderOtherPlayers(state);
    renderHeader(state);

    if (state.gameOver) {
        showWinModal(state);
    }
}

function renderBoard(state) {
    gameBoard.innerHTML = '';
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = r;
            cell.dataset.col = c;

            const data = state.board[r][c];

            if (data.card === 'FREE') {
                cell.innerHTML = '<div class="corner-star">★</div>';
            } else {
                const img = document.createElement('img');
                img.src = getCardImageUrl(data.card);
                img.alt = data.card;
                img.loading = 'lazy';
                img.onerror = function() {
                    this.style.display = 'none';
                    const fb = document.createElement('div');
                    fb.className = 'card-text-fallback';
                    fb.textContent = data.card;
                    cell.appendChild(fb);
                };
                cell.appendChild(img);
            }

            // Chip overlay — chip value is now the team index
            if (data.chip !== null) {
                const overlay = document.createElement('div');
                overlay.className = 'chip-overlay';
                const chip = document.createElement('div');
                chip.className = `chip chip-team${data.chip}`;
                if (data.inSequence) chip.classList.add('chip-seq');
                overlay.appendChild(chip);
                cell.appendChild(overlay);
            }

            cell.addEventListener('click', () => onCellClick(r, c));

            if (lastMoveHighlight && r === lastMoveHighlight.row && c === lastMoveHighlight.col) {
                cell.classList.add('last-move-highlight');
            }

            gameBoard.appendChild(cell);
        }
    }
}

function renderMyHand(state) {
    myHand.innerHTML = '';
    const isMyTurn = state.currentPlayer === state.myIndex && !state.gameOver;

    state.myHand.forEach((card, idx) => {
        const div = document.createElement('div');
        div.className = 'hand-card';

        const img = document.createElement('img');
        img.src = getCardImageUrl(card);
        img.alt = card;
        img.onerror = function() {
            this.style.display = 'none';
            const fb = document.createElement('div');
            fb.className = 'card-text-fallback';
            fb.textContent = card;
            div.insertBefore(fb, div.firstChild);
        };
        div.appendChild(img);

        if (card === 'JD' || card === 'JC') {
            const label = document.createElement('div');
            label.className = 'hand-jack-label wild-badge';
            label.textContent = 'WILD';
            div.appendChild(label);
        } else if (card === 'JH' || card === 'JS') {
            const label = document.createElement('div');
            label.className = 'hand-jack-label anti-badge';
            label.textContent = 'REMOVE';
            div.appendChild(label);
        }

        const dead = isCardDead(state.board, card);
        if (dead) {
            div.classList.add('dead-card');
            const x = document.createElement('div');
            x.className = 'dead-x';
            x.textContent = '✕';
            div.appendChild(x);
        }

        if (isMyTurn) {
            div.addEventListener('click', () => {
                socket.emit('selectCard', { cardIdx: idx });
            });
        } else {
            div.style.cursor = 'default';
        }

        myHand.appendChild(div);
    });

    // Update hand label with team color
    const myTeamColor = state.teamColors[state.myTeam];
    $('myDot').style.background = myTeamColor;
    $('myDot').style.boxShadow = `0 0 6px ${myTeamColor}`;
    $('myHandLabel').textContent = state.players[state.myIndex] + ' (You)';
}

function renderOtherPlayers(state) {
    const container = $('otherPlayersInfo');
    container.innerHTML = '';

    state.otherPlayers.forEach(op => {
        const div = document.createElement('div');
        div.className = 'other-player-info';

        const teamColor = state.teamColors[op.team];
        const dot = document.createElement('div');
        dot.className = 'opp-dot';
        dot.style.background = teamColor;
        dot.style.boxShadow = `0 0 4px ${teamColor}`;

        const label = document.createElement('div');
        label.className = 'opp-label';
        label.textContent = op.name;

        const cards = document.createElement('div');
        cards.className = 'opp-cards';
        for (let i = 0; i < op.cardCount; i++) {
            const cb = document.createElement('div');
            cb.className = 'card-back';
            cards.appendChild(cb);
        }

        div.appendChild(dot);
        div.appendChild(label);
        div.appendChild(cards);
        container.appendChild(div);
    });
}

function renderHeader(state) {
    const scoresContainer = $('headerScores');
    scoresContainer.innerHTML = '';

    // Build one score box per team
    for (let t = 0; t < state.numTeams; t++) {
        const box = document.createElement('div');
        box.className = 'score-box';

        const chip = document.createElement('div');
        chip.className = 'score-chip';
        chip.style.background = state.teamColors[t];
        chip.style.boxShadow = `0 0 6px ${state.teamColors[t]}`;

        const info = document.createElement('div');
        info.className = 'score-info';

        // Get team member names
        const members = [];
        for (let i = 0; i < state.numPlayers; i++) {
            if (state.teams[i] === t) members.push(state.players[i]);
        }

        const nameEl = document.createElement('span');
        nameEl.className = 'score-name';
        nameEl.textContent = state.teamNames[t];
        nameEl.title = members.join(', ');

        const seqEl = document.createElement('span');
        seqEl.className = 'score-seq';
        seqEl.textContent = `${state.sequences[t]} / 2`;

        info.appendChild(nameEl);
        info.appendChild(seqEl);
        box.appendChild(chip);
        box.appendChild(info);

        // Dim teams that are not current player's team
        const currentTeam = state.teams[state.currentPlayer];
        box.style.opacity = t === currentTeam ? '1' : '.5';

        scoresContainer.appendChild(box);
    }

    deckCount.textContent = state.deckCount;
    roomCodeSmall.textContent = state.roomCode;

    if (state.gameOver) {
        const myTeamWon = state.winner === state.myTeam;
        turnLabel.textContent = myTeamWon ? 'You Win!' : 'You Lose';
    } else if (state.currentPlayer === state.myIndex) {
        turnLabel.textContent = 'Your Turn';
        turnLabel.style.color = 'var(--gold)';
    } else {
        const currentName = state.players[state.currentPlayer];
        const currentTeam = state.teams[state.currentPlayer];
        if (currentTeam === state.myTeam) {
            turnLabel.textContent = `${currentName}'s Turn (Teammate)`;
            turnLabel.style.color = state.teamColors[state.myTeam];
        } else {
            turnLabel.textContent = `${currentName}'s Turn`;
            turnLabel.style.color = 'var(--text-dim)';
        }
    }
}

function highlightValidMoves() {
    document.querySelectorAll('.cell').forEach(cell => {
        cell.classList.remove('valid-move');
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        if (validMoves.some(([mr, mc]) => mr === r && mc === c)) {
            cell.classList.add('valid-move');
        }
    });
}

function highlightSelectedCard() {
    document.querySelectorAll('.hand-card').forEach((el, idx) => {
        el.classList.toggle('selected', idx === selectedCard);
    });
}

// ── Cell Click (Place/Remove Chip) ──────────────────────────

function onCellClick(row, col) {
    if (selectedCard === -1 || !lastState) return;
    if (lastState.currentPlayer !== lastState.myIndex) return;
    if (!validMoves.some(([r, c]) => r === row && c === col)) return;

    socket.emit('makeMove', { cardIdx: selectedCard, row, col });
    selectedCard = -1;
    validMoves = [];
}

// ── Dead Card Detection (client-side hint) ──────────────────

function isCardDead(board, card) {
    if (!card || card[0] === 'J') return false;
    for (let r = 0; r < 10; r++)
        for (let c = 0; c < 10; c++)
            if (board[r][c].card === card && board[r][c].chip === null)
                return false;
    return true;
}

// ── Win Modal ───────────────────────────────────────────────

function showWinModal(state) {
    const myTeamWon = state.winner === state.myTeam;
    $('winEmoji').textContent = myTeamWon ? '🏆' : '😔';
    $('winTitle').textContent = myTeamWon ? 'You Win!' : 'You Lose';

    if (myTeamWon) {
        // Get teammates
        const teammates = [];
        for (let i = 0; i < state.numPlayers; i++) {
            if (state.teams[i] === state.myTeam) teammates.push(state.players[i]);
        }
        $('winSubtext').textContent = `Team ${state.teamNames[state.winner]} wins! (${teammates.join(', ')})`;
    } else {
        const winners = [];
        for (let i = 0; i < state.numPlayers; i++) {
            if (state.teams[i] === state.winner) winners.push(state.players[i]);
        }
        $('winSubtext').textContent = `Team ${state.teamNames[state.winner]} wins! (${winners.join(', ')})`;
    }

    winModal.classList.add('active');
    if (myTeamWon) {
        launchConfetti();
        launchFireworks();
        playCelebrationSound();
    } else {
        playLoseSound();
    }
}

// ── Rules Modal ─────────────────────────────────────────────

window.showRules = () => $('rulesModal').classList.add('active');
window.closeRules = () => $('rulesModal').classList.remove('active');

// ── Confetti ────────────────────────────────────────────────

function launchConfetti() {
    const container = $('confettiContainer');
    const colors = ['#d4a843','#38bdf8','#fb7185','#4ade80','#a78bfa','#facc15','#f472b6','#fff'];
    for (let i = 0; i < 200; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.setProperty('--fall-time', (2 + Math.random() * 3) + 's');
        piece.style.animationDelay = Math.random() * 2 + 's';
        piece.style.transform = `rotateZ(${Math.random() * 360}deg)`;
        piece.style.width = (6 + Math.random() * 8) + 'px';
        piece.style.height = (10 + Math.random() * 14) + 'px';
        container.appendChild(piece);
    }
    setTimeout(() => { container.innerHTML = ''; }, 6000);
}

// ── Fireworks ───────────────────────────────────────────────

function launchFireworks() {
    const container = $('confettiContainer');
    const colors = ['#d4a843','#38bdf8','#fb7185','#4ade80','#a78bfa','#facc15'];

    function burst(x, y, delay) {
        setTimeout(() => {
            const count = 30;
            for (let i = 0; i < count; i++) {
                const spark = document.createElement('div');
                spark.className = 'firework-spark';
                const angle = (Math.PI * 2 * i) / count;
                const dist = 60 + Math.random() * 80;
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist;
                spark.style.left = x + 'px';
                spark.style.top = y + 'px';
                spark.style.background = colors[Math.floor(Math.random() * colors.length)];
                spark.style.setProperty('--dx', dx + 'px');
                spark.style.setProperty('--dy', dy + 'px');
                container.appendChild(spark);
            }
        }, delay);
    }

    const w = window.innerWidth, h = window.innerHeight;
    burst(w * 0.25, h * 0.3, 0);
    burst(w * 0.75, h * 0.25, 400);
    burst(w * 0.5, h * 0.2, 800);
    burst(w * 0.3, h * 0.4, 1200);
    burst(w * 0.7, h * 0.35, 1600);
}

// ── Celebration Sound (Web Audio API) ───────────────────────

function playCelebrationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [
            { freq: 523.25, time: 0, dur: 0.15 },
            { freq: 659.25, time: 0.12, dur: 0.15 },
            { freq: 783.99, time: 0.24, dur: 0.15 },
            { freq: 1046.50, time: 0.4, dur: 0.4 },
            { freq: 783.99, time: 0.4, dur: 0.4 },
            { freq: 659.25, time: 0.4, dur: 0.4 },
        ];
        notes.forEach(n => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = n.freq;
            gain.gain.setValueAtTime(0.25, ctx.currentTime + n.time);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.time + n.dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + n.time);
            osc.stop(ctx.currentTime + n.time + n.dur + 0.05);
        });
        setTimeout(() => {
            const notes2 = [
                { freq: 659.25, time: 0, dur: 0.12 },
                { freq: 783.99, time: 0.1, dur: 0.12 },
                { freq: 1046.50, time: 0.2, dur: 0.12 },
                { freq: 1318.51, time: 0.35, dur: 0.6 },
                { freq: 1046.50, time: 0.35, dur: 0.6 },
            ];
            notes2.forEach(n => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = n.freq;
                gain.gain.setValueAtTime(0.2, ctx.currentTime + n.time);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.time + n.dur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + n.time);
                osc.stop(ctx.currentTime + n.time + n.dur + 0.05);
            });
        }, 600);
    } catch(e) { /* Audio not supported */ }
}

function playLoseSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [
            { freq: 392, time: 0, dur: 0.3 },
            { freq: 349.23, time: 0.25, dur: 0.3 },
            { freq: 329.63, time: 0.5, dur: 0.5 },
        ];
        notes.forEach(n => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = n.freq;
            gain.gain.setValueAtTime(0.15, ctx.currentTime + n.time);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.time + n.dur);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + n.time);
            osc.stop(ctx.currentTime + n.time + n.dur + 0.05);
        });
    } catch(e) { /* Audio not supported */ }
}
