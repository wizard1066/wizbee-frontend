/**
 * Wizbee Homework Mode - Student Play
 * Self-paced homework where students play independently
 */

const API_URL = 'https://api.wizbee.app';

let shareCode = null;
let playerName = null;
let gameData = null;
let currentWordIndex = 0;
let currentWord = '';
let guessCount = 0;
let totalGuesses = 0;
let wordsSolved = 0;
let wordStartTime = null;
let totalTimeMs = 0;
let timerInterval = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Get share code from URL
    const urlParams = new URLSearchParams(window.location.search);
    shareCode = urlParams.get('code');

    if (!shareCode) {
        showError('No homework code provided', 'Please use the link provided by your teacher.');
        return;
    }

    // Check if player name is stored
    playerName = localStorage.getItem(`homework_player_${shareCode}`);

    if (playerName) {
        loadGame();
    } else {
        showJoinScreen();
    }

    setupEventListeners();
});

// ============================================================================
// SCREENS
// ============================================================================

function showJoinScreen() {
    hideAllScreens();
    document.getElementById('join-screen').style.display = 'flex';
}

function showGameScreen() {
    hideAllScreens();
    document.getElementById('game-screen').style.display = 'block';
}

function showCompletedScreen() {
    hideAllScreens();
    document.getElementById('completed-screen').style.display = 'flex';

    // Show final stats
    document.getElementById('finalScore').textContent = wordsSolved;
    document.getElementById('finalTotal').textContent = gameData.totalWords;
    document.getElementById('finalSolved').textContent = wordsSolved;
    document.getElementById('finalGuesses').textContent = totalGuesses;
    document.getElementById('finalTime').textContent = formatTime(totalTimeMs);
}

function showError(title, message) {
    hideAllScreens();
    document.getElementById('error-screen').style.display = 'flex';
    document.getElementById('errorTitle').textContent = title;
    document.getElementById('errorMessage').textContent = message;
}

function hideAllScreens() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('join-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('completed-screen').style.display = 'none';
    document.getElementById('error-screen').style.display = 'none';
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function loadGame() {
    try {
        const response = await fetch(`${API_URL}/api/homework/game/${shareCode}`, {
            headers: {
                'X-Game-Code': shareCode,
                'X-Player-Name': playerName
            }
        });

        const data = await response.json();

        if (!data.success) {
            if (data.completed) {
                // Already completed - show results
                loadMyResults();
                return;
            }
            showError('Cannot Load Homework', data.error || 'Failed to load homework');
            return;
        }

        gameData = data.gameData;
        currentWordIndex = gameData.currentIndex || 0;

        // Update UI
        document.getElementById('playerNameDisplay').textContent = playerName;
        document.getElementById('themeDisplay').textContent = gameData.theme;
        document.getElementById('totalWords').textContent = gameData.totalWords;

        showGameScreen();
        startWord();

    } catch (error) {
        console.error('[HOMEWORK] Error loading game:', error);
        showError('Connection Error', 'Failed to connect to server.');
    }
}

async function submitResult(solved, gaveUp) {
    const timeMs = Date.now() - wordStartTime;

    try {
        const response = await fetch(`${API_URL}/api/homework/submit-result`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Game-Code': shareCode,
                'X-Player-Name': playerName
            },
            body: JSON.stringify({
                shareCode,
                wordIndex: currentWordIndex,
                solved,
                gaveUp,
                guesses: guessCount,
                timeMs
            })
        });

        const data = await response.json();

        if (data.success) {
            // Update totals
            totalTimeMs += timeMs;
            totalGuesses += guessCount;
            if (solved) wordsSolved++;

            if (data.completed) {
                // Homework finished!
                stopTimer();
                showCompletedScreen();
            } else {
                // Move to next word
                currentWordIndex = data.nextIndex;
                // Delay: 4s for give up (to see answer), 1.5s for correct, 0.5s for wrong guess
                const delay = gaveUp ? 4000 : (solved ? 1500 : 500);
                setTimeout(() => startWord(), delay);
            }
        }

    } catch (error) {
        console.error('[HOMEWORK] Error submitting result:', error);
    }
}

async function loadMyResults() {
    try {
        const response = await fetch(`${API_URL}/api/homework/my-results/${shareCode}`, {
            headers: {
                'X-Game-Code': shareCode,
                'X-Player-Name': playerName
            }
        });

        const data = await response.json();

        if (data.success) {
            wordsSolved = data.myResults.wordsSolved;
            totalGuesses = data.myResults.totalGuesses;
            totalTimeMs = data.myResults.totalTimeMs;
            gameData = { totalWords: data.myResults.wordResults.length };
            showCompletedScreen();
        } else {
            showError('Already Completed', 'You have already completed this homework.');
        }

    } catch (error) {
        console.error('[HOMEWORK] Error loading results:', error);
        showError('Error', 'Failed to load your results.');
    }
}

