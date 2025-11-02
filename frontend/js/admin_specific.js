function toggleGeminiSettings(isChecked) {
    const settingsDiv = document.getElementById('geminiSettings');
    if (settingsDiv) {
        if (isChecked) {
            settingsDiv.classList.remove('hidden');
        } else {
            settingsDiv.classList.add('hidden');
        }
    }
}

function toggleOllamaSettings(isChecked) {
    const settingsDiv = document.getElementById('ollamaSettings');
    if (settingsDiv) {
        if (isChecked) {
            settingsDiv.classList.remove('hidden');
        } else {
            settingsDiv.classList.add('hidden');
        }
    }
}

// Initialize visibility based on initial toggle state on page load
document.addEventListener('DOMContentLoaded', () => {
     const geminiToggle = document.getElementById('enableGeminiToggle');
     const ollamaToggle = document.getElementById('enableOllamaToggle');
     
     if (geminiToggle) {
         toggleGeminiSettings(geminiToggle.checked);
     }
      if (ollamaToggle) {
         toggleOllamaSettings(ollamaToggle.checked);
     }
});
