document.addEventListener('DOMContentLoaded', function() {
    // Check if we should be in a loading state as soon as the panel opens
    chrome.storage.session.get('isProcessing', (result) => {
        if (result.isProcessing) {
            // Show the loading spinner immediately
            showState('loading');
            // Clear the flag so it doesn't happen again on a simple reopen
            chrome.storage.session.set({ isProcessing: false });
        } else {
            // If not processing, show the default initial state
            setInitialState();
        }
    });
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

function showState(state, data = {}) {
    loadingIndicator.classList.add('hidden');
    contentDisplay.classList.add('hidden');
    errorMessage.classList.add('hidden');
    
    levelDownButton.disabled = true;
    undoButton.disabled = true;
    copyButton.disabled = true;
    vocabButton.disabled = true;

    if (state === 'loading') {
        contentDisplay.classList.remove('hidden'); 
        loadingIndicator.classList.remove('hidden');
    } else if (state === 'error') {
        errorText.innerHTML = `<strong class="font-bold">Error:</strong> ${data.message}`;
        errorMessage.classList.remove('hidden');
    } else if (state === 'result') {
        contentDisplay.classList.remove('hidden');
        copyButton.disabled = false;
        vocabButton.disabled = false;
        
        if (data.historyCount > 1) {
            undoButton.disabled = false;
        }

        if (data.atMinimum) {
            levelDownButton.disabled = true;
            levelDownButton.textContent = 'Simplest';
        } else {
            levelDownButton.disabled = false;
            levelDownButton.textContent = 'Simpler';
        }
    }
}

function applyDictionary(text, dictionary) {
    if (!dictionary || Object.keys(dictionary).length === 0) return text;
    const cleanText = text.replace(/<span class="definable-word"[^>]*>(.*?)<\/span>/gi, '$1');
    const sortedWords = Object.keys(dictionary).sort((a, b) => b.length - a.length);
    let newText = cleanText;
    for (const word of sortedWords) {
        const regex = new RegExp(`\\b(${word})\\b(?![^<]*?>)`, 'gi');
        const definition = dictionary[word].replace(/"/g, '&quot;'); // Escape quotes for the attribute
        newText = newText.replace(regex, `<span class="definable-word" data-definition="${definition}">$1</span>`);
    }
    return newText;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // The 'loading' message from background.js is no longer needed here,
    // but we keep the listener for other messages.
    if (message.type === 'error') {
        showState('error', { message: message.message });
    } else if (message.type === 'result') {
        const textWithDefinitions = applyDictionary(message.content, message.dictionary);
        adaptedTextElement.innerHTML = textWithDefinitions;
        showState('result', message);
    } else if (message.type === 'vocab-result') {
        const textWithDefinitions = applyDictionary(adaptedTextElement.innerHTML, message.dictionary);
        adaptedTextElement.innerHTML = textWithDefinitions;
        const currentState = {
            atMinimum: levelDownButton.textContent === 'Simplest',
            historyCount: undoButton.disabled ? 1 : 2 
        };
        showState('result', currentState);
        vocabButton.disabled = true;
    }
});

vocabButton.addEventListener('click', () => {
    const currentText = adaptedTextElement.textContent;
    chrome.runtime.sendMessage({ type: 'get-vocab', text: currentText });
});

// In sidepanel.js

levelDownButton.addEventListener('click', () => {
    // Get ALL the data needed for the next API call
    chrome.storage.session.get(['originalText', 'currentLexile'], (result) => {
        if (result.originalText && result.currentLexile) {
            // Pass the data in the message to background.js
            chrome.runtime.sendMessage({ 
                type: 'adapt-text', 
                action: 'simpler',
                originalText: result.originalText,
                currentLexile: result.currentLexile
            });
        }
    });
});

undoButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'adapt-text', action: 'undo' });
});

copyButton.addEventListener('click', () => {
    const textToCopy = `${adaptedTextElement.textContent}\n\nRewritten by QuickRewriter`;
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        setTimeout(() => { copyButton.textContent = originalText; }, 2000);
    }).catch(err => console.error('Failed to copy text: ', err));
});

adaptedTextElement.addEventListener('click', (event) => {
    if (event.target.classList.contains('definable-word')) {
        const nextEl = event.target.nextElementSibling;

        if (nextEl && nextEl.classList.contains('definition-inline')) {
            nextEl.remove();
            return;
        }

        const existingDef = adaptedTextElement.querySelector('.definition-inline');
        if (existingDef) {
            existingDef.remove();
        }

        const word = event.target.textContent;
        const definition = event.target.getAttribute('data-definition');
        const definitionBox = document.createElement('span');
        definitionBox.className = 'definition-inline';
        definitionBox.innerHTML = `<strong class="font-bold">${word}:</strong> ${definition}`;
        event.target.after(definitionBox);
    }
});

function setInitialState() {
    adaptedTextElement.innerHTML = '<p>Select text on a page and right-click to get started.</p>';
    vocabButton.disabled = true;
    levelDownButton.disabled = true;
    undoButton.disabled = true;
    copyButton.disabled = true;
}
