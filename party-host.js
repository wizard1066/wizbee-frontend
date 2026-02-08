/**
 * Wizbee Party Mode - Host Display
 * For projector/TV display showing clues, words, and leaderboard
 */

const API_URL = 'https://api.wizbee.app';

let authToken = null;
let socket = null;
let gameCode = null;
let gameData = null;
let currentWordIndex = -1;
let wordStartedAt = null;
let leaderboard = [];
let currentSort = 'rank';
let wordRevealed = false;
let timerInterval = null;
let gameStarted = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    authToken = localStorage.getItem('authToken');

    if (!authToken) {
        showError('Please log in to host a party game.');
        return;
    }

    // Get game code from URL
    const urlParams = new URLSearchParams(window.location.search);
    gameCode = urlParams.get('code');

    if (!gameCode) {
        showError('No game code provided.');
        return;
    }

    loadGameData();
    connectSocket();
    setupEventListeners();
});

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function loadGameData() {
    try {
        const response = await fetch(`${API_URL}/api/party/game/${gameCode}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (!data.success) {
            showError(data.error || 'Failed to load game');
            return;
        }

        gameData = data.gameData;
        currentWordIndex = gameData.currentIndex;
        wordStartedAt = gameData.wordStartedAt;
        gameStarted = data.started;

        renderHostDisplay();
        loadLeaderboard();

    } catch (error) {
        console.error('[HOST] Error loading game:', error);
        showError('Failed to connect to server.');
    }
}

async function startGame() {
    try {
        const response = await fetch(`${API_URL}/api/party/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                shareCode: gameCode
            })
        });

        const data = await response.json();

        if (data.success) {
            gameStarted = true;
            document.getElementById('clueDisplay').textContent = 'Get ready! Starting first word...';
            updateControls();
        }
    } catch (error) {
        console.error('[HOST] Error starting game:', error);
    }
}

