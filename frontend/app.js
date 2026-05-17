/* ═══════════════════════════════════════════════════════════════════
   APP STATE
   One object tracks everything the app needs to know.
   No state scattered across random variables.
════════════════════════════════════════════════════════════════════ */
const State = {
    currentScreen:   'landing',   // 'landing' | 'indexing' | 'chat'
    repoId:          null,        // "a3f8c21d" — set after submission
    repoName:        null,        // "biswaisop/Genos"
    mode:            'chat',      // 'chat' | 'review' | 'report'
    pollingInterval: null,        // holds the setInterval reference
    chatHistory:     [],          // {role, content} pairs for display
    selectedFile:    null,        // file chosen in review mode
};


/* ═══════════════════════════════════════════════════════════════════
   SCREEN MANAGEMENT
   One function to switch screens. Call this instead of toggling 
   classes manually every time.
════════════════════════════════════════════════════════════════════ */
function showScreen(screenName) {
    // Hide all screens
    document.getElementById('screen-landing').classList.add('hidden');
    document.getElementById('screen-indexing').classList.add('hidden');
    document.getElementById('screen-chat').classList.add('hidden');

    // Show the requested one
    document.getElementById(`screen-${screenName}`).classList.remove('hidden');

    State.currentScreen = screenName;
}


/* ═══════════════════════════════════════════════════════════════════
   API HELPERS
   Thin wrappers around fetch(). Always handle errors.
════════════════════════════════════════════════════════════════════ */

// Base URL — in development this is localhost
// In production, change to your Railway URL
const API_BASE = '';   // empty string = same origin

async function apiPost(path, body) {
    /*
    Makes a POST request to your FastAPI backend.
    
    Returns: the parsed JSON response
    Throws: an error with the API's error message if request fails
    */
    const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const data = await response.json();

    // If the server returned an error status (4xx, 5xx), throw it
    // so the calling code can catch it and show a message
    if (!response.ok) {
        throw new Error(data.detail || 'Request failed');
    }

    return data;
}

async function apiGet(path) {
    /*
    Makes a GET request to your FastAPI backend.
    Same error handling as apiPost.
    */
    const response = await fetch(`${API_BASE}${path}`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.detail || 'Request failed');
    }

    return data;
}
//DELETING DATA------------

async function apiDelete(path) {
    const response = await fetch(`${API_BASE}${path}`, {
        method: 'DELETE',
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.detail || 'Delete failed');
    }
    return data;
}


/* ═══════════════════════════════════════════════════════════════════
   SCREEN 1: LANDING
════════════════════════════════════════════════════════════════════ */

function validateGithubUrl(url) {
    /*
    Returns true if url looks like a valid GitHub repo URL.
    Doesn't need to be exact — just catch obvious mistakes before
    sending to the server.
    */
    const trimmed = url.trim();
    return trimmed.startsWith('https://github.com/') && 
           trimmed.split('/').length >= 5;
}

