import { MessageType } from "../types/MessageType"
import { WebSocket } from "ws"
import { rooms } from "../store/store"

export const sendMessage = (message: string, roomId: string, sendToAll: boolean = true, ws?: WebSocket) => {
    const messageToSend: MessageType = {
        type: 'MESSAGE',
        message: message
    }

    if (sendToAll) {
        rooms[roomId].forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(messageToSend))
            }
        })
    } else {
        rooms[roomId].forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(messageToSend))
            }
        })
    }
}