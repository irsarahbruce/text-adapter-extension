// sidepanel.js (Final version to render HTML)

const loadingIndicator = document.getElementById('loading');
const contentDisplay = document.getElementById('content-display');
const adaptedTextElement = document.getElementById('adapted-text');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const levelDownButton = document.getElementById('level-down');
const levelUpButton = document.getElementById('level-up');
const copyButton = document.getElementById('copy-text');

function showState(state, data = {}) {
    loadingIndicator.classList.add('hidden');
    contentDisplay.classList.add('hidden');
    errorMessage.classList.add('hidden');
    
    levelDownButton.disabled = true;
    levelUpButton.disabled = true;
    copyButton.disabled = true;

    if (state === 'loading') {
        loadingIndicator.classList.remove('hidden');
    } else if (state === 'error') {
        errorText.textContent = data.message;
        errorMessage.classList.remove('hidden');
    } else if (state === 'result') {
        contentDisplay.classList.remove('hidden');
        levelDownButton.disabled = false;
        levelUpButton.disabled = false;
        copyButton.disabled = false;

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
        // --- THIS IS THE KEY CHANGE ---
        // Use .innerHTML to render the formatted text instead of .textContent
        adaptedTextElement.innerHTML = message.content;
        showState('result', message);
    }
});

levelDownButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'adapt-text', action: 'simpler' });
});

levelUpButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'adapt-text', action: 'detailed' });
});

copyButton.addEventListener('click', () => {
    // .textContent will copy the clean text without the HTML tags, which is ideal.
    const textToCopy = adaptedTextElement.textContent;
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        copyButton.classList.remove('bg-blue-500', 'hover:bg-blue-600');
        copyButton.classList.add('bg-green-500');
        setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.classList.remove('bg-green-500');
            copyButton.classList.add('bg-blue-500', 'hover:bg-blue-600');
        }, 2000);
    }).catch(err => console.error('Failed to copy text: ', err));
});

// Set an initial state by setting the innerHTML of the adapted text element.
adaptedTextElement.innerHTML = '<p>Select some text on a page, right-click, and choose "Adapt Text with AI" to get started.</p>';