function showUrlError(message) {
    const errorEl = document.getElementById('url-error');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function hideUrlError() {
    document.getElementById('url-error').classList.add('hidden');
}

async function handleAnalyzeClick() {
    /*
    Called when the user clicks "Analyze".
    
    Flow:
    1. Read and validate the URL
    2. Call POST /api/repos/
    3. If successful: save repo_id, switch to indexing screen
    4. If failed: show error message
    */
    const urlInput = document.getElementById('repo-url');
    const url      = urlInput.value.trim();
    const btn      = document.getElementById('analyze-btn');

    // Validate first — don't even hit the API with garbage
    if (!url) {
        showUrlError('Please enter a GitHub repository URL.');
        return;
    }
    if (!validateGithubUrl(url)) {
        showUrlError('That doesn\'t look like a GitHub URL. Try: https://github.com/owner/repo');
        return;
    }

    hideUrlError();

    // Disable button so user can't submit twice
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    try {
        const data = await apiPost('/api/repos/', { url });

        // Save the repo ID — we need it for status polling and chat
        State.repoId   = data.repo_id;
        State.repoName = url.replace('https://github.com/', '');

        // Switch to indexing screen and start polling
        showScreen('indexing');
        document.getElementById('indexing-repo-url').textContent = url;
        startPolling();

    } catch (error) {
        // Show the error from the server
        showUrlError(error.message);
        btn.disabled = false;
        btn.textContent = 'Analyze';
    }
}

// Load previously analyzed repos when the landing screen shows
async function loadPreviousRepos() {
    try {
        const data = await apiGet('/api/repos/');
        const repos = data.repos.filter(r => r.status === 'ready');

        if (repos.length === 0) return;

        const section = document.getElementById('previous-repos-section');
        const list    = document.getElementById('previous-repos-list');

        section.classList.remove('hidden');
        list.innerHTML = '';   // clear before re-rendering

        repos.forEach(repo => {
            const card = document.createElement('div');
            card.className = 'repo-card';
            card.innerHTML = `
                <div>
        <div class="repo-card-name">${repo.owner}/${repo.name}</div>
        <div class="repo-card-meta">${repo.chunk_count} chunks · ${repo.file_count} files</div>
    </div>
    <div style="display:flex; align-items:center; gap:8px;">
        <span class="repo-card-arrow">→</span>
        <button 
            class="delete-repo-btn" 
            data-repo-id="${repo.id}"
            data-repo-name="${repo.owner}/${repo.name}"
            title="Delete this repo"
        >✕</button>
    </div>
            `;
            // Clicking a previous repo goes straight to chat
           card.addEventListener('click', (e) => {
    // Don't open if user clicked the delete button
    if (e.target.closest('.delete-repo-btn')) return;
    State.repoId   = repo.id;
    State.repoName = `${repo.owner}/${repo.name}`;
    openChatScreen(repo);
});

// Delete button
const deleteBtn = card.querySelector('.delete-repo-btn');
deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();   // prevent card click from firing
    const name = deleteBtn.dataset.repoName;
    if (!confirm(`Delete "${name}"?\n\nThis removes the index and cloned files.`)) return;

    deleteBtn.textContent = '...';
    deleteBtn.disabled    = true;

    try {
        await apiDelete(`/api/repos/${deleteBtn.dataset.repoId}`);
        card.remove();   // remove from UI instantly

        // Hide the section if no repos left
        if (list.querySelectorAll('.repo-card').length === 0) {
            section.classList.add('hidden');
        }
    } catch (err) {
        deleteBtn.textContent = '✕';
        deleteBtn.disabled    = false;
        alert(`Failed to delete: ${err.message}`);
    }
});
            list.appendChild(card);
        });

    } catch (e) {
        // No previous repos — that's fine, just don't show the section
    }
}


/* ═══════════════════════════════════════════════════════════════════
   EVENT LISTENERS — Screen 1
   Set up all the click handlers for the landing screen.
════════════════════════════════════════════════════════════════════ */

document.getElementById('analyze-btn')
        .addEventListener('click', handleAnalyzeClick);

// Also submit when user presses Enter in the input
document.getElementById('repo-url')
        .addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleAnalyzeClick();
        });

// Clear error when user starts typing
document.getElementById('repo-url')
        .addEventListener('input', hideUrlError);


/* ═══════════════════════════════════════════════════════════════════
   INITIALIZE
   Runs when the page first loads.
════════════════════════════════════════════════════════════════════ */
loadPreviousRepos();    

/* ═══════════════════════════════════════════════════════════════════
   SCREEN 2: INDEXING — POLLING
════════════════════════════════════════════════════════════════════ */

function startPolling() {
    /*
    Calls the status endpoint every 2 seconds.
    Updates the progress bar and stats with each response.
    Stops when status is "ready" or "failed".
    */

    // setInterval returns an ID — save it so we can stop it later
    State.pollingInterval = setInterval(async () => {

        try {
            const data = await apiGet(`/api/repos/${State.repoId}/status`);
            updateIndexingUI(data);

            // Stop polling when done
           if (data.status === 'ready') {
    stopPolling();
    updateIndexingUI(data);   // fills bar to 100%

    // Short pause so user sees the bar hit 100% before the screen switches
    setTimeout(() => openChatScreen(data), 700);

    // Fill progress bar completely before switching screens
    const progressBar =
        document.getElementById('progress-bar-fill');

    if (progressBar) {
        progressBar.style.width = '100%';
    }

    openChatScreen(data);

} else if (data.status === 'failed') {
                stopPolling();
                showIndexingError(data.error_msg || 'Indexing failed.');
            }

        } catch (error) {

    console.error(error);

    stopPolling();

    showIndexingError(error.message);
}

    }, 2000);   // 2000ms = 2 seconds between each call
}

