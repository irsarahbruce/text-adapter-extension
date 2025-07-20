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
    // Hide all main elements and the tooltip on every state change
    loadingIndicator.classList.add('hidden');
    contentDisplay.classList.add('hidden');
    errorMessage.classList.add('hidden');
    tooltip.classList.add('hidden'); // <-- Hides the tooltip
    
    levelDownButton.disabled = true;
    undoButton.disabled = true;
    copyButton.disabled = true;
    vocabButton.disabled = true;

    if (state === 'loading') {
        loadingIndicator.classList.remove('hidden');
    } else if (state === 'error') {
        // Dynamically add the "Error:" prefix here
        errorText.innerHTML = `<strong class="font-bold">Error:</strong> ${data.message}`;
        errorMessage.classList.remove('hidden');
    } else if (state === 'result') {
        contentDisplay.classList.remove('hidden');
        
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
    // ... (This function remains the same)
}

// ... (The rest of your sidepanel.js file remains the same)
