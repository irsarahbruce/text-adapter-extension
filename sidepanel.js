const loadingIndicator = document.getElementById('loading');
const contentDisplay = document.getElementById('content-display');
const adaptedTextElement = document.getElementById('adapted-text');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const levelDownButton = document.getElementById('level-down');
const undoButton = document.getElementById('undo-button'); // Changed from levelUpButton
const copyButton = document.getElementById('copy-text');

function showState(state, data = {}) {
    loadingIndicator.classList.add('hidden');
    contentDisplay.classList.add('hidden');
    errorMessage.classList.add('hidden');
    
    levelDownButton.disabled = true;
    undoButton.disabled = true; // Changed from levelUpButton
    copyButton.disabled = true;

    if (state === 'loading') {
        loadingIndicator.classList.remove('hidden');
    } else if (state === 'error') {
        errorText.textContent = data.message;
        errorMessage.classList.remove('hidden');
    } else if (state === 'result') {
        contentDisplay.classList.remove('hidden');
        levelDownButton.disabled = false;
        copyButton.disabled = false;
        
        // Enable Undo button only if there's a history to undo to
        if (data.historyCount > 1) {
            undoButton.disabled = false;
        }

        if (data.atMinimum) {
            levelDownButton.disabled = true;
            levelDownButton.textContent = 'Simplest';
        } else {
            levelDownButton.textContent = 'Simpler';
        }
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'loading') {
        showState('loading');
    } else if (message.type === 'error') {
        showState('error', { message: message.message });
    } else if (message.type === 'result') {
        adaptedTextElement.innerHTML = message.content;
        showState('result', message);
    }
});

levelDownButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'adapt-text', action: 'simpler' });
});

// Changed listener to the Undo button
undoButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'adapt-text', action: 'undo' });
});

copyButton.addEventListener('click', () => {
    const textToCopy = adaptedTextElement.textContent;
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        setTimeout(() => { copyButton.textContent = originalText; }, 2000);
    }).catch(err => console.error('Failed to copy text: ', err));
});

adaptedTextElement.innerHTML = '<p>Select some text on a page, right-click, and choose "Adapt Text with AI" to get started.</p>';
