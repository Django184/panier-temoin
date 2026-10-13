// Générateur de QR code (norme ISO/IEC 18004), mode octets, versions 1
// à 10, correction d'erreur M. Sans dépendance : il sert à afficher la
// carte Cumulus, qui tient en une cinquantaine de caractères.
// Algorithme d'après le générateur de référence de Project Nayuki (MIT).

/** Blocs de correction M par version : [codes de correction par bloc, nombre de blocs]. */
const BLOCS_M: Record<number, [number, number]> = {
  1: [10, 1],
  2: [16, 1],
  3: [26, 1],
  4: [18, 2],
  5: [24, 2],
  6: [16, 4],
  7: [18, 4],
  8: [22, 4],
  9: [22, 5],
  10: [26, 5],
};

const FORMAT_M = 0; // bits de niveau de correction : L = 1, M = 0, Q = 3, H = 2

function bit(valeur: number, i: number): boolean {
  return ((valeur >>> i) & 1) !== 0;
}

function modulesBruts(version: number): number {
  let resultat = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const nbAlignements = Math.floor(version / 7) + 2;
    resultat -= (25 * nbAlignements - 10) * nbAlignements - 55;
    if (version >= 7) resultat -= 36;
  }
  return resultat;
}

function capaciteDonnees(version: number): number {
  const [ecParBloc, nbBlocs] = BLOCS_M[version];
  return Math.floor(modulesBruts(version) / 8) - ecParBloc * nbBlocs;
}

// --- Reed-Solomon sur GF(256), polynôme 0x11D ---------------------------

function multiplier(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function diviseurRS(degre: number): number[] {
  const resultat = new Array<number>(degre).fill(0);
  resultat[degre - 1] = 1;
  let racine = 1;
  for (let i = 0; i < degre; i++) {
    for (let j = 0; j < resultat.length; j++) {
      resultat[j] = multiplier(resultat[j], racine);
      if (j + 1 < resultat.length) resultat[j] ^= resultat[j + 1];
    }
    racine = multiplier(racine, 0x02);
  }
  return resultat;
}

function resteRS(donnees: number[], diviseur: number[]): number[] {
  const resultat = new Array<number>(diviseur.length).fill(0);
  for (const octet of donnees) {
    const facteur = octet ^ (resultat.shift() as number);
    resultat.push(0);
    diviseur.forEach((coef, i) => {
      resultat[i] ^= multiplier(coef, facteur);
    });
  }
  return resultat;
}

// --- Encodage --------------------------------------------------------------

function codesDonnees(octets: Uint8Array, version: number): number[] {
  const bits: number[] = [];
  const ajouter = (valeur: number, longueur: number) => {
    for (let i = longueur - 1; i >= 0; i--) bits.push((valeur >>> i) & 1);
  };
  ajouter(0b0100, 4); // mode octets
  ajouter(octets.length, version < 10 ? 8 : 16);
  for (const o of octets) ajouter(o, 8);

  const capaciteBits = capaciteDonnees(version) * 8;
  ajouter(0, Math.min(4, capaciteBits - bits.length));
  ajouter(0, (8 - (bits.length % 8)) % 8);
  for (let remplissage = 0xec; bits.length < capaciteBits; remplissage ^= 0xec ^ 0x11) ajouter(remplissage, 8);

  const codes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    codes.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
  }
  return codes;
}

function avecCorrection(donnees: number[], version: number): number[] {
  const [ecParBloc, nbBlocs] = BLOCS_M[version];
  const codesBruts = Math.floor(modulesBruts(version) / 8);
  const nbBlocsCourts = nbBlocs - (codesBruts % nbBlocs);
  const longueurCourte = Math.floor(codesBruts / nbBlocs);
  const diviseur = diviseurRS(ecParBloc);

  const blocs: number[][] = [];
  for (let i = 0, k = 0; i < nbBlocs; i++) {
    const longueur = longueurCourte - ecParBloc + (i < nbBlocsCourts ? 0 : 1);
    const bloc = donnees.slice(k, k + longueur);
    k += longueur;
    const correction = resteRS(bloc, diviseur);
    if (i < nbBlocsCourts) bloc.push(0);
    blocs.push(bloc.concat(correction));
  }

  const resultat: number[] = [];
  for (let i = 0; i < blocs[0].length; i++) {
    blocs.forEach((bloc, j) => {
      if (i !== longueurCourte - ecParBloc || j >= nbBlocsCourts) resultat.push(bloc[i]);
    });
  }
  return resultat;
}

// --- Matrice ---------------------------------------------------------------

class Matrice {
  readonly version: number;
  readonly taille: number;
  readonly modules: boolean[][];
  readonly fonction: boolean[][];

  constructor(version: number) {
    this.version = version;
    this.taille = version * 4 + 17;
    this.modules = Array.from({ length: this.taille }, () => new Array<boolean>(this.taille).fill(false));
    this.fonction = Array.from({ length: this.taille }, () => new Array<boolean>(this.taille).fill(false));
  }

  poser(x: number, y: number, sombre: boolean): void {
    this.modules[y][x] = sombre;
    this.fonction[y][x] = true;
  }

