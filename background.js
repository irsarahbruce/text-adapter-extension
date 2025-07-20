const API_URL = "https://monkfish-app-wbxiw.ondigitalocean.app";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "adapt-text",
    title: "Adapt Text with AI",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "adapt-text" && info.selectionText) {
    chrome.storage.session.set({ adaptationHistory: [] });
    chrome.sidePanel.open({ tabId: tab.id });
    setTimeout(() => {
      processText(info.selectionText, 'initial', tab.id);
    }, 300);
  }
});

// A more robust way to send messages to the side panel
async function sendMessageToSidePanel(message, retries = 3) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (retries > 0 && error.message.includes("Receiving end does not exist")) {
      console.log("Side panel not ready, retrying...");
      setTimeout(() => sendMessageToSidePanel(message, retries - 1), 100);
    } else {
      console.error("Failed to send message to side panel:", error);
    }
  }
}

async function processText(text, action, tabId) {
  console.log("Processing text:", action);
  await sendMessageToSidePanel({ type: 'loading' });

  try {
    const requestBody = { text, action };
    const sessionData = await chrome.storage.session.get(['currentLexile', 'adaptationHistory']);
    let history = sessionData.adaptationHistory || [];
    
    if (action !== 'initial') {
      requestBody.currentLexile = sessionData.currentLexile;
    } else {
      // For the very first request, we don't have a lexile score yet.
      // The API will handle this with a default.
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

    if (data.adaptedText && typeof data.adaptedText === 'string') {
        data.adaptedText = data.adaptedText.replace(/Error:/gi, "").trim();
    }

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

async function processVocab(text) {
    await sendMessageToSidePanel({ type: 'loading' });
    try {
        const response = await fetch(`${API_URL}/vocab`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

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
                            atMinimum: false,
                            historyCount: history.length
                        });
                    });
                }
            });
        } else {
            chrome.storage.session.get(['originalText', 'currentLexile'], async (result) => {
                if (result.originalText) {
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    processText(result.originalText, message.action, tab.id);
                }
            });
        }
    } else if (message.type === 'get-vocab') {
        processVocab(message.text);
    }
    return true;
});
