// background.js
// Coordinateur central. Ouvre le side panel et appelle Gemini.

const GEMINI_KEY = "AQ.Ab8RN6I1vsfcWuJiU1gJ1E0bl3rahNn8RrpUGOLkOkfpsovVVA"; // 🔑 Remplace par ta vraie clé
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

// Ouvre le side panel quand le user clique sur l'icône
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Écoute les messages du side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "ANALYSER") {
    analyserAvecGemini(message.article)
      .then(analyse => sendResponse({ succes: true, analyse }))
      .catch(err => sendResponse({ succes: false, erreur: err.message }));

    return true; // Garde le canal ouvert (async)
  }
});

async function analyserAvecGemini(article) {
  const prompt = `
Tu es un expert en analyse critique de médias et journalisme.
Analyse cet article et retourne UNIQUEMENT un objet JSON valide, sans markdown, sans backticks, sans texte avant ou après.

Article :
Titre : ${article.titre}
Auteur : ${article.auteur || "Non mentionné"}
URL : ${article.url}
Texte : ${article.texte.slice(0, 6000)}

Retourne exactement ce JSON :
{
  "auteur": {
    "nom": "nom de l'auteur ou null",
    "reconnu": true ou false,
    "notes": "courte description de l'auteur si connu, sinon null"
  },
  "date": {
    "trouvee": "date trouvée dans l'article ou null",
    "recente": true ou false,
    "notes": "ex: article vieux de 3 ans"
  },
  "langage_emotionnel": {
    "detecte": true ou false,
    "exemples": ["mot ou phrase chargée 1", "mot ou phrase chargée 2"],
    "severite": "faible" ou "modérée" ou "élevée"
  },
  "ce_qui_manque": {
    "elements": ["contexte manquant 1", "contexte manquant 2"],
    "resume": "une phrase qui résume ce qui est omis"
  },
  "biais": {
    "detecte": true ou false,
    "type": "ex: biais de confirmation, biais politique, etc. ou null",
    "explication": "courte explication ou null"
  },
  "score_fiabilite": un nombre entre 1 et 10,
  "resume_global": "2-3 phrases résumant l'analyse globale de l'article"
}
`;

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const texteReponse = data.candidates[0].content.parts[0].text;

  // Parse le JSON retourné par Gemini
  const jsonPropre = texteReponse.replace(/```json|```/g, "").trim();
  return JSON.parse(jsonPropre);
}
