import { Game } from "../Game";
import { games } from "../store/store";
import { rooms } from "../store/store";
import { WebSocket } from "ws";

const handleChoice = (roomId: string, playerId: string, choice: number) => {
    // get the game
    const game = games[roomId]
    if (!game) {
        return;
    }

    game.setPlayerChoice(playerId, choice)
    const result = game.scoreRuns()

    if (result === null) {
        // send upadated scoreboard
        broadCastScoreBoard(roomId, game)
        // console.log("Good here");

    } else if (typeof result !== "string") {
        const message = {
            type: 'UPDATE_GAME',
            // message: 'Waiting for the other player to choose...'
            message: result.message
        }
        rooms[roomId].forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message))
            }
        })
    } else {
        // game is over send the results
        broadcastGameOver(roomId, result, game)
    }
}

const broadCastScoreBoard = (roomId: string, game: Game) => {
    const scoreBoard = {
        type: 'UPDATE_GAME',
        message: {
            innings: game.innings,
            playersScore: game.players.map(p => ({
                player: p.player,
                runs: p.score,
                role: p.state,
                choice: p.choice
            }))
        }
    }

    rooms[roomId].forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(scoreBoard))
        }
    })

    game.resetChoices()
}

const broadcastGameOver = (roomId: string, result: string, game: Game) => {
    const payload = {
        type: 'GAME_OVER',
        message: {
            result,
            playersScore: game.players.map(p => ({
                player: p.player,
                runs: p.score,
                role: p.state,
                choice: p.choice
            }))
        }
    }
    rooms[roomId].forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload))
        }
    })
    delete rooms[roomId]
    delete games[roomId]
}

export default handleChoice;