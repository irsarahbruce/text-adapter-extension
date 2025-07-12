/* ======================================================================= */
/* FILE: background.js                                                     */
/* This is the complete and final corrected version.                       */
/* ======================================================================= */

const API_URL = "https://monkfish-app-wbxiw.ondigitalocean.app/adapt";

// 1. Create the Context Menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "adapt-text",
    title: "Adapt Text with AI",
    contexts: ["selection"],
  });
});

// 2. Listen for a click on our Context Menu item
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "adapt-text" && info.selectionText) {
    processText(info.selectionText, 'initial', tab.id);
  }
});

// 3. Main function to process text
async function processText(text, action, tabId) {
  // Only open the side panel on the initial request.
  if (action === 'initial') {
    await chrome.sidePanel.open({ tabId });
  }
  
  // Send a "loading" message to the side panel immediately
  chrome.runtime.sendMessage({ type: 'loading' });

  try {
    const requestBody = {
      text: text,
      action: action,
    };
    
    if (action !== 'initial') {
        const data = await chrome.storage.session.get(['currentLexile']);
        requestBody.currentLexile = data.currentLexile;
    }

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    await chrome.storage.session.set({ 
        originalText: text, 
        currentLexile: data.currentLexile 
    });

    chrome.runtime.sendMessage({ type: 'result', content: data.adaptedText });

  } catch (error) {
    console.error("Error calling API:", error);
    chrome.runtime.sendMessage({ type: 'error', message: error.message });
  }
}

// 4. Listen for messages from the side panel (e.g., when a button is clicked)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'adapt-text') {
        chrome.storage.session.get(['originalText'], async (result) => {
            if (result.originalText) {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) {
                    processText(result.originalText, message.action, tab.id);
                }
            }
        });
        return true; 
    }
});
