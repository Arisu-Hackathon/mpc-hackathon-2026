// sidepanel.js
// Logique du side panel : gère les états, parle au content script et background.

// ─── ÉLÉMENTS DU DOM ───
const btnAnalyser = document.getElementById("btn-analyser");
const btnRetry = document.getElementById("btn-retry");

const etatIdle = document.getElementById("etat-idle");
const etatLoading = document.getElementById("etat-loading");
const etatErreur = document.getElementById("etat-erreur");
const etatResultats = document.getElementById("etat-resultats");
const loadingTexte = document.querySelector(".loading-texte");

// ─── GESTION DES ÉTATS ───

function afficherEtat(etat) {
  etatIdle.classList.add("cache");
  etatLoading.classList.add("cache");
  etatErreur.classList.add("cache");
  etatResultats.classList.add("cache");

  if (etat === "idle") etatIdle.classList.remove("cache");
  if (etat === "loading") etatLoading.classList.remove("cache");
  if (etat === "erreur") etatErreur.classList.remove("cache");
  if (etat === "resultats") etatResultats.classList.remove("cache");
}

function afficherErreur(message) {
  document.getElementById("erreur-message").textContent = message;
  afficherEtat("erreur");
  btnAnalyser.classList.remove("loading");
}

// ─── AFFICHER LES RÉSULTATS ───

function afficherResultats(analyse) {
  // Score
  const score = analyse.score_fiabilite;
  document.getElementById("score-badge").textContent = `${score}/10`;
  document.getElementById("resume-global").textContent = analyse.resume_global;
  setTimeout(() => {
    document.getElementById("score-bar").style.width = `${score * 10}%`;
    const bar = document.getElementById("score-bar");
    if (score >= 7) bar.style.background = "var(--green)";
    else if (score >= 4) bar.style.background = "var(--yellow)";
    else bar.style.background = "var(--red)";
  }, 50);

  // Auteur
  const auteur = analyse.auteur;
  document.getElementById("auteur-nom").textContent = auteur.nom || "Non mentionné";
  document.getElementById("auteur-notes").textContent = auteur.notes || "";
  setTag("auteur-tag", auteur.reconnu ? "Reconnu" : "Inconnu", auteur.reconnu ? "vert" : "gris");

  // Date
  const date = analyse.date;
  document.getElementById("date-valeur").textContent = date.trouvee || "Non trouvée";
  document.getElementById("date-notes").textContent = date.notes || "";
  setTag("date-tag", date.recente ? "Récent" : "Ancien", date.recente ? "vert" : "jaune");

  // Langage émotionnel
  const emotion = analyse.langage_emotionnel;
  const tagCouleurEmotion = emotion.detecte
    ? (emotion.severite === "élevée" ? "rouge" : "jaune")
    : "vert";
  const tagTexteEmotion = emotion.detecte
    ? `${emotion.severite}`
    : "Neutre";
  setTag("emotion-tag", tagTexteEmotion, tagCouleurEmotion);

  const exemplesContainer = document.getElementById("emotion-exemples");
  exemplesContainer.innerHTML = "";
  if (emotion.detecte && emotion.exemples.length > 0) {
    emotion.exemples.forEach(mot => {
      const span = document.createElement("span");
      span.className = "tag-mot";
      span.textContent = mot;
      exemplesContainer.appendChild(span);
    });
  } else {
    exemplesContainer.innerHTML = `<span class="section-notes">Aucun langage émotionnel détecté.</span>`;
  }

  // Biais
  const biais = analyse.biais;
  setTag("biais-tag", biais.detecte ? "Détecté" : "Aucun", biais.detecte ? "rouge" : "vert");
  document.getElementById("biais-type").textContent = biais.type || "";
  document.getElementById("biais-explication").textContent = biais.explication || "Aucun biais notable détecté.";

  // Ce qui manque
  document.getElementById("manque-resume").textContent = analyse.ce_qui_manque.resume || "";
  const manqueListe = document.getElementById("manque-liste");
  manqueListe.innerHTML = "";
  if (analyse.ce_qui_manque.elements && analyse.ce_qui_manque.elements.length > 0) {
    analyse.ce_qui_manque.elements.forEach(el => {
      const li = document.createElement("li");
      li.textContent = el;
      manqueListe.appendChild(li);
    });
  }

  afficherEtat("resultats");
  btnAnalyser.classList.remove("loading");
}

function setTag(id, texte, couleur) {
  const el = document.getElementById(id);
  el.textContent = texte;
  el.className = `tag tag-${couleur}`;
}

// ─── LOGIQUE PRINCIPALE ───

async function analyser() {
  btnAnalyser.classList.add("loading");
  afficherEtat("loading");

  // 1. Trouver l'onglet actif
  let tabs;
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) {
    afficherErreur("Impossible d'accéder à l'onglet actif.");
    return;
  }

  const tab = tabs[0];
  if (!tab || !tab.id) {
    afficherErreur("Aucun onglet actif trouvé.");
    return;
  }

  // 2. Demander au content script d'extraire l'article
  loadingTexte.textContent = "Lecture de l'article...";
  let articleData;
  try {
    articleData = await chrome.tabs.sendMessage(tab.id, { type: "EXTRAIRE_ARTICLE" });
  } catch (e) {
    afficherErreur("Impossible de lire la page. Essaie de recharger l'onglet.");
    return;
  }

  if (!articleData || !articleData.succes) {
    afficherErreur(articleData?.erreur || "La page ne semble pas être un article.");
    return;
  }

  // 3. Envoyer au background pour analyse Gemini
  loadingTexte.textContent = "Analyse en cours...";
  let resultat;
  try {
    resultat = await chrome.runtime.sendMessage({
      type: "ANALYSER",
      article: articleData
    });
  } catch (e) {
    afficherErreur("Erreur lors de l'analyse. Vérifie ta clé API Gemini.");
    return;
  }

  if (!resultat || !resultat.succes) {
    afficherErreur(resultat?.erreur || "Erreur inconnue lors de l'analyse.");
    return;
  }

  // 4. Afficher les résultats
  afficherResultats(resultat.analyse);
}

// ─── ÉVÉNEMENTS ───

btnAnalyser.addEventListener("click", analyser);
btnRetry.addEventListener("click", analyser);

// Charger la dernière analyse sauvegardée si disponible
chrome.storage.local.get(["derniereAnalyse"], (data) => {
  if (data.derniereAnalyse) {
    afficherResultats(data.derniereAnalyse);
  }
});
