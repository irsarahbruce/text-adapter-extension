document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('tooltip').classList.add('hidden');
});

const loadingIndicator = document.getElementById('loading');
const contentDisplay = document.getElementById('content-display');
const adaptedTextElement = document.getElementById('adapted-text');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const levelDownButton = document.getElementById('level-down');
const undoButton = document.getElementById('undo-button');
const copyButton = document.getElementById('copy-text');
const vocabButton = document.getElementById('vocab-button');
const tooltip = document.getElementById('tooltip');

function applyDictionary(text, dictionary) {
    if (!dictionary || Object.keys(dictionary).length === 0) return text;
    const cleanText = text.replace(/<span class="definable-word"[^>]*>(.*?)<\/span>/gi, '$1');
    const sortedWords = Object.keys(dictionary).sort((a, b) => b.length - a.length);
    let newText = cleanText;
    for (const word of sortedWords) {
        const regex = new RegExp(`\\b(${word})\\b(?![^<]*?>)`, 'gi');
        const definition = dictionary[word];
        newText = newText.replace(regex, `<span class="definable-word" data-definition="${definition}">$1</span>`);
    }
    return newText;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Hide everything first for a clean state
    loadingIndicator.classList.add('hidden');
    contentDisplay.classList.add('hidden');
    errorMessage.classList.add('hidden');
    tooltip.classList.add('hidden');

    if (message.type === 'loading') {
        contentDisplay.classList.remove('hidden'); 
        loadingIndicator.classList.remove('hidden');
        adaptedTextElement.innerHTML = '<p>Please wait...</p>';
    } else if (message.type === 'error') {
        errorText.innerHTML = `<strong class="font-bold">Error:</strong> ${message.message}`;
        errorMessage.classList.remove('hidden');
    } else if (message.type === 'result' || message.type === 'vocab-result') {
        contentDisplay.classList.remove('hidden');

        if (message.type === 'result') {
            const textWithDefinitions = applyDictionary(message.content, message.dictionary);
            adaptedTextElement.innerHTML = textWithDefinitions;
        } else { // vocab-result
            const textWithDefinitions = applyDictionary(adaptedTextElement.innerHTML, message.dictionary);
            adaptedTextElement.innerHTML = textWithDefinitions;
            vocabButton.disabled = true;
        }
        
        // --- This is the corrected button logic ---
        copyButton.disabled = false;
        vocabButton.disabled = vocabButton.disabled || false; // Keep it disabled if it was just used
        
        if (message.historyCount > 1) {
            undoButton.disabled = false;
        } else {
            undoButton.disabled = true;
        }

        if (message.atMinimum) {
            levelDownButton.disabled = true;
            levelDownButton.textContent = 'Simplest';
        } else {
            levelDownButton.disabled = false;
            levelDownButton.textContent = 'Simpler';
        }
    }
});

// --- (All button and tooltip event listeners remain the same) ---

vocabButton.addEventListener('click', () => {
    const currentText = adaptedTextElement.innerHTML;
    chrome.runtime.sendMessage({ type: 'get-vocab', text: currentText });
});

levelDownButton.addEventListener('click', () => {
    chrome.storage.session.get('originalText', (result) => {
        if (result.originalText) {
            chrome.runtime.sendMessage({ type: 'adapt-text', action: 'simpler' });
        }
    });
});

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

adaptedTextElement.addEventListener('mouseover', (event) => {
    if (event.target.classList.contains('definable-word')) {
        const word = event.target.textContent;
        const definition = event.target.getAttribute('data-definition');
        tooltip.innerHTML = `<strong class="font-bold">${word}:</strong> ${definition}`;
        const mainContentArea = document.querySelector('main');
        const wordRect = event.target.getBoundingClientRect();
        const mainRect = mainContentArea.getBoundingClientRect();
        const topPosition = wordRect.top - mainRect.top + mainContentArea.scrollTop + wordRect.height;
        const leftPosition = wordRect.left - mainRect.left;
        tooltip.style.left = `${leftPosition}px`;
        tooltip.style.top = `${topPosition}px`;
        tooltip.classList.remove('hidden');
    }
});

adaptedTextElement.addEventListener('mouseout', (event) => {
    if (event.target.classList.contains('definable-word')) {
        tooltip.classList.add('hidden');
    }
});

// Set the initial state when the panel first opens
adaptedTextElement.innerHTML = '<p>Select text on a page and right-click to get started.</p>';
vocabButton.disabled = true;
levelDownButton.disabled = true;
undoButton.disabled = true;
copyButton.disabled = true;
