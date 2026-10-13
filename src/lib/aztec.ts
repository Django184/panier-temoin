// Générateur de code Aztec (ISO/IEC 24778), le format des cartes Cumulus
// dans l'app Migros et Google Wallet. Sans dépendance.
//
// Les données sont encodées en un seul segment « binary shift » (octets
// bruts) : c'est un encodage valide et lu par tous les lecteurs, un peu
// moins compact que l'encodage optimal, sans importance pour une
// cinquantaine de caractères. Correction d'erreur : 33 % + 3 mots, comme
// la valeur par défaut de ZXing. Disposition d'après l'encodeur ZXing
// (Apache 2.0).

const POLYNOMES: Record<number, number> = { 4: 0x13, 6: 0x43, 8: 0x12d, 10: 0x409, 12: 0x1069 };

/** Corps de Galois GF(2^m) : tables d'exponentielles et de logarithmes. */
class Corps {
  readonly exp: number[];
  readonly log: number[];
  readonly taille: number;

  constructor(m: number) {
    this.taille = 1 << m;
    this.exp = new Array<number>(this.taille).fill(0);
    this.log = new Array<number>(this.taille).fill(0);
    let x = 1;
    for (let i = 0; i < this.taille; i++) {
      this.exp[i] = x;
      x <<= 1;
      if (x >= this.taille) x = (x ^ POLYNOMES[m]) & (this.taille - 1);
    }
    for (let i = 0; i < this.taille - 1; i++) this.log[this.exp[i]] = i;
  }

  mul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return this.exp[(this.log[a] + this.log[b]) % (this.taille - 1)];
  }
}

const CORPS: Record<number, Corps> = {};
function corps(m: number): Corps {
  CORPS[m] ??= new Corps(m);
  return CORPS[m];
}

/**
 * Ajoute `nbCorrection` mots de correction Reed-Solomon aux mots de
 * données (générateur ∏ (x − α^i), i = 1…n, comme pour Aztec).
 */
function reedSolomon(donnees: number[], nbCorrection: number, m: number): number[] {
  const gf = corps(m);
  // Coefficients du générateur, du degré le plus haut au plus bas.
  let generateur = [1];
  for (let i = 1; i <= nbCorrection; i++) {
    const racine = gf.exp[i];
    const suivant = new Array<number>(generateur.length + 1).fill(0);
    generateur.forEach((c, j) => {
      suivant[j] ^= c;
      suivant[j + 1] ^= gf.mul(c, racine);
    });
    generateur = suivant;
  }
  const reste = new Array<number>(nbCorrection).fill(0);
  for (const d of donnees) {
    const facteur = d ^ (reste.shift() as number);
    reste.push(0);
    for (let i = 0; i < nbCorrection; i++) reste[i] ^= gf.mul(generateur[i + 1], facteur);
  }
  return [...donnees, ...reste];
}

class Bits {
  readonly valeurs: boolean[] = [];

  ajouter(valeur: number, longueur: number): void {
    for (let i = longueur - 1; i >= 0; i--) this.valeurs.push(((valeur >>> i) & 1) === 1);
  }

  get longueur(): number {
    return this.valeurs.length;
  }

  lire(i: number): boolean {
    return this.valeurs[i] === true;
  }
}

/** Données : passage en mode octets (B/S) depuis le mode majuscules. */
function bitsDonnees(octets: Uint8Array): Bits {
  const bits = new Bits();
  let debut = 0;
  while (debut < octets.length) {
    // Un segment B/S couvre au plus 2078 octets (31 + 2047).
    const n = Math.min(octets.length - debut, 2078);
    bits.ajouter(31, 5); // B/S
    if (n <= 31) {
      bits.ajouter(n, 5);
    } else {
      bits.ajouter(0, 5);
      bits.ajouter(n - 31, 11);
    }
    for (let i = 0; i < n; i++) bits.ajouter(octets[debut + i], 8);
    debut += n;
  }
  return bits;
}

