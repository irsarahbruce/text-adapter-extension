const API_URL = "https://monkfish-app-wbxiw.ondigitalocean.app";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Background script loaded");
  chrome.contextMenus.create({
    id: "adapt-text",
    title: "Adapt Text with AI",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "adapt-text" && info.selectionText) {
    // Clear any previous history
    chrome.storage.session.set({ adaptationHistory: [] });
    
    // Open the sidepanel first
    chrome.sidePanel.open({ tabId: tab.id });
    
    // Process the text with a slight delay to ensure the sidepanel is open
    setTimeout(() => {
      processText(info.selectionText, 'simpler', tab.id);
    }, 300);
  }
});

async function processText(text, action, tabId) {
  console.log("Processing text:", action);
  
  chrome.runtime.sendMessage({ type: 'loading' });

  try {
    const requestBody = { text, action };
    const sessionData = await chrome.storage.session.get(['currentLexile', 'adaptationHistory']);
    const history = sessionData.adaptationHistory || [];

    if (action !== 'initial') {
        requestBody.currentLexile = sessionData.currentLexile;
    }

    const response = await fetch(`${API_URL}/adapt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Raw API response:", data);

    // This is your original error text cleaning logic
    if (data.adaptedText) {
      let adaptedText = data.adaptedText.toString();
      adaptedText = adaptedText.replace(/Error:\s*Here is the summary of the text in simple, easy-to-scan HTML format:/gi, "");
      adaptedText = adaptedText.replace(/<p>\s*Error:/gi, "<p>");
      adaptedText = adaptedText.replace(/^Error:/gi, "");
      adaptedText = adaptedText.replace(/<([^>]+)>\s*Error:/gi, "<$1>");
      adaptedText = adaptedText.replace(/Error:/gi, "");
      data.adaptedText = adaptedText;
    }

    // Add the new result to the history
    if (action !== 'initial') {
        history.push({ content: data.adaptedText, lexile: data.currentLexile });
    } else {
        history.push({ content: `<p>${text}</p>`, lexile: data.currentLexile });
        history.push({ content: data.adaptedText, lexile: data.currentLexile });
    }

    chrome.runtime.sendMessage({ 
        type: 'result', 
        content: data.adaptedText,
        dictionary: data.dictionary, // Pass dictionary if available
        atMinimum: data.atMinimum,
        historyCount: history.length
    });

    await chrome.storage.session.set({ 
        originalText: text, 
        currentLexile: data.currentLexile,
        adaptationHistory: history
    });

  } catch (error) {
    console.error("Error during extension workflow:", error);
    chrome.runtime.sendMessage({ type: 'error', message: error.message });
  }
}

// This is the new function for handling vocab requests
async function processVocab(text) {
    try {
        chrome.runtime.sendMessage({ type: 'loading' });
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

// This is the updated message listener that handles all actions
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
        } else { // Handles "Simpler"
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
