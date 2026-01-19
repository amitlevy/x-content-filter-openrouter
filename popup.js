// Default configuration
const defaultTopicsConfig = [
    { topic: "politics", description: "posts about political subjects", threshold: 0.8, enabled: true },
    { topic: "negativity", description: "posts with overly negative sentiment", threshold: 0.9, enabled: true }
];

// Current state
let topicsConfig = [];

// DOM elements
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('status-text');
const messageEl = document.getElementById('message');
const apiKeyInput = document.getElementById('apiKey');
const topicsListEl = document.getElementById('topics-list');
const addTopicBtn = document.getElementById('add-topic-btn');
const addTopicForm = document.getElementById('add-topic-form');
const newTopicNameInput = document.getElementById('new-topic-name');
const newTopicDescInput = document.getElementById('new-topic-description');
const newTopicThresholdInput = document.getElementById('new-topic-threshold');
const cancelAddTopicBtn = document.getElementById('cancel-add-topic');
const confirmAddTopicBtn = document.getElementById('confirm-add-topic');
const saveBtn = document.getElementById('save-btn');

// Load settings from storage
async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['OPENROUTER_API_KEY', 'topicsConfig'], (result) => {
            // Set API key if present
            if (result.OPENROUTER_API_KEY) {
                apiKeyInput.value = result.OPENROUTER_API_KEY;
                updateStatus(true);
            } else {
                updateStatus(false);
            }

            // Set topics config with defaults if not present
            if (result.topicsConfig && Array.isArray(result.topicsConfig)) {
                topicsConfig = result.topicsConfig;
            } else {
                topicsConfig = JSON.parse(JSON.stringify(defaultTopicsConfig));
            }

            renderTopics();
            resolve();
        });
    });
}

// Update status indicator
function updateStatus(hasApiKey) {
    if (hasApiKey) {
        statusEl.classList.remove('inactive');
        statusEl.classList.add('active');
        statusTextEl.textContent = 'Filtering active';
    } else {
        statusEl.classList.remove('active');
        statusEl.classList.add('inactive');
        statusTextEl.textContent = 'API key required';
    }
}

// Show message
function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = 'message ' + type;
    setTimeout(() => {
        messageEl.className = 'message';
    }, 3000);
}

// Render topics list
function renderTopics() {
    topicsListEl.innerHTML = '';

    topicsConfig.forEach((topic, index) => {
        const row = document.createElement('div');
        row.className = 'topic-row';
        row.innerHTML = `
            <div class="checkbox-wrapper">
                <input type="checkbox" id="topic-enabled-${index}" ${topic.enabled ? 'checked' : ''}>
            </div>
            <div class="topic-info">
                <div class="topic-name">${escapeHtml(topic.topic)}</div>
                <div class="topic-description" title="${escapeHtml(topic.description)}">${escapeHtml(topic.description)}</div>
            </div>
            <div class="topic-controls">
                <div class="threshold-wrapper">
                    <input type="range" id="topic-threshold-${index}" min="0" max="1" step="0.1" value="${topic.threshold}">
                    <span class="threshold-value" id="topic-threshold-value-${index}">${topic.threshold.toFixed(1)}</span>
                </div>
                <button class="delete-btn" data-index="${index}" title="Delete topic">&times;</button>
            </div>
        `;
        topicsListEl.appendChild(row);

        // Add event listeners
        const checkbox = row.querySelector(`#topic-enabled-${index}`);
        checkbox.addEventListener('change', () => {
            topicsConfig[index].enabled = checkbox.checked;
        });

        const slider = row.querySelector(`#topic-threshold-${index}`);
        const valueDisplay = row.querySelector(`#topic-threshold-value-${index}`);
        slider.addEventListener('input', () => {
            const value = parseFloat(slider.value);
            topicsConfig[index].threshold = value;
            valueDisplay.textContent = value.toFixed(1);
        });

        const deleteBtn = row.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => deleteTopic(index));
    });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Delete topic
function deleteTopic(index) {
    const topic = topicsConfig[index];
    const isDefault = defaultTopicsConfig.some(dt => dt.topic === topic.topic);

    if (isDefault) {
        if (!confirm(`"${topic.topic}" is a default topic. Are you sure you want to delete it?`)) {
            return;
        }
    }

    topicsConfig.splice(index, 1);
    renderTopics();
}

// Add topic handlers
addTopicBtn.addEventListener('click', () => {
    addTopicForm.classList.add('visible');
    addTopicBtn.style.display = 'none';
    newTopicNameInput.focus();
});

cancelAddTopicBtn.addEventListener('click', () => {
    hideAddTopicForm();
});

confirmAddTopicBtn.addEventListener('click', () => {
    addNewTopic();
});

// Handle enter key in add topic form
newTopicNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') newTopicDescInput.focus();
});

newTopicDescInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') newTopicThresholdInput.focus();
});

newTopicThresholdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addNewTopic();
});

function hideAddTopicForm() {
    addTopicForm.classList.remove('visible');
    addTopicBtn.style.display = 'block';
    newTopicNameInput.value = '';
    newTopicDescInput.value = '';
    newTopicThresholdInput.value = '0.8';
}

function addNewTopic() {
    const name = newTopicNameInput.value.trim().toLowerCase();
    const description = newTopicDescInput.value.trim();
    const threshold = parseFloat(newTopicThresholdInput.value);

    // Validation
    if (!name) {
        showMessage('Topic name is required', 'error');
        newTopicNameInput.focus();
        return;
    }

    if (!description) {
        showMessage('Description is required', 'error');
        newTopicDescInput.focus();
        return;
    }

    if (isNaN(threshold) || threshold < 0 || threshold > 1) {
        showMessage('Threshold must be between 0 and 1', 'error');
        newTopicThresholdInput.focus();
        return;
    }

    // Check for duplicate
    if (topicsConfig.some(t => t.topic === name)) {
        showMessage('A topic with this name already exists', 'error');
        newTopicNameInput.focus();
        return;
    }

    // Add new topic
    topicsConfig.push({
        topic: name,
        description: description,
        threshold: threshold,
        enabled: true
    });

    renderTopics();
    hideAddTopicForm();
    showMessage('Topic added', 'success');
}

// Save settings
saveBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();

    // Validate API key format (basic check)
    if (apiKey && !apiKey.startsWith('sk-or-')) {
        showMessage('Invalid API key format. Should start with sk-or-', 'error');
        return;
    }

    // Save to storage
    await new Promise((resolve) => {
        const data = {
            topicsConfig: topicsConfig
        };

        if (apiKey) {
            data.OPENROUTER_API_KEY = apiKey;
        } else {
            // Remove API key if cleared
            chrome.storage.local.remove('OPENROUTER_API_KEY');
        }

        chrome.storage.local.set(data, resolve);
    });

    // Update status
    updateStatus(!!apiKey);

    // Update badge
    chrome.runtime.sendMessage({ type: 'updateBadge', hasApiKey: !!apiKey });

    showMessage('Settings saved!', 'success');
});

// Listen for API key input changes to update status
apiKeyInput.addEventListener('input', () => {
    const hasKey = apiKeyInput.value.trim().length > 0;
    updateStatus(hasKey);
});

// Initialize
document.addEventListener('DOMContentLoaded', loadSettings);