/** Bourrage : aucun mot ne doit être tout à 0 ou tout à 1. */
function bourrer(bits: Bits, taille: number): Bits {
  const sortie = new Bits();
  const n = bits.longueur;
  const masque = (1 << taille) - 2;
  for (let i = 0; i < n; i += taille) {
    let mot = 0;
    for (let j = 0; j < taille; j++) {
      if (i + j >= n || bits.lire(i + j)) mot |= 1 << (taille - 1 - j);
    }
    if ((mot & masque) === masque) {
      sortie.ajouter(mot & masque, taille);
      i--;
    } else if ((mot & masque) === 0) {
      sortie.ajouter(mot | 1, taille);
      i--;
    } else {
      sortie.ajouter(mot, taille);
    }
  }
  return sortie;
}

/** Mots de données + correction, en bits, précédés du remplissage de début. */
function avecCorrection(bits: Bits, totalBits: number, taille: number): Bits {
  const nbMots = bits.longueur / taille;
  const totalMots = Math.floor(totalBits / taille);
  const mots: number[] = [];
  for (let i = 0; i < nbMots; i++) {
    let valeur = 0;
    for (let j = 0; j < taille; j++) if (bits.lire(i * taille + j)) valeur |= 1 << (taille - j - 1);
    mots.push(valeur);
  }
  const complet = reedSolomon(mots, totalMots - nbMots, taille);
  const sortie = new Bits();
  sortie.ajouter(0, totalBits % taille);
  for (const mot of complet) sortie.ajouter(mot, taille);
  return sortie;
}

function bitsCouches(couches: number, compact: boolean): number {
  return ((compact ? 88 : 112) + 16 * couches) * couches;
}

function tailleMot(couches: number): number {
  if (couches <= 2) return 6;
  if (couches <= 8) return 8;
  if (couches <= 22) return 10;
  return 12;
}

/**
 * Matrice d'un code Aztec pour le texte donné (true = module sombre),
 * sans marge : l'Aztec n'en exige pas, une marge de 2 modules suffit.
 */
