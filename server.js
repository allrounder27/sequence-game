/* ============================================================
   SEQUENCE — Multiplayer Server (Express + Socket.IO)
   Supports 2, 3, 4 or 6 players
   ============================================================ */

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
    cors: { origin: '*' },
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000
});

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

const SEQ_TO_WIN = 2;

// Valid player counts & matching hand sizes
const VALID_COUNTS = [2, 3, 4, 6];
const HAND_SIZES   = { 2: 7, 3: 6, 4: 6, 6: 5 };

// Team assignments per player count
const TEAM_MAP = {
    2: [0, 1],                   // 2 teams
    3: [0, 1, 2],                // 3 teams (FFA)
    4: [0, 1, 0, 1],             // 2 teams (2v2)
    6: [0, 1, 2, 0, 1, 2]        // 3 teams (2v2v2)
};

// Fixed team colors
const TEAM_COLORS = ['#fb7185', '#4ade80', '#38bdf8'];  // Red, Green, Blue
const TEAM_NAMES  = ['Red', 'Green', 'Blue'];

function teamCount(playerCount) {
    return new Set(TEAM_MAP[playerCount]).size;
}

// ── Room Storage ────────────────────────────────────────────
const rooms = {};

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

function initGame(numPlayers) {
    const board = [];
    for (let r = 0; r < 10; r++) {
        board[r] = [];
        for (let c = 0; c < 10; c++)
            board[r][c] = { card: BOARD_LAYOUT[r][c], chip: null, inSequence: false };
    }
    const deck = createDeck();
    shuffle(deck);

    const handSize = HAND_SIZES[numPlayers];
    const hands = [];
    for (let p = 0; p < numPlayers; p++) hands.push([]);
    for (let i = 0; i < handSize; i++) {
        for (let p = 0; p < numPlayers; p++) {
            hands[p].push(deck.pop());
        }
    }

    const teams = TEAM_MAP[numPlayers];
    const numTeams = teamCount(numPlayers);

    return {
        board, deck, hands,
        sequences: new Array(numTeams).fill(0),
        currentPlayer: 0,
        completedSequences: [],
        gameOver: false,
        winner: -1,
        lastMove: null,
        numPlayers,
        teams,
        numTeams
    };
}

// ── Valid Moves ─────────────────────────────────────────────

function getValidMoves(game, playerIdx, card) {
    const moves = [];
    const myTeam = game.teams[playerIdx];

    if (isTwoEyedJack(card)) {
        for (let r = 0; r < 10; r++)
            for (let c = 0; c < 10; c++)
                if (game.board[r][c].chip === null && game.board[r][c].card !== 'FREE')
                    moves.push([r, c]);
    } else if (isOneEyedJack(card)) {
        for (let r = 0; r < 10; r++)
            for (let c = 0; c < 10; c++)
                if (game.board[r][c].chip !== null && game.board[r][c].chip !== myTeam && !game.board[r][c].inSequence)
                    moves.push([r, c]);
    } else {
        for (const [r, c] of getBoardPositions(game.board, card))
            if (game.board[r][c].chip === null) moves.push([r, c]);
    }
    return moves;
}

// ── Sequence Detection ──────────────────────────────────────

function findNewSequences(game, teamIdx) {
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
                    if (cell.card === 'FREE' || cell.chip === teamIdx) pos.push([nr, nc]);
                    else { ok = false; break; }
                }
                if (!ok) continue;
                const isDup = game.completedSequences.some(s =>
                    s.team === teamIdx && s.positions.length === 5 &&
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

    const otherPlayers = [];
    for (let i = 0; i < g.numPlayers; i++) {
        if (i === playerIdx) continue;
        otherPlayers.push({
            index: i,
            name: room.players[i].name,
            cardCount: g.hands[i].length,
            team: g.teams[i]
        });
    }

    return {
        board: g.board,
        myHand: g.hands[playerIdx],
        currentPlayer: g.currentPlayer,
        myIndex: playerIdx,
        myTeam: g.teams[playerIdx],
        sequences: g.sequences,
        deckCount: g.deck.length,
        gameOver: g.gameOver,
        winner: g.winner,
        completedSequences: g.completedSequences,
        lastMove: g.lastMove,
        roomCode: room.code,
        players: room.players.map(p => p.name),
        teams: g.teams,
        numTeams: g.numTeams,
        numPlayers: g.numPlayers,
        teamColors: TEAM_COLORS.slice(0, g.numTeams),
        teamNames: TEAM_NAMES.slice(0, g.numTeams),
        otherPlayers
    };
}

