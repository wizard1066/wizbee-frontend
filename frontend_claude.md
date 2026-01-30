# Wizbee Frontend - Claude Documentation

**Last Updated:** January 29, 2026  
**Status:** Production Ready  
**Deployment:** Vercel

---

## Overview

Wizbee frontend is a multiplayer word puzzle game where players compete to solve themed word puzzles with AI-generated clues. Built with vanilla JavaScript, HTML, and CSS for simplicity and performance.

---

## Architecture

### Tech Stack
- **Framework:** Vanilla JavaScript (no frameworks)
- **Styling:** Custom CSS with Tailwind-inspired utilities
- **Real-time:** Socket.IO client
- **Auth:** Google Sign-In + JWT
- **Deployment:** Vercel
- **Backend:** Railway (separate repo)

### Key Files
```
wizbee-frontend/
├── index.html          # Main page: theme creation, game start
├── play.html           # Game interface with multiplayer
├── browse.html         # Browse themes (unused?)
├── admin.html          # Theme management (edit/delete)
├── edit.html           # Edit individual theme
└── styles.css          # Global styles
```

---

## Page Flows

### 1. Login Flow (index.html)
```
User visits wizbee.app
  ↓
Google Sign-In button
  ↓
Get JWT token from backend
  ↓
Store in localStorage
  ↓
Show theme creation interface
```

### 2. Solo Play Flow
```
Enter theme → Generate words → Browse/Edit → Select 7 words → Play
  ↓
play.html loads
  ↓
Generate clues via Claude API
  ↓
Play game (solo)
  ↓
View summary
```

### 3. Multiplayer Flow
```
Player A: Create theme → Click "Share Game"
  ↓
Backend creates shared game
  ↓
Show QR code + share code (e.g., "8BDC")
  ↓
Player B: Enter code or scan QR
  ↓
Both players connected via Socket.IO
  ↓
Real-time synchronized gameplay
  ↓
View summary (both players)
```

---

## Socket.IO Integration (play.html)

### Connection Setup

```javascript
function initializeSocket() {
    if (!multiplayerCode) return;
    
    socket = io('https://api.wizbee.app', {
        auth: { token: authToken },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });
    
    // Register ALL listeners FIRST (before connect fires)
    socket.on('skip_requested', handleSkipRequest);
    socket.on('skip_declined', handleSkipDeclined);
    socket.on('both_skipped', handleBothSkipped);
    socket.on('opponent_advanced', handleOpponentAdvanced);
    socket.on('player_joined', handlePlayerJoined);
    socket.on('game_completed', handleGameCompleted);
    
    // Connect event LAST
    socket.on('connect', () => {
        socket.emit('join_game', multiplayerCode);
    });
}
```

**CRITICAL:** All `socket.on()` listeners must be registered BEFORE the `connect` event, or they may miss events.

---

### Event Handlers

#### opponent_advanced
When opponent solves a word and advances.

```javascript
socket.on('opponent_advanced', async (data) => {
    // Filter: Ignore if we're the solver
    const currentUserEmail = localStorage.getItem('userEmail');
    if (data.solver === currentUserEmail) return;
    
    // Only react if we're behind
    if (data.newIndex > currentWordIndex) {
        // Record opponent's solve
        gameResults.push({
            word: wordList[currentWordIndex],
            won: false,
            solvedByOpponent: true
        });
        
        // Show animation
        await animateOpponentSolution();
        showOpponentSolvedMessage();
        await delay(2000);
        
        // Jump to next word
        jumpToWord(data.newIndex);
        
        // Re-enable controls
        document.getElementById('submitGuess').classList.remove('hidden');
        document.getElementById('showClueBtn').classList.remove('hidden');
        document.getElementById('giveUpBtn').classList.remove('hidden');
    }
});
```

**Key Points:**
- **Filter own events:** Check `data.solver === currentUserEmail` to avoid showing "Opponent solved" when you solved
- **Animation first:** Always show animation BEFORE jumping to next word
- **Re-enable controls:** After jumping, restore game buttons

---

