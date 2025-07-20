const API_URL = "https://monkfish-app-wbxiw.ondigitalocean.app/adapt";

// Store pending text to process when sidepanel is ready
let pendingTextToProcess = null;
let pendingAction = null;
let pendingTabId = null;

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
    // Store the text we need to process
    pendingTextToProcess = info.selectionText;
    pendingAction = 'initial';
    pendingTabId = tab.id;
    
    // Clear previous history
    chrome.storage.session.set({ adaptationHistory: [] });
    
    // Open the side panel immediately
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Listen for sidepanel ready signal
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message:", message.type);
    
    if (message.type === 'sidepanel-ready') {
        console.log("Sidepanel is ready, processing pending text:", pendingTextToProcess);
        // Process any pending text when sidepanel signals it's ready
        if (pendingTextToProcess) {
            processText(pendingTextToProcess, pendingAction, pendingTabId);
            pendingTextToProcess = null;
            pendingAction = null;
            pendingTabId = null;
        }
    } else if (message.type === 'adapt-text' && message.action === 'undo') {
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

async function processText(text, action, tabId) {
  console.log("Processing text:", action);
  
  try {
    // Send loading state to sidepanel
    chrome.runtime.sendMessage({ type: 'loading' })
      .catch(err => console.log("Sending loading message failed, sidepanel might not be ready yet"));

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
    console.log("Raw API response:", data);
    console.log("Adapted text before cleaning:", data.adaptedText);

    // Improved error text cleaning
    if (data.adaptedText) {
      // Convert to string in case it's not already
      let adaptedText = data.adaptedText.toString();
      
      // Remove any occurrence of "Error:" at the beginning of the text or after HTML tags
      adaptedText = adaptedText.replace(/<p>\s*Error:/gi, "<p>");
      adaptedText = adaptedText.replace(/^Error:/i, "");
      adaptedText = adaptedText.replace(/<([^>]+)>\s*Error:/gi, "<$1>");
      
      // Also try removing it if it appears with any capitalization
      adaptedText = adaptedText.replace(/<p>\s*ERROR:/gi, "<p>");
      adaptedText = adaptedText.replace(/^ERROR:/i, "");
      
      data.adaptedText = adaptedText;
    }
    
    console.log("Adapted text after cleaning:", data.adaptedText);

    // Add the new result to the history
    if (action !== 'initial') {
        history.push({ content: data.adaptedText, lexile: data.currentLexile });
    } else {
        // For initial, history starts with original text and the new result
        history.push({ content: `<p>${text}</p>`, lexile: data.currentLexile });
        history.push({ content: data.adaptedText, lexile: data.currentLexile });
    }

    // Try sending the message, catch and log any errors
    try {
      await chrome.runtime.sendMessage({ 
          type: 'result', 
          content: data.adaptedText,
          atMinimum: data.atMinimum,
          historyCount: history.length
      });
    } catch (error) {
      console.error("Failed to send result message to sidepanel:", error);
    }

    await chrome.storage.session.set({ 
        originalText: text, 
        currentLexile: data.currentLexile,
        adaptationHistory: history
    });

  } catch (error) {
    console.error("Error during extension workflow:", error);
    chrome.runtime.sendMessage({ type: 'error', message: error.message })
      .catch(err => console.error("Failed to send error message to sidepanel"));
  }
}