// ============================================================================
// GAME LOGIC
// ============================================================================

function startWord() {
    currentWord = gameData.words[currentWordIndex];
    guessCount = 0;
    wordStartTime = Date.now();

    // Update progress
    document.getElementById('currentWord').textContent = currentWordIndex + 1;
    updateProgressBar();

    // Show clue
    const clue = gameData.clues[currentWordIndex];
    const clueText = Array.isArray(clue) ? clue.join(' | ') : clue;
    document.getElementById('clueText').textContent = clueText;

    // Show word boxes
    renderWordBoxes('');

    // Update stats
    updateStats();

    // Re-enable input controls (they get disabled after correct/giveup)
    document.getElementById('guessInput').disabled = false;
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('giveUpBtn').style.display = 'block';

    // Clear input and feedback
    document.getElementById('guessInput').value = '';
    document.getElementById('feedback').className = 'feedback';
    document.getElementById('guessInput').focus();

    // Start timer
    startTimer();
}

function renderWordBoxes(guess) {
    const container = document.getElementById('wordBoxes');
    const letters = currentWord.split('');
    const guessLetters = guess.toUpperCase().split('');

    container.innerHTML = letters.map((letter, i) => {
        const guessLetter = guessLetters[i] || '';
        const isCorrect = guessLetter === letter.toUpperCase();
        const isFilled = guessLetter !== '';

        let className = 'letter-box';
        if (isCorrect) className += ' correct';
        else if (isFilled) className += ' filled';

        return `<span class="${className}">${isFilled ? guessLetter : (letter === ' ' ? ' ' : '')}</span>`;
    }).join('');
}

function checkGuess(guess) {
    const normalizedGuess = guess.trim().toUpperCase();
    const normalizedWord = currentWord.toUpperCase();

    guessCount++;
    updateStats();

    if (normalizedGuess === normalizedWord) {
        // Correct!
        renderWordBoxes(normalizedWord);
        document.getElementById('feedback').textContent = 'Correct!';
        document.getElementById('feedback').className = 'feedback correct';
        document.getElementById('guessInput').disabled = true;
        document.getElementById('submitBtn').disabled = true;
        document.getElementById('giveUpBtn').style.display = 'none';

        submitResult(true, false);
    } else {
        // Wrong
        renderWordBoxes(normalizedGuess);
        document.getElementById('feedback').textContent = 'Try again!';
        document.getElementById('feedback').className = 'feedback wrong';
        document.getElementById('guessInput').value = '';
        document.getElementById('guessInput').focus();

        // Clear feedback after a moment
        setTimeout(() => {
            document.getElementById('feedback').className = 'feedback';
        }, 1500);
    }
}

function giveUp() {
    // Show the word
    renderWordBoxes(currentWord);
    document.getElementById('feedback').textContent = `The word was: ${currentWord}`;
    document.getElementById('feedback').className = 'feedback wrong';
    document.getElementById('guessInput').disabled = true;
    document.getElementById('submitBtn').disabled = true;
    document.getElementById('giveUpBtn').style.display = 'none';

    submitResult(false, true);
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateProgressBar() {
    const progress = ((currentWordIndex) / gameData.totalWords) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;
}

function updateStats() {
    document.getElementById('guessCount').textContent = guessCount;
    document.getElementById('solvedCount').textContent = wordsSolved;
}

function startTimer() {
    stopTimer();
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - wordStartTime;
        document.getElementById('timeElapsed').textContent = formatTime(elapsed);
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function formatTime(ms) {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Join button
    document.getElementById('joinBtn').addEventListener('click', () => {
        const name = document.getElementById('playerNameInput').value.trim();
        if (name.length < 1) {
            alert('Please enter your name');
            return;
        }
        playerName = name;
        localStorage.setItem(`homework_player_${shareCode}`, playerName);
        loadGame();
    });

    // Enter key on name input
    document.getElementById('playerNameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('joinBtn').click();
        }
    });

    // Submit guess
    document.getElementById('submitBtn').addEventListener('click', () => {
        const guess = document.getElementById('guessInput').value;
        if (guess.trim()) {
            checkGuess(guess);
        }
    });

    // Enter key on guess input
    document.getElementById('guessInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('submitBtn').click();
        }
    });

    // Live update word boxes as user types
    document.getElementById('guessInput').addEventListener('input', (e) => {
        renderWordBoxes(e.target.value);
    });

    // Give up button - no confirmation, just show answer for 4 seconds
    document.getElementById('giveUpBtn').addEventListener('click', () => {
        giveUp();
    });

    // View results button
    document.getElementById('viewResultsBtn').addEventListener('click', () => {
        window.location.href = `homework-results.html?code=${shareCode}&player=${encodeURIComponent(playerName)}`;
    });
}
