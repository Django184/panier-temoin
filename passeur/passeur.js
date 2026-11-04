// Passeur de l'ancienne adresse (https://django184.github.io/panier-temoin/) — ECOSYSTEME.md §7.4.
// Lit les données de Panier Témoin gardées sur ce téléphone à l'ancienne adresse et les transmet
// à la nouvelle dans le fragment de l'URL (jamais envoyé à un serveur), au format d'export commun.
// Jamais transmises : la session Supabase et la copie de la carte Cumulus (reconnexion demandée).
// Les données d'ici ne sont pas effacées. Format attendu : src/lib/demenagement.ts.
(function () {
  const PREFIXE = "panier-temoin:";
  const SIMPLES = ["preferences", "projet-claude", "projet-chef-feta", "brouillon"];
  const cible = document.querySelector('meta[name="cible"]').content;
  const fragment = location.hash;
  const lien = document.getElementById("lien");

  function base64url(texte) {
    const octets = new TextEncoder().encode(texte);
    let bin = "";
    for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  const lire = (cle) => { try { return localStorage.getItem(PREFIXE + cle); } catch (e) { return null; } };

  // Un lien envoyé par Claude (ticket « #/import/{…} », recette « #/courses/{…} ») suit tel quel :
  // les réglages passeront à la prochaine ouverture de l'ancienne icône. Pour tout autre fragment
  // (#/courses, #/cumulus… : l'écran où l'app était restée), les réglages passent maintenant.
  const lienClaude = /^#\/(import|courses)\/./.test(fragment);
  let adresse = cible + (lienClaude ? fragment : "");

  if (!lienClaude) {
    const cles = {};
    for (const cle of SIMPLES) { const v = lire(cle); if (v) cles[cle] = v; }
    // Changements de la liste pas encore envoyés : la liste, la recette affichée et les recettes
    // concernées partent avec eux, pour être envoyés après la connexion à la nouvelle adresse.
    let file = [];
    try { file = JSON.parse(lire("synchro-file") || "[]"); } catch (e) { file = []; }
    if (Array.isArray(file) && file.length) {
      cles["synchro-file"] = JSON.stringify(file);
      const courses = lire("courses"); if (courses) cles["courses"] = courses;
      const active = lire("recette-active"); if (active) cles["recette-active"] = active;
      const ids = new Set(file.filter((op) => op && op.table === "recettes").map((op) => op.id));
      try {
        const recettes = JSON.parse(lire("recettes") || "[]").filter((r) => r && ids.has(r.id));
        if (recettes.length) cles["recettes"] = JSON.stringify(recettes);
      } catch (e) { /* recettes illisibles : la base fait foi */ }
    }
    if (Object.keys(cles).length) {
      const enveloppe = {
        format: "ecosysteme.export",
        formatVersion: 1,
        app: "panier-temoin",
        appVersion: "passeur",
        schemaVersion: 0,
        exportedAt: new Date().toISOString(),
        data: { cles: cles }
      };
      adresse = cible + "#/demenagement/" + base64url(JSON.stringify(enveloppe));
    }
  }
  lien.href = adresse;
  location.replace(adresse);
})();
