// Background service worker for X Content Filter

// Update badge based on API key status
function updateBadge(hasApiKey) {
    if (hasApiKey) {
        chrome.action.setBadgeText({ text: '' });
    } else {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#f4212e' });
    }
}

// Check API key status on startup
chrome.runtime.onStartup.addListener(() => {
    checkApiKeyStatus();
});

// Check API key status when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
    checkApiKeyStatus();
});

// Check API key and update badge
function checkApiKeyStatus() {
    chrome.storage.local.get(['OPENROUTER_API_KEY'], (result) => {
        updateBadge(!!result.OPENROUTER_API_KEY);
    });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'updateBadge') {
        updateBadge(message.hasApiKey);
    }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.OPENROUTER_API_KEY) {
        updateBadge(!!changes.OPENROUTER_API_KEY.newValue);
    }
});

// Initial check
checkApiKeyStatus();
