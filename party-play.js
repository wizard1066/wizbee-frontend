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
            showError(data.error || 'Failed to join game');
            return;
        }

        if (!data.gameData) {
            showError('No game data received');
            return;
        }

        updateStatus('Loading game data...');

        gameData = data.gameData;
        currentWordIndex = gameData.currentIndex || 0;
        wordStartedAt = gameData.wordStartedAt ? new Date(gameData.wordStartedAt) : null;

        updateStatus('Connecting to live updates...');
        connectSocket();

        updateStatus('Ready!');

        if (!data.started) {
            console.log('[PLAYER] Game not started, showing waiting screen');
            showWaitingScreen();
        } else if (currentWordIndex >= 0 && wordStartedAt) {
            console.log('[PLAYER] Word active, showing game screen');
            showGameScreen();
        } else {
            console.log('[PLAYER] Between words, showing waiting');
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

    socket.on('disconnect', () => {
        console.log('[PLAYER] Socket disconnected');
    });
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

function showBetweenWords() {
    console.log('[PLAYER] showBetweenWords() called');
    hideAll();
    stopTimer();
    document.getElementById('between-words').style.display = 'flex';
}

function showGameScreen() {
    hideAll();
    const screen = document.getElementById('game-screen');
    screen.style.display = 'block';

    // Update display
    document.getElementById('gameCodeDisplay').textContent = gameCode.toUpperCase();
    document.getElementById('playerNameDisplay').textContent = playerName;
    document.getElementById('currentWord').textContent = currentWordIndex + 1;
    document.getElementById('totalWords').textContent = gameData.words.length;

    // Show clue
    const clues = gameData.clues[currentWordIndex];
    const clueText = Array.isArray(clues) ? clues.join(' | ') : clues;
    document.getElementById('clueText').textContent = clueText;

    // Show word boxes
    const word = gameData.words[currentWordIndex];
    const boxesHtml = word.split('').map(letter =>
        `<div class="letter-box">${letter === ' ' ? ' ' : ''}</div>`
    ).join('');
    document.getElementById('wordBoxes').innerHTML = boxesHtml;

    // Reset input
    document.getElementById('guessInput').value = '';
    document.getElementById('guessInput').focus();
    document.getElementById('guessCount').textContent = guessCount;
    document.getElementById('feedback').style.display = 'none';

    // Start timer
    startTimer();
}

function showDone(solved) {
    hideAll();
    stopTimer();

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
        if (e.key === 'Enter') submitGuess();
    });

    // Update word boxes as user types
    document.getElementById('guessInput').addEventListener('input', (e) => {
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
