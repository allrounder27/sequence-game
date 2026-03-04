/* ============================================================
   SEQUENCE — Game Logic  (image-based board + hands)
   ============================================================ */

// ── Board Layout (Standard Sequence Board) ──────────────────
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

// ── Constants ───────────────────────────────────────────────
const PLAYER_COLORS = ['p1', 'p2'];
const PLAYER_NAMES  = ['Player 1', 'Player 2'];
const HAND_SIZE     = 7;
const SEQ_TO_WIN    = 2;

// Card image base URL (deckofcardsapi static assets)
const CARD_IMG_BASE = 'https://deckofcardsapi.com/static/img/';

// ── Game State ──────────────────────────────────────────────
let game = {
    board: [],
    deck: [],
    players: [
        { hand: [], sequences: 0 },
        { hand: [], sequences: 0 }
    ],
    currentPlayer: 0,
    selectedCardIdx: -1,
    validMoves: [],
    completedSequences: [],
    gameOver: false
};

// ============================================================
//  CARD IMAGE HELPER
// ============================================================

/**
 * Converts an internal card code to deckofcardsapi image URL.
 * Internal: "10S" "AH" "KD" "JC" "2H" etc.
 * API uses: "0S" for 10, otherwise same.  Full URL example:
 *   https://deckofcardsapi.com/static/img/0S.png
 */
function getCardImageUrl(card) {
    if (!card || card === 'FREE') return null;
    const suit  = card.slice(-1);
    let value   = card.slice(0, -1);
    if (value === '10') value = '0';
    return CARD_IMG_BASE + value + suit + '.png';
}

// ============================================================
//  INITIALISATION
// ============================================================

function newGame() {
    game.board              = [];
    game.deck               = [];
    game.players            = [{ hand: [], sequences: 0 }, { hand: [], sequences: 0 }];
    game.currentPlayer      = 0;
    game.selectedCardIdx    = -1;
    game.validMoves         = [];
    game.completedSequences = [];
    game.gameOver           = false;

    for (let r = 0; r < 10; r++) {
        game.board[r] = [];
        for (let c = 0; c < 10; c++) {
            game.board[r][c] = { card: BOARD_LAYOUT[r][c], chip: null, inSequence: false };
        }
    }

    game.deck = createDeck();
    shuffle(game.deck);

    for (let i = 0; i < HAND_SIZE; i++) {
        game.players[0].hand.push(game.deck.pop());
        game.players[1].hand.push(game.deck.pop());
    }

    closeWin();
    clearConfetti();
    renderBoard();
    renderHands();
    updateStatus();
    showMessage('Select a card from your hand');
}

// ── Deck helpers ────────────────────────────────────────────

function createDeck() {
    const suits  = ['S', 'H', 'D', 'C'];
    const values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const deck   = [];
    for (let d = 0; d < 2; d++)
        for (const s of suits)
            for (const v of values)
                deck.push(v + s);
    return deck;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// ============================================================
//  CARD UTILITIES
// ============================================================

function isTwoEyedJack(card) { return card === 'JD' || card === 'JC'; }
function isOneEyedJack(card) { return card === 'JH' || card === 'JS'; }
function isJack(card) { return card && card[0] === 'J' && card.length === 2; }

function getBoardPositions(card) {
    const pos = [];
    for (let r = 0; r < 10; r++)
        for (let c = 0; c < 10; c++)
            if (game.board[r][c].card === card) pos.push([r, c]);
    return pos;
}

function isDeadCard(card) {
    if (isJack(card)) return false;
    return getBoardPositions(card).every(([r, c]) => game.board[r][c].chip !== null);
}

// ============================================================
//  MOVE LOGIC
// ============================================================

function getValidMoves(card) {
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
        for (const [r, c] of getBoardPositions(card))
            if (game.board[r][c].chip === null) moves.push([r, c]);
    }
    return moves;
}

function makeMove(row, col) {
    const card   = game.players[game.currentPlayer].hand[game.selectedCardIdx];
    const player = game.currentPlayer;

    if (isOneEyedJack(card)) {
        game.board[row][col].chip = null;
    } else {
        game.board[row][col].chip = player;
    }

    game.players[player].hand.splice(game.selectedCardIdx, 1);
    if (game.deck.length > 0) game.players[player].hand.push(game.deck.pop());

    game.selectedCardIdx = -1;
    game.validMoves      = [];

    if (!isOneEyedJack(card)) {
        const newSeqs = findNewSequences(player);
        for (const seq of newSeqs) {
            game.completedSequences.push({ player, positions: seq });
            for (const [r, c] of seq) game.board[r][c].inSequence = true;
            game.players[player].sequences++;
        }
        if (game.players[player].sequences >= SEQ_TO_WIN) {
            game.gameOver = true;
            renderBoard();
            renderHands();
            updateStatus();
            setTimeout(() => showWin(player), 500);
            return;
        }
        if (newSeqs.length > 0) {
            renderBoard();
            renderHands();
            updateStatus();
            showMessage(`${PLAYER_NAMES[player]} completed a sequence! 🎉`);
            setTimeout(() => {
                game.currentPlayer = 1 - game.currentPlayer;
                renderBoard();
                renderHands();
                updateStatus();
                showMessage('Select a card from your hand');
            }, 1200);
            return;
        }
    }

    game.currentPlayer = 1 - game.currentPlayer;
    renderBoard();
    renderHands();
    updateStatus();
    showMessage('Select a card from your hand');
}

