// Code-barres EAN-13, celui de la carte Cumulus physique (13 chiffres,
// commençant par 2099…). Lisible par les lecteurs de caisse à imageur.

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Chiffre de contrôle d'un EAN-13 (calculé sur les 12 premiers chiffres). */
export function chiffreControle(douzeChiffres: string): number {
  const somme = [...douzeChiffres].reduce((s, c, i) => s + Number(c) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (somme % 10)) % 10;
}

export function ean13Valide(numero: string): boolean {
  return /^\d{13}$/.test(numero) && chiffreControle(numero.slice(0, 12)) === Number(numero[12]);
}

/** Les 95 modules du code-barres (true = barre). */
export function genererEan13(numero: string): boolean[] {
  if (!ean13Valide(numero)) throw new Error('Numéro EAN-13 invalide.');
  const chiffres = [...numero].map(Number);
  const parite = PARITE[chiffres[0]];
  let motif = '101';
  for (let i = 1; i <= 6; i++) motif += (parite[i - 1] === 'L' ? L : G)[chiffres[i]];
  motif += '01010';
  for (let i = 7; i <= 12; i++) motif += R[chiffres[i]];
  motif += '101';
  return [...motif].map((c) => c === '1');
}