#### skip_requested
Opponent wants to skip - show modal.

```javascript
socket.on('skip_requested', (data) => {
    const currentUserEmail = localStorage.getItem('userEmail');
    
    // Don't show modal to the person who requested skip
    if (data.requester === currentUserEmail) return;
    
    // Show modal with two options
    showSkipRequestModal(data.requester, data.word);
});
```

**Modal Actions:**
- **Keep Trying:** Calls `/api/respond-skip` with `response: "keep_trying"`
- **Skip Together:** Calls `/api/respond-skip` with `response: "skip"`

---

#### skip_declined
Opponent chose to keep trying after your skip request.

```javascript
socket.on('skip_declined', (data) => {
    const currentUserEmail = localStorage.getItem('userEmail');
    
    // Only show to the person who requested skip
    if (data.decliner === currentUserEmail) return;
    
    // Re-enable next button
    const resetBtn = document.getElementById('resetButton');
    resetBtn.disabled = false;
    resetBtn.textContent = 'Next Word →';
    
    // Show notification
    showNotification('Opponent is still trying to solve it!');
});
```

---

#### both_skipped
Both players agreed to skip - advance together.

```javascript
socket.on('both_skipped', async (data) => {
    // Record as skipped
    gameResults.push({
        word: wordList[currentWordIndex],
        won: false,
        bothSkipped: true
    });
    
    // Show notification
    showNotification('⏭️ Both skipped - moving to next word');
    await delay(2000);
    
    // Jump to next word
    jumpToWord(data.newIndex);
    
    // Re-enable controls
    document.getElementById('submitGuess').classList.remove('hidden');
    document.getElementById('showClueBtn').classList.remove('hidden');
    document.getElementById('giveUpBtn').classList.remove('hidden');
    
    // Reset next button
    const resetBtn = document.getElementById('resetButton');
    resetBtn.classList.add('hidden');
    resetBtn.disabled = false;
});
```

---

#### game_completed
Game ended - all words finished.

```javascript
socket.on('game_completed', (data) => {
    // Hide game controls
    document.getElementById('submitGuess').classList.add('hidden');
    document.getElementById('showClueBtn').classList.add('hidden');
    document.getElementById('giveUpBtn').classList.add('hidden');
    
    // Show summary button
    const resetBtn = document.getElementById('resetButton');
    resetBtn.textContent = '🎉 View Summary';
    resetBtn.classList.remove('hidden');
    resetBtn.disabled = false;
    resetBtn.onclick = showGameSummary;
    
    // Show message
    document.getElementById('gameMessage').textContent = '🏁 Game Complete!';
});
```

---

## Key Functions

### shareGame()
Create and share a multiplayer game.

```javascript
async function shareGame() {
    const gameData = JSON.parse(localStorage.getItem('pendingGame'));
    const cacheKey = gameData?.cacheKey;
    
    const response = await fetch(`${API_URL}/api/create-shared-game`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            cacheKey: cacheKey,
            clues: wordClues,
            words: wordList
        })
    });
    
    const data = await response.json();
    
    // Set multiplayer variables
    multiplayerCode = data.shareCode;
    isMultiplayerGame = true;
    
    // Initialize Socket.IO
    initializeSocket();
    
    // Save code
    localStorage.setItem('sharedGameCode', data.shareCode);
    
    // Show QR code modal
    showShareCodeModal(data.shareCode);
    
    // Change button to show clue
    document.getElementById('showClueBtn').textContent = '💡 Show Clue';
    document.getElementById('showClueBtn').onclick = showClue;
}
```

---

### giveUp()
Player gives up on current word - requests skip.

```javascript
async function giveUp() {
    // End game locally
    endGame(false);
    
    // If multiplayer, request skip from opponent
    if (isMultiplayerGame && multiplayerCode) {
        // Wait 3 seconds so user can see the answer
        await delay(3000);
        
        const response = await fetch(`${API_URL}/api/request-skip`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                shareCode: multiplayerCode,
                wordIndex: currentWordIndex,
                word: currentWord
            })
        });
        
        if (response.ok) {
            showWaitingForOpponent();
        }
    }
}
```