// ── Sequence Detection ──────────────────────────────────────

function findNewSequences(player) {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    const found = [];

    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
            for (const [dr, dc] of dirs) {
                const er = r + dr * 4, ec = c + dc * 4;
                if (er < 0 || er >= 10 || ec < 0 || ec >= 10) continue;

                const pos = [];
                let ok = true;
                for (let i = 0; i < 5; i++) {
                    const nr = r + dr * i, nc = c + dc * i;
                    const cell = game.board[nr][nc];
                    if (cell.card === 'FREE' || cell.chip === player) {
                        pos.push([nr, nc]);
                    } else { ok = false; break; }
                }
                if (!ok) continue;

                const isDuplicate = game.completedSequences.some(s =>
                    s.player === player &&
                    s.positions.length === 5 &&
                    s.positions.every(([sr, sc], i) => sr === pos[i][0] && sc === pos[i][1])
                );
                if (isDuplicate) continue;

                let tooMuchOverlap = false;
                for (const existing of game.completedSequences) {
                    let overlap = 0;
                    for (const [pr, pc] of pos)
                        if (existing.positions.some(([sr, sc]) => sr === pr && sc === pc))
                            overlap++;
                    if (overlap > 1) { tooMuchOverlap = true; break; }
                }
                if (tooMuchOverlap) continue;

                found.push(pos);
                return found;
            }
        }
    }
    return found;
}

// ============================================================
//  EVENT HANDLERS
// ============================================================

function onCardClick(playerIdx, cardIdx) {
    if (game.gameOver) return;
    if (playerIdx !== game.currentPlayer) {
        showMessage("It's not your turn!");
        return;
    }

    const card = game.players[playerIdx].hand[cardIdx];

    if (isDeadCard(card)) {
        game.players[playerIdx].hand.splice(cardIdx, 1);
        if (game.deck.length > 0) game.players[playerIdx].hand.push(game.deck.pop());
        showMessage('Dead card exchanged!');
        game.selectedCardIdx = -1;
        game.validMoves = [];
        renderHands();
        renderBoard();
        return;
    }

    if (game.selectedCardIdx === cardIdx) {
        game.selectedCardIdx = -1;
        game.validMoves = [];
        showMessage('Select a card from your hand');
    } else {
        game.selectedCardIdx = cardIdx;
        game.validMoves = getValidMoves(card);
        if (game.validMoves.length === 0)
            showMessage('No valid moves for this card.');
        else if (isOneEyedJack(card))
            showMessage("Click an opponent's chip to remove");
        else if (isTwoEyedJack(card))
            showMessage('Click any empty space');
        else
            showMessage('Click a highlighted space');
    }

    renderHands();
    renderBoard();
}

function onCellClick(row, col) {
    if (game.gameOver || game.selectedCardIdx === -1) return;
    if (!game.validMoves.some(([r, c]) => r === row && c === col)) return;
    makeMove(row, col);
}

// ============================================================
//  RENDERING
// ============================================================

function renderBoard() {
    const el = document.getElementById('gameBoard');
    el.innerHTML = '';

    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
            const cell = game.board[r][c];
            const div  = document.createElement('div');
            div.className = 'cell';

            const isValid = game.validMoves.some(([vr, vc]) => vr === r && vc === c);

            if (cell.card === 'FREE') {
                div.classList.add('free-space');
                div.innerHTML = '<span class="free-star">★</span>';
            } else {
                const url = getCardImageUrl(cell.card);
                const img = document.createElement('img');
                img.className = 'cell-img';
                img.src = url;
                img.alt = cell.card;
                img.loading = 'lazy';
                div.appendChild(img);
            }

            if (cell.chip !== null) {
                const ch = document.createElement('div');
                ch.className = `chip ${PLAYER_COLORS[cell.chip]}`;
                if (cell.inSequence) ch.classList.add('in-sequence');
                div.appendChild(ch);
                div.classList.add('has-chip');
            }

            if (cell.inSequence) div.classList.add('seq-cell');

            if (isValid) {
                div.classList.add('valid-move');
                if (game.selectedCardIdx !== -1) {
                    const card = game.players[game.currentPlayer].hand[game.selectedCardIdx];
                    if (isOneEyedJack(card)) div.classList.add('remove-move');
                }
            }

            div.addEventListener('click', () => onCellClick(r, c));
            el.appendChild(div);
        }
    }
}

