
const loadingIndicator = document.getElementById('loading');
const contentDisplay = document.getElementById('content-display');
const adaptedTextElement = document.getElementById('adapted-text');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const levelDownButton = document.getElementById('level-down');
const levelUpButton = document.getElementById('level-up');
const copyButton = document.getElementById('copy-text');

// Function to manage UI states (loading, error, result)
function showState(state, message = '') {
    loadingIndicator.classList.add('hidden');
    contentDisplay.classList.add('hidden');
    errorMessage.classList.add('hidden');
    
    levelDownButton.disabled = true;
    levelUpButton.disabled = true;
    copyButton.disabled = true;

    if (state === 'loading') {
        loadingIndicator.classList.remove('hidden');
    } else if (state === 'error') {
        errorText.textContent = message;
        errorMessage.classList.remove('hidden');
    } else if (state === 'result') {
        contentDisplay.classList.remove('hidden');
        levelDownButton.disabled = false;
        levelUpButton.disabled = false;
        copyButton.disabled = false;
    }
}

// 1. Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'loading') {
        showState('loading');
    } else if (message.type === 'error') {
        showState('error', message.message);
    } else if (message.type === 'result') {
        adaptedTextElement.textContent = message.content;
        showState('result');
    }
});

// 2. Add event listeners for the buttons
levelDownButton.addEventListener('click', () => {
    // When clicked, send a message to the background script to get a simpler version
    chrome.runtime.sendMessage({ type: 'adapt-text', action: 'simpler' });
});

levelUpButton.addEventListener('click', () => {
    // Send a message to get a more detailed version
    chrome.runtime.sendMessage({ type: 'adapt-text', action: 'detailed' });
});

copyButton.addEventListener('click', () => {
    const textToCopy = adaptedTextElement.textContent;
    
    // Use the Clipboard API to copy text
    navigator.clipboard.writeText(textToCopy).then(() => {
        // Provide visual feedback to the user
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        copyButton.classList.remove('bg-blue-500', 'hover:bg-blue-600');
        copyButton.classList.add('bg-green-500');
        setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.classList.remove('bg-green-500');
            copyButton.classList.add('bg-blue-500', 'hover:bg-blue-600');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        // Fallback for older browsers or if permissions fail
        // This is less reliable in extensions but good to have.
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Fallback copy failed', err);
        }
        document.body.removeChild(textArea);
    });
});

// Set an initial state
adaptedTextElement.textContent = 'Select some text on a page, right-click, and choose "Adapt Text with AI" to get started.';

