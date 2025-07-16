# Hand Cricket Server

This project implements the classic school-time game Hand Cricket using Node.js, Express, and WebSockets. It allows you to create rooms and play the game in real-time with a friend.

## Features

- **Real-time gameplay**: Utilizing WebSockets for smooth, real-time interactions.
- **Multiplayer support**: Create and join rooms dynamically.
- **Docker support**: Easily deployable using Docker.

## Prerequisites

- **Node.js**: Ensure Node.js is installed on your system.
- **Docker (Optional)**: For containerized deployment.

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-repo/handcricket.git
   ```
2. **Navigate to the directory**:
   ```bash
   cd handcricket
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Compile TypeScript**:
   ```bash
   npx tsc --build
   ```

## Running the Application

### Locally

1. **Start the server**:
   ```bash
   npm run dev
   ```

2. **Access the application**: By default, it runs on `http://localhost:3000`.

### Using Docker

1. **Build the Docker image**:
   ```bash
   docker build -t handcricket .
   ```

2. **Run the Docker container**:
   ```bash
   docker run -p 3000:3000 handcricket
   ```

## Event List

This server supports several real-time events:

### Client to Server Events

| Event Name    | Function                                           | Required Parameters           | Description |
|---------------|----------------------------------------------------|-----------------------------|-------------|
| JOIN_ROOM     | Join a room by specifying the room and player ID   | `roomId`, `playerId`        | Player joins a game room. When 2 players join, game starts automatically |
| PLAYER_CHOICE | Handle player's choice during the game             | `roomId`, `playerId`, `choice` | Submit player's choice (1-6) for the current round |
| MESSAGE       | Send a chat message to all players in the room     | `roomId`, `message`         | Send text messages to other players in the same room |

### Server to Client Events

| Event Name    | Function                                           | Data Structure              | Description |
|---------------|----------------------------------------------------|-----------------------------|-------------|
| MESSAGE       | Broadcast message to all clients in a room        | `{ type: 'MESSAGE', message: string }` | General messages including player join notifications |
| START_GAME    | Notify clients that the game has started          | `{ type: 'START_GAME', message: { batsman: string, bowler: string } }` | Sent when 2 players join and game begins |
| UPDATE_GAME   | Update game state and scoreboard                  | `{ type: 'UPDATE_GAME', message: { innings: number, playersScore: [{ player: string, runs: number, role: string }] } }` | Real-time game state updates |
| GAME_OVER     | Notify clients that the game has ended            | `{ type: 'GAME_OVER', message: { result: string } }` | Final game result with winner information |

## How to Play

1. **Join a Room**: Connect to the WebSocket server and send a `JOIN_ROOM` event with your player ID and room ID.
2. **Wait for Game Start**: Once 2 players join, the server will send a `START_GAME` event with role assignments.
3. **Make Choices**: Players submit their choices (1-6) using the `PLAYER_CHOICE` event.
4. **Game Logic**: 
   - If choices are different: batting player scores runs equal to their choice
   - If choices are the same: innings change or game ends
5. **Game End**: Server sends `GAME_OVER` event with the final result.

## Contribution

Feel free to submit pull requests or create issues regarding any bugs or feature requests.

## License

This project is licensed under ISC. See the [LICENSE](LICENSE) file for details.
