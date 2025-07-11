/* ======================================================================= */
/* FILE: background.js                                                     */
/* This version has the API_URL definitively corrected.                    */
/* ======================================================================= */

// **FINALLY AND TRULY FIXED:** The URL is now a proper JavaScript string.
const API_URL = "https://monkfish-app-wbxiw.ondigitalocean.app/adapt"; 

// 1. Create the Context Menu
// This menu item will only appear when the user has selected text.
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
    // When clicked, call the function to process the selected text
    processText(info.selectionText, 'initial', tab.id);
  }
});

// 3. Main function to process text
async function processText(text, action, tabId) {
  // First, open the side panel to show the user something is happening
  await chrome.sidePanel.open({ tabId });
  
  // Send a "loading" message to the side panel immediately
  chrome.runtime.sendMessage({ type: 'loading' });

  try {
    // Prepare the data to send to our API
    const requestBody = {
      text: text,
      action: action,
    };
    
    // If the action is not 'initial', it means we are adjusting the level.
    // We need to retrieve the current lexile score we saved earlier.
    if (action !== 'initial') {
        const data = await chrome.storage.session.get(['currentLexile']);
        requestBody.currentLexile = data.currentLexile;
    }

    // Make the API call
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

    // Save the original text and the new lexile score in session storage
    // so we can use it for the "Simpler" / "More Detailed" buttons later.
    await chrome.storage.session.set({ 
        originalText: text, 
        currentLexile: data.currentLexile 
    });

    // Send the successful result to the side panel
    chrome.runtime.sendMessage({ type: 'result', content: data.adaptedText });

  } catch (error) {
    console.error("Error calling API:", error);
    // Send an error message to the side panel
    chrome.runtime.sendMessage({ type: 'error', message: error.message });
  }
}

// 4. Listen for messages from the side panel (e.g., when a button is clicked)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Check if the message is a request to adapt the text further
    if (message.type === 'adapt-text') {
        // Retrieve the original text we saved
        chrome.storage.session.get(['originalText'], (result) => {
            if (result.originalText) {
                // Call the main processing function again with the new action
                processText(result.originalText, message.action, sender.tab.id);
            }
        });
    }
});
