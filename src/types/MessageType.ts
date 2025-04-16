// enum Type {
//     'JOIN_ROOM' = 'JOIN_ROOM',
//     'LEAVE_ROOM' = 'LEAVE_ROOM',
//     'START_GAME' = 'START_GAME'
// }

export interface MessageType {
    type: string,
    // message?: string | {
    //     choice: string
    // },
    message?: string,
    choice?: number
    playerId?: string,
    roomId?: string
}