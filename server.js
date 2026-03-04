/* ============================================================
   SEQUENCE — Multiplayer Server (Express + Socket.IO)
   ============================================================ */

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ── Board Layout ────────────────────────────────────────────
const BOARD_LAYOUT = [
    ['FREE','2S','3S','4S','5S','6S','7S','8S','9S','FREE'],
    ['6C','5C','4C','3C','2C','AH','KH','QH','10H','10S'],
    ['7C','AS','2D','3D','4D','5D','6D','7D','9H','QS'],
    ['8C','KS','6C','5C','4C','3C','2C','8D','8H','KS'],
    ['9C','QS','7C','6H','5H','4H','AH','9D','7H','AS'],
    ['10C','10S','8C','7H','2H','3H','KH','10D','6H','2D'],
    ['QC','9S','9C','8H','9H','10H','QH','QD','5H','3D'],
    ['KC','8S','10C','QC','KC','AC','AD','KD','4H','4D'],
    ['AC','7S','6S','5S','4S','3S','2S','2H','3H','5D'],
    ['FREE','AD','KD','QD','10D','9D','8D','7D','6D','FREE']
];

const HAND_SIZE  = 7;
const SEQ_TO_WIN = 2;

// ── Room Storage ────────────────────────────────────────────
const rooms = {};  // code → { players, game }

function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code;
    do { code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
    while (rooms[code]);
    return code;
}

// ── Deck Helpers ────────────────────────────────────────────

function createDeck() {
    const suits = ['S','H','D','C'], values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const deck = [];
    for (let d = 0; d < 2; d++) for (const s of suits) for (const v of values) deck.push(v + s);
    return deck;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// ── Card Helpers ────────────────────────────────────────────

function isTwoEyedJack(c)  { return c === 'JD' || c === 'JC'; }
function isOneEyedJack(c)  { return c === 'JH' || c === 'JS'; }
function isJack(c)          { return c && c[0] === 'J' && c.length === 2; }

function getBoardPositions(board, card) {
    const pos = [];
    for (let r = 0; r < 10; r++)
        for (let c = 0; c < 10; c++)
            if (board[r][c].card === card) pos.push([r, c]);
    return pos;
}

function isDeadCard(board, card) {
    if (isJack(card)) return false;
    return getBoardPositions(board, card).every(([r, c]) => board[r][c].chip !== null);
}

// ── Game Init ───────────────────────────────────────────────

function initGame() {
    const board = [];
    for (let r = 0; r < 10; r++) {
        board[r] = [];
        for (let c = 0; c < 10; c++)
            board[r][c] = { card: BOARD_LAYOUT[r][c], chip: null, inSequence: false };
    }
    const deck = createDeck();
    shuffle(deck);
    const hands = [[], []];
    for (let i = 0; i < HAND_SIZE; i++) { hands[0].push(deck.pop()); hands[1].push(deck.pop()); }
    return {
        board, deck, hands,
        sequences: [0, 0],
        currentPlayer: 0,
        completedSequences: [],
        gameOver: false,
        winner: -1
    };
}

// ── Valid Moves ─────────────────────────────────────────────

function getValidMoves(game, card) {
    const moves = [];
    if (isTwoEyedJack(card)) {
        for (let r = 0; r < 10; r++)
            for (let c = 0; c < 10; c++)
                if (game.board[r][c].chip === null && game.board[r][c].card !== 'FREE')
                    moves.push([r, c]);
    } else if (isOneEyedJack(card)) {
        const opp = 1 - game.currentPlayer;
        for (let r = 0; r < 10; r++)
            for (let c = 0; c < 10; c++)
                if (game.board[r][c].chip === opp && !game.board[r][c].inSequence)
                    moves.push([r, c]);
    } else {
        for (const [r, c] of getBoardPositions(game.board, card))
            if (game.board[r][c].chip === null) moves.push([r, c]);
    }
    return moves;
}

// ── Sequence Detection ──────────────────────────────────────

function findNewSequences(game, player) {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    const found = [];
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
            for (const [dr, dc] of dirs) {
                if (r + dr * 4 < 0 || r + dr * 4 >= 10 || c + dc * 4 < 0 || c + dc * 4 >= 10) continue;
                const pos = [];
                let ok = true;
                for (let i = 0; i < 5; i++) {
                    const nr = r + dr * i, nc = c + dc * i;
                    const cell = game.board[nr][nc];
                    if (cell.card === 'FREE' || cell.chip === player) pos.push([nr, nc]);
                    else { ok = false; break; }
                }
                if (!ok) continue;
                const isDup = game.completedSequences.some(s =>
                    s.player === player && s.positions.length === 5 &&
                    s.positions.every(([sr, sc], i) => sr === pos[i][0] && sc === pos[i][1])
                );
                if (isDup) continue;
                let tooMuch = false;
                for (const ex of game.completedSequences) {
                    let ov = 0;
                    for (const [pr, pc] of pos)
                        if (ex.positions.some(([sr, sc]) => sr === pr && sc === pc)) ov++;
                    if (ov > 1) { tooMuch = true; break; }
                }
                if (tooMuch) continue;
                found.push(pos);
                return found;
            }
        }
    }
    return found;
}

