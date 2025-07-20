// In background.js

// ... (keep your existing API_URL constant and contextMenus listeners) ...

// --- Your existing processText function can remain unchanged ---
async function processText(text, action, tabId) {
    // ... (no changes needed here)
}

// --- ADD THIS NEW FUNCTION for handling vocab requests ---
async function processVocab(text) {
    try {
        const response = await fetch(`${API_URL}/vocab`, { // Note the new /vocab endpoint
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json(); // Expects { dictionary: { ... } }

        // Send just the dictionary back to the side panel
        chrome.runtime.sendMessage({
            type: 'vocab-result',
            dictionary: data.dictionary
        });

    } catch (error) {
        console.error("Error during vocab processing:", error);
        chrome.runtime.sendMessage({ type: 'error', message: error.message });
    }
}


// --- REPLACE your existing onMessage listener with this new version ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'adapt-text') {
        if (message.action === 'undo') {
            chrome.storage.session.get(['adaptationHistory'], (result) => {
                let history = result.adaptationHistory || [];
                if (history.length > 1) {
                    history.pop();
                    const prevState = history[history.length - 1];
                    chrome.storage.session.set({
                        adaptationHistory: history,
                        currentLexile: prevState.lexile
                    }, () => {
                        chrome.runtime.sendMessage({
                            type: 'result',
                            content: prevState.content,
                            atMinimum: false,
                            historyCount: history.length
                        });
                    });
                }
            });
        } else {
            chrome.storage.session.get(['originalText'], async (result) => {
                if (result.originalText) {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (tab) {
                        processText(result.originalText, message.action, tab.id);
                    }
                }
            });
        }
    } else if (message.type === 'get-vocab') {
        // When the vocab button is clicked, call the new function
        processVocab(message.text);
    }
    return true; 
});