---

### endGame(won)
Called when word is completed (win or lose).

**IMPORTANT:** Despite the name, `endGame()` is called for EVERY word, not just when the game ends!

```javascript
async function endGame(won) {
    gameOver = true;
    
    // Track result
    gameResults.push({
        word: currentWord,
        won: won,
        guesses: maxGuesses - remainingGuesses,
        timeSeconds: Math.floor((Date.now() - wordStartTime) / 1000),
        cluesViewed: clueViewCount
    });
    
    // Show message
    if (won) {
        celebrateWin();
        messageDiv.textContent = `🎉 ${winMessage} ${currentWord}`;
        
        // Auto-advance in multiplayer
        if (isMultiplayerGame && multiplayerCode) {
            if (currentWordIndex >= wordList.length - 1) {
                // Last word - wait then complete
                await delay(5000);
                await completeMultiplayerGame();
            } else {
                // Not last word - broadcast and let Socket.IO handle
                await delay(2000);
                await advanceMultiplayerGame();
            }
            return; // Exit early in multiplayer
        }
    }
    
    // Solo game: Show next button
    const resetBtn = document.getElementById('resetButton');
    resetBtn.classList.remove('hidden');
    
    if (currentWordIndex >= wordList.length - 1) {
        // Last word
        resetBtn.textContent = '🏁 No More Words';
        resetBtn.disabled = true;
        
        setTimeout(() => {
            resetBtn.textContent = '🎉 View Summary';
            resetBtn.disabled = false;
        }, 2000);
    } else {
        resetBtn.textContent = 'Next Word →';
    }
}
```

**Key Behaviors:**
- **Multiplayer Won:** Auto-advances via `advanceMultiplayerGame()`, no manual button
- **Multiplayer Lost:** Shows waiting state for opponent
- **Solo:** Shows "Next Word" button
- **Last Word:** Shows "No More Words" → "View Summary"

---

### jumpToWord(newIndex)
Jump to a specific word (used in multiplayer sync).

```javascript
function jumpToWord(newIndex) {
    // Clear old clue timer
    hideClue();
    
    // Check if game complete
    if (newIndex >= wordList.length) {
        // Show completion screen
        document.getElementById('submitGuess').classList.add('hidden');
        document.getElementById('showClueBtn').classList.add('hidden');
        document.getElementById('giveUpBtn').classList.add('hidden');
        
        const resetBtn = document.getElementById('resetButton');
        resetBtn.textContent = '🎉 View Summary';
        resetBtn.classList.remove('hidden');
        resetBtn.onclick = showGameSummary;
        
        return;
    }
    
    // Update to new word
    currentWordIndex = newIndex;
    currentWord = wordList[newIndex];
    currentGuess = '';
    guessHistory = [];
    remainingGuesses = maxGuesses;
    gameOver = false;
    
    // Reset UI
    createWordBoxes();
    updateGuessCount();
    resetKeyboard();
    hideClue();
    
    // Clear previous guesses and messages
    document.getElementById('previousGuesses').innerHTML = '';
    document.getElementById('gameMessage').textContent = '';
    
    // Update theme display
    document.getElementById('selectedTheme').textContent = 
        `${selectedThemeWord} (${currentWordIndex + 1}/${wordList.length})`;
    
    // Check if last word - show "No More Words" button
    if (newIndex >= wordList.length - 1) {
        const resetBtn = document.getElementById('resetButton');
        resetBtn.textContent = '🏁 No More Words';
        resetBtn.disabled = true;
        resetBtn.classList.remove('hidden');
    }
    
    // Start auto-clue timer
    if (wordClues.length > newIndex) {
        showClueAuto(20000);
    }
}
```

---

### showGameSummary()
Display final results.

