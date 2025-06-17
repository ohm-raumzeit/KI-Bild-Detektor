// popup.js

document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('saveKey');
    const statusDiv = document.getElementById('status');

    // Load the saved API key when the popup opens
    chrome.storage.local.get(['apiKey'], (result) => {
        if (result.apiKey) {
            apiKeyInput.value = result.apiKey;
            statusDiv.textContent = "API-Schlüssel ist geladen.";
            statusDiv.className = 'status-success';
        } else {
             statusDiv.textContent = "Bitte geben Sie einen API-Schlüssel ein.";
             statusDiv.className = '';
        }
    });

    // Save the API key when the save button is clicked
    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.local.set({ apiKey: apiKey }, () => {
                statusDiv.textContent = 'API-Schlüssel erfolgreich gespeichert!';
                statusDiv.className = 'status-success';
                setTimeout(() => {
                    statusDiv.textContent = 'API-Schlüssel ist geladen.';
                }, 2000);
            });
        } else {
            statusDiv.textContent = 'Das Feld darf nicht leer sein.';
            statusDiv.className = 'status-error';
        }
    });
});
