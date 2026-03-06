/* ============================================================
   SEQUENCE — Multiplayer Client (Socket.IO)
   ============================================================ */

const socket = io();

// ── State ───────────────────────────────────────────────────
let myIndex       = -1;
let selectedCard  = -1;
let validMoves    = [];
let lastState     = null;
let myColor       = '#38bdf8';
let isHorizontalView = false;
let myRoomCode    = null;
let myName        = null;

// ── Card Image Helper ───────────────────────────────────────
function getCardImageUrl(card) {
    if (!card || card === 'FREE') return null;
    const suit  = card.slice(-1);
    let value   = card.slice(0, -1);
    if (value === '10') value = '0';
    return `https://deckofcardsapi.com/static/img/${value}${suit}.png`;
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
const oppCards         = $('oppCards');
const turnLabel        = $('turnLabel');
const gameMessage      = $('gameMessage');
const deckCount        = $('deckCount');
const roomCodeSmall    = $('roomCodeSmall');
const winModal         = $('winModal');
const disconnectModal  = $('disconnectModal');

// ── Lobby Logic ─────────────────────────────────────────────

$('btnCreate').addEventListener('click', () => {
    const name = nameInput.value.trim() || 'Player 1';
    myName = name;
    socket.emit('createRoom', { name, color: myColor });
});

$('btnJoinShow').addEventListener('click', () => {
    if (!nameInput.value.trim()) nameInput.value = 'Player 2';
    lobbyStep1.classList.add('hidden');
    lobbyJoin.classList.remove('hidden');
    lobbyError.classList.add('hidden');
    setTimeout(() => codeInput.focus(), 100);
});

// When code is entered, peek the room to get host color
codeInput?.addEventListener('input', () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length === 4) {
        socket.emit('peekRoom', code);
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
    socket.emit('joinRoom', { code, name, color: myColor });
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
    socket.emit('requestNewGame');
});

$('btnPlayAgain').addEventListener('click', () => {
    winModal.classList.remove('active');
    socket.emit('requestNewGame');
});

function showLobbyError(msg) {
    lobbyError.textContent = msg;
    lobbyError.classList.remove('hidden');
}
// ── Color Picker ──────────────────────────────────────────────────────
document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        myColor = sw.dataset.color;
    });
});

// ── Toggle View ─────────────────────────────────────────────────────
$('btnToggleView').addEventListener('click', () => {
    isHorizontalView = !isHorizontalView;
    gameBoard.classList.toggle('horizontal-view', isHorizontalView);
    $('btnToggleView').textContent = isHorizontalView ? '🔄 Vertical' : '🔄 Horizontal';
});
// ── Socket Events ───────────────────────────────────────────

socket.on('roomCreated', ({ code, playerIndex, hostColor }) => {
    myIndex = playerIndex;
    myRoomCode = code;
    roomCodeDisplay.textContent = code;
    lobbyStep1.classList.add('hidden');
    lobbyWaiting.classList.remove('hidden');
    lobbyError.classList.add('hidden');
});

socket.on('roomJoined', ({ code, playerIndex }) => {
    myIndex = playerIndex;
    myRoomCode = code;
});

// When joining, server tells us which color the host picked so we can grey it out
socket.on('hostColor', (hostColor) => {
    document.querySelectorAll('.color-swatch').forEach(sw => {
        sw.classList.remove('taken');
        if (sw.dataset.color === hostColor) {
            sw.classList.add('taken');
            // If joiner had the same color selected, pick a different one
            if (myColor === hostColor) {
                const available = document.querySelector('.color-swatch:not(.taken):not(.selected)');
                if (available) {
                    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                    available.classList.add('selected');
                    myColor = available.dataset.color;
                }
            }
        }
    });
});

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
    disconnectModal.classList.add('active');
});