```javascript
function showGameSummary() {
    const totalWords = gameResults.length;
    const wordsWon = gameResults.filter(r => r.won).length;
    const avgTime = Math.round(totalTime / totalWords);
    
    let html = `
        <div class="summary-stats">
            <h3>📊 Overall Stats</h3>
            <p><strong>Words Won:</strong> ${wordsWon}/${totalWords}</p>
            <p><strong>Success Rate:</strong> ${Math.round((wordsWon/totalWords)*100)}%</p>
        </div>
        
        <div class="summary-results">
            <h3>📝 Word by Word</h3>
    `;
    
    gameResults.forEach((result) => {
        let icon, status;
        
        if (result.bothSkipped) {
            icon = '⏭️';
            status = '<span style="color: #667eea;">Both players skipped</span>';
        } else if (result.solvedByOpponent) {
            icon = '👤';
            status = '<span style="color: #667eea;">Solved by opponent</span>';
        } else if (result.won) {
            icon = '✅';
            status = `${result.guesses} guesses, ${result.timeSeconds}s`;
        } else {
            icon = '❌';
            status = `${result.guesses} guesses, ${result.timeSeconds}s`;
        }
        
        html += `
            <div style="padding: 10px; border-bottom: 1px solid #e2e8f0;">
                ${icon} <strong>${result.word}</strong> - ${status}
            </div>
        `;
    });
    
    html += '</div>';
    document.getElementById('summaryContent').innerHTML = html;
    document.getElementById('summaryOverlay').classList.remove('hidden');
}
```

**Result Types:**
- `won: true` → ✅ You solved
- `solvedByOpponent: true` → 👤 Opponent solved
- `bothSkipped: true` → ⏭️ Both skipped
- `won: false` (no flags) → ❌ You failed

---

## State Management

### Global Variables (play.html)

```javascript
// Authentication
let authToken = null;
let userEmail = null;

// Game state
let wordList = [];
let currentWordIndex = 0;
let currentWord = '';
let currentGuess = '';
let remainingGuesses = 0;
let maxGuesses = 8;
let guessHistory = [];
let gameOver = false;

// Theme info
let selectedThemeWord = '';
let currentLanguage = 'en';
let wordClues = [];

// Multiplayer
let socket = null;
let multiplayerCode = null;
let isMultiplayerGame = false;

// Results tracking
let gameResults = [];
```

### LocalStorage Usage

```javascript
// Auth
localStorage.setItem('authToken', token);
localStorage.setItem('userEmail', email);

// Game data
localStorage.setItem('pendingGame', JSON.stringify(gameData));

// Multiplayer
localStorage.setItem('sharedGameCode', shareCode);

// Theme editing
localStorage.setItem('lastEditedTheme', JSON.stringify({
    cacheKey: cacheKey,
    themeName: themeName
}));
```

**IMPORTANT:** Don't remove `pendingGame` from localStorage until AFTER sharing, or the share button will fail!

---

## UI Patterns

### Button State Management

Buttons change based on game state:

**Game In Progress:**
```
[Submit Word] [Show Clue] [Give Up]
```

**After Solving (Solo):**
```
[Next Word →]
```

**After Solving (Multiplayer):**
```
(No button - auto-advances via Socket.IO)
```

**After Giving Up (Multiplayer):**
```
[⏳ Waiting for opponent...]  (disabled)
```

**Last Word (Before Solving):**
```
[🏁 No More Words]  (disabled, visible)
```

**Last Word (After Solving):**
```
[🏁 No More Words]  (2 seconds)
  ↓
[🎉 View Summary]  (enabled)
```

---

### Modal System

#### Share Code Modal
Shows QR code and 4-character code.

```javascript
function showShareCodeModal(shareCode) {
    const shareUrl = 'https://wizbee.app/?join=' + shareCode;
    
    // Create modal with QR code
    const modal = createModal(`
        <h2>Share Game Code</h2>
        <div id="qrcode"></div>
        <div class="share-code">${shareCode}</div>
        <button onclick="copyShareCode('${shareCode}')">Copy Code</button>
    `);
    
    // Generate QR code
    new QRCode(document.getElementById("qrcode"), {
        text: shareUrl,
        width: 200,
        height: 200
    });
}
```

---

#### Skip Request Modal
Asks opponent: keep trying or skip together?

