# 🃏 Sequence - Multiplayer Card Board Game

A real-time multiplayer implementation of the classic **Sequence** board game, built with **Node.js**, **Express**, and **Socket.IO**.

## 📖 About the Game

Sequence is a board-and-card game where players (or teams) compete to create sequences of five connected chips on a game board. Players take turns playing cards from their hand and placing chips on the corresponding board spaces. The first player/team to complete the required number of sequences wins!

### Key Features

- 🎮 **Real-time Multiplayer** — Play with friends online using room codes
- 👥 **Team Support** — Supports up to 6 players with team-based gameplay
- 🃏 **Full Card Deck** — Uses a standard double deck (104 cards)
- 🔀 **Special Jacks** — Two-eyed Jacks (wild) and One-eyed Jacks (remove opponent's chip)
- ⭐ **Free Corners** — Four corner spaces count for all players
- 📱 **Responsive UI** — Play from any device with a modern browser

## 🛠️ Tech Stack

| Technology  | Purpose                        |
|-------------|--------------------------------|
| Node.js     | Server runtime                 |
| Express     | HTTP server & static files     |
| Socket.IO   | Real-time WebSocket communication |
| HTML/CSS/JS | Client-side game interface     |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- npm (comes with Node.js)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/allrounder27/sequence-game.git
   cd sequence-game
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open your browser** and navigate to:
   ```
   http://localhost:3000
   ```

## 🎲 How to Play

1. **Create a Room** — One player creates a game room and receives a 4-letter room code.
2. **Share the Code** — Share the room code with friends so they can join.
3. **Join the Room** — Other players enter the code to join the game.
4. **Play Cards** — On your turn, select a card from your hand and place a chip on the matching board space.
5. **Use Jacks Strategically**:
   - **Two-Eyed Jacks** (♦ J, ♣ J) — Wild cards! Place a chip on any open space.
   - **One-Eyed Jacks** (♥ J, ♠ J) — Remove an opponent's chip from the board.
6. **Complete Sequences** — Form a row of 5 chips (horizontal, vertical, or diagonal).
7. **Win the Game** — The first player/team to complete **2 sequences** wins!

## 📁 Project Structure

```
sequence-game/
├── server.js          # Express + Socket.IO game server
├── package.json       # Project dependencies and scripts
├── Feature.txt        # Feature notes
├── public/
│   ├── index.html     # Game UI
│   ├── styles.css     # Styling
│   ├── game.js        # Client-side game logic
│   └── cards/         # Card image assets
└── README.md          # This file
```

## 🔧 Configuration

| Environment Variable | Default | Description         |
|---------------------|---------|---------------------|
| `PORT`              | `3000`  | Server listen port  |

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is open source and available for personal and educational use.

## 🙏 Acknowledgments

- Inspired by the classic [Sequence board game](https://en.wikipedia.org/wiki/Sequence_(game)) by Jax Ltd.
- Built with ❤️ using Node.js and Socket.IO