function stopPolling() {
    if (State.pollingInterval) {
        clearInterval(State.pollingInterval);   // stops the setInterval
        State.pollingInterval = null;
    }
}

    function updateIndexingUI(data) {
    const fillEl = document.getElementById('progress-bar-fill');
    if (!fillEl) return;   // guard against destroyed DOM

    const chunkCount = data.chunk_count || 0;
    const fileCount  = data.file_count  || 0;
    const status     = data.status;

    // Calculate progress percentage
    let progress = 0;
    if (status === 'ready') {
        progress = 100;
    } else if (fileCount > 0 && chunkCount > 0) {
        // Real progress: chunks done vs estimated total
        // ~8 chunks per file is a reasonable estimate
        const estimated = fileCount * 8;
        progress = Math.min(Math.round((chunkCount / estimated) * 100), 94);
    } else if (fileCount > 0) {
        // Files found but embedding hasn't started — show 20% to show it's alive
        progress = 20;
    } else if (status === 'indexing') {
        // Cloning in progress — show 5% so bar isn't dead
        progress = 5;
    }

    fillEl.style.width = `${progress}%`;

    // Stats text
    const statsEl = document.getElementById('indexing-stats');
    if (statsEl) {
        if (status === 'ready') {
            statsEl.textContent = `${chunkCount} chunks indexed · ${fileCount} files`;
        } else if (chunkCount > 0) {
            statsEl.textContent = `${chunkCount} chunks embedded · ${fileCount} files`;
        } else if (fileCount > 0) {
            statsEl.textContent = `${fileCount} files found, embedding now...`;
        } else if (status === 'indexing') {
            statsEl.textContent = 'Cloning repository...';
        } else {
            statsEl.textContent = 'Starting...';
        }
    }

    // Title text
    const titleEl = document.getElementById('indexing-title');
    if (titleEl) {
        if (status === 'ready') {
            titleEl.textContent = 'Done!';
        } else if (chunkCount > 0) {
            titleEl.textContent = 'Embedding code chunks...';
        } else if (fileCount > 0) {
            titleEl.textContent = 'Starting embedding...';
        } else if (status === 'indexing') {
            titleEl.textContent = 'Cloning repository...';
        } else {
            titleEl.textContent = 'Connecting...';
        }
    }

    
    // ─────────────────────────────────────────────
    // DEBUG LOG
    // ─────────────────────────────────────────────

    console.log('Polling update:', data);

}

function showIndexingError(message) {
    /*
    Replaces the indexing spinner with an error message.
    Has a retry button that takes the user back to the landing screen.
    */
   stopPolling();

    document.querySelector('.indexing-container').innerHTML = `
        <div style="text-align:center; display:flex; flex-direction:column; 
                    align-items:center; gap:16px;">
            <span style="font-size:32px;">⚠</span>
            <h2 style="color: var(--danger)">Indexing Failed</h2>
            <p style="color: var(--text-secondary)">${message}</p>
            <button class="btn btn-ghost" onclick="goBackToLanding()">
                ← Try a different repo
            </button>
        </div>
    `;
}

function goBackToLanding() {
    // Reset state and go back
    State.repoId   = null;
    State.repoName = null;
    showScreen('landing');
    loadPreviousRepos();   // refresh the previous repos list
}
/* ═══════════════════════════════════════════════════════════════════
   SCREEN 3: CHAT — SETUP
════════════════════════════════════════════════════════════════════ */

function openChatScreen(repoData) {

    /*
    Switches to the chat screen and populates the sidebar.
    */

    stopPolling();

    const repoNameEl  = document.getElementById('sidebar-repo-name');
    const repoStatsEl = document.getElementById('sidebar-repo-stats');

    if (repoNameEl) {
        repoNameEl.textContent =
            State.repoName || `${repoData.owner}/${repoData.name}`;
    }

    if (repoStatsEl) {
        repoStatsEl.textContent =
            `${repoData.chunk_count || '?'} chunks · ${repoData.file_count || '?'} files`;
    }

    showScreen('chat');

    const input = document.getElementById('chat-input');

    if (input) {
        input.focus();
    }

    console.log('Chat screen opened');
}


/* ═══════════════════════════════════════════════════════════════════
   CHAT STATE
════════════════════════════════════════════════════════════════════ */