  motifsFixes(): void {
    for (let i = 0; i < this.taille; i++) {
      this.poser(6, i, i % 2 === 0);
      this.poser(i, 6, i % 2 === 0);
    }
    this.reperage(3, 3);
    this.reperage(this.taille - 4, 3);
    this.reperage(3, this.taille - 4);

    const positions = this.positionsAlignement();
    const n = positions.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const coin = (i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0);
        if (!coin) this.alignement(positions[i], positions[j]);
      }
    }
    this.format(0);
    this.versionInfo();
  }

  private positionsAlignement(): number[] {
    if (this.version === 1) return [];
    const nb = Math.floor(this.version / 7) + 2;
    const pas = Math.floor((this.version * 8 + nb * 3 + 5) / (nb * 4 - 4)) * 2;
    const resultat = [6];
    for (let pos = this.taille - 7; resultat.length < nb; pos -= pas) resultat.splice(1, 0, pos);
    return resultat;
  }

  private reperage(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.taille && yy >= 0 && yy < this.taille) this.poser(xx, yy, distance !== 2 && distance !== 4);
      }
    }
  }

  private alignement(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) this.poser(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  format(masque: number): void {
    const donnees = (FORMAT_M << 3) | masque;
    let reste = donnees;
    for (let i = 0; i < 10; i++) reste = (reste << 1) ^ ((reste >>> 9) * 0x537);
    const bits = ((donnees << 10) | reste) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.poser(8, i, bit(bits, i));
    this.poser(8, 7, bit(bits, 6));
    this.poser(8, 8, bit(bits, 7));
    this.poser(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) this.poser(14 - i, 8, bit(bits, i));

    for (let i = 0; i < 8; i++) this.poser(this.taille - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) this.poser(8, this.taille - 15 + i, bit(bits, i));
    this.poser(8, this.taille - 8, true);
  }

  private versionInfo(): void {
    if (this.version < 7) return;
    let reste = this.version;
    for (let i = 0; i < 12; i++) reste = (reste << 1) ^ ((reste >>> 11) * 0x1f25);
    const bits = (this.version << 12) | reste;
    for (let i = 0; i < 18; i++) {
      const sombre = bit(bits, i);
      const a = this.taille - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.poser(a, b, sombre);
      this.poser(b, a, sombre);
    }
  }

  placer(codes: number[]): void {
    let i = 0;
    for (let droite = this.taille - 1; droite >= 1; droite -= 2) {
      if (droite === 6) droite = 5;
      for (let v = 0; v < this.taille; v++) {
        for (let j = 0; j < 2; j++) {
          const x = droite - j;
          const montant = ((droite + 1) & 2) === 0;
          const y = montant ? this.taille - 1 - v : v;
          if (!this.fonction[y][x] && i < codes.length * 8) {
            this.modules[y][x] = bit(codes[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  masquer(masque: number): void {
    for (let y = 0; y < this.taille; y++) {
      for (let x = 0; x < this.taille; x++) {
        let inverser: boolean;
        switch (masque) {
          case 0: inverser = (x + y) % 2 === 0; break;
          case 1: inverser = y % 2 === 0; break;
          case 2: inverser = x % 3 === 0; break;
          case 3: inverser = (x + y) % 3 === 0; break;
          case 4: inverser = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inverser = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: inverser = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: inverser = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (!this.fonction[y][x] && inverser) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  /** Pénalité de la norme : longues suites, blocs 2×2, faux motifs de repérage, équilibre. */
  penalite(): number {
    const t = this.taille;
    let score = 0;
    const lignes: boolean[][] = [];
    for (let y = 0; y < t; y++) lignes.push(this.modules[y]);
    for (let x = 0; x < t; x++) lignes.push(this.modules.map((rangee) => rangee[x]));

    for (const ligne of lignes) {
      let suite = 1;
      for (let i = 1; i <= t; i++) {
        if (i < t && ligne[i] === ligne[i - 1]) {
          suite++;
        } else {
          if (suite >= 5) score += 3 + (suite - 5);
          suite = 1;
        }
      }
      const texte = ligne.map((m) => (m ? '1' : '0')).join('');
      for (const motif of ['10111010000', '00001011101']) {
        for (let i = texte.indexOf(motif); i !== -1; i = texte.indexOf(motif, i + 1)) score += 40;
      }
    }

    for (let y = 0; y < t - 1; y++) {
      for (let x = 0; x < t - 1; x++) {
        const c = this.modules[y][x];
        if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1]) score += 3;
      }
    }

    const sombres = this.modules.reduce((n, rangee) => n + rangee.filter(Boolean).length, 0);
    const total = t * t;
    score += (Math.ceil(Math.abs(sombres * 20 - total * 10) / total) - 1) * 10;
    return score;
  }
}

/**
 * Matrice d'un QR code pour le texte donné (true = module sombre),
 * sans la marge blanche de 4 modules, à ajouter à l'affichage.
 */
export function genererQR(texte: string): boolean[][] {
  const octets = new TextEncoder().encode(texte);
  let version = 1;
  while (version <= 10 && 4 + (version < 10 ? 8 : 16) + octets.length * 8 > capaciteDonnees(version) * 8) version++;
  if (version > 10) throw new Error('Texte trop long pour un QR code de version 10.');

  const matrice = new Matrice(version);
  matrice.motifsFixes();
  matrice.placer(avecCorrection(codesDonnees(octets, version), version));

  let meilleur = 0;
  let meilleurScore = Infinity;
  for (let masque = 0; masque < 8; masque++) {
    matrice.masquer(masque);
    matrice.format(masque);
    const score = matrice.penalite();
    if (score < meilleurScore) {
      meilleur = masque;
      meilleurScore = score;
    }
    matrice.masquer(masque); // annule
  }
  matrice.masquer(meilleur);
  matrice.format(meilleur);
  return matrice.modules;
}
