// Lecture d'une photo de ticket, entièrement dans le téléphone :
// l'image n'est jamais envoyée sur un serveur.
//
// Étapes : décodage (le navigateur applique l'orientation de l'appareil
// photo), réduction à 2000 px, niveaux de gris, seuillage local (le
// papier thermique est souvent pâle et inégal), puis Tesseract avec le
// modèle français. Les photos de ticket sont souvent prises de côté :
// plusieurs orientations sont essayées et la meilleure lecture est gardée.

import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import { lireTicket } from '../lib/lecteurTicket.ts';
import type { TicketBrouillon } from '../lib/types.ts';

export interface Progression {
  etape: string;
  /** Avancement de 0 à 1, ou null s'il est inconnu. */
  part: number | null;
}

type Ecouteur = (p: Progression) => void;

let ecouteurCourant: Ecouteur | null = null;
let promesseWorker: Promise<Worker> | null = null;

function adresse(chemin: string): string {
  return new URL(`${import.meta.env.BASE_URL}${chemin}`, window.location.href).href;
}

const ETAPES: Record<string, string> = {
  'loading tesseract core': 'Chargement du moteur de lecture',
  'initializing tesseract': 'Préparation du moteur',
  'loading language traineddata': 'Chargement du modèle français',
  'initializing api': 'Préparation du moteur',
  'recognizing text': 'Lecture du ticket',
};

function obtenirWorker(): Promise<Worker> {
  if (!promesseWorker) {
    // Modèle LSTM seul : c'est le format du modèle français compact.
    promesseWorker = createWorker('fra', OEM.LSTM_ONLY, {
      workerPath: adresse('ocr/worker.min.js'),
      corePath: adresse('ocr/core'),
      langPath: adresse('ocr/lang'),
      logger: (m: { status: string; progress: number }) => {
        ecouteurCourant?.({ etape: ETAPES[m.status] ?? 'Lecture du ticket', part: m.progress ?? null });
      },
    })
      .then(async (worker) => {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          preserve_interword_spaces: '1',
        });
        return worker;
      })
      .catch((e: unknown) => {
        promesseWorker = null;
        throw e;
      });
  }
  return promesseWorker;
}

// ---------------------------------------------------------------------
// Préparation de l'image
// ---------------------------------------------------------------------

const COTE_MAX = 2000;

function chargerImage(fichier: Blob): Promise<HTMLImageElement> {
  return new Promise((resoudre, rejeter) => {
    const url = URL.createObjectURL(fichier);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resoudre(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      rejeter(new Error('Image illisible. Essayez une autre photo ou une capture d’écran.'));
    };
    image.src = url;
  });
}

/** Image redressée, réduite, en niveaux de gris et seuillée. */
async function preparer(fichier: Blob): Promise<HTMLCanvasElement> {
  const image = await chargerImage(fichier);
  const echelle = Math.min(1, COTE_MAX / Math.max(image.naturalWidth, image.naturalHeight));
  const largeur = Math.round(image.naturalWidth * echelle);
  const hauteur = Math.round(image.naturalHeight * echelle);

  const toile = document.createElement('canvas');
  toile.width = largeur;
  toile.height = hauteur;
  const ctx = toile.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Votre navigateur ne permet pas de traiter l’image.');
  ctx.drawImage(image, 0, 0, largeur, hauteur);

  const pixels = ctx.getImageData(0, 0, largeur, hauteur);
  seuillageLocal(pixels.data, largeur, hauteur);
  ctx.putImageData(pixels, 0, 0);
  return toile;
}

/**
 * Seuillage local par image intégrale : un pixel devient noir s'il est
 * nettement plus sombre que la moyenne de son voisinage. Robuste aux
 * ombres et au papier thermique pâli.
 */
