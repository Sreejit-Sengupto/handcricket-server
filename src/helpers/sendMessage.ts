import { MessageType } from "../types/MessageType"
import { WebSocket } from "ws"
import { rooms } from "../store/store"

export const sendMessage = (message: string, roomId: string) => {
    const messageToSend: MessageType = {
        type: 'MESSAGE',
        message: message
    }

    rooms[roomId].forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(messageToSend))
        }
    })
}