```javascript
function showSkipRequestModal(requester, word) {
    const modal = createModal(`
        <h2>🤔 Opponent Wants to Skip</h2>
        <p>Your opponent gave up.</p>
        <p>Do you want to keep trying or skip together?</p>
        <button onclick="respondToSkip('keep_trying')">💪 Keep Trying</button>
        <button onclick="respondToSkip('skip')">⏭️ Skip Together</button>
    `);
}
```

**IMPORTANT:** Don't show the word in the modal! That would spoil the answer.

---

## Animations

### Letter-by-Letter Reveal
Shows opponent's answer animating in.

```javascript
async function animateOpponentSolution() {
    const word = wordList[currentWordIndex];
    const boxes = document.querySelectorAll('.letter-box');
    
    // Clear boxes
    boxes.forEach(box => {
        box.textContent = '';
        box.classList.remove('correct', 'present', 'absent');
    });
    
    // Reveal each letter with delay
    for (let i = 0; i < word.length; i++) {
        const box = boxes[i];
        box.textContent = word[i];
        box.classList.add('correct');
        
        // Pop animation
        box.style.animation = 'pop 0.3s ease-in-out';
        
        await delay(150); // 150ms per letter
    }
    
    // Flash all boxes
    await delay(300);
    boxes.forEach(box => {
        box.style.animation = 'pulse 0.5s ease-in-out';
    });
    
    await delay(800);
}
```

---

### Celebration Animation
When you solve a word.

```javascript
function celebrateWin() {
    // Show all letters as correct
    for (let i = 0; i < currentWord.length; i++) {
        const box = document.getElementById(`box-${i}`);
        box.textContent = currentWord[i];
        box.classList.add('correct');
    }
    
    // Flash animation
    for (let i = 0; i < currentWord.length; i++) {
        const box = document.getElementById(`box-${i}`);
        setTimeout(() => box.classList.add('flash'), i * 150);
        setTimeout(() => box.classList.remove('flash'), i * 150 + 1000);
    }
}
```

---

## Mobile Support

### Hidden Input for Mobile Keyboard

```html
<input 
    type="text" 
    id="guessInput" 
    autocomplete="off"
    autocorrect="off"
    autocapitalize="characters"
    style="position: absolute; left: -9999px; opacity: 0;"
/>
```

**Why:** Mobile devices need an actual `<input>` to trigger the keyboard.

**How it works:**
1. Input is hidden off-screen
2. When user taps letter boxes, input is focused
3. User types on mobile keyboard
4. Input updates `currentGuess` variable
5. Letter boxes update to show letters

---

### Touch-Friendly Letter Boxes

```javascript
function createWordBoxes() {
    const container = document.getElementById('wordBoxes');
    container.innerHTML = '';
    
    for (let i = 0; i < currentWord.length; i++) {
        const box = document.createElement('div');
        box.className = 'letter-box';
        box.id = `box-${i}`;
        box.onclick = focusInput;  // ← Tap to show keyboard
        container.appendChild(box);
    }
}

function focusInput() {
    const guessInput = document.getElementById('guessInput');
    if (guessInput && !gameOver) {
        guessInput.focus();  // Shows mobile keyboard
    }
}
```

---

## Common Issues & Solutions

### Issue 1: "Opponent solved it!" shows on both screens

**Cause:** Socket.IO broadcasts to entire room including the solver.

**Solution:** Filter events by checking if you're the solver.

```javascript
socket.on('opponent_advanced', async (data) => {
    const currentUserEmail = localStorage.getItem('userEmail');
    if (data.solver === currentUserEmail) {
        return;  // Ignore own solves
    }
    // ... handle opponent solve
});
```

---

### Issue 2: Buttons don't re-enable after opponent solves

**Cause:** Forgot to show buttons after jumping to next word.

**Solution:** Always re-enable controls after jumping.

```javascript
// After jumpToWord(data.newIndex)
document.getElementById('submitGuess').classList.remove('hidden');
document.getElementById('showClueBtn').classList.remove('hidden');
document.getElementById('giveUpBtn').classList.remove('hidden');
```

---