// ── Auto-Rejoin on Reconnect ─────────────────────────────────
socket.on('connect', () => {
    // If we were in a game, try to rejoin the room
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

    // Apply player-chosen colors
    if (state.playerColors && state.playerColors.length === 2) {
        document.documentElement.style.setProperty('--p1', state.playerColors[0]);
        document.documentElement.style.setProperty('--p2', state.playerColors[1]);
        document.documentElement.style.setProperty('--p1-dark', darkenColor(state.playerColors[0]));
        document.documentElement.style.setProperty('--p2-dark', darkenColor(state.playerColors[1]));
    }

    renderBoard(state);
    renderMyHand(state);
    renderOpponentCards(state.opponentCardCount);
    renderHeader(state);

    // Win check
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

            // Card image or corner
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

            // Chip overlay
            if (data.chip !== null) {
                const overlay = document.createElement('div');
                overlay.className = 'chip-overlay';
                const chip = document.createElement('div');
                chip.className = `chip chip-p${data.chip + 1}`;
                if (data.inSequence) chip.classList.add('chip-seq');
                overlay.appendChild(chip);
                cell.appendChild(overlay);
            }

            cell.addEventListener('click', () => onCellClick(r, c));
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

        // Jack labels
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

        // Check dead card
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

    // Update hand label
    const color = state.myIndex === 0 ? 'var(--p1)' : 'var(--p2)';
    $('myDot').style.background = color;
    $('myDot').style.boxShadow = `0 0 6px ${color}`;
    $('myHandLabel').textContent = state.players[state.myIndex] + ' (You)';
}

function renderOpponentCards(count) {
    oppCards.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const cb = document.createElement('div');
        cb.className = 'card-back';
        oppCards.appendChild(cb);
    }
}

function renderHeader(state) {
    $('p1Name').textContent = state.players[0] || 'Player 1';
    $('p2Name').textContent = state.players[1] || 'Player 2';
    $('p1Seq').textContent = `${state.sequences[0]} / 2`;
    $('p2Seq').textContent = `${state.sequences[1]} / 2`;
    deckCount.textContent = state.deckCount;
    roomCodeSmall.textContent = state.roomCode;

    if (state.gameOver) {
        turnLabel.textContent = state.winner === state.myIndex ? 'You Win!' : 'You Lose';
    } else if (state.currentPlayer === state.myIndex) {
        turnLabel.textContent = 'Your Turn';
        turnLabel.style.color = 'var(--gold)';
    } else {
        turnLabel.textContent = 'Opponent\'s Turn';
        turnLabel.style.color = 'var(--text-dim)';
    }

    // Highlight active player score box
    $('p1ScoreBox').style.opacity = state.currentPlayer === 0 ? '1' : '.5';
    $('p2ScoreBox').style.opacity = state.currentPlayer === 1 ? '1' : '.5';

    // Opponent label
    const oppIdx = 1 - state.myIndex;
    const oppName = state.players[oppIdx] || 'Opponent';
    document.querySelector('.opp-label').textContent = oppName;
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
    const iWon = state.winner === state.myIndex;
    $('winEmoji').textContent = iWon ? '🏆' : '😔';
    $('winTitle').textContent = iWon ? 'You Win!' : 'You Lose';
    $('winSubtext').textContent = iWon
        ? 'Congratulations! You completed 2 sequences!'
        : `${state.players[state.winner]} completed 2 sequences.`;
    winModal.classList.add('active');
    if (iWon) launchConfetti();
}

// ── Rules Modal ─────────────────────────────────────────────

window.showRules = () => $('rulesModal').classList.add('active');
window.closeRules = () => $('rulesModal').classList.remove('active');

// ── Confetti ────────────────────────────────────────────────

function launchConfetti() {
    const container = $('confettiContainer');
    const colors = ['#d4a843','#38bdf8','#fb7185','#4ade80','#a78bfa','#facc15','#f472b6'];
    for (let i = 0; i < 120; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.setProperty('--fall-time', (2 + Math.random() * 2) + 's');
        piece.style.animationDelay = Math.random() * 1.5 + 's';
        piece.style.transform = `rotateZ(${Math.random() * 360}deg)`;
        container.appendChild(piece);
    }
    setTimeout(() => { container.innerHTML = ''; }, 5000);
}