if (!State.messages) {
    State.messages = [];
}

State.isGenerating = false;


/* ═══════════════════════════════════════════════════════════════════
   CHAT MESSAGES — rendering
════════════════════════════════════════════════════════════════════ */

function hideWelcomeMessage() {

    const welcome = document.getElementById('welcome-message');

    if (welcome) {
        welcome.style.display = 'none';
    }

}


function addUserMessage(text) {

    hideWelcomeMessage();

    const container = document.getElementById('chat-messages');

    if (!container) return;

    const div = document.createElement('div');

    div.className = 'message user';

    div.innerHTML = `
        <span class="message-label">You</span>

        <div class="message-bubble">
            ${escapeHtml(text)}
        </div>
    `;

    container.appendChild(div);

    State.messages.push({
        role: 'user',
        content: text,
        timestamp: Date.now()
    });

    scrollToBottom();

    return div;
}


function addThinkingMessage() {

    /*
    Creates unique thinking message IDs.
    Prevents collisions from multiple requests.
    */

    const container = document.getElementById('chat-messages');

    if (!container) return null;

    const div = document.createElement('div');

    const messageId = `thinking-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    div.className = 'message assistant';
    div.id        = messageId;

    div.innerHTML = `
        <span class="message-label">CodeLens</span>

        <div class="thinking">

            <div class="thinking-dots">
                <div class="thinking-dot"></div>
                <div class="thinking-dot"></div>
                <div class="thinking-dot"></div>
            </div>

            <span style="
                color: var(--text-muted);
                font-size: 12px;
            ">
                Searching codebase...
            </span>

        </div>
    `;

    container.appendChild(div);

    scrollToBottom();

    return messageId;
}


/* ═══════════════════════════════════════════════════════════════════
   SOURCE TAGS
════════════════════════════════════════════════════════════════════ */

function buildSourcesHtml(sources) {

    if (!sources || sources.length === 0) {
        return '';
    }

    const tags = sources
        .filter(s => s.file)
        .slice(0, 5)
        .map((s, index) => {

            const symbol = s.symbol
                ? ` · ${escapeHtml(s.symbol)}`
                : '';

            return `
                <button 
                    class="source-tag"
                    onclick="openSourcePreview(${index})"
                >
                    ${escapeHtml(s.file)}
                    ${symbol}
                </button>
            `;
        })
        .join('');

    return `
        <div class="message-sources">
            ${tags}
        </div>
    `;
}


/* ═══════════════════════════════════════════════════════════════════
   COPY BUTTONS FOR CODE BLOCKS
════════════════════════════════════════════════════════════════════ */

function attachCopyButtons(container) {

    const blocks = container.querySelectorAll('pre');

    blocks.forEach(pre => {

        const button = document.createElement('button');

        button.className = 'copy-code-btn';
        button.textContent = 'Copy';

        button.onclick = async () => {

            try {

                const code = pre.innerText;

                await navigator.clipboard.writeText(code);

                button.textContent = 'Copied';

                setTimeout(() => {
                    button.textContent = 'Copy';
                }, 1500);

            } catch {

                button.textContent = 'Failed';

            }

        };

        pre.style.position = 'relative';

        pre.appendChild(button);

    });

}


/* ═══════════════════════════════════════════════════════════════════
   ASSISTANT ANSWERS
════════════════════════════════════════════════════════════════════ */

function replaceThinkingWithAnswer(
    messageId,
    answer,
    sources,
    toolCallCount
) {

    const thinkingEl = document.getElementById(messageId);

    if (!thinkingEl) {
        return;
    }

    /*
    DOMPurify REQUIRED.
    Add this in index.html BEFORE app.js:

    <script src="https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js"></script>
    */

    const renderedAnswer = DOMPurify.sanitize(
        marked.parse(answer || 'No response.')
    );

    const sourcesHtml = buildSourcesHtml(sources);

    const toolInfo = toolCallCount > 0
        ? `
            <div style="
                font-size:11px;
                color: var(--text-muted);
                padding: 6px 0 0 4px;
            ">
                ↳ ${toolCallCount} additional file${toolCallCount > 1 ? 's' : ''} read
            </div>
        `
        : '';

    thinkingEl.id = '';

    thinkingEl.innerHTML = `
        <span class="message-label">CodeLens</span>

        <div class="message-bubble assistant-bubble">
            ${renderedAnswer}
        </div>

        ${sourcesHtml}

        ${toolInfo}
    `;

    thinkingEl.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });

    attachCopyButtons(thinkingEl);

    State.messages.push({
        role: 'assistant',
        content: answer,
        sources,
        timestamp: Date.now()
    });

    scrollToBottom();
}


/* ═══════════════════════════════════════════════════════════════════
   CHAT SCROLLING
════════════════════════════════════════════════════════════════════ */

function scrollToBottom() {

    const container = document.getElementById('chat-messages');

    if (!container) return;

    container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
    });

}


/* ═══════════════════════════════════════════════════════════════════
   SECURITY
════════════════════════════════════════════════════════════════════ */

function escapeHtml(text) {

    const div = document.createElement('div');

    div.textContent = text;

    return div.innerHTML;

}


/* ═══════════════════════════════════════════════════════════════════
   SEND MESSAGE
════════════════════════════════════════════════════════════════════ */

async function sendMessage(queryText) {

    /*
    Prevent spam / overlapping requests.
    */

    if (State.isGenerating) {
        return;
    }

    const inputEl = document.getElementById('chat-input');

    if (!inputEl) return;

    const text = (queryText || inputEl.value).trim();

    if (!text) return;

    State.isGenerating = true;

    const sendBtn = document.getElementById('send-btn');

    inputEl.value = '';

    inputEl.style.height = 'auto';

    if (sendBtn) {
        sendBtn.disabled = true;
    }

    addUserMessage(text);

    const thinkingId = addThinkingMessage();

    try {

        const requestBody = {
            repo_id: State.repoId,
            query:   text,
            mode:    State.mode || 'chat',
        };

        /*
        Review mode support
        */

        if (
            State.mode === 'review' &&
            State.selectedFile
        ) {
            requestBody.target_file =
                State.selectedFile;
        }

        console.log('Sending request:', requestBody);

        const data = await apiPost(
            '/api/chat',
            requestBody
        );

        console.log('API response:', data);

        replaceThinkingWithAnswer(
            thinkingId,
            data.answer,
            data.sources || [],
            data.tool_calls_made || 0
        );

    } catch (error) {

        console.error('Chat error:', error);

        let message = 'Unknown error occurred.';

        if (
            error.message.includes('Failed to fetch')
        ) {

            message =
                'Cannot connect to backend server.';

        } else if (
            error.message.includes('timeout')
        ) {

            message =
                'Request timed out.';

        } else {

            message = error.message;

        }

        replaceThinkingWithAnswer(
            thinkingId,
            `⚠️ ${message}`,
            [],
            0
        );

    } finally {

        State.isGenerating = false;

        if (sendBtn) {
            sendBtn.disabled = false;
        }

        inputEl.focus();

    }

}


/* ═══════════════════════════════════════════════════════════════════
   SOURCE PREVIEW PLACEHOLDER
════════════════════════════════════════════════════════════════════ */

function openSourcePreview(index) {

    /*
    Future feature:
    open modal/sidebar with file preview.
    */

    console.log('Open source preview:', index);

}


/* ═══════════════════════════════════════════════════════════════════
   EVENT LISTENERS
════════════════════════════════════════════════════════════════════ */

const sendBtn = document.getElementById('send-btn');

if (sendBtn) {

    sendBtn.addEventListener(
        'click',
        () => sendMessage()
    );

}


const chatInput = document.getElementById('chat-input');

if (chatInput) {

    /*
    Send on Enter
    */

    chatInput.addEventListener(
        'keydown',
        (e) => {

            if (
                e.key === 'Enter' &&
                !e.shiftKey
            ) {

                e.preventDefault();

                sendMessage();

            }

        }
    );

    /*
    Auto-resize textarea
    */

    chatInput.addEventListener(
        'input',
        function () {

            this.style.height = 'auto';

            this.style.height =
                Math.min(this.scrollHeight, 140) + 'px';

        }
    );

}


/*
Suggestion chips
*/

document
    .querySelectorAll('.suggestion-chip')
    .forEach(chip => {

        chip.addEventListener('click', () => {

            if (State.isGenerating) {
                return;
            }

            const query =
                chip.dataset.query;

            sendMessage(query);

        });

    });


/*
New repo button
*/

const newRepoBtn =
    document.getElementById('new-repo-btn');

if (newRepoBtn) {

    newRepoBtn.addEventListener(
        'click',
        goBackToLanding
    );
    document.getElementById('delete-repo-btn')
        .addEventListener('click', async () => {
            if (!State.repoId) return;
            if (!confirm(`Delete "${State.repoName}"?\n\nThis removes the index and cloned files.`)) return;

            const btn    = document.getElementById('delete-repo-btn');
            btn.textContent = '...';
            btn.disabled    = true;

            try {
                await apiDelete(`/api/repos/${State.repoId}`);
                State.repoId   = null;
                State.repoName = null;
                goBackToLanding();
            } catch (err) {
                btn.textContent = 'Delete';
                btn.disabled    = false;
                alert(`Failed to delete: ${err.message}`);
            }
        });

}
/* ═══════════════════════════════════════════════════════════════════
   MODE SWITCHING + REVIEW MODE + REPORT MODE
   FINAL STABLE VERSION
════════════════════════════════════════════════════════════════════ */

// Add these to your global State object
// (put near the top of app.js)

State.mode            = 'chat';
State.selectedFile    = null;
State.cachedReport    = null;
State.reportLoading   = false;


/* ═══════════════════════════════════════════════════════════════════
   MODE SWITCHING
════════════════════════════════════════════════════════════════════ */

function setMode(newMode) {

    // Prevent switching during report generation
    if (State.reportLoading) return;

    State.mode = newMode;

    // Update active tab UI
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.toggle(
            'active',
            tab.dataset.mode === newMode
        );
    });

    const filePickerSection = document.getElementById('file-picker-section');
    const suggestions       = document.getElementById('suggestions-section');
    const chatInputBar      = document.querySelector('.chat-input-bar');
    const input             = document.getElementById('chat-input');
    const reportControls =
    document.getElementById('report-controls');

    // Reset visibility first
    if (filePickerSection) {
    filePickerSection.classList.add('hidden');
}

if (suggestions) {
    suggestions.classList.add('hidden');
}

if (chatInputBar) {
    chatInputBar.classList.remove('hidden');
}

if (reportControls) {
    reportControls.classList.add('hidden');
}

    
    /* ─────────────────────────────────────────────
       CHAT MODE
    ───────────────────────────────────────────── */

    if (newMode === 'chat') {

        suggestions.classList.remove('hidden');

        input.placeholder =
            'Ask anything about this codebase...';

    }

    /* ─────────────────────────────────────────────
       REVIEW MODE
    ───────────────────────────────────────────── */

    else if (newMode === 'review') {

       if (filePickerSection) {
    filePickerSection.classList.remove('hidden');
}

        input.placeholder =
            'Select a file above to review it...';

        // Only load files if dropdown is empty
       

       loadFileList();

    }

    /* ─────────────────────────────────────────────
       REPORT MODE
    ───────────────────────────────────────────── */

    else if (newMode === 'report') {

    chatInputBar.classList.add('hidden');

    if (reportControls) {
        reportControls.classList.remove('hidden');
    }
}
}


/* ═══════════════════════════════════════════════════════════════════
   FILE LIST LOADER
════════════════════════════════════════════════════════════════════ */

async function loadFileList() {

    const select = document.getElementById('file-picker');

    select.innerHTML =
        '<option value="">Loading files...</option>';

    select.disabled = true;

    try {

        const data = await apiGet(
            `/api/repos/${State.repoId}/files`
        );

        const files = data.files || [];

        select.innerHTML =
            '<option value="">Select a file to review...</option>';

        files.forEach(filePath => {

            const option = document.createElement('option');

            option.value       = filePath;
            option.textContent = filePath;

            select.appendChild(option);

        });

        select.disabled = false;

    } catch (error) {

        console.error(error);

        select.innerHTML =
            '<option value="">Could not load files</option>';
    }
}


/* ═══════════════════════════════════════════════════════════════════
   FILE PICKER EVENT
════════════════════════════════════════════════════════════════════ */

document.getElementById('file-picker')
    .addEventListener('change', function () {

        State.selectedFile = this.value;

        const input = document.getElementById('chat-input');

        if (this.value) {

            input.placeholder =
                `Ask about ${this.value} or press Enter for full review`;

        } else {

            input.placeholder =
                'Select a file above to review it...';
        }
    });


/* ═══════════════════════════════════════════════════════════════════
   REPORT MODE
════════════════════════════════════════════════════════════════════ */

async function generateReport() {

    // Prevent duplicate report calls
    if (State.reportLoading) return;

    State.reportLoading = true;
   

    disableInteractiveUI();

    hideWelcomeMessage();

    const container = document.getElementById('chat-messages');
     document.querySelectorAll('.report-message')
    .forEach(el => el.remove());
    

    /* ─────────────────────────────────────────────
       USE CACHED REPORT IF AVAILABLE
    ───────────────────────────────────────────── */

    if (State.cachedReport) {

        renderReport(State.cachedReport);

        State.reportLoading = false;

        enableInteractiveUI();

        return;
    }

    /* ─────────────────────────────────────────────
       LOADING UI
    ───────────────────────────────────────────── */

    const loadingDiv = document.createElement('div');

    loadingDiv.id = 'report-loading';

    loadingDiv.className = 'message assistant';

    loadingDiv.innerHTML = `
        <div class="message-bubble">
            <div style="
                display:flex;
                flex-direction:column;
                align-items:center;
                gap:14px;
                padding:20px;
            ">
                <span class="spinner"></span>

                <div style="font-weight:600;">
                    Generating Repository Intelligence Report
                </div>

                <div style="
                    color: var(--text-secondary);
                    font-size: 14px;
                    text-align:center;
                    line-height:1.6;
                ">
                    Reading architecture, components,
                    patterns, and dependencies...
                </div>
            </div>
        </div>
    `;

    container.appendChild(loadingDiv);

    scrollToBottom();

    /* ─────────────────────────────────────────────
       API CALL
    ───────────────────────────────────────────── */

    try {

       const data = await apiPost(
    '/api/report',
    {
        repo_id: State.repoId
    }
);

        document.getElementById('report-loading')?.remove();

        // Cache the report
        State.cachedReport = data.report;

        renderReport(data.report);

    } catch (error) {

        console.error(error);

        document.getElementById('report-loading')?.remove();

        const errDiv = document.createElement('div');

        errDiv.className = 'message assistant';

        errDiv.innerHTML = `
            <div class="message-bubble" style="
                color: var(--danger);
            ">
                Failed to generate report.<br><br>
                ${error.message}
            </div>
        `;

        container.appendChild(errDiv);

        scrollToBottom();

    } finally {

        State.reportLoading = false;

        enableInteractiveUI();
    }
}


/* ═══════════════════════════════════════════════════════════════════
   REPORT RENDERER
════════════════════════════════════════════════════════════════════ */

function renderReport(reportMarkdown) {

    const container = document.getElementById('chat-messages');

    const reportDiv = document.createElement('div');

    reportDiv.className =
    'message assistant report-message';

    reportDiv.innerHTML = `
        <span class="message-label">
            Repository Intelligence Report
        </span>

        <div class="message-bubble report-bubble">
            ${marked.parse(reportMarkdown)}
        </div>
    `;

    container.appendChild(reportDiv);

    // Syntax highlighting
    reportDiv.querySelectorAll('pre code')
        .forEach(block => {
            hljs.highlightElement(block);
        });

    scrollToBottom();
}


/* ═══════════════════════════════════════════════════════════════════
   UI LOCKING
════════════════════════════════════════════════════════════════════ */

function disableInteractiveUI() {

    document.querySelectorAll('.mode-tab')
        .forEach(btn => btn.disabled = true);

    const sendBtn = document.getElementById('send-btn');

    if (sendBtn) {
        sendBtn.disabled = true;
    }
}

function enableInteractiveUI() {

    document.querySelectorAll('.mode-tab')
        .forEach(btn => btn.disabled = false);

    const sendBtn = document.getElementById('send-btn');

    if (sendBtn) {
        sendBtn.disabled = false;
    }
}


/* ═══════════════════════════════════════════════════════════════════
   REPORT BUTTON EVENT
════════════════════════════════════════════════════════════════════ */

document.getElementById('generate-report-btn')
    ?.addEventListener('click', generateReport);


/* ═══════════════════════════════════════════════════════════════════
   MODE TAB EVENTS
════════════════════════════════════════════════════════════════════ */

document.querySelectorAll('.mode-tab')
    .forEach(tab => {

        tab.addEventListener('click', () => {

            setMode(tab.dataset.mode);

        });

    });