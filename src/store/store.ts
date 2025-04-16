import { WebSocket } from "ws"
import { Game } from "../Game"

export const rooms: { [key: string]: WebSocket[] } = {}

export const games: { [key: string]: Game } = {} 
