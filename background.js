const API_URL = "https://api.quickrewriter.com";

chrome.runtime.onInstalled.addListener(() => {
  // Create a unique user ID on first installation for analytics
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "adapt-text" && info.selectionText) {
    // SET THE FLAG HERE, BEFORE OPENING THE PANEL
    chrome.storage.session.set({ isProcessing: true, adaptationHistory: [] });
    
    chrome.sidePanel.open({ tabId: tab.id });
    
    setTimeout(() => {
      processText(info.selectionText, 'initial');
    }, 300);
  }
});

async function sendMessageToSidePanel(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    console.warn("Could not send message to side panel.", error.message);
  }
}

async function processText(text, action) {
  // We no longer need to send the 'loading' message from here, 
  // as the side panel will handle it on its own.
  try {
    const { userId } = await chrome.storage.local.get('userId');
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    const requestBody = { 
        text, 
        action,
        userId: userId || null,
        url: tab ? tab.url : null
    };
    const sessionData = await chrome.storage.session.get(['currentLexile']);
    
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
    
    const historyResult = await chrome.storage.session.get(['adaptationHistory']);
    let history = historyResult.adaptationHistory || [];

    if (action === 'initial') {
        history = [{ content: `<p>${text}</p>`, lexile: 1200 }];
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
    let friendlyMessage = error.message;
    if (error.message.includes("413")) {
        friendlyMessage = "Too much text! Please start with a smaller selection.";
    }
    await sendMessageToSidePanel({ type: 'error', message: friendlyMessage });
  }
}

async function processVocab(text, currentLexile) {
    await sendMessageToSidePanel({ type: 'loading' });
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
                        currentLexile: prevState.lexile
                    }, () => {
                        sendMessageToSidePanel({
                            type: 'result',
                            content: prevState.content,
                            dictionary: {}, // Undo clears dictionary words
                            atMinimum: false,
                            historyCount: history.length
                        });
                    });
                }
            });
        } else { // Handles "Simpler"
            chrome.storage.session.get('originalText', (result) => {
                if (result.originalText) {
                    processText(result.originalText, 'simpler');
                }
            });
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
