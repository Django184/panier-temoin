// Import d'un ticket lu par l'app Claude (voie de secours, sans frais
// avec un abonnement Claude). L'app fournit une consigne à copier ;
// l'utilisateur l'envoie avec la photo du ticket, puis colle la réponse.
// La réponse est vérifiée ici, puis ouvre le même écran de validation.

import type { FormatMagasin, MethodeExtraction, TicketBrouillon } from './types.ts';
import { versCentimes } from './montants.ts';
import { construireLigne } from './lecteurTicket.ts';

export const CONSIGNE_CLAUDE = `Lis ce ticket de caisse Migros et réponds UNIQUEMENT avec un objet JSON, sans texte autour, au format suivant :

{
  "magasin": { "numero_filiale": "064590", "nom": "MM Métropole Renens", "localite": "Renens", "cooperative": "Vaud" },
  "date": "2026-10-12",
  "heure": "19:00:05",
  "total": "24.60",
  "vous_economisez": "4.00",
  "lignes": [
    { "libelle": "Agnesi Linguine N.10", "quantite": "3", "prix": "2.40", "rabais": "2.88", "total": "4.32" },
    { "libelle": "Aubergines", "quantite": "1", "prix": "4.00", "rabais": "", "total": "2.00" }
  ]
}

Règles :
- Recopie chaque ligne d'article exactement comme imprimée : colonnes Désignation, Quant., Prix, Rabais, Total.
- Ne recalcule rien : si une valeur est illisible, mets une chaîne vide.
- « numero_filiale », « date » et « heure » viennent de la DERNIÈRE ligne du ticket (Filiale … Date Heure), pas de l'heure du paiement.
- « vous_economisez » : le montant de la ligne « Vous économisez au total », ou "" s'il n'y en a pas.
- N'inclus JAMAIS le numéro Cumulus, les points, les données de carte ou de paiement, ni aucun identifiant de transaction.`;

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

/** Réponse collée depuis l'app Claude → brouillon de ticket. */
export function lireReponseClaude(reponse: string): TicketBrouillon {
  return lireReponseJSON(reponse, 'import_claude');
}

/**
 * Transforme une réponse JSON au format de la consigne (lecture
 * automatique ou import depuis Claude) en brouillon de ticket.
 */
export function lireReponseJSON(reponse: string, methode: MethodeExtraction): TicketBrouillon {
  const debut = reponse.indexOf('{');
  const fin = reponse.lastIndexOf('}');
  if (debut === -1 || fin <= debut) {
    throw new ErreurImport('Aucun objet JSON trouvé : collez la réponse complète de Claude.');
  }

  let donnees: unknown;
  try {
    donnees = JSON.parse(reponse.slice(debut, fin + 1));
  } catch {
    throw new ErreurImport('La réponse n’est pas un JSON valide. Demandez à Claude de ne renvoyer que le JSON.');
  }
  if (typeof donnees !== 'object' || donnees === null) {
    throw new ErreurImport('La réponse ne contient pas de ticket.');
  }

  const d = donnees as Record<string, unknown>;
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
