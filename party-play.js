/**
 * Wizbee Party Mode - Player Interface
 * Mobile-optimized play screen for party game participants
 */

const API_URL = 'https://api.wizbee.app';

let socket = null;
let gameCode = null;
let playerName = null;
let gameData = null;
let currentWordIndex = -1;
let wordStartedAt = null;
let guessCount = 0;
let solvedCount = 0;
let timerInterval = null;
let hasSubmittedResult = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Get game code from URL
    const urlParams = new URLSearchParams(window.location.search);
    gameCode = urlParams.get('code');

    if (!gameCode) {
        showError('No game code provided.');
        return;
    }

    // Check for existing player name in localStorage
    const storedName = localStorage.getItem('partyPlayerName');
    const storedCode = localStorage.getItem('partyGameCode');

    if (storedName && storedCode === gameCode) {
        playerName = storedName;
        joinGame();
    } else {
        showJoinScreen();
    }

    setupEventListeners();
});

// ============================================================================
// JOIN FLOW
// ============================================================================

function showJoinScreen() {
    hideAll();
    document.getElementById('join-screen').style.display = 'flex';
}

function handleJoin() {
    const nameInput = document.getElementById('playerNameInput');
    const name = nameInput.value.trim();

    if (!name || name.length < 2) {
        nameInput.style.border = '2px solid #e53e3e';
        return;
    }

    playerName = name;
    localStorage.setItem('partyPlayerName', playerName);
    localStorage.setItem('partyGameCode', gameCode);

    joinGame();
}

async function joinGame() {
    hideAll();
    const loadingEl = document.getElementById('loading');
    loadingEl.style.display = 'flex';

    // Show status updates in loading screen
    const statusEl = loadingEl.querySelector('p');
    const updateStatus = (msg) => {
        console.log('[PLAYER]', msg);
        if (statusEl) statusEl.textContent = msg;
    };

    try {
        updateStatus('Connecting to game...');

        const response = await fetch(`${API_URL}/api/party/game/${gameCode}`, {
            headers: {
                'X-Game-Code': gameCode,
                'X-Player-Name': encodeURIComponent(playerName)
            }
        });

        updateStatus('Got response, parsing...');

        const data = await response.json();
        console.log('[PLAYER] API response:', data);

        if (!data.success) {
            // Check if this is a homework game - redirect to homework-play
            if (data.redirectUrl) {
                console.log('[PLAYER] Redirecting to:', data.redirectUrl);
                window.location.href = data.redirectUrl;
                return;
            }
            showError(data.error || 'Failed to join game');
            return;
        }

        if (!data.gameData) {
            showError('No game data received');
            return;
        }

        updateStatus('Loading game data...');

        gameData = data.gameData;
        // currentIndex starts at -1 (no word yet), becomes 0+ when word starts
        currentWordIndex = gameData.currentIndex;
        wordStartedAt = gameData.wordStartedAt ? new Date(gameData.wordStartedAt) : null;

        updateStatus('Connecting to live updates...');
        connectSocket();

        updateStatus('Ready!');

        console.log('[PLAYER] Deciding screen - started:', data.started, 'wordIndex:', currentWordIndex, 'wordStartedAt:', wordStartedAt);

        if (!data.started) {
            // Game hasn't started yet - wait for host to click "Start Game"
            console.log('[PLAYER] Game not started, showing waiting screen');
            showWaitingScreen();
        } else if (wordStartedAt) {
            // Game started AND a word has started - show game screen
            console.log('[PLAYER] Word in progress, showing game screen');
            showGameScreen();
        } else {
            // Game started but no word yet - show "Get ready!"
            console.log('[PLAYER] Game started, waiting for first word');
            showBetweenWords();
        }

    } catch (error) {
        console.error('[PLAYER] Join error:', error);
        showError('Failed to connect: ' + error.message);
    }
}

// ============================================================================
// SOCKET.IO CONNECTION
// ============================================================================

