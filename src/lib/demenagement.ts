// Changement d'adresse (ECOSYSTEME.md §7.4, chantier B) : la page laissée à l'ancienne
// adresse (https://django184.github.io/panier-temoin/) lit les données gardées sur le
// téléphone et ouvre la nouvelle adresse sur « #/demenagement/<export en base64url> ».
//
// Ce module, sans effet de bord, décode cet export et décide de ce qui peut être écrit :
//  - jamais la session Supabase ni la copie de la carte Cumulus (reconnexion obligatoire) ;
//  - une donnée déjà présente à la nouvelle adresse n'est jamais écrasée ;
//  - la liste, les recettes et la file des changements non envoyés forment un tout : repris
//    ensemble, et seulement si la nouvelle adresse n'a encore rien de tout cela.

/** Données reprises une à une (clés sans le préfixe « panier-temoin: »). */
export const CLES_SIMPLES = ['preferences', 'projet-claude', 'projet-chef-feta', 'brouillon'] as const;
/** Données reprises ensemble : la file d'envoi désigne des articles et des recettes. */
export const CLES_SYNCHRO = ['courses', 'recettes', 'recette-active', 'synchro-file'] as const;

const TAILLE_MAX = 1_000_000;

export class ErreurDemenagement extends Error {}

export interface ExportDemenagement {
  format: 'ecosysteme.export';
  formatVersion: 1;
  app: 'panier-temoin';
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  data: { cles: Record<string, string> };
}

export interface PlanDemenagement {
  /** [clé sans préfixe, valeur brute] à écrire. */
  ecrire: Array<[string, string]>;
  /** Clés reçues mais gardées telles quelles à la nouvelle adresse. */
  conservees: string[];
  /** Changements de la liste pas encore envoyés, repris pour envoi après connexion. */
  enAttente: number;
}

export function versBase64url(texte: string): string {
  const octets = new TextEncoder().encode(texte);
  let bin = '';
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function depuisBase64url(texte: string): string {
  const bin = atob(texte.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Lit l'export transmis ; lève ErreurDemenagement avec un message en clair. */
export function decoderDemenagement(code: string): ExportDemenagement {
  let e: unknown;
  try {
    e = JSON.parse(depuisBase64url(code));
  } catch {
    throw new ErreurDemenagement('Les données de l’ancienne adresse sont illisibles.');
  }
  const x = e as Partial<ExportDemenagement> | null;
  if (!x || x.format !== 'ecosysteme.export' || x.formatVersion !== 1) {
    throw new ErreurDemenagement('Ce lien ne contient pas un export de l’écosystème.');
  }
  if (x.app !== 'panier-temoin') throw new ErreurDemenagement(`Cet export vient d’une autre app (${String(x.app)}).`);
  const cles = x.data?.cles;
  if (!cles || typeof cles !== 'object' || Array.isArray(cles)) {
    throw new ErreurDemenagement('L’export ne contient aucune donnée.');
  }
  return x as ExportDemenagement;
}

function fileEnAttente(brut: string | undefined): number {
  if (!brut) return 0;
  try {
    const file = JSON.parse(brut) as unknown;
    return Array.isArray(file) ? file.length : 0;
  } catch {
    return 0;
  }
}

/** Ce qu'il faut écrire, compte tenu de ce que la nouvelle adresse a déjà. */
export function planDemenagement(
  exp: ExportDemenagement,
  existante: (cle: string) => string | null,
): PlanDemenagement {
  const recu = (cle: string): string | undefined => {
    const v = exp.data.cles[cle];
    return typeof v === 'string' && v.length > 0 && v.length <= TAILLE_MAX ? v : undefined;
  };
  const plan: PlanDemenagement = { ecrire: [], conservees: [], enAttente: 0 };

  for (const cle of CLES_SIMPLES) {
    const v = recu(cle);
    if (v === undefined) continue;
    if (existante(cle) !== null) plan.conservees.push(cle);
    else plan.ecrire.push([cle, v]);
  }

  const groupe = CLES_SYNCHRO.filter((cle) => recu(cle) !== undefined);
  const enAttente = fileEnAttente(recu('synchro-file'));
  if (groupe.length > 0 && enAttente > 0) {
    if (CLES_SYNCHRO.some((cle) => existante(cle) !== null)) {
      plan.conservees.push(...groupe);
    } else {
      for (const cle of groupe) plan.ecrire.push([cle, recu(cle) as string]);
      plan.enAttente = enAttente;
    }
  }
  return plan;
}
