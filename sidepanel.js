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

function showState(state, data = {}) {
    loadingIndicator.classList.add('hidden');
    contentDisplay.classList.add('hidden');
    errorMessage.classList.add('hidden');
    tooltip.classList.add('hidden');
    
    // Disable all buttons by default
    levelDownButton.disabled = true;
    undoButton.disabled = true;
    copyButton.disabled = true;
    vocabButton.disabled = true;

    if (state === 'loading') {
        // Only clear the text if we're not preserving it (e.g., for vocab)
        if (!data.preserveContent) {
            adaptedTextElement.innerHTML = '<p>Please wait...</p>';
        }
        contentDisplay.classList.remove('hidden');
        loadingIndicator.classList.remove('hidden');
    } else if (state === 'error') {
        errorText.innerHTML = `<strong class="font-bold">Error:</strong> ${data.message}`;
        errorMessage.classList.remove('hidden');
    } else if (state === 'result') {
        contentDisplay.classList.remove('hidden');
        
        // Correctly re-enable all necessary buttons
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
        const definition = dictionary[word];
        newText = newText.replace(regex, `<span class="definable-word" data-definition="${definition}">$1</span>`);
    }
    return newText;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'loading') {
        showState('loading');
    } else if (message.type === 'error') {
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

adaptedTextElement.addEventListener('click', (event) => {
    if (event.target.classList.contains('definable-word')) {
        const nextEl = event.target.nextElementSibling;

        // If the definition is already showing for this word, remove it and exit.
        if (nextEl && nextEl.classList.contains('definition-inline')) {
            nextEl.remove();
            return;
        }

        // Remove any other open definitions to keep the view clean.
        const existingDef = adaptedTextElement.querySelector('.definition-inline');
        if (existingDef) {
            existingDef.remove();
        }

        // Create and insert the new definition box.
        const word = event.target.textContent;
        const definition = event.target.getAttribute('data-definition');
        const definitionBox = document.createElement('span');
        definitionBox.className = 'definition-inline';
        definitionBox.innerHTML = `<strong class="font-bold">${word}:</strong> ${definition}`;
        event.target.after(definitionBox);
    }
});

// Set the initial state when the panel first opens
adaptedTextElement.innerHTML = '<p>Select text on a page and right-click to get started.</p>';
vocabButton.disabled = true;
levelDownButton.disabled = true;
undoButton.disabled = true;
copyButton.disabled = true;
