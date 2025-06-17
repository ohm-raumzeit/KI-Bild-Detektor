// background.js - Service Worker

// Function to convert an image URL to a base64 string
async function imageUrlToBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        resolve({
          base64: base64data,
          mimeType: blob.type
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Fehler beim Abrufen oder Konvertieren des Bildes:", error);
    return null;
  }
}

// Function to call the Gemini API
async function analyzeImageWithGemini(imageData, apiKey) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const prompt = `Analysiere das folgende Bild. Ist es wahrscheinlich von einer KI generiert worden? Gib eine kurze, aber detaillierte, gut formatierte Markdown-Analyse, die Folgendes enthält:
  - **KI-Wahrscheinlichkeit:** Eine prozentuale Einschätzung (z.B. ~85% KI-generiert).
  - **Begründung:** Eine kurze Erklärung für deine Einschätzung. Achte auf typische KI-Artefakte wie fehlerhafte Hände/Finger, unlogische Texturen, verzerrte Hintergründe oder inkonsistenten Lichteinfall.
  - **Bildaufbau:** Eine Beschreibung der Komposition, des Hauptmotivs und der Farbpalette.
  - **Versteckte/Ungewöhnliche Details:** Eine Liste möglicher versteckter oder bemerkenswerter Elemente im Bild.`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: imageData.mimeType,
              data: imageData.base64
            }
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok) {
      // Handle specific API errors
      const errorMessage = result.error?.message || JSON.stringify(result.error);
      throw new Error(`API-Anfrage fehlgeschlagen mit Status ${response.status}: ${errorMessage}`);
    }

    if (result.candidates && result.candidates.length > 0 && result.candidates[0].content.parts.length > 0) {
      return result.candidates[0].content.parts[0].text;
    } else if(result.promptFeedback) {
      console.error("Analyse blockiert:", result.promptFeedback);
      return `Fehler: Die Analyse wurde aufgrund von Sicherheitseinstellungen blockiert. Das Bild könnte unangemessene Inhalte enthalten. Blockierungsgrund: ${result.promptFeedback.blockReason}`;
    } else {
      console.error("Unerwartete API-Antwortstruktur:", result);
      return "Fehler: Die Antwort des KI-Modells konnte nicht verarbeitet werden.";
    }
  } catch (error) {
    console.error("Fehler bei der Kommunikation mit der Gemini-API:", error);
    return `Ein Fehler ist aufgetreten: ${error.message}. Stellen Sie sicher, dass die API korrekt konfiguriert ist.`;
  }
}


// Create the context menu item
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "analyze-image-gemini",
    title: "Bild mit Gemini analysieren",
    contexts: ["image"]
  });
});

// Listener for the context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "analyze-image-gemini" && info.srcUrl) {

    // Inject CSS first
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["modal.css"]
    }).catch(err => console.log("CSS konnte nicht injiziert werden:", err)); // Add catch for robustness

    // Show a "loading" modal immediately
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: showLoadingModal
    });

    // --- CHECK FOR API KEY ---
    const storageResult = await chrome.storage.local.get('apiKey');
    const apiKey = storageResult.apiKey;

    if (!apiKey) {
      const errorMessage = "Fehler: API-Schlüssel nicht gefunden. Bitte klicken Sie auf das Erweiterungssymbol in Ihrer Browserleiste und geben Sie Ihren Gemini-API-Schlüssel ein.";
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: displayAnalysisInModal,
        args: [errorMessage]
      });
      return; // Stop execution if no key
    }
    // --- END OF CHECK ---

    const imageData = await imageUrlToBase64(info.srcUrl);
    if (imageData) {
      const analysisResult = await analyzeImageWithGemini(imageData, apiKey);
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: displayAnalysisInModal,
        args: [analysisResult]
      });
    } else {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: displayAnalysisInModal,
        args: ["Fehler: Das Bild konnte nicht geladen oder verarbeitet werden. Es könnte durch CORS-Richtlinien geschützt sein."]
      });
    }
  }
});

// Function to be injected into the page to show a loading state
function showLoadingModal() {
  const existingModal = document.getElementById('gemini-analysis-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'gemini-analysis-modal';
  modal.innerHTML = `
  <div class="gemini-modal-content">
  <div class="gemini-modal-header">
  <h3>Bildanalyse wird geladen...</h3>
  <button id="gemini-modal-close" class="gemini-modal-close-btn">&times;</button>
  </div>
  <div class="gemini-modal-body">
  <div class="gemini-loader"></div>
  <p>Bitte warten Sie, während Gemini das Bild analysiert.</p>
  </div>
  </div>
  `;
  document.body.appendChild(modal);

  const closeModal = () => modal.remove();

  document.getElementById('gemini-modal-close').onclick = closeModal;

  const escapeListener = (event) => {
    if (event.key === "Escape") {
      closeModal();
      document.removeEventListener('keydown', escapeListener);
    }
  };
  document.addEventListener('keydown', escapeListener);
}

// Function to be injected into the page to display the final result
function displayAnalysisInModal(analysis) {
  const modal = document.getElementById('gemini-analysis-modal');
  if (!modal) {
    console.error("Gemini Modal nicht gefunden!");
    alert(analysis); // Fallback
    return;
  }

  function simpleMarkdownToHtml(markdown) {
    return markdown
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n/g, '<br>');
  }

  const modalHeader = modal.querySelector('.gemini-modal-header h3');
  const modalBody = modal.querySelector('.gemini-modal-body');

  modalHeader.textContent = 'Gemini Bildanalyse-Ergebnis';
  modalBody.innerHTML = simpleMarkdownToHtml(analysis);
}