// ============================================================
//  SOCKET.IO
// ============================================================

io.on('connection', socket => {
    let currentRoom = null;
    let playerIdx   = -1;

    socket.on('createRoom', ({ name, maxPlayers }) => {
        maxPlayers = parseInt(maxPlayers) || 2;
        if (!VALID_COUNTS.includes(maxPlayers)) maxPlayers = 2;

        const code = generateCode();
        const room = {
            code,
            maxPlayers,
            players: [{ id: socket.id, name: name || 'Player 1' }],
            game: null
        };
        rooms[code] = room;
        currentRoom = code;
        playerIdx = 0;
        socket.join(code);
        socket.emit('roomCreated', { code, playerIndex: 0, maxPlayers });
        console.log(`Room ${code} created by ${name} (${maxPlayers} players)`);
    });

    socket.on('peekRoom', (code) => {
        code = (code || '').toUpperCase().trim();
        const room = rooms[code];
        if (!room) return socket.emit('error', 'Room not found. Check the code.');
        if (room.players.length >= room.maxPlayers) return socket.emit('error', 'Room is full.');
        socket.emit('roomInfo', {
            maxPlayers: room.maxPlayers,
            currentCount: room.players.length,
            playerNames: room.players.map(p => p.name)
        });
    });

    socket.on('joinRoom', ({ code, name }) => {
        code = (code || '').toUpperCase().trim();
        const room = rooms[code];
        if (!room) return socket.emit('error', 'Room not found. Check the code.');
        if (room.players.length >= room.maxPlayers) return socket.emit('error', 'Room is full.');

        const pIdx = room.players.length;
        room.players.push({ id: socket.id, name: name || `Player ${pIdx + 1}` });
        currentRoom = code;
        playerIdx = pIdx;
        socket.join(code);
        socket.emit('roomJoined', { code, playerIndex: pIdx, maxPlayers: room.maxPlayers });

        io.to(code).emit('lobbyUpdate', {
            currentCount: room.players.length,
            maxPlayers: room.maxPlayers,
            playerNames: room.players.map(p => p.name)
        });

        console.log(`Room ${code}: ${name} joined (${room.players.length}/${room.maxPlayers})`);

        // Start game when full
        if (room.players.length === room.maxPlayers) {
            room.game = initGame(room.maxPlayers);
            const sockets = Array.from(io.sockets.adapter.rooms.get(code) || []);
            for (const sid of sockets) {
                const idx = room.players.findIndex(p => p.id === sid);
                if (idx !== -1) io.to(sid).emit('gameStart', stateForPlayer(room, idx));
            }
            console.log(`Room ${code}: Game starting with ${room.maxPlayers} players!`);
        }
    });

    socket.on('selectCard', ({ cardIdx }) => {
        if (!currentRoom || playerIdx === -1) return;
        const room = rooms[currentRoom];
        if (!room || !room.game) return;
        const g = room.game;
        if (g.gameOver || g.currentPlayer !== playerIdx) return;

        const card = g.hands[playerIdx][cardIdx];
        if (!card) return;

        if (isDeadCard(g.board, card)) {
            g.hands[playerIdx].splice(cardIdx, 1);
            if (g.deck.length > 0) g.hands[playerIdx].push(g.deck.pop());
            broadcastState(room);
            socket.emit('message', 'Dead card exchanged!');
            return;
        }

        const moves = getValidMoves(g, playerIdx, card);
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

        const moves = getValidMoves(g, playerIdx, card);
        if (!moves.some(([r, c]) => r === row && c === col)) return;

        const myTeam = g.teams[playerIdx];

        if (isOneEyedJack(card)) {
            g.board[row][col].chip = null;
        } else {
            g.board[row][col].chip = myTeam;
        }

        g.lastMove = { row, col, player: playerIdx, team: myTeam };

        g.hands[playerIdx].splice(cardIdx, 1);
        if (g.deck.length > 0) g.hands[playerIdx].push(g.deck.pop());

        if (!isOneEyedJack(card)) {
            const newSeqs = findNewSequences(g, myTeam);
            for (const seq of newSeqs) {
                g.completedSequences.push({ team: myTeam, positions: seq });
                for (const [r, c] of seq) g.board[r][c].inSequence = true;
                g.sequences[myTeam]++;
            }
            if (g.sequences[myTeam] >= SEQ_TO_WIN) {
                g.gameOver = true;
                g.winner = myTeam;
                broadcastState(room);
                io.to(currentRoom).emit('message', `Team ${TEAM_NAMES[myTeam]} wins! 🏆`);
                return;
            }
            if (newSeqs.length > 0) {
                broadcastState(room);
                io.to(currentRoom).emit('message', `${room.players[playerIdx].name} completed a sequence for Team ${TEAM_NAMES[myTeam]}! 🎉`);
                setTimeout(() => {
                    g.currentPlayer = (g.currentPlayer + 1) % g.numPlayers;
                    broadcastState(room);
                }, 1200);
                return;
            }
        }

        g.currentPlayer = (g.currentPlayer + 1) % g.numPlayers;
        broadcastState(room);
    });

    socket.on('requestNewGame', () => {
        if (!currentRoom) return;
        const room = rooms[currentRoom];
        if (!room || room.players.length < room.maxPlayers) return;
        room.game = initGame(room.maxPlayers);
        broadcastState(room);
        io.to(currentRoom).emit('message', 'New game started!');
    });

    socket.on('rejoinRoom', ({ code, name }) => {
        code = (code || '').toUpperCase().trim();
        const room = rooms[code];
        if (!room || !room.game) return socket.emit('error', 'Room expired. Please start a new game.');

        const idx = room.players.findIndex(p => p.name === name);
        if (idx === -1) return socket.emit('error', 'Player not found in room.');

        if (room.disconnectTimers && room.disconnectTimers[idx]) {
            clearTimeout(room.disconnectTimers[idx]);
            delete room.disconnectTimers[idx];
            console.log(`Room ${code}: ${name} reconnected (timer cleared)`);
        }

        room.players[idx].id = socket.id;
        currentRoom = code;
        playerIdx = idx;
        socket.join(code);

        io.to(socket.id).emit('gameStart', stateForPlayer(room, idx));
        io.to(code).emit('message', `${name} reconnected!`);
    });

    socket.on('disconnect', () => {
        if (!currentRoom) return;
        const room = rooms[currentRoom];
        if (!room) return;

        const roomCode = currentRoom;
        const pIdx = playerIdx;
        const leaving = room.players.find(p => p.id === socket.id);
        const leavingName = leaving ? leaving.name : 'A player';

        room.disconnectTimers = room.disconnectTimers || {};
        if (room.disconnectTimers[pIdx]) clearTimeout(room.disconnectTimers[pIdx]);

        console.log(`Room ${roomCode}: ${leavingName} disconnected, starting 60s grace period...`);

        room.disconnectTimers[pIdx] = setTimeout(() => {
            const r = rooms[roomCode];
            if (!r) return;
            io.to(roomCode).emit('playerLeft', leavingName);
            delete rooms[roomCode];
            console.log(`Room ${roomCode} closed (disconnect timeout for ${leavingName})`);
        }, 60000);
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
