// background.js

const API_URL = "https://api.quickrewriter.com";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('userId', (result) => {
    if (!result.userId) {
      const newUserId = self.crypto.randomUUID();
      chrome.storage.local.set({ userId: newUserId });
    }
  });

  chrome.contextMenus.create({
    id: "adapt-text",
    title: "Rewrite with QuickRewriter",
    contexts: ["selection"],
  });
});

async function reportSessionEnd(userId, finalLexile) {
    if (!userId || !finalLexile) return;
    
    fetch(`${API_URL}/session-end`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, finalLexile }),
    }).catch(err => console.error("Failed to report session end:", err));
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "adapt-text" && info.selectionText) {
    
    // --- Immediate Actions ---
    chrome.storage.session.set({ isProcessing: true, adaptationHistory: [] });
    chrome.sidePanel.open({ tabId: tab.id });

    // --- Delayed Actions ---
    setTimeout(() => {
      // CORRECTED: Call the renamed function for the initial processing
      processInitialText(info.selectionText, 'initial');
    }, 300);

    const handlePreferenceUpdate = async () => {
      const { userId } = await chrome.storage.local.get('userId');
      const { currentLexile } = await chrome.storage.session.get('currentLexile');
      
      if (userId && currentLexile) {
          reportSessionEnd(userId, currentLexile);
      }
    };
    
    handlePreferenceUpdate();
  }
});

async function sendMessageToSidePanel(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    console.warn("Could not send message to side panel.", error.message);
  }
}

// Renamed function for the first adaptation
async function processInitialText(text, action) {
  try {
    const { userId } = await chrome.storage.local.get('userId');
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    // For the initial action, the body uses 'text', not 'originalText'
    const requestBody = { 
        text, 
        action: 'initial', // Hardcode to initial for this function
        userId: userId || null,
        url: tab ? tab.url : null
    };
    
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
    
    // Initialize history with the original text and its calculated lexile from the API
    const history = [
        { content: `<p>${text}</p>`, lexile: data.originalLexile },
        { content: data.adaptedText, lexile: data.currentLexile }
    ];

    await sendMessageToSidePanel({ 
        type: 'result', 
        content: data.adaptedText,
        dictionary: data.dictionary || {},
        atMinimum: data.atMinimum,
        historyCount: history.length
    });

    // Set all necessary session data for subsequent "simpler" clicks
    await chrome.storage.session.set({ 
        originalText: data.originalText, // Store the original text returned by the API
        currentLexile: data.currentLexile,
        adaptationHistory: history
    });

  } catch (error) {
    let friendlyMessage = error.message;
    if (error.message.includes("413")) {
        friendlyMessage = "Too much text! Please start with a smaller selection.";
    }
    await sendMessageToSidePanel({ type: 'error', message: friendlyMessage });
  }
}

// New function for subsequent "Simpler" clicks
async function processSimpler(originalText, currentLexile) {
    try {
        const { userId } = await chrome.storage.local.get('userId');
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

        const requestBody = {
            action: 'simplify', // Correct action for subsequent simplifications
            originalText,
            currentLexile,
            userId: userId || null,
            url: tab ? tab.url : null
        };

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
        
        const historyResult = await chrome.storage.session.get(['adaptationHistory']);
        let history = historyResult.adaptationHistory || [];
        history.push({ content: data.adaptedText, lexile: data.currentLexile });

        await sendMessageToSidePanel({ 
            type: 'result', 
            content: data.adaptedText,
            atMinimum: data.atMinimum,
            historyCount: history.length
        });
        
        await chrome.storage.session.set({
            currentLexile: data.currentLexile,
            adaptationHistory: history,
            originalText: data.originalText
        });

    } catch (error) {
        await sendMessageToSidePanel({ type: 'error', message: error.message });
    }
}

async function processVocab(text, currentLexile) {
    try {
        const { userId } = await chrome.storage.local.get('userId');
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

        const requestBody = {
            text,
            currentLexile,
            userId: userId || null,
            url: tab ? tab.url : null
        };

        const response = await fetch(`${API_URL}/vocab`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
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
    if (message.type === 'adapt-text') {
        if (message.action === 'undo') {
            chrome.storage.session.get(['adaptationHistory'], (result) => {
                let history = result.adaptationHistory || [];
                if (history.length > 1) {
                    history.pop();
                    const prevState = history[history.length - 1];
                    chrome.storage.session.set({
                        adaptationHistory: history,
                        currentLexile: prevState.lexile,
                        originalText: history[0].content.replace(/<p>|<\/p>/g, '')
                    }, () => {
                        sendMessageToSidePanel({
                            type: 'result',
                            content: prevState.content,
                            dictionary: {},
                            atMinimum: false,
                            historyCount: history.length
                        });
                    });
                }
            });
        } else { // Handles "Simpler"
            if (message.originalText && message.currentLexile) {
                processSimpler(message.originalText, message.currentLexile);
            }
        }
    } else if (message.type === 'get-vocab') {
        chrome.storage.session.get(['currentLexile'], (result) => {
            if (result.currentLexile) {
                processVocab(message.text, result.currentLexile);
            } else {
                processVocab(message.text, 1000); 
            }
        });
    }
    return true;
});
