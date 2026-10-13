// Lecture des tickets par Claude, dans un projet Claude de l'utilisateur
// (compris dans son abonnement, sans frais supplémentaires).
//
// Le projet reçoit une fois pour toutes les instructions ci-dessous.
// Pour chaque photo, Claude répond par un lien « Ouvrir dans Panier
// Témoin » qui contient le ticket lu ; le lien rouvre l'app sur l'écran
// de vérification. Le même ticket figure dans un bloc de code, à copier
// puis à coller dans l'app si le lien ne s'ouvre pas.

import type { FormatMagasin, MethodeExtraction, TicketBrouillon } from './types.ts';
import { versCentimes } from './montants.ts';
import { construireLigne } from './lecteurTicket.ts';

/** Début des liens d'import produits par Claude. */
export const ADRESSE_IMPORT = 'https://django184.github.io/panier-temoin/#/import/';

export const INSTRUCTIONS_PROJET = `Tu lis des tickets de caisse de supermarchés Migros (Suisse) pour l'app Panier Témoin. Chaque message contient la photo d'un ticket. Pour chaque photo, suis exactement ces règles, sans poser de question.

1. LECTURE
Construis un objet JSON compact, sur une seule ligne, sans aucun espace en dehors des textes, avec ces clés :
- "f" : numéro de filiale, sur la DERNIÈRE ligne du ticket (« Filiale … Date Heure »)
- "m" : nom du magasin, la ligne sous l'en-tête (par exemple « MM Métropole Renens »)
- "l" : localité du magasin
- "c" : le mot après « Société Coopérative Migros » (par exemple « Vaud »)
- "d" : date de la DERNIÈRE ligne, au format AAAA-MM-JJ
- "h" : heure de la DERNIÈRE ligne (HH:MM:SS), pas l'heure du paiement
- "t" : montant de la ligne « Total CHF »
- "e" : montant de « Vous économisez au total », ou "" s'il n'y en a pas
- "a" : la liste des articles dans l'ordre du ticket ; chaque article est une liste de 5 textes : [désignation, quantité, prix, rabais, total], recopiés exactement comme imprimés (colonnes Désignation article, Quant., Prix, Rabais, Total).

Exemple :
{"f":"064590","m":"MM Métropole Renens","l":"Renens","c":"Vaud","d":"2026-10-12","h":"19:00:05","t":"24.60","e":"4.00","a":[["Agnesi Linguine N.10","3","2.40","2.88","4.32"],["Aubergines","1","4.00","","2.00"]]}

Règles de lecture :
- Ne recalcule rien et n'invente rien. Une valeur illisible devient "".
- Les fruits et légumes pesés ont une quantité 1, un prix au kilo et un total différent du prix : recopie-les tels quels.
- N'inclus JAMAIS le numéro Cumulus, les points, les données de carte ou de paiement, le nom du caissier ni aucun identifiant de transaction.

2. RÉPONSE
Réponds avec exactement ces trois éléments, et rien d'autre :
a) Une phrase : nombre d'articles, total et date, par exemple « 12 articles, total 24.60 CHF, le 12.10.2026. », suivie des valeurs que tu n'as pas pu lire s'il y en a.
b) Un lien Markdown dont le texte est « Ouvrir dans Panier Témoin » et l'adresse ${ADRESSE_IMPORT} suivie de l'objet JSON, dans lequel tu remplaces chaque espace par %20, chaque « % » par %25, chaque « ( » par %28 et chaque « ) » par %29. Ne change rien d'autre.
c) L'objet JSON tel quel, dans un bloc de code.

N'utilise ni artefact, ni fichier, ni outil.`;

/** Erreur de lecture du JSON collé, avec un message pour l'utilisateur. */
export class ErreurImport extends Error {}

function texte(valeur: unknown): string {
  if (typeof valeur === 'string') return valeur.trim();
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return String(valeur);
  return '';
}

/** « 2.40 », « 2,40 », 2.4 → centimes ; null si vide ou invalide. */
function montant(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return Math.round(valeur * 100);
  const t = texte(valeur);
  return t === '' ? null : versCentimes(t);
}

const CANTONS_COOPERATIVES: Record<string, string> = {
  vaud: 'VD',
  geneve: 'GE',
  valais: 'VS',
  zurich: 'ZH',
  luzern: 'LU',
  ticino: 'TI',
  basel: 'BS',
};

function cantonDeCooperative(cooperative: string): string {
  const cle = cooperative.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return CANTONS_COOPERATIVES[cle] ?? '';
}

/** « JJ.MM.AAAA » ou « AAAA-MM-JJ » → « AAAA-MM-JJ » ; '' sinon. */
function dateIso(valeur: string): string {
  const iso = valeur.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return valeur;
  const suisse = valeur.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return suisse ? `${suisse[3]}-${suisse[2]}-${suisse[1]}` : '';
}

function heureComplete(valeur: string): string {
  if (/^\d{2}:\d{2}:\d{2}$/.test(valeur)) return valeur;
  if (/^\d{2}:\d{2}$/.test(valeur)) return `${valeur}:00`;
  return '';
}

/** Réponse de Claude (lien ou texte collé) → brouillon de ticket. */
export function lireReponseClaude(reponse: string): TicketBrouillon {
  return lireReponseJSON(reponse, 'import_claude');
}