export function genererAztec(texte: string): boolean[][] {
  const bits = bitsDonnees(new TextEncoder().encode(texte));
  const nbCorrection = Math.floor((bits.longueur * 33) / 100) + 11;
  const totalVoulu = bits.longueur + nbCorrection;

  let compact = true;
  let couches = 0;
  let taille = 0;
  let bourres: Bits | null = null;
  let totalCouches = 0;
  for (let i = 0; ; i++) {
    if (i > 32) throw new Error('Texte trop long pour un code Aztec.');
    compact = i <= 3;
    couches = compact ? i + 1 : i;
    totalCouches = bitsCouches(couches, compact);
    if (totalVoulu > totalCouches) continue;
    if (bourres === null || taille !== tailleMot(couches)) {
      taille = tailleMot(couches);
      bourres = bourrer(bits, taille);
    }
    const utilisables = totalCouches - (totalCouches % taille);
    if (compact && bourres.longueur > taille * 64) continue;
    if (bourres.longueur + nbCorrection <= utilisables) break;
  }
  const message = avecCorrection(bourres as Bits, totalCouches, taille);
  const nbMotsMessage = (bourres as Bits).longueur / taille;

  // Message de mode : nombre de couches et de mots de données.
  const mode = new Bits();
  if (compact) {
    mode.ajouter(couches - 1, 2);
    mode.ajouter(nbMotsMessage - 1, 6);
  } else {
    mode.ajouter(couches - 1, 5);
    mode.ajouter(nbMotsMessage - 1, 11);
  }
  const messageMode = avecCorrection(mode, compact ? 28 : 40, 4);

  // Disposition.
  const tailleBase = (compact ? 11 : 14) + couches * 4;
  const position = new Array<number>(tailleBase).fill(0);
  let tailleMatrice: number;
  if (compact) {
    tailleMatrice = tailleBase;
    for (let i = 0; i < tailleBase; i++) position[i] = i;
  } else {
    tailleMatrice = tailleBase + 1 + 2 * Math.floor((Math.floor(tailleBase / 2) - 1) / 15);
    const centreBase = Math.floor(tailleBase / 2);
    const centre = Math.floor(tailleMatrice / 2);
    for (let i = 0; i < centreBase; i++) {
      const decalage = i + Math.floor(i / 15);
      position[centreBase - i - 1] = centre - decalage - 1;
      position[centreBase + i] = centre + decalage + 1;
    }
  }

  const matrice = Array.from({ length: tailleMatrice }, () => new Array<boolean>(tailleMatrice).fill(false));
  const poser = (x: number, y: number) => {
    matrice[y][x] = true;
  };

  let debutCouche = 0;
  for (let i = 0; i < couches; i++) {
    const longueurRangee = (couches - i) * 4 + (compact ? 9 : 12);
    for (let j = 0; j < longueurRangee; j++) {
      const colonne = j * 2;
      for (let k = 0; k < 2; k++) {
        if (message.lire(debutCouche + colonne + k)) poser(position[i * 2 + k], position[i * 2 + j]);
        if (message.lire(debutCouche + longueurRangee * 2 + colonne + k)) {
          poser(position[i * 2 + j], position[tailleBase - 1 - i * 2 - k]);
        }
        if (message.lire(debutCouche + longueurRangee * 4 + colonne + k)) {
          poser(position[tailleBase - 1 - i * 2 - k], position[tailleBase - 1 - i * 2 - j]);
        }
        if (message.lire(debutCouche + longueurRangee * 6 + colonne + k)) {
          poser(position[tailleBase - 1 - i * 2 - j], position[i * 2 + k]);
        }
      }
    }
    debutCouche += longueurRangee * 8;
  }

  const centre = Math.floor(tailleMatrice / 2);
  // Message de mode autour de la cible.
  if (compact) {
    for (let i = 0; i < 7; i++) {
      const d = centre - 3 + i;
      if (messageMode.lire(i)) poser(d, centre - 5);
      if (messageMode.lire(i + 7)) poser(centre + 5, d);
      if (messageMode.lire(20 - i)) poser(d, centre + 5);
      if (messageMode.lire(27 - i)) poser(centre - 5, d);
    }
  } else {
    for (let i = 0; i < 10; i++) {
      const d = centre - 5 + i + Math.floor(i / 5);
      if (messageMode.lire(i)) poser(d, centre - 7);
      if (messageMode.lire(i + 10)) poser(centre + 7, d);
      if (messageMode.lire(29 - i)) poser(d, centre + 7);
      if (messageMode.lire(39 - i)) poser(centre - 7, d);
    }
  }

  // Cible centrale (« bull's eye ») et repères d'orientation.
  const cible = compact ? 5 : 7;
  for (let i = 0; i < cible; i += 2) {
    for (let j = centre - i; j <= centre + i; j++) {
      poser(j, centre - i);
      poser(j, centre + i);
      poser(centre - i, j);
      poser(centre + i, j);
    }
  }
  poser(centre - cible, centre - cible);
  poser(centre - cible + 1, centre - cible);
  poser(centre - cible, centre - cible + 1);
  poser(centre + cible, centre - cible);
  poser(centre + cible, centre - cible + 1);
  poser(centre + cible, centre + cible - 1);

  // Grille de référence des grands symboles.
  if (!compact) {
    for (let i = 0, j = 0; i < Math.floor(tailleBase / 2) - 1; i += 15, j += 16) {
      for (let k = centre & 1; k < tailleMatrice; k += 2) {
        poser(centre - j, k);
        poser(centre + j, k);
        poser(k, centre - j);
        poser(k, centre + j);
      }
    }
  }
  return matrice;
}