// ── Build State For Client ──────────────────────────────────

function stateForPlayer(room, playerIdx) {
    const g = room.game;
    return {
        board: g.board,
        myHand: g.hands[playerIdx],
        opponentCardCount: g.hands[1 - playerIdx].length,
        currentPlayer: g.currentPlayer,
        myIndex: playerIdx,
        sequences: g.sequences,
        deckCount: g.deck.length,
        gameOver: g.gameOver,
        winner: g.winner,
        completedSequences: g.completedSequences,
        roomCode: room.code,
        players: room.players.map(p => p.name),
        playerColors: room.players.map(p => p.color)
    };
}

// ============================================================
//  SOCKET.IO
// ============================================================

io.on('connection', socket => {
    let currentRoom = null;
    let playerIdx   = -1;

    socket.on('createRoom', ({ name, color }) => {
        const code = generateCode();
        const room = {
            code,
            players: [{ id: socket.id, name: name || 'Player 1', color: color || '#38bdf8' }],
            game: null
        };
        rooms[code] = room;
        currentRoom = code;
        playerIdx = 0;
        socket.join(code);
        socket.emit('roomCreated', { code, playerIndex: 0 });
        console.log(`Room ${code} created by ${name}`);
    });

    // Let the joiner peek at host color before joining
    socket.on('peekRoom', (code) => {
        code = (code || '').toUpperCase().trim();
        const room = rooms[code];
        if (!room) return socket.emit('error', 'Room not found. Check the code.');
        if (room.players.length >= 2) return socket.emit('error', 'Room is full.');
        socket.emit('hostColor', room.players[0].color);
    });

    socket.on('joinRoom', ({ code, name, color }) => {
        code = (code || '').toUpperCase().trim();
        const room = rooms[code];
        if (!room) return socket.emit('error', 'Room not found. Check the code.');
        if (room.players.length >= 2) return socket.emit('error', 'Room is full.');
        // Prevent same color as host
        const hostColor = room.players[0].color;
        if (color === hostColor) {
            // Auto-pick a different color
            const fallbacks = ['#38bdf8','#fb7185','#4ade80','#a78bfa','#fb923c','#facc15'];
            color = fallbacks.find(c => c !== hostColor) || '#fb7185';
        }
        room.players.push({ id: socket.id, name: name || 'Player 2', color: color || '#fb7185' });
        currentRoom = code;
        playerIdx = 1;
        socket.join(code);
        socket.emit('roomJoined', { code, playerIndex: 1 });

        // Start game
        room.game = initGame();
        const sockets = Array.from(io.sockets.adapter.rooms.get(code) || []);
        for (const sid of sockets) {
            const idx = room.players.findIndex(p => p.id === sid);
            if (idx !== -1) io.to(sid).emit('gameStart', stateForPlayer(room, idx));
        }
        console.log(`Room ${code}: ${name} joined. Game starting!`);
    });

    socket.on('selectCard', ({ cardIdx }) => {
        if (!currentRoom || playerIdx === -1) return;
        const room = rooms[currentRoom];
        if (!room || !room.game) return;
        const g = room.game;
        if (g.gameOver || g.currentPlayer !== playerIdx) return;

        const card = g.hands[playerIdx][cardIdx];
        if (!card) return;

        // Dead card exchange
        if (isDeadCard(g.board, card)) {
            g.hands[playerIdx].splice(cardIdx, 1);
            if (g.deck.length > 0) g.hands[playerIdx].push(g.deck.pop());
            broadcastState(room);
            socket.emit('message', 'Dead card exchanged!');
            return;
        }

        const moves = getValidMoves(g, card);
        socket.emit('validMoves', { cardIdx, moves, card });
    });

    socket.on('makeMove', ({ cardIdx, row, col }) => {
        if (!currentRoom || playerIdx === -1) return;
        const room = rooms[currentRoom];
        if (!room || !room.game) return;
        const g = room.game;
        if (g.gameOver || g.currentPlayer !== playerIdx) return;

        const card = g.hands[playerIdx][cardIdx];
        if (!card) return;

        const moves = getValidMoves(g, card);
        if (!moves.some(([r, c]) => r === row && c === col)) return;

        // Execute move
        if (isOneEyedJack(card)) {
            g.board[row][col].chip = null;
        } else {
            g.board[row][col].chip = playerIdx;
        }

        g.hands[playerIdx].splice(cardIdx, 1);
        if (g.deck.length > 0) g.hands[playerIdx].push(g.deck.pop());

        // Check sequences
        if (!isOneEyedJack(card)) {
            const newSeqs = findNewSequences(g, playerIdx);
            for (const seq of newSeqs) {
                g.completedSequences.push({ player: playerIdx, positions: seq });
                for (const [r, c] of seq) g.board[r][c].inSequence = true;
                g.sequences[playerIdx]++;
            }
            if (g.sequences[playerIdx] >= SEQ_TO_WIN) {
                g.gameOver = true;
                g.winner = playerIdx;
                broadcastState(room);
                io.to(currentRoom).emit('message', `${room.players[playerIdx].name} wins! 🏆`);
                return;
            }
            if (newSeqs.length > 0) {
                broadcastState(room);
                io.to(currentRoom).emit('message', `${room.players[playerIdx].name} completed a sequence! 🎉`);
                setTimeout(() => {
                    g.currentPlayer = 1 - g.currentPlayer;
                    broadcastState(room);
                }, 1200);
                return;
            }
        }

        g.currentPlayer = 1 - g.currentPlayer;
        broadcastState(room);
    });

    socket.on('requestNewGame', () => {
        if (!currentRoom) return;
        const room = rooms[currentRoom];
        if (!room || room.players.length < 2) return;
        room.game = initGame();
        broadcastState(room);
        io.to(currentRoom).emit('message', 'New game started!');
    });

    socket.on('disconnect', () => {
        if (!currentRoom) return;
        const room = rooms[currentRoom];
        if (!room) return;
        const leaving = room.players.find(p => p.id === socket.id);
        io.to(currentRoom).emit('playerLeft', leaving ? leaving.name : 'Opponent');
        // Clean up room
        delete rooms[currentRoom];
        console.log(`Room ${currentRoom} closed (disconnect)`);
    });

    function broadcastState(room) {
        const sockets = Array.from(io.sockets.adapter.rooms.get(room.code) || []);
        for (const sid of sockets) {
            const idx = room.players.findIndex(p => p.id === sid);
            if (idx !== -1) io.to(sid).emit('gameState', stateForPlayer(room, idx));
        }
    }
});

server.listen(PORT, () => console.log(`Sequence server running on port ${PORT}`));