function connectSocket() {
    console.log('[PLAYER] Connecting to Socket.IO...');

    socket = io(API_URL, {
        auth: {
            gameCode: gameCode,
            playerName: playerName
        },
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('[PLAYER] Socket connected:', socket.id);
        socket.emit('join_game', gameCode);

        // Re-sync game state in case we missed any events while connecting
        resyncGameState();
    });

    socket.on('connect_error', (error) => {
        console.error('[PLAYER] Socket connection error:', error);
    });

    // Game started
    socket.on('game_started', (data) => {
        console.log('[PLAYER] Game started:', data);
        showBetweenWords();
    });

    // Word started
    socket.on('party_word_start', (data) => {
        console.log('[PLAYER] Word started:', data);
        currentWordIndex = data.wordIndex;
        wordStartedAt = new Date(data.startedAt);
        hasSubmittedResult = false;
        guessCount = 0;
        showGameScreen();
    });

    // Word ended
    socket.on('party_word_end', (data) => {
        console.log('[PLAYER] Word ended:', data);
        if (!hasSubmittedResult) {
            // Player didn't submit in time
            showBetweenWords();
        }
    });

    // Game ended
    socket.on('game_ended', (data) => {
        console.log('[PLAYER] Game ended:', data);
        showGameEnded();
    });

    socket.on('disconnect', () => {
        console.log('[PLAYER] Socket disconnected');
    });
}

/**
 * Re-sync game state from server after socket connects
 * This handles the race condition where host starts game while player is connecting
 */
async function resyncGameState() {
    try {
        console.log('[PLAYER] Re-syncing game state...');

        const response = await fetch(`${API_URL}/api/party/game/${gameCode}`, {
            headers: {
                'X-Game-Code': gameCode,
                'X-Player-Name': encodeURIComponent(playerName)
            }
        });

        const data = await response.json();

        if (!data.success || !data.gameData) {
            console.log('[PLAYER] Re-sync failed:', data.error);
            return;
        }

        const newWordIndex = data.gameData.currentIndex;
        const newWordStartedAt = data.gameData.wordStartedAt ? new Date(data.gameData.wordStartedAt) : null;
        const gameStarted = data.started;

        console.log('[PLAYER] Re-sync: started=', gameStarted, 'wordIndex=', newWordIndex, 'wordStartedAt=', newWordStartedAt);

        // Check what screen we're currently showing
        const waitingScreen = document.getElementById('waiting-screen');
        const betweenWords = document.getElementById('between-words');
        const gameScreen = document.getElementById('game-screen');

        const isShowingWaiting = waitingScreen.style.display !== 'none';
        const isShowingBetween = betweenWords.style.display !== 'none';
        const isShowingGame = gameScreen.style.display !== 'none';

        // If a word has started but we're not showing the game screen, update
        if (newWordStartedAt && !isShowingGame) {
            console.log('[PLAYER] Re-sync: Word started! Showing game screen.');
            currentWordIndex = newWordIndex;
            wordStartedAt = newWordStartedAt;
            hasSubmittedResult = false;
            guessCount = 0;
            showGameScreen();
        }
        // If game started but we're still on waiting screen, show "Get ready!"
        else if (gameStarted && isShowingWaiting) {
            console.log('[PLAYER] Re-sync: Game started! Showing get ready screen.');
            showBetweenWords();
        }
    } catch (error) {
        console.error('[PLAYER] Re-sync error:', error);
    }
}

// ============================================================================
// GAME LOGIC
// ============================================================================

async function submitGuess() {
    const input = document.getElementById('guessInput');
    const guess = input.value.trim().toUpperCase();

    if (!guess) return;

    const word = gameData.words[currentWordIndex].toUpperCase();

    guessCount++;
    document.getElementById('guessCount').textContent = guessCount;

    if (guess === word) {
        // Correct!
        await submitResult(true, false);
        showDone(true);
    } else {
        // Wrong
        showFeedback('wrong', 'Not quite, try again!');
        input.value = '';
        input.focus();
    }
}

async function giveUp() {
    if (confirm('Are you sure you want to give up?')) {
        await submitResult(false, true);
        showDone(false);
    }
}

async function submitResult(solved, gaveUp) {
    hasSubmittedResult = true;
    stopTimer();

    try {
        const response = await fetch(`${API_URL}/api/party/submit-result`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Game-Code': gameCode,
                'X-Player-Name': encodeURIComponent(playerName)
            },
            body: JSON.stringify({
                shareCode: gameCode,
                wordIndex: currentWordIndex,
                solved,
                gaveUp,
                guesses: guessCount
            })
        });

        const data = await response.json();
        console.log('[PLAYER] Result submitted:', data);

        if (solved) {
            solvedCount++;
            document.getElementById('solvedCount').textContent = solvedCount;
        }

        return data;
    } catch (error) {
        console.error('[PLAYER] Submit result error:', error);
    }
}

