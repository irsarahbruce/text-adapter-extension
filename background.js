console.log("Background script loaded");

const API_URL = "https://monkfish-app-wbxiw.ondigitalocean.app/adapt";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "adapt-text",
    title: "Adapt Text with AI",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "adapt-text" && info.selectionText) {
    // Clear any previous history and start fresh
    chrome.storage.session.set({ adaptationHistory: [] });
    processText(info.selectionText, 'initial', tab.id);
  }
});

async function processText(text, action, tabId) {
  if (action === 'initial') {
   await chrome.sidePanel.open({ tabId });

  }
  
  chrome.runtime.sendMessage({ type: 'loading' });

  try {
    const requestBody = { text, action };
    const sessionData = await chrome.storage.session.get(['currentLexile', 'adaptationHistory']);
    const history = sessionData.adaptationHistory || [];

    if (action !== 'initial') {
        requestBody.currentLexile = sessionData.currentLexile;
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Add the new result to the history
   if (data.adaptedText && data.adaptedText.includes("Error:")) {
  data.adaptedText = data.adaptedText.replace(/^<p>Error:\s*/i, "<p>");
}
    if (action !== 'initial') {
        history.push({ content: data.adaptedText, lexile: data.currentLexile });
    } else {
        // For initial, history starts with original text and the new result
        history.push({ content: `<p>${text}</p>`, lexile: data.currentLexile });
        history.push({ content: data.adaptedText, lexile: data.currentLexile });
    }

    chrome.runtime.sendMessage({ 
        type: 'result', 
        content: data.adaptedText,
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'adapt-text' && message.action === 'undo') {
        // Handle Undo action
        chrome.storage.session.get(['adaptationHistory', 'originalText'], (result) => {
            let history = result.adaptationHistory || [];
            if (history.length > 1) {
                history.pop(); // Remove the current state
                const prevState = history[history.length - 1]; // Get the previous state
                chrome.storage.session.set({
                    adaptationHistory: history,
                    currentLexile: prevState.lexile
                }, () => {
                    chrome.runtime.sendMessage({
                        type: 'result',
                        content: prevState.content,
                        atMinimum: false, // It can't be at minimum if we just undid
                        historyCount: history.length
                    });
                });
            }
        });

    } else if (message.type === 'adapt-text') {
        // Handle "Simpler" action
        chrome.storage.session.get(['originalText'], async (result) => {
            if (result.originalText) {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) {
                    processText(result.originalText, message.action, tab.id);
                }
            }
        });
    }
    return true; 
});
