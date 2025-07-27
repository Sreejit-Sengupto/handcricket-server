export class Game {
    innings: number = 1
    players: {
        player: string,
        score: number,
        state: 'batting' | 'bowling' | null,
        choice: number | null
    }[]

    toss = () => Math.floor(Math.random() * 2)

    constructor(player1Id: string, player2Id: string) {
        this.players = [
            {
                player: player1Id,
                score: 0,
                state: null,
                choice: null
            },
            {
                player: player2Id,
                score: 0,
                state: null,
                choice: null
            }
        ]

        this.players[0].state = this.toss() === 0 ? 'batting' : 'bowling'
        this.players[1].state = this.players[0].state === 'batting' ? 'bowling' : 'batting'
    }

    setPlayerChoice(playerId: string, choice: number) {
        const player = this.players.find(player => playerId === player.player)
        if (player) {
            player.choice = parseInt(choice.toString())
        }
    }

    scoreRuns() {
        const player1 = this.players[0]
        const player2 = this.players[1]

        if (player1.choice === null || player2.choice === null) {
            // return "WAIT"
            return {
                type: 'WAIT',
                message: player1.choice === null ? player1.player : player2.player
            }
        }


        if (this.innings === 1) {
            // Add the choice to the batsman score, if the choices aren't equal
            if (player1.choice !== player2.choice) {
                if (player1.state === 'batting') {
                    player1.score += player1.choice
                } else {
                    player2.score += player2.choice
                }
                // If the choices are equal:
                // set inning = 2
                // swap states
            } else {
                this.innings = 2
                let temp = player1.state
                player1.state = player2.state
                player2.state = temp
            }
        } else if (this.innings === 2) {
            if (player1.choice !== player2.choice) {
                if (player1.state === 'batting') {
                    player1.score += player1.choice
                } else {
                    player2.score += player2.choice
                }
                if (player1.state === 'batting') {
                    if (player1.score > player2.score) {
                        return this.determineWinner()
                    }
                }
                if (player2.state === 'batting') {
                    if (player2.score > player1.score) {
                        return this.determineWinner()
                    }
                }
            } else {
                // determine winner
                return this.determineWinner()
            }
        }

        // reset choices
        // this.resetChoices()
        return null;
    }

    determineWinner() {
        const player1 = this.players[0]
        const player2 = this.players[1]

        if (player1.score > player2.score) {
            return `Player ${player1.player} wins with the score ${player1.score}`
        } else if (player1.score < player2.score) {
            return `Player ${player2.player} wins with the score ${player2.score}`
        } else {
            return "It's a tie"
        }
    }

    resetChoices() {
        this.players.forEach(player => {
            player.choice = null
        })
    }
}