import { MessageType } from "../types/MessageType"
import { sendMessage } from "./sendMessage"
import { WebSocket } from "ws"
import { rooms } from "../store/store"
import { games } from "../store/store"
import { Game } from "../Game"

const playerIdsArr: string[] = [];
let pointer = 0;

export const joinRoom = (ws: WebSocket, roomId: string, playerId: string) => {
    if (playerIdsArr.includes(playerId)) {
        sendMessage('This player is already in the room', roomId)
    }

    if (!rooms[roomId]) {
        rooms[roomId] = []
    }

    if (rooms[roomId].length < 2) {
        rooms[roomId].push(ws)
        playerIdsArr[pointer++] = playerId
        sendMessage(`${playerId} has entered the stadium`, roomId);
    } else {
        ws.send(JSON.stringify({ type: 'MESSAGE', message: 'The room is full' }))
    }

    if (rooms[roomId].length === 2) {
        const player1Id = playerIdsArr[pointer - 2];
        const player2Id = playerIdsArr[pointer - 1];

        const game = new Game(player1Id, player2Id)

        games[roomId] = game;

        rooms[roomId].forEach((client) => {
            client.send(JSON.stringify({
                type: 'START_GAME',
                message: {
                    batsman: game.players[0].state === 'batting' ? game.players[0].player : game.players[1].player,
                    bowler: game.players[0].state === 'bowling' ? game.players[0].player : game.players[1].player,
                }
            }))
        })
        pointer -= 2;
    }

}