function renderHands() {
    for (let p = 0; p < 2; p++) {
        const handEl = document.getElementById(`player${p + 1}Hand`);
        handEl.innerHTML = '';

        const row = document.getElementById(`p${p + 1}HandRow`);
        row.classList.toggle('active',   p === game.currentPlayer && !game.gameOver);
        row.classList.toggle('inactive', p !== game.currentPlayer && !game.gameOver);

        for (let i = 0; i < game.players[p].hand.length; i++) {
            const card = game.players[p].hand[i];
            const dead = isDeadCard(card);
            const url  = getCardImageUrl(card);

            const el = document.createElement('div');
            el.className = 'hand-card';
            if (p === game.currentPlayer && game.selectedCardIdx === i) el.classList.add('selected');
            if (p !== game.currentPlayer) el.classList.add('inactive');
            if (dead) el.classList.add('dead');

            const img = document.createElement('img');
            img.src = url;
            img.alt = card;
            img.draggable = false;
            el.appendChild(img);

            // Badges
            if (isTwoEyedJack(card))  el.insertAdjacentHTML('beforeend', '<span class="jack-badge wild">WILD</span>');
            if (isOneEyedJack(card))  el.insertAdjacentHTML('beforeend', '<span class="jack-badge anti">REMOVE</span>');
            if (dead)                 el.insertAdjacentHTML('beforeend', '<span class="dead-badge">DEAD</span>');

            el.addEventListener('click', () => onCardClick(p, i));
            handEl.appendChild(el);
        }
    }

    const dc = document.getElementById('deckCount');
    if (dc) dc.textContent = game.deck.length;
}

function updateStatus() {
    const turnEl = document.getElementById('turnLabel');
    const p1Seq  = document.getElementById('p1Seq');
    const p2Seq  = document.getElementById('p2Seq');
    const p1Box  = document.getElementById('p1ScoreBox');
    const p2Box  = document.getElementById('p2ScoreBox');

    turnEl.textContent = game.gameOver
        ? 'Game Over!'
        : `${PLAYER_NAMES[game.currentPlayer]}'s Turn`;
    turnEl.className = 'turn-label ' + (game.gameOver ? '' : PLAYER_COLORS[game.currentPlayer]);

    p1Seq.textContent = `${game.players[0].sequences} / ${SEQ_TO_WIN}`;
    p2Seq.textContent = `${game.players[1].sequences} / ${SEQ_TO_WIN}`;

    p1Box.classList.toggle('active', game.currentPlayer === 0 && !game.gameOver);
    p2Box.classList.toggle('active', game.currentPlayer === 1 && !game.gameOver);
}

function showMessage(msg) {
    const el = document.getElementById('gameMessage');
    el.textContent = msg;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 350);
}

// ============================================================
//  MODALS
// ============================================================

function showRules() { document.getElementById('rulesModal').classList.add('active'); }
function closeRules(){ document.getElementById('rulesModal').classList.remove('active'); }

function showWin(playerIdx) {
    document.getElementById('winTitle').textContent  = `${PLAYER_NAMES[playerIdx]} Wins!`;
    document.getElementById('winSubtext').textContent = `Completed ${SEQ_TO_WIN} sequences — congratulations!`;
    document.getElementById('winModal').classList.add('active');
    launchConfetti();
}
function closeWin() { document.getElementById('winModal').classList.remove('active'); }

// ============================================================
//  CONFETTI
// ============================================================

function launchConfetti() {
    const box = document.getElementById('confettiContainer');
    box.innerHTML = '';
    const colors = ['#c9a84c','#38bdf8','#fb7185','#4ade80','#f0d060','#a78bfa','#f97316'];
    for (let i = 0; i < 100; i++) {
        const p = document.createElement('div');
        p.className = 'confetti';
        p.style.left              = Math.random() * 100 + '%';
        p.style.background        = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDelay    = (Math.random() * 3) + 's';
        p.style.animationDuration = (Math.random() * 2 + 2.5) + 's';
        p.style.width  = (Math.random() * 8 + 4) + 'px';
        p.style.height = (Math.random() * 8 + 4) + 'px';
        box.appendChild(p);
    }
}
function clearConfetti() { document.getElementById('confettiContainer').innerHTML = ''; }

// ============================================================
//  BOOT
// ============================================================

document.addEventListener('DOMContentLoaded', newGame);