### Issue 3: Skip modal shows to person who requested skip

**Cause:** Not filtering the `skip_requested` event.

**Solution:** Check if you're the requester.

```javascript
socket.on('skip_requested', (data) => {
    const currentUserEmail = localStorage.getItem('userEmail');
    if (data.requester === currentUserEmail) return;
    showSkipRequestModal(data.requester, data.word);
});
```

---

### Issue 4: Game doesn't advance on last word

**Cause:** Trying to jump to index >= wordList.length doesn't show completion.

**Solution:** Check for game completion in `opponent_advanced`.

```javascript
if (data.newIndex >= wordList.length) {
    // Show game complete screen
    // Don't call jumpToWord()
}
```

---

### Issue 5: Socket.IO events not firing

**Cause:** Listeners registered after `connect` event fires.

**Solution:** Register ALL listeners BEFORE `connect` listener.

```javascript
function initializeSocket() {
    socket = io(...);
    
    // Register listeners FIRST
    socket.on('opponent_advanced', ...);
    socket.on('skip_requested', ...);
    // ... all other listeners
    
    // Connect listener LAST
    socket.on('connect', () => { ... });
}
```

---

## Testing Multiplayer

### Two-Browser Test

1. **Browser A (Chrome):** Create theme, click Share
2. **Browser B (Safari/Incognito):** Join with code
3. **Test scenarios:**
   - Both solve words → Both advance together
   - A gives up → B sees modal
   - B clicks "Keep Trying" → A sees notification
   - B clicks "Skip Together" → Both advance
   - A solves last word → Both see summary

**IMPORTANT:** Use different email accounts! Testing with same account filters out events.

---

## Performance Optimization

### Clue Generation
**Problem:** Generating 7 clues takes 10-20 seconds.

**Solutions:**
1. Show loading indicator: "💭 Thinking..."
2. Cache clues in database (future)
3. Pre-generate when theme is created (future)

---

### Word Lookup
**Problem:** Fetching theme with 448 words is slow.

**Solution:** Backend uses `ANY($1)` query instead of JOIN.

---

## Environment Variables

```javascript
const API_URL = 'https://api.wizbee.app';
```

**Note:** No other environment variables in frontend. All sensitive keys are in backend.

---

## Deployment (Vercel)

### Build Settings
- **Framework Preset:** Other
- **Build Command:** (none - static site)
- **Output Directory:** ./
- **Install Command:** (none)

### Auto-Deploy
Push to `main` branch → Automatic deployment to wizbee.app

---

## Future Improvements

### High Priority
1. **Clue Caching:** Don't regenerate clues every game
2. **Better Loading States:** Progress bars, estimated time
3. **Reconnection Recovery:** Resume disconnected games

### Medium Priority
4. **Hint System:** Progressive hints if stuck
5. **Word History:** Show which words you've already tried
6. **Sound Effects:** Celebration sounds, notifications

### Low Priority
7. **Themes:** Dark mode, custom colors
8. **Achievements:** Badges for milestones
9. **Statistics:** Track personal bests

---

## Known Limitations

1. **No offline mode:** Requires internet connection
2. **No reconnection:** Disconnect = must rejoin manually
3. **No undo:** Can't take back a guess
4. **No hints after giving up:** Answer is final

---

## Debugging Tips

### Check Socket.IO Connection
```javascript
// Browser console
socket
socket.connected  // Should be true
socket.id         // Should show ID

// Check if in room
multiplayerCode   // Should show share code
isMultiplayerGame // Should be true
```

### Check Game State
```javascript
// Current word info
currentWordIndex
currentWord
wordList

// Results tracking
gameResults

// Auth
authToken
userEmail
```

### Force Polling (Bypass Socket.IO)
Click the bee icon to manually poll game state. Useful if Socket.IO breaks.

---

## Support & Contact

**Repository:** wizbee-frontend (private)  
**Production:** https://wizbee.app  
**Backend:** https://api.wizbee.app  

**For issues or questions about this documentation, refer to the conversation transcript in `/mnt/transcripts/`.**

---

**End of Frontend Documentation**
