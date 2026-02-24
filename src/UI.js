import { GameState } from './GameState.js';
import { COLORS } from './Constants.js';

export const UI = {
    health: document.getElementById('health'),
    ammo: document.getElementById('ammo'),
    killStats: document.getElementById('kill-stats'),
    aliveCount: document.getElementById('alive-count'),
    damageFlash: document.getElementById('damage-flash'),
    timer: document.getElementById('timer'),
    scoreboard: document.getElementById('scoreboard'),
    scoreList: document.getElementById('score-list'),
    gameOverScreen: document.getElementById('game-over-screen'),
    winnerName: document.getElementById('winner-name'),
    finalScoreList: document.getElementById('final-score-list'),

    updateUI(enemies = []) {
        if (this.health) this.health.innerText = `${Math.ceil(GameState.health)} HP`;
        
        if (this.timer) {
            if (GameState.selectedMode === 'dm') {
                this.timer.style.display = 'block';
                this.timer.innerText = this.formatTime(GameState.gameTimeLeft);
            } else {
                this.timer.style.display = 'none';
            }
        }
        
        if (this.ammo) {
            if (GameState.currentWeapon === 'gun') {
                this.ammo.style.visibility = 'visible';
                this.ammo.innerText = GameState.isReloading ? "RELOADING..." : `${GameState.ammoInClip} / ${GameState.ammoTotal}`;
            } else {
                this.ammo.style.visibility = 'hidden';
            }
        }
        
        if (GameState.selectedMode === 'dm' && !GameState.peer && this.killStats && this.aliveCount) {
            this.killStats.style.display = 'block';
            const count = enemies.filter(e => e.userData.alive).length;
            this.aliveCount.innerText = count;
        } else if (this.killStats) {
            this.killStats.style.display = 'none';
        }
    },

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    updateScoreboard() {
        if (!this.scoreList) return;
        this.renderScoreboard(this.scoreList);
    },

    renderScoreboard(container, isFinal = false) {
        const fontSize = isFinal ? "24px" : "16px";
        const padding = isFinal ? "15px 25px" : "8px 15px";

        if (GameState.teamsEnabled) {
            let teamAKills = (GameState.playerTeam === 'A') ? GameState.playerKills : 0;
            let teamBKills = (GameState.playerTeam === 'B') ? GameState.playerKills : 0;
            
            for (const id in GameState.networkScores) {
                const p = GameState.networkScores[id];
                if (p.team === 'A') teamAKills += p.kills;
                else if (p.team === 'B') teamBKills += p.kills;
            }

            container.innerHTML = `
                <div style="background: rgba(0,0,0,0.5); padding: ${isFinal ? '15px' : '10px'}; display: flex; justify-content: space-around; border: 1px solid #444; margin-bottom: ${isFinal ? '20px' : '10px'};">
                    <div style="color: ${COLORS.TEAM_A_LIGHT}; font-weight: bold; font-size: ${isFinal ? '28px' : '16px'};">TEAM A: ${teamAKills}</div>
                    <div style="color: ${COLORS.TEAM_B_LIGHT}; font-weight: bold; font-size: ${isFinal ? '28px' : '16px'};">TEAM B: ${teamBKills}</div>
                </div>
                <div class="score-header">
                    <span>PLAYER</span>
                    <span style="flex: 0.5;">TEAM</span>
                    <span>KILLS</span>
                </div>
            `;

            const createRow = (name, team, kills, isLocal) => {
                const row = document.createElement('div');
                row.className = isLocal ? 'score-row local' : 'score-row';
                row.style.fontSize = fontSize;
                row.style.padding = padding;
                const nameSpan = document.createElement('span');
                nameSpan.textContent = name;
                const teamSpan = document.createElement('span');
                teamSpan.textContent = team;
                teamSpan.style.flex = "0.5";
                teamSpan.style.color = team === 'A' ? COLORS.TEAM_A_LIGHT : COLORS.TEAM_B_LIGHT;
                const killsSpan = document.createElement('span');
                killsSpan.textContent = kills;
                row.appendChild(nameSpan);
                row.appendChild(teamSpan);
                row.appendChild(killsSpan);
                return row;
            };

            container.appendChild(createRow(`${GameState.playerName} (YOU)`, GameState.playerTeam, GameState.playerKills, true));
            for (const id in GameState.networkScores) {
                const p = GameState.networkScores[id];
                container.appendChild(createRow(p.name, p.team || 'A', p.kills, false));
            }
        } else {
            container.innerHTML = `
                <div class="score-header">
                    <span>PLAYER</span>
                    <span>KILLS</span>
                </div>
            `;
            const createRow = (name, kills, isLocal) => {
                const row = document.createElement('div');
                row.className = isLocal ? 'score-row local' : 'score-row';
                row.style.fontSize = fontSize;
                row.style.padding = padding;
                const nameSpan = document.createElement('span');
                nameSpan.textContent = name;
                const killsSpan = document.createElement('span');
                killsSpan.textContent = kills;
                row.appendChild(nameSpan);
                row.appendChild(killsSpan);
                return row;
            };
            container.appendChild(createRow(`${GameState.playerName} (YOU)`, GameState.playerKills, true));
            for (const id in GameState.networkScores) {
                const p = GameState.networkScores[id];
                container.appendChild(createRow(p.name, p.kills, false));
            }
        }
    },

    loadSettings() {
        const saved = localStorage.getItem('bs_settings');
        if (saved) {
            const settings = JSON.parse(saved);
            GameState.playerName = settings.playerName || "Noob";
            return settings;
        }
        return null;
    },

    saveSettings(settings) {
        localStorage.setItem('bs_settings', JSON.stringify(settings));
    },

    showGameOver() {
        if (!this.gameOverScreen || !this.finalScoreList) return;

        if (GameState.teamsEnabled) {
            let teamAKills = (GameState.playerTeam === 'A') ? GameState.playerKills : 0;
            let teamBKills = (GameState.playerTeam === 'B') ? GameState.playerKills : 0;
            
            for (const id in GameState.networkScores) {
                const p = GameState.networkScores[id];
                if (p.team === 'A') teamAKills += p.kills;
                else if (p.team === 'B') teamBKills += p.kills;
            }

            let winningTeam = 'A';
            if (teamBKills > teamAKills) winningTeam = 'B';
            else if (teamAKills === teamBKills) winningTeam = 'DRAW';

            if (winningTeam === 'DRAW') {
                this.winnerName.innerText = "MATCH DRAW";
                this.winnerName.style.color = "#fff";
            } else {
                this.winnerName.innerText = `TEAM ${winningTeam} WINS!`;
                this.winnerName.style.color = winningTeam === 'A' ? COLORS.TEAM_A_LIGHT : COLORS.TEAM_B_LIGHT;
            }
        } else {
            let winnerName = GameState.playerName;
            let maxKills = GameState.playerKills;

            for (const id in GameState.networkScores) {
                if (GameState.networkScores[id].kills > maxKills) {
                    maxKills = GameState.networkScores[id].kills;
                    winnerName = GameState.networkScores[id].name;
                }
            }

            this.winnerName.innerText = winnerName.toUpperCase();
            if (winnerName === GameState.playerName) {
                this.winnerName.style.color = "#0f0";
                this.winnerName.innerText += " (YOU)";
            } else {
                this.winnerName.style.color = "#f00";
            }
        }

        this.renderScoreboard(this.finalScoreList, true);
        this.gameOverScreen.style.display = 'flex';
    }
};
