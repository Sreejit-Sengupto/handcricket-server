import express from 'express'
import { WebSocket, WebSocketServer } from 'ws'
import { MessageType } from './types/MessageType'
import { joinRoom } from './helpers/joinRoom'
import { rooms } from './store/store'
import handleChoice from './helpers/handleChoice'

const app = express()
const PORT = process.env.PORT

const expressServer = app.listen(PORT, () => {
    console.log(`Server up on PORT: ${PORT}`);
})

const wss = new WebSocketServer({ server: expressServer })

wss.on('connection', (ws) => {
    console.log("A client connected");

    ws.on('message', (message) => {
        const parsedMessage: MessageType = JSON.parse(message.toString())
        // parsedMessage structure
        // {
        //     type: 'join',
        //     message: 'message',
        //     playerId?: 'playerId'
        //     roomId?: 'roomId',
        // }

        switch (parsedMessage.type) {
            case 'JOIN_ROOM':
                joinRoom(ws, parsedMessage.roomId || "", parsedMessage.playerId!)
                break;

            case 'PLAYER_CHOICE':
                handleChoice(parsedMessage.roomId!, parsedMessage.playerId!, parsedMessage.choice!)
                break;

            case 'MESSAGE':
                rooms[parsedMessage.roomId || ""].forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'MESSAGE', message: parsedMessage.message }))
                    }
                })
                break;

            default:
                console.log(`Unknow message type ${parsedMessage.type}`);
                break;
        }
    })

    ws.on('close', () => {
        console.log('A Client disconnected');
        for (const roomId in rooms) {
            rooms[roomId] = rooms[roomId].filter(client => client !== ws)
            if (rooms[roomId].length === 0) {
                delete rooms[roomId]
            }
        }
    })
})