async function loadLeaderboard() {
    try {
        const response = await fetch(`${API_URL}/api/party/leaderboard/${gameCode}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (data.success) {
            leaderboard = data.leaderboard;
            renderLeaderboard();
        }
    } catch (error) {
        console.error('[HOST] Error loading leaderboard:', error);
    }
}

async function startWord(wordIndex) {
    try {
        const response = await fetch(`${API_URL}/api/party/start-word`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                shareCode: gameCode,
                wordIndex
            })
        });

        const data = await response.json();

        if (data.success) {
            currentWordIndex = wordIndex;
            wordStartedAt = new Date(data.startedAt);
            wordRevealed = false;
            updateWordDisplay();
            startTimer();
        }
    } catch (error) {
        console.error('[HOST] Error starting word:', error);
    }
}

async function endWord() {
    try {
        await fetch(`${API_URL}/api/party/end-word`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                shareCode: gameCode,
                wordIndex: currentWordIndex
            })
        });
    } catch (error) {
        console.error('[HOST] Error ending word:', error);
    }
}

async function endGame() {
    try {
        const response = await fetch(`${API_URL}/api/party/end`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                shareCode: gameCode
            })
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('clueDisplay').textContent = 'Game Over!';
            document.getElementById('wordDisplay').textContent = 'Final Scores Above';
            document.getElementById('wordDisplay').classList.remove('hidden-word');

            // Hide all control buttons
            document.getElementById('startGameBtn').style.display = 'none';
            document.getElementById('startWordBtn').style.display = 'none';
            document.getElementById('nextWordBtn').style.display = 'none';
            document.getElementById('revealWordBtn').style.display = 'none';
            document.getElementById('endGameBtn').style.display = 'none';
        }
    } catch (error) {
        console.error('[HOST] Error ending game:', error);
    }
}

// ============================================================================
// SOCKET.IO CONNECTION
// ============================================================================

function connectSocket() {
    console.log('[HOST] Connecting to Socket.IO...');

    socket = io(API_URL, {
        auth: {
            token: authToken
        },
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('[HOST] Socket connected:', socket.id);
        socket.emit('join_game', gameCode);
    });

    socket.on('connect_error', (error) => {
        console.error('[HOST] Socket connection error:', error);
    });

    // Player joined
    socket.on('player_joined', (data) => {
        console.log('[HOST] Player joined:', data);
        loadLeaderboard();
    });

    // Player submitted result
    socket.on('party_player_result', (data) => {
        console.log('[HOST] Player result:', data);

        // Update leaderboard entry
        updatePlayerResult(data);

        // If first solver, show winner banner
        if (data.solved && !wordRevealed) {
            showWinnerBanner(data.playerName);
        }
    });

    // Word started (from another host instance)
    socket.on('party_word_start', (data) => {
        console.log('[HOST] Word started:', data);
        currentWordIndex = data.wordIndex;
        wordStartedAt = new Date(data.startedAt);
        wordRevealed = false;
        updateWordDisplay();
        startTimer();
    });

    // Word ended (all players submitted)
    socket.on('party_word_end', (data) => {
        console.log('[HOST] Word ended:', data);
        if (data.allPlayersSubmitted && !wordRevealed) {
            console.log('[HOST] All players submitted - auto-revealing word');
            showAllDoneBanner();
            revealWord();
        }
    });

    socket.on('disconnect', () => {
        console.log('[HOST] Socket disconnected');
    });
}

// ============================================================================
// RENDERING
// ============================================================================

function renderHostDisplay() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('host-content').style.display = 'flex';

    document.getElementById('gameCode').textContent = gameCode.toUpperCase();
    document.getElementById('themeName').textContent = gameData.theme;
    document.getElementById('totalWords').textContent = gameData.words.length;

    updateWordDisplay();
    updateControls();
}

function updateWordDisplay() {
    const wordNum = currentWordIndex + 1;
    document.getElementById('currentWordNum').textContent = wordNum > 0 ? wordNum : '-';

    if (currentWordIndex < 0) {
        document.getElementById('clueDisplay').textContent = 'Waiting to start...';
        document.getElementById('wordDisplay').innerHTML = '';
        return;
    }

    const clues = gameData.clues[currentWordIndex];
    const word = gameData.words[currentWordIndex];

    // Show clue
    const clueText = Array.isArray(clues) ? clues.join(' | ') : clues;
    document.getElementById('clueDisplay').textContent = clueText;

    // Show word (hidden or revealed)
    const wordDisplay = document.getElementById('wordDisplay');
    if (wordRevealed) {
        wordDisplay.classList.remove('hidden-word');
        wordDisplay.textContent = word;
    } else {
        wordDisplay.classList.add('hidden-word');
        wordDisplay.innerHTML = word.split('').map(letter =>
            `<span class="letter">${letter === ' ' ? ' ' : '?'}</span>`
        ).join('');
    }
}

function updateControls() {
    const startGameBtn = document.getElementById('startGameBtn');
    const startBtn = document.getElementById('startWordBtn');
    const nextBtn = document.getElementById('nextWordBtn');
    const revealBtn = document.getElementById('revealWordBtn');
    const endBtn = document.getElementById('endGameBtn');

    const isLastWord = currentWordIndex >= gameData.words.length - 1;
    const hasStartedWord = currentWordIndex >= 0;

    // Show Start Game button if game hasn't started yet
    startGameBtn.style.display = !gameStarted ? 'block' : 'none';

    // Show Start First Word only after game started but before first word
    startBtn.style.display = gameStarted && !hasStartedWord ? 'block' : 'none';

    // Show Next Word after first word, if not last word
    nextBtn.style.display = hasStartedWord && !isLastWord ? 'block' : 'none';
    revealBtn.style.display = hasStartedWord && !wordRevealed ? 'block' : 'none';
    endBtn.style.display = hasStartedWord && isLastWord && wordRevealed ? 'block' : 'none';

    nextBtn.disabled = !wordRevealed;
}

function renderLeaderboard() {
    const body = document.getElementById('leaderboardBody');
    const playerCount = document.getElementById('playerCount');

    playerCount.textContent = leaderboard.length;

    if (leaderboard.length === 0) {
        body.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #a0aec0;">
                Waiting for players to join...
            </div>
        `;
        return;
    }

    // Sort leaderboard
    const sorted = [...leaderboard].sort((a, b) => {
        switch (currentSort) {
            case 'time':
                return a.totalTimeMs - b.totalTimeMs;
            case 'guesses':
                return a.totalGuesses - b.totalGuesses;
            default: // rank
                if (b.wordsSolved !== a.wordsSolved) return b.wordsSolved - a.wordsSolved;
                if (a.totalGuesses !== b.totalGuesses) return a.totalGuesses - b.totalGuesses;
                return a.totalTimeMs - b.totalTimeMs;
        }
    });

    body.innerHTML = sorted.map((player, index) => {
        const placeClass = index === 0 ? 'first-place' : index === 1 ? 'second-place' : index === 2 ? 'third-place' : '';
        const rankClass = index < 3 ? `rank-${index + 1}` : '';

        // Fade out lower-ranked players (12% per position, min 20%)
        // Top 3 stay at full opacity, then fade starts from position 4
        const opacity = index < 3 ? 1 : Math.max(0.2, 1 - ((index - 2) * 0.12));

        // Get current word status
        const currentResult = player.wordResults?.find(r => r.wordIndex === currentWordIndex);
        let statusHtml = '';
        if (currentWordIndex >= 0) {
            if (currentResult?.solved) {
                statusHtml = '<span class="status-badge done">Done</span>';
            } else if (currentResult?.gaveUp) {
                statusHtml = '<span class="status-badge gave-up">Gave Up</span>';
            } else {
                statusHtml = '<span class="status-badge solving">Solving...</span>';
            }
        }

        return `
            <div class="leaderboard-row ${placeClass}" style="opacity: ${opacity}">
                <div class="rank ${rankClass}">${index + 1}</div>
                <div class="player-name">${escapeHtml(player.playerName)}</div>
                <div class="stat solved">${player.wordsSolved}</div>
                <div class="stat">${player.totalGuesses}</div>
                <div class="stat">${formatTime(player.totalTimeMs)}</div>
                <div class="player-status">${statusHtml}</div>
            </div>
        `;
    }).join('');
}

function updatePlayerResult(data) {
    // Find or create player in leaderboard
    let player = leaderboard.find(p => p.playerName === data.playerName);

    if (!player) {
        player = {
            playerName: data.playerName,
            wordsSolved: 0,
            totalGuesses: 0,
            totalTimeMs: 0,
            wordResults: []
        };
        leaderboard.push(player);
    }

    // Update word result
    const existingResult = player.wordResults?.find(r => r.wordIndex === data.wordIndex);
    if (existingResult) {
        existingResult.solved = data.solved;
        existingResult.gaveUp = data.gaveUp;
        existingResult.guesses = data.guesses;
        existingResult.timeMs = data.timeMs;
    } else {
        if (!player.wordResults) player.wordResults = [];
        player.wordResults.push({
            wordIndex: data.wordIndex,
            solved: data.solved,
            gaveUp: data.gaveUp,
            guesses: data.guesses,
            timeMs: data.timeMs
        });
    }

    // Recalculate totals
    player.wordsSolved = player.wordResults.filter(r => r.solved).length;
    player.totalGuesses = player.wordResults.reduce((sum, r) => sum + (r.guesses || 0), 0);
    player.totalTimeMs = player.wordResults.reduce((sum, r) => sum + (r.timeMs || 0), 0);

    renderLeaderboard();
}

function showWinnerBanner(playerName) {
    const banner = document.getElementById('winner-banner');
    banner.innerHTML = `<strong>${escapeHtml(playerName)}</strong> solved it first!`;
    banner.style.display = 'block';

    // Auto-reveal word after winner
    setTimeout(() => {
        revealWord();
    }, 1500);

    // Hide banner after a few seconds
    setTimeout(() => {
        banner.style.display = 'none';
    }, 5000);
}

function showAllDoneBanner() {
    const banner = document.getElementById('winner-banner');
    banner.innerHTML = `All players done!`;
    banner.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
    banner.style.display = 'block';

    // Hide banner after a few seconds
    setTimeout(() => {
        banner.style.display = 'none';
        banner.style.background = ''; // Reset to default
    }, 3000);
}

function revealWord() {
    if (wordRevealed) return; // Prevent double-reveal
    wordRevealed = true;
    updateWordDisplay();
    updateControls();
    endWord();
    stopTimer();
}

// ============================================================================
// TIMER
// ============================================================================

function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
        // Could add elapsed time display if needed
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    document.getElementById('startGameBtn').addEventListener('click', () => {
        startGame();
    });

    document.getElementById('startWordBtn').addEventListener('click', () => {
        startWord(0);
        updateControls();
    });

    document.getElementById('nextWordBtn').addEventListener('click', () => {
        if (currentWordIndex < gameData.words.length - 1) {
            startWord(currentWordIndex + 1);
            loadLeaderboard();
            updateControls();
        }
    });

    document.getElementById('revealWordBtn').addEventListener('click', () => {
        revealWord();
    });

    document.getElementById('endGameBtn').addEventListener('click', () => {
        if (confirm('End this game? All players will be notified.')) {
            endGame();
        }
    });

    // Sort buttons
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSort = btn.dataset.sort;
            renderLeaderboard();
        });
    });
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatTime(ms) {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    document.getElementById('loading').innerHTML = `
        <div style="text-align: center; color: #fef3c7;">
            <p style="font-size: 18px; margin-bottom: 20px;">${message}</p>
            <a href="index.html" style="color: #667eea;">Return to Home</a>
        </div>
    `;
}

// Refresh leaderboard periodically
setInterval(loadLeaderboard, 5000);