function seuillageLocal(donnees: Uint8ClampedArray, largeur: number, hauteur: number): void {
  const n = largeur * hauteur;
  const gris = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const j = i * 4;
    gris[i] = 0.299 * donnees[j] + 0.587 * donnees[j + 1] + 0.114 * donnees[j + 2];
  }

  const integrale = new Float64Array((largeur + 1) * (hauteur + 1));
  for (let y = 1; y <= hauteur; y += 1) {
    let ligne = 0;
    for (let x = 1; x <= largeur; x += 1) {
      ligne += gris[(y - 1) * largeur + (x - 1)];
      integrale[y * (largeur + 1) + x] = integrale[(y - 1) * (largeur + 1) + x] + ligne;
    }
  }

  const rayon = Math.max(8, Math.round(Math.max(largeur, hauteur) / 80));
  const ecart = 12;
  for (let y = 0; y < hauteur; y += 1) {
    const y0 = Math.max(0, y - rayon);
    const y1 = Math.min(hauteur, y + rayon + 1);
    for (let x = 0; x < largeur; x += 1) {
      const x0 = Math.max(0, x - rayon);
      const x1 = Math.min(largeur, x + rayon + 1);
      const somme =
        integrale[y1 * (largeur + 1) + x1] -
        integrale[y0 * (largeur + 1) + x1] -
        integrale[y1 * (largeur + 1) + x0] +
        integrale[y0 * (largeur + 1) + x0];
      const moyenne = somme / ((x1 - x0) * (y1 - y0));
      const valeur = gris[y * largeur + x] < moyenne - ecart ? 0 : 255;
      const j = (y * largeur + x) * 4;
      donnees[j] = valeur;
      donnees[j + 1] = valeur;
      donnees[j + 2] = valeur;
      donnees[j + 3] = 255;
    }
  }
}

/** Rotation d'un quart, d'un demi ou de trois quarts de tour (sens horaire). */
function pivoter(source: HTMLCanvasElement, degres: 0 | 90 | 180 | 270): HTMLCanvasElement {
  if (degres === 0) return source;
  const toile = document.createElement('canvas');
  const quart = degres === 90 || degres === 270;
  toile.width = quart ? source.height : source.width;
  toile.height = quart ? source.width : source.height;
  const ctx = toile.getContext('2d');
  if (!ctx) return source;
  ctx.translate(toile.width / 2, toile.height / 2);
  ctx.rotate((degres * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return toile;
}

// ---------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------

/** Note d'une lecture : lignes reconnues, total et pied trouvés. */
function note(ticket: TicketBrouillon): number {
  return (
    ticket.lignes.length * 2 +
    (ticket.totalCentimes !== null ? 3 : 0) +
    (ticket.magasin.numeroFiliale !== '' ? 3 : 0)
  );
}

export interface ResultatLecture {
  brouillon: TicketBrouillon;
  rotation: 0 | 90 | 180 | 270;
}

/**
 * Lit une photo de ticket. Si « rotation » est donnée, seule cette
 * orientation est essayée ; sinon les deux plus probables d'après le
 * format de la photo.
 */
export async function lirePhoto(
  fichier: Blob,
  surProgression: Ecouteur,
  rotation?: 0 | 90 | 180 | 270,
): Promise<ResultatLecture> {
  ecouteurCourant = surProgression;
  try {
    surProgression({ etape: 'Préparation de l’image', part: null });
    const image = await preparer(fichier);
    const worker = await obtenirWorker();

    const essais: Array<0 | 90 | 180 | 270> =
      rotation !== undefined ? [rotation] : image.width > image.height * 1.1 ? [90, 270] : [0, 180];

    let meilleur: ResultatLecture | null = null;
    let meilleureNote = -1;
    for (const angle of essais) {
      surProgression({ etape: 'Lecture du ticket', part: 0 });
      const { data } = await worker.recognize(pivoter(image, angle));
      const brouillon = lireTicket(data.text);
      const n = note(brouillon);
      if (n > meilleureNote) {
        meilleur = { brouillon, rotation: angle };
        meilleureNote = n;
      }
      // Lecture convaincante : inutile d'essayer l'autre orientation.
      if (n >= 9) break;
    }
    return meilleur as ResultatLecture;
  } finally {
    ecouteurCourant = null;
  }
}
