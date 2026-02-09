/**
 * Wizbee My Games - Teacher Dashboard
 * View and manage all games created by the logged-in user
 */

const API_URL = 'https://api.wizbee.app';

let authToken = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    authToken = localStorage.getItem('authToken');

    if (!authToken) {
        showError('Please log in to view your games.');
        document.getElementById('loading').style.display = 'none';
        return;
    }

    loadGames();
});

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function loadGames() {
    try {
        const response = await fetch(`${API_URL}/api/my-games`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        document.getElementById('loading').style.display = 'none';

        if (!data.success) {
            showError(data.error || 'Failed to load games');
            return;
        }

        if (data.games.length === 0) {
            document.getElementById('empty-state').style.display = 'block';
            return;
        }

        renderGames(data.games);

    } catch (error) {
        console.error('[MY-GAMES] Error loading games:', error);
        document.getElementById('loading').style.display = 'none';
        showError('Failed to connect to server.');
    }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderGames(games) {
    const container = document.getElementById('games-list');
    container.style.display = 'flex';

    container.innerHTML = games.map(game => {
        const isExpired = game.expiresAt && new Date(game.expiresAt) < new Date();
        const status = isExpired ? 'expired' : game.status;
        const statusLabel = isExpired ? 'Expired' : (game.status === 'active' ? 'Active' : 'Ended');

        // Parse theme from cache_key (format: "language:theme")
        const theme = game.theme ? game.theme.split(':').slice(1).join(':') || game.theme : 'Unknown';

        // Format date
        const createdDate = new Date(game.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        // Build action links based on game mode
        let actionsHtml = '';
        if (game.gameMode === 'homework') {
            actionsHtml = `
                <a href="homework-results.html?code=${game.shareCode}" class="btn-primary">View Results</a>
                <a href="monitor.html?code=${game.shareCode}" class="btn-secondary">Monitor</a>
            `;
        } else {
            actionsHtml = `
                <a href="party-host.html?code=${game.shareCode}" class="btn-primary">Host Game</a>
                <a href="monitor.html?code=${game.shareCode}" class="btn-secondary">Monitor</a>
            `;
        }

        return `
            <div class="game-card">
                <div class="game-code">${game.shareCode}</div>
                <div class="game-info">
                    <div class="game-theme">${escapeHtml(theme)}</div>
                    <div class="game-meta">
                        <span class="mode-badge ${game.gameMode}">${game.gameMode}</span>
                        <span class="status-badge ${status}">${statusLabel}</span>
                        <span>${game.playerCount} player${game.playerCount !== 1 ? 's' : ''}</span>
                        <span>${createdDate}</span>
                    </div>
                </div>
                <div class="game-actions">
                    ${actionsHtml}
                </div>
            </div>
        `;
    }).join('');
}

function showError(message) {
    const errorEl = document.getElementById('error');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
