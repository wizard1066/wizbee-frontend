/**
 * Wizbee Game Monitor - Teacher Dashboard
 * Real-time monitoring of classroom game sessions
 */

const API_URL = 'https://api.wizbee.app';

let authToken = null;
let socket = null;
let gameCode = null;
let gameData = null;
let players = [];
let totalWords = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Get auth token
    authToken = localStorage.getItem('authToken');

    if (!authToken) {
        showError('Please log in to access the game monitor.');
        return;
    }

    // Get game code from URL
    const urlParams = new URLSearchParams(window.location.search);
    gameCode = urlParams.get('code');

    if (!gameCode) {
        showError('No game code provided. Please access this page from a shared game link.');
        return;
    }

    // Load initial data
    loadGameData();

    // Connect to Socket.IO for real-time updates
    connectSocket();
});

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function loadGameData() {
    try {
        const response = await fetch(`${API_URL}/api/monitor/${gameCode}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                showError('Game not found. The code may be incorrect or the game has been deleted.');
            } else if (response.status === 401) {
                showError('Please log in to access the game monitor.');
            } else {
                showError('Failed to load game data.');
            }
            return;
        }

        const data = await response.json();

        if (!data.success) {
            showError(data.error || 'Failed to load game data.');
            return;
        }

        gameData = data.game;
        players = data.players;
        totalWords = data.game.totalWords;

        renderMonitor();

    } catch (error) {
        console.error('[MONITOR] Error loading game data:', error);
        showError('Failed to connect to server.');
    }
}

async function refreshPlayers() {
    try {
        const response = await fetch(`${API_URL}/api/monitor/${gameCode}/players`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                players = data.players;
                renderPlayers();
            }
        }
    } catch (error) {
        console.error('[MONITOR] Error refreshing players:', error);
    }
}

// ============================================================================
// SOCKET.IO CONNECTION
// ============================================================================

function connectSocket() {
    console.log('[MONITOR] Connecting to Socket.IO...');

    socket = io(API_URL, {
        auth: {
            token: authToken
        },
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('[MONITOR] Socket connected:', socket.id);
        // Join the game room
        socket.emit('join_game', gameCode);
    });

    socket.on('connect_error', (error) => {
        console.error('[MONITOR] Socket connection error:', error);
    });

    // Listen for player events
    socket.on('player_joined', (data) => {
        console.log('[MONITOR] Player joined:', data);
        // Add player to list if not already present
        const exists = players.find(p => p.name === data.playerName);
        if (!exists) {
            players.push({
                name: data.playerName,
                type: data.playerType,
                currentIndex: 0,
                wordsSolved: 0,
                joinedAt: data.joinedAt,
                lastActive: new Date().toISOString()
            });
            renderPlayers();
        }
    });

    socket.on('player_progress', (data) => {
        console.log('[MONITOR] Player progress:', data);
        // Update player in list
        const player = players.find(p => p.name === data.playerName);
        if (player) {
            player.currentIndex = data.currentIndex;
            player.wordsSolved = data.wordsSolved;
            player.lastActive = new Date().toISOString();
            renderPlayers();
        }
    });

    socket.on('opponent_advanced', (data) => {
        console.log('[MONITOR] Game advanced:', data);
        // Update game state
        if (gameData) {
            gameData.currentIndex = data.newIndex;
            updateGameInfo();
        }
        // Refresh players to get latest state
        refreshPlayers();
    });

    socket.on('game_completed', (data) => {
        console.log('[MONITOR] Game completed:', data);
        if (gameData) {
            gameData.status = 'completed';
            updateGameStatus();
        }
    });

    socket.on('disconnect', () => {
        console.log('[MONITOR] Socket disconnected');
    });
}

// ============================================================================
// RENDERING FUNCTIONS
// ============================================================================

function renderMonitor() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('monitor-content').style.display = 'block';

    // Game code
    document.getElementById('game-code').textContent = gameCode.toUpperCase();
    document.getElementById('share-code-display').textContent = gameCode.toUpperCase();

    updateGameStatus();
    updateGameInfo();
    renderPlayers();
}

function updateGameStatus() {
    const statusBadge = document.getElementById('status-badge');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');

    if (gameData.status === 'active') {
        statusBadge.className = 'status-badge active';
        statusIndicator.className = 'status-indicator active';
        statusText.textContent = 'Live';
    } else {
        statusBadge.className = 'status-badge completed';
        statusIndicator.className = 'status-indicator completed';
        statusText.textContent = 'Completed';
    }
}

function updateGameInfo() {
    document.getElementById('current-word').textContent = gameData.currentIndex + 1;
    document.getElementById('total-words').textContent = totalWords;
    document.getElementById('player-count').textContent = players.length;

    // Format start time
    if (gameData.createdAt) {
        const startTime = new Date(gameData.createdAt);
        document.getElementById('game-started').textContent = startTime.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

function renderPlayers() {
    const playerCountBadge = document.getElementById('player-count-badge');
    const noPlayers = document.getElementById('no-players');
    const playersTable = document.getElementById('players-table');
    const playersBody = document.getElementById('players-body');

    playerCountBadge.textContent = players.length;
    document.getElementById('player-count').textContent = players.length;

    if (players.length === 0) {
        noPlayers.style.display = 'block';
        playersTable.style.display = 'none';
        return;
    }

    noPlayers.style.display = 'none';
    playersTable.style.display = 'table';

    // Sort players by words solved (descending)
    const sortedPlayers = [...players].sort((a, b) => {
        if (b.wordsSolved !== a.wordsSolved) {
            return b.wordsSolved - a.wordsSolved;
        }
        return b.currentIndex - a.currentIndex;
    });

    playersBody.innerHTML = sortedPlayers.map(player => {
        const progressPercent = totalWords > 0 ? (player.currentIndex / totalWords) * 100 : 0;
        const activityStatus = getActivityStatus(player.lastActive);

        return `
            <tr>
                <td><strong>${escapeHtml(player.name)}</strong></td>
                <td><span class="player-type ${player.type}">${player.type}</span></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="progress-bar">
                            <div class="fill" style="width: ${progressPercent}%"></div>
                        </div>
                        <span>${player.currentIndex}/${totalWords}</span>
                    </div>
                </td>
                <td>${player.wordsSolved}</td>
                <td>
                    <div class="activity-status">
                        <span class="activity-dot ${activityStatus.class}"></span>
                        ${activityStatus.text}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getActivityStatus(lastActive) {
    if (!lastActive) {
        return { class: 'inactive', text: 'Unknown' };
    }

    const now = new Date();
    const lastActiveDate = new Date(lastActive);
    const diffSeconds = Math.floor((now - lastActiveDate) / 1000);

    if (diffSeconds < 30) {
        return { class: 'active', text: 'Active' };
    } else if (diffSeconds < 120) {
        return { class: 'idle', text: 'Idle' };
    } else {
        return { class: 'inactive', text: 'Inactive' };
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function showError(message) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'block';
    document.getElementById('error-text').textContent = message;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Refresh players periodically as backup (in case socket events are missed)
setInterval(refreshPlayers, 30000);