// ============================================================================
// UI UPDATES
// ============================================================================

function hideAll() {
    console.log('[PLAYER] hideAll() called');
    document.getElementById('loading').style.display = 'none';
    document.getElementById('join-screen').style.display = 'none';
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('between-words').style.display = 'none';
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('done-screen').style.display = 'none';
}

function showWaitingScreen() {
    console.log('[PLAYER] showWaitingScreen() called');
    hideAll();
    const el = document.getElementById('waiting-screen');
    console.log('[PLAYER] waiting-screen element:', el);
    el.style.display = 'flex';
    console.log('[PLAYER] waiting-screen display set to flex');
}

let resyncInterval = null;

function showBetweenWords() {
    console.log('[PLAYER] showBetweenWords() called');
    hideAll();
    stopTimer();
    document.getElementById('between-words').style.display = 'flex';

    // Start periodic resync to catch missed events
    startResyncInterval();
}

function startResyncInterval() {
    stopResyncInterval();
    resyncInterval = setInterval(() => {
        console.log('[PLAYER] Periodic resync...');
        resyncGameState();
    }, 2000); // Check every 2 seconds
}

function stopResyncInterval() {
    if (resyncInterval) {
        clearInterval(resyncInterval);
        resyncInterval = null;
    }
}

function showGameScreen() {
    console.log('[PLAYER] showGameScreen() called');
    console.log('[PLAYER] currentWordIndex:', currentWordIndex);
    console.log('[PLAYER] gameData:', gameData);

    hideAll();
    stopResyncInterval(); // Stop polling when playing
    const screen = document.getElementById('game-screen');
    screen.style.display = 'block';

    // Safety check
    if (!gameData || !gameData.words || currentWordIndex < 0 || currentWordIndex >= gameData.words.length) {
        console.error('[PLAYER] Invalid game state:', { gameData, currentWordIndex });
        showError('Game data not ready. Please refresh.');
        return;
    }

    // Update display
    document.getElementById('gameCodeDisplay').textContent = gameCode.toUpperCase();
    document.getElementById('playerNameDisplay').textContent = playerName;
    document.getElementById('currentWord').textContent = currentWordIndex + 1;
    document.getElementById('totalWords').textContent = gameData.words.length;

    // Show clue
    const clues = gameData.clues[currentWordIndex];
    const clueText = Array.isArray(clues) ? clues.join(' | ') : clues;
    document.getElementById('clueText').textContent = clueText || 'No clue available';
    console.log('[PLAYER] Clue:', clueText);

    // Show word boxes
    const word = gameData.words[currentWordIndex];
    console.log('[PLAYER] Word:', word, 'Length:', word?.length);

    if (word) {
        const boxesHtml = word.split('').map(letter =>
            `<div class="letter-box">${letter === ' ' ? ' ' : ''}</div>`
        ).join('');
        document.getElementById('wordBoxes').innerHTML = boxesHtml;
        console.log('[PLAYER] Created', word.length, 'letter boxes');
    } else {
        console.error('[PLAYER] No word at index', currentWordIndex);
    }

    // Reset input and force focus
    const input = document.getElementById('guessInput');
    input.value = '';
    input.disabled = false;
    input.readOnly = false;
    document.getElementById('guessCount').textContent = guessCount;
    document.getElementById('feedback').style.display = 'none';

    // Delayed focus for better cross-browser support
    setTimeout(() => {
        input.focus();
        input.click();
        console.log('[PLAYER] Input focused, activeElement:', document.activeElement?.id);
    }, 100);

    // Start timer
    startTimer();
}

