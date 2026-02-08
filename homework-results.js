/**
 * Wizbee Homework Mode - Results Dashboard
 * Shows results for students (after completing) and teachers (full dashboard)
 */

const API_URL = 'https://api.wizbee.app';

let shareCode = null;
let playerName = null;
let authToken = null;
let isTeacher = false;
let homeworkData = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Get share code and player name from URL
    const urlParams = new URLSearchParams(window.location.search);
    shareCode = urlParams.get('code');
    playerName = urlParams.get('player');

    // Check if user is logged in (teacher)
    authToken = localStorage.getItem('authToken');

    if (!shareCode) {
        showError('No homework code provided');
        return;
    }

    // Determine if teacher or student view
    if (authToken) {
        // Teacher view - show full dashboard
        isTeacher = true;
        loadTeacherResults();
    } else if (playerName) {
        // Student view - show their results + leaderboard
        isTeacher = false;
        loadStudentResults();
    } else {
        showError('Please provide your player name or log in as teacher');
    }

    setupEventListeners();
});

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function loadTeacherResults() {
    try {
        const response = await fetch(`${API_URL}/api/homework/teacher-results/${shareCode}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (!data.success) {
            showError(data.error || 'Failed to load results');
            return;
        }

        homeworkData = data;
        renderTeacherView(data);

    } catch (error) {
        console.error('[RESULTS] Error loading teacher results:', error);
        showError('Failed to connect to server');
    }
}

async function loadStudentResults() {
    try {
        const response = await fetch(`${API_URL}/api/homework/my-results/${shareCode}`, {
            headers: {
                'X-Game-Code': shareCode,
                'X-Player-Name': playerName
            }
        });

        const data = await response.json();

        if (!data.success) {
            showError(data.error || 'Failed to load results');
            return;
        }

        homeworkData = data;
        renderStudentView(data);

    } catch (error) {
        console.error('[RESULTS] Error loading student results:', error);
        showError('Failed to connect to server');
    }
}

async function loadStudentDetail(studentName) {
    try {
        const response = await fetch(`${API_URL}/api/homework/student-detail/${shareCode}/${encodeURIComponent(studentName)}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (data.success) {
            showStudentModal(studentName, data);
        }

    } catch (error) {
        console.error('[RESULTS] Error loading student detail:', error);
    }
}

async function closeHomework() {
    if (!confirm('Are you sure you want to close this homework? Students will no longer be able to submit.')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/homework/close`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ shareCode })
        });

        const data = await response.json();

        if (data.success) {
            alert('Homework closed successfully');
            location.reload();
        } else {
            alert(data.error || 'Failed to close homework');
        }

    } catch (error) {
        console.error('[RESULTS] Error closing homework:', error);
        alert('Failed to close homework');
    }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderTeacherView(data) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';

    // Header
    document.getElementById('shareCode').textContent = data.homework.shareCode;
    document.getElementById('themeName').textContent = data.homework.theme;
    document.getElementById('totalWords').textContent = `${data.homework.totalWords} words`;

    // Info bar
    document.getElementById('createdAt').textContent = formatDate(data.homework.createdAt);

    const expiresInfo = document.getElementById('expiresInfo');
    if (data.homework.isExpired) {
        expiresInfo.textContent = 'Expired';
        expiresInfo.classList.add('expired');
    } else if (data.homework.expiresAt) {
        expiresInfo.textContent = `Expires: ${formatDate(data.homework.expiresAt)}`;
    }

    // Summary cards
    document.getElementById('summary-section').style.display = 'grid';
    document.getElementById('totalStudentsCard').textContent = data.summary.totalStudents;
    document.getElementById('completedCount').textContent = data.summary.completedCount;
    document.getElementById('inProgressCount').textContent = data.summary.inProgressCount;
    document.getElementById('averageScore').textContent = data.summary.averageScore;

    // Student list
    renderStudentList(data.students, true);

    // Teacher actions
    if (data.homework.status === 'active' && !data.homework.isExpired) {
        document.getElementById('teacher-actions').style.display = 'flex';
    }
}

function renderStudentView(data) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';

    // Header
    document.getElementById('shareCode').textContent = shareCode;

    // My results section
    document.getElementById('my-results-section').style.display = 'block';
    document.getElementById('myRank').textContent = `#${data.myRank}`;
    document.getElementById('totalStudents').textContent = data.totalStudents;
    document.getElementById('myWordsSolved').textContent = data.myResults.wordsSolved;
    document.getElementById('myGuesses').textContent = data.myResults.totalGuesses;
    document.getElementById('myTime').textContent = formatTime(data.myResults.totalTimeMs);

    // Leaderboard
    renderStudentList(data.leaderboard, false);
}

function renderStudentList(students, isTeacherView) {
    const container = document.getElementById('studentList');

    if (students.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #a0aec0;">
                No students have joined yet
            </div>
        `;
        return;
    }

    container.innerHTML = students.map((student, index) => {
        const placeClass = index === 0 ? 'first-place' : index === 1 ? 'second-place' : index === 2 ? 'third-place' : '';
        const rankClass = index < 3 ? `rank-${index + 1}` : '';

        // Determine status
        let statusHtml = '';
        if (student.completed) {
            statusHtml = '<span class="status-badge completed">Completed</span>';
        } else if (student.wordsAttempted > 0 || student.currentIndex > 0) {
            statusHtml = '<span class="status-badge in-progress">In Progress</span>';
        } else {
            statusHtml = '<span class="status-badge not-started">Not Started</span>';
        }

        // Highlight current player
        const isMe = student.playerName === playerName;
        const meStyle = isMe ? 'background: rgba(102, 126, 234, 0.2);' : '';

        return `
            <div class="student-row ${placeClass}" style="${meStyle}" data-student="${escapeHtml(student.playerName)}">
                <div class="rank ${rankClass}">${student.rank || index + 1}</div>
                <div class="student-name">${escapeHtml(student.playerName)}${isMe ? ' (You)' : ''}</div>
                <div class="stat solved">${student.wordsSolved}</div>
                <div class="stat">${student.totalGuesses}</div>
                <div class="stat">${formatTime(student.totalTimeMs)}</div>
                <div class="stat">${statusHtml}</div>
            </div>
        `;
    }).join('');

    // Add click handlers for teacher view
    if (isTeacherView) {
        container.querySelectorAll('.student-row').forEach(row => {
            row.addEventListener('click', () => {
                const studentName = row.dataset.student;
                if (studentName) {
                    loadStudentDetail(studentName);
                }
            });
        });
    }
}

function showStudentModal(studentName, data) {
    const modal = document.getElementById('student-modal');
    const modalContent = document.getElementById('modalContent');

    document.getElementById('modalStudentName').textContent = studentName;

    // Render word results
    modalContent.innerHTML = `
        <div style="margin-bottom: 20px; display: flex; justify-content: space-around; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 12px;">
            <div style="text-align: center;">
                <div style="font-size: 24px; font-weight: bold; color: #48bb78;">${data.summary.wordsSolved}</div>
                <div style="font-size: 12px; color: #a0aec0;">Solved</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 24px; font-weight: bold;">${data.summary.totalGuesses}</div>
                <div style="font-size: 12px; color: #a0aec0;">Guesses</div>
            </div>
            <div style="text-align: center;">
                <div style="font-size: 24px; font-weight: bold;">${formatTime(data.summary.totalTimeMs)}</div>
                <div style="font-size: 12px; color: #a0aec0;">Time</div>
            </div>
        </div>
        <h4 style="margin-bottom: 15px;">Word-by-Word Results</h4>
        ${data.wordResults.map(result => `
            <div class="word-result ${result.solved ? 'solved' : 'gave-up'}">
                <div class="word-info">
                    <div class="word">${result.word}</div>
                    <div class="clue">${Array.isArray(result.clue) ? result.clue.join(' | ') : result.clue}</div>
                </div>
                <div class="result-stats">
                    <div class="result-icon">${result.solved ? '&#10004;' : '&#10006;'}</div>
                    <div style="font-size: 12px; color: #a0aec0;">
                        ${result.guesses} guess${result.guesses !== 1 ? 'es' : ''} | ${formatTime(result.timeMs)}
                    </div>
                </div>
            </div>
        `).join('')}
    `;

    modal.style.display = 'flex';
}

function showError(message) {
    document.getElementById('loading').innerHTML = `
        <div style="text-align: center; color: #fef3c7;">
            <p style="font-size: 18px; margin-bottom: 20px;">${message}</p>
            <a href="index.html" style="color: #667eea;">Return to Home</a>
        </div>
    `;
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Close modal
    document.getElementById('closeModalBtn').addEventListener('click', () => {
        document.getElementById('student-modal').style.display = 'none';
    });

    document.getElementById('student-modal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            document.getElementById('student-modal').style.display = 'none';
        }
    });

    // Close homework button
    document.getElementById('closeHomeworkBtn').addEventListener('click', closeHomework);
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

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
