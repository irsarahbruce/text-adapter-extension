document.addEventListener('DOMContentLoaded', function() {
  console.log("Sidepanel DOM loaded, sending ready signal");
  chrome.runtime.sendMessage({ type: 'sidepanel-ready' });
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
    
    levelDownButton.disabled = true;
    undoButton.disabled = true;
    copyButton.disabled = true;
    vocabButton.disabled = true;

    if (state === 'loading') {
        loadingIndicator.classList.remove('hidden');
    } else if (state === 'error') {
        errorText.textContent = data.message;
        errorMessage.classList.remove('hidden');
    } else if (state === 'result') {
        contentDisplay.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        
        levelDownButton.disabled = false;
        copyButton.disabled = false;
        vocabButton.disabled = false;
        
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

function applyDictionary(text, dictionary) {
    if (!dictionary || Object.keys(dictionary).length === 0) return text;
    const sortedWords = Object.keys(dictionary).sort((a, b) => b.length - a.length);

    for (const word of sortedWords) {
        const regex = new RegExp(`\\b(${word})\\b(?![^<]*?>)`, 'gi');
        const definition = dictionary[word];
        text = text.replace(regex, `<span class="definable-word" data-definition="${definition}">$1</span>`);
    }
    return text;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'loading') {
        showState('loading');
    } else if (message.type === 'error') {
        showState('error', { message: message.message });
    } else if (message.type === 'result') {
        adaptedTextElement.innerHTML = message.content;
        showState('result', message);
    } else if (message.type === 'vocab-result') {
        const textWithDefinitions = applyDictionary(adaptedTextElement.innerHTML, message.dictionary);
        adaptedTextElement.innerHTML = textWithDefinitions;
        vocabButton.disabled = true;
    }
});

vocabButton.addEventListener('click', () => {
    const currentText = adaptedTextElement.innerHTML;
    chrome.runtime.sendMessage({ type: 'get-vocab', text: currentText });
});

levelDownButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'adapt-text', action: 'simpler' });
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
        const definition = event.target.getAttribute('data-definition');
        tooltip.textContent = definition;
        const rect = event.target.getBoundingClientRect();
        tooltip.style.left = `${rect.left}px`;
        tooltip.style.top = `${rect.bottom + 4}px`;
        tooltip.classList.remove('hidden');
    }
});

adaptedTextElement.addEventListener('mouseout', (event) => {
    if (event.target.classList.contains('definable-word')) {
        tooltip.classList.add('hidden');
    }
});

// Update the initial text
adaptedTextElement.innerHTML = '<p>Please wait...</p>';
