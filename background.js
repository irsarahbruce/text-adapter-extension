const API_URL = "https://monkfish-app-wbxiw.ondigitalocean.app";
let lastActionData = null; // Store data until the side panel is ready

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "adapt-text",
    title: "Rewrite with QuickRewriter",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "adapt-text" && info.selectionText) {
    chrome.storage.session.set({ adaptationHistory: [] });
    chrome.sidePanel.open({ tabId: tab.id });
    lastActionData = { type: 'process-initial-text', text: info.selectionText, tabId: tab.id };
  }
});

async function sendMessageToSidePanel(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    console.warn("Side panel is not open or ready. Message not sent.", error);
  }
}

async function processText(text, action, tabId) {
  await sendMessageToSidePanel({ type: 'loading' });

  try {
    const requestBody = { text, action };
    const sessionData = await chrome.storage.session.get(['currentLexile']);
    
    if (action !== 'initial') {
      requestBody.currentLexile = sessionData.currentLexile;
    }

    const response = await fetch(`${API_URL}/adapt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    console.log("Raw API response:", data);
    
    const historyResult = await chrome.storage.session.get(['adaptationHistory']);
    let history = historyResult.adaptationHistory || [];

    if (action === 'initial') {
        history = [{ content: `<p>${text}</p>`, lexile: data.currentLexile }];
    }
    history.push({ content: data.adaptedText, lexile: data.currentLexile });

    await sendMessageToSidePanel({ 
        type: 'result', 
        content: data.adaptedText,
        dictionary: data.dictionary,
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
    await sendMessageToSidePanel({ type: 'error', message: error.message });
  }
}

async function processVocab(text, currentLexile) {
    await sendMessageToSidePanel({ type: 'loading' });
    try {
        const response = await fetch(`${API_URL}/vocab`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, currentLexile }), // Pass the lexile score
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        await sendMessageToSidePanel({
            type: 'vocab-result',
            dictionary: data.dictionary
        });
    } catch (error) {
        console.error("Error during vocab processing:", error);
        await sendMessageToSidePanel({ type: 'error', message: error.message });
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'sidepanel-ready' && lastActionData) {
        if (lastActionData.type === 'process-initial-text') {
            processText(lastActionData.text, 'initial', lastActionData.tabId);
            lastActionData = null;
        }
    } else if (message.type === 'adapt-text') {
        if (message.action === 'undo') {
            // ... (undo logic remains the same)
        } else {
            chrome.storage.session.get(['originalText'], (result) => {
                if (result.originalText) {
                    processText(result.originalText, 'simpler');
                }
            });
        }
    } else if (message.type === 'get-vocab') {
        // Get the currentLexile from storage and pass it to processVocab
        chrome.storage.session.get(['currentLexile'], (result) => {
            if (result.currentLexile) {
                processVocab(message.text, result.currentLexile);
            } else {
                // Fallback if lexile isn't found for some reason
                processVocab(message.text, 1000); 
            }
        });
    }
    return true;
});
