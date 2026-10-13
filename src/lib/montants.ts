// Conversions entre montants affichés et centimes entiers.

/** « 2.40 » ou « 2,40 » → 240. Renvoie null si la saisie est invalide. */
export function versCentimes(texte: string): number | null {
  const propre = texte.trim().replace(',', '.');
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(propre)) return null;
  const [entier, decimales = ''] = propre.split('.');
  return Number(entier) * 100 + Number(decimales.padEnd(2, '0'));
}

/** 240 → « 2.40 ». */
export function enFrancs(centimes: number | null | undefined): string {
  if (centimes === null || centimes === undefined || Number.isNaN(centimes)) return '';
  const signe = centimes < 0 ? '−' : '';
  const absolu = Math.abs(Math.round(centimes));
  return `${signe}${Math.floor(absolu / 100)}.${String(absolu % 100).padStart(2, '0')}`;
}

/** 240 → « CHF 2.40 ». */
export function enCHF(centimes: number | null | undefined): string {
  const montant = enFrancs(centimes);
  return montant === '' ? '' : `CHF ${montant}`;
}

/** Arrondi au centime d'un produit quantité × prix. */
export function produitCentimes(quantite: number, prixCentimes: number): number {
  return Math.round(quantite * prixCentimes);
}

/** Poids en kg déduit d'un total et d'un prix au kilo, à 3 décimales. */
export function poidsDeduit(totalCentimes: number, rabaisCentimes: number, prixKgCentimes: number): number {
  return Math.round(((totalCentimes + rabaisCentimes) / prixKgCentimes) * 1000) / 1000;
}