function showDone(solved) {
    hideAll();
    stopTimer();
    stopResyncInterval();

    const doneScreen = document.getElementById('done-screen');
    doneScreen.style.display = 'flex';

    const icon = document.getElementById('doneIcon');
    const title = document.getElementById('doneTitle');
    const message = document.getElementById('doneMessage');
    const timeDisplay = document.getElementById('doneTime');

    if (solved) {
        icon.textContent = '';
        icon.style.background = '#48bb78';
        title.textContent = 'Correct!';
        message.textContent = 'Waiting for the next word...';

        const elapsed = Date.now() - wordStartedAt.getTime();
        timeDisplay.textContent = formatTime(elapsed);
    } else {
        icon.textContent = '';
        icon.style.background = '#e53e3e';
        title.textContent = 'Gave Up';
        message.textContent = 'Better luck on the next one!';
        timeDisplay.textContent = '';
    }
}

function showFeedback(type, text) {
    const feedback = document.getElementById('feedback');
    feedback.className = 'feedback ' + type;
    feedback.textContent = text;
    feedback.style.display = 'block';

    setTimeout(() => {
        feedback.style.display = 'none';
    }, 2000);
}

function showError(message) {
    hideAll();
    document.getElementById('loading').innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <p style="font-size: 18px; margin-bottom: 20px;">${message}</p>
            <a href="index.html" style="color: white; text-decoration: underline;">Return to Home</a>
        </div>
    `;
    document.getElementById('loading').style.display = 'flex';
}

// ============================================================================
// TIMER
// ============================================================================

function startTimer() {
    stopTimer();
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimer() {
    if (!wordStartedAt) return;
    const elapsed = Date.now() - wordStartedAt.getTime();
    document.getElementById('timeElapsed').textContent = formatTime(elapsed);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Join button
    document.getElementById('joinBtn').addEventListener('click', handleJoin);

    // Enter key on name input
    document.getElementById('playerNameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleJoin();
    });

    // Submit guess
    document.getElementById('submitBtn').addEventListener('click', submitGuess);

    // Enter key on guess input
    document.getElementById('guessInput').addEventListener('keypress', (e) => {
        console.log('[PLAYER] Keypress:', e.key);
        if (e.key === 'Enter') submitGuess();
    });

    // Debug: log when input receives focus
    document.getElementById('guessInput').addEventListener('focus', () => {
        console.log('[PLAYER] Input focused');
    });

    document.getElementById('guessInput').addEventListener('click', () => {
        console.log('[PLAYER] Input clicked');
    });

    // Leave button
    document.getElementById('leaveBtn').addEventListener('click', () => {
        if (confirm('Leave this game?')) {
            localStorage.removeItem('partyPlayerName');
            localStorage.removeItem('partyGameCode');
            if (socket) socket.disconnect();
            window.location.href = 'index.html';
        }
    });

    // Update word boxes as user types
    document.getElementById('guessInput').addEventListener('input', (e) => {
        console.log('[PLAYER] Input event:', e.target.value);
        const value = e.target.value.toUpperCase();
        const boxes = document.querySelectorAll('.letter-box');
        const word = gameData?.words[currentWordIndex]?.toUpperCase() || '';

        boxes.forEach((box, i) => {
            if (word[i] === ' ') {
                box.textContent = ' ';
                box.classList.remove('filled');
            } else if (i < value.length) {
                box.textContent = value[i];
                box.classList.add('filled');
            } else {
                box.textContent = '';
                box.classList.remove('filled');
            }
        });
    });

    // Give up button
    document.getElementById('giveUpBtn').addEventListener('click', giveUp);
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
}

// Global function for leave buttons in HTML
function leaveGame() {
    if (confirm('Leave this game?')) {
        localStorage.removeItem('partyPlayerName');
        localStorage.removeItem('partyGameCode');
        if (socket) socket.disconnect();
        window.location.href = 'index.html';
    }
}

function showGameEnded() {
    console.log('[PLAYER] showGameEnded() called');
    hideAll();
    stopTimer();
    stopResyncInterval();

    const doneScreen = document.getElementById('done-screen');
    doneScreen.style.display = 'flex';

    const icon = document.getElementById('doneIcon');
    const title = document.getElementById('doneTitle');
    const message = document.getElementById('doneMessage');
    const timeDisplay = document.getElementById('doneTime');

    icon.textContent = '🏆';
    icon.style.background = '#667eea';
    title.textContent = 'Game Over!';
    message.textContent = `You solved ${solvedCount} words. Thanks for playing!`;
    timeDisplay.textContent = '';

    // Clear stored game data
    localStorage.removeItem('partyPlayerName');
    localStorage.removeItem('partyGameCode');
}