/**
 * Décode le contenu d'un lien d'import. Les séquences « %XX » valides
 * sont décodées une à une, pour qu'un « % » laissé tel quel par Claude
 * (« Lait 3.5% ») ne fasse pas échouer tout le lien.
 */
export function decoderLien(contenu: string): string {
  try {
    return decodeURIComponent(contenu);
  } catch {
    return contenu.replace(/(?:%[0-9A-Fa-f]{2})+/g, (sequence) => {
      try {
        return decodeURIComponent(sequence);
      } catch {
        return sequence;
      }
    });
  }
}

/** Textes candidats à contenir le JSON du ticket, du plus sûr au moins sûr. */
function candidatsJSON(reponse: string): string[] {
  const candidats: string[] = [];
  // 1. Le lien « #/import/… » (adresse de l'app ou lien collé tel quel).
  const lien = reponse.match(/#\/import\/([^\s<>]+)/);
  if (lien) {
    const decode = decoderLien(lien[1]);
    // Dans un lien Markdown, la parenthèse fermante finale n'en fait pas partie.
    candidats.push(decode, decode.replace(/\)+$/, ''));
  }
  // 2. Les blocs de code.
  for (const bloc of reponse.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g)) candidats.push(bloc[1]);
  // 3. Du premier « { » au dernier « } ».
  candidats.push(reponse);
  return candidats
    .map((c) => {
      const debut = c.indexOf('{');
      const fin = c.lastIndexOf('}');
      return debut === -1 || fin <= debut ? '' : c.slice(debut, fin + 1);
    })
    .filter((c) => c !== '');
}

/** Format compact des instructions du projet → format détaillé. */
function formatDetaille(d: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(d.a)) return d;
  return {
    magasin: { numero_filiale: d.f, nom: d.m, localite: d.l, cooperative: d.c },
    date: d.d,
    heure: d.h,
    total: d.t,
    vous_economisez: d.e,
    lignes: d.a.map((article) => {
      const [libelle, quantite, prix, rabais, total] = Array.isArray(article) ? article : [];
      return { libelle, quantite, prix, rabais, total };
    }),
  };
}

/**
 * Transforme une réponse de Claude (lien d'import, bloc de code ou JSON
 * seul, au format compact ou détaillé) en brouillon de ticket.
 */
export function lireReponseJSON(reponse: string, methode: MethodeExtraction): TicketBrouillon {
  const candidats = candidatsJSON(reponse);
  if (candidats.length === 0) {
    throw new ErreurImport('Aucun ticket trouvé : copiez la réponse complète de Claude, ou le bloc de code.');
  }

  let donnees: unknown = null;
  for (const candidat of candidats) {
    try {
      donnees = JSON.parse(candidat);
      break;
    } catch {
      // Candidat suivant.
    }
  }
  if (donnees === null) {
    throw new ErreurImport('Le ticket envoyé par Claude est incomplet. Copiez le bloc de code de sa réponse, puis touchez « Coller ».');
  }
  if (typeof donnees !== 'object') {
    throw new ErreurImport('La réponse ne contient pas de ticket.');
  }

  const d = formatDetaille(donnees as Record<string, unknown>);
  const mag = (typeof d.magasin === 'object' && d.magasin !== null ? d.magasin : {}) as Record<string, unknown>;
  const nom = texte(mag.nom);
  const formatLu = nom.match(/^(MMM|MM|M)\s/);

  const lignesBrutes = Array.isArray(d.lignes) ? d.lignes : [];
  if (lignesBrutes.length === 0) {
    throw new ErreurImport('La réponse ne contient aucune ligne d’article.');
  }

  const lignes = lignesBrutes
    .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
    .map((l) => {
      const quantiteLue = Number(texte(l.quantite).replace(',', '.'));
      const quantite = Number.isFinite(quantiteLue) && quantiteLue > 0 ? quantiteLue : 1;
      const prix = montant(l.prix);
      const rabais = montant(l.rabais);
      const total = montant(l.total);
      return construireLigne(texte(l.libelle), quantite, prix, rabais ?? 0, total, {
        quantiteSure: Number.isFinite(quantiteLue) && quantiteLue > 0,
        prixSur: prix !== null,
        rabaisSur: true,
        totalSur: total !== null,
      });
    })
    .filter((l) => l.libelle.length > 0)
    // Valeurs recopiées du ticket : un article pesé (quantité 1, total
    // différent du prix, sans rabais) est reconnu de façon fiable.
    .map((l) => ({ ...l, douteux: l.douteux.filter((d) => d !== 'unite') }));

  const brouillon: TicketBrouillon = {
    magasin: {
      numeroFiliale: texte(mag.numero_filiale).replace(/\D/g, ''),
      nom,
      format: formatLu ? (formatLu[1] as FormatMagasin) : '',
      localite: texte(mag.localite),
      canton: cantonDeCooperative(texte(mag.cooperative)),
    },
    date: dateIso(texte(d.date)),
    heure: heureComplete(texte(d.heure)),
    totalCentimes: montant(d.total),
    rabaisTotalCentimes: montant(d.vous_economisez) ?? 0,
    lignes,
    douteux: [],
    methode,
  };

  if (brouillon.magasin.numeroFiliale === '') brouillon.douteux.push('filiale');
  if (brouillon.date === '') brouillon.douteux.push('date');
  if (brouillon.heure === '') brouillon.douteux.push('heure');
  if (brouillon.totalCentimes === null) brouillon.douteux.push('total');
  return brouillon;
}
