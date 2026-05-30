// content.js
// Ce script est injecté dans chaque page web.
// Son seul job : extraire le texte propre de l'article avec Readability.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTRAIRE_ARTICLE") {

    try {
      // Readability a besoin d'un clone du document pour pas modifier la page
      const documentClone = document.cloneNode(true);
      const reader = new Readability(documentClone);
      const article = reader.parse();

      if (article) {
        sendResponse({
          succes: true,
          titre: article.title,
          texte: article.textContent,
          auteur: article.byline,
          url: window.location.href
        });
      } else {
        sendResponse({
          succes: false,
          erreur: "Impossible d'extraire l'article. La page n'est peut-être pas un article."
        });
      }

    } catch (e) {
      sendResponse({
        succes: false,
        erreur: e.message
      });
    }

    return true; // Garde le canal ouvert pour la réponse async
  }
});
