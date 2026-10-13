// Types partagés par le lecteur de ticket, l'import depuis Claude et
// l'écran de validation. Aucun montant n'est stocké en virgule
// flottante : tout est en centimes entiers.

export type Unite = 'piece' | 'kg';

export type FormatMagasin = 'M' | 'MM' | 'MMM';

/** Champs d'une ligne qu'aucun calcul n'a confirmés. */
export type ChampLigne = 'libelle' | 'quantite' | 'prix' | 'rabais' | 'total' | 'unite';

export interface LigneBrouillon {
  /** Identifiant local, stable pendant l'édition (clé React). */
  cle: string;
  libelle: string;
  unite: Unite;
  /** Nombre de pièces, ou poids en kg pour un article pesé. */
  quantite: number;
  /** Prix normal à la pièce ou au kilo (colonne « Prix »). */
  prixCentimes: number | null;
  rabaisCentimes: number;
  totalCentimes: number | null;
  douteux: ChampLigne[];
  /** Champs modifiés à la main (affichés comme une correction au stylo). */
  corriges: ChampLigne[];
  /** Produit canonique choisi dans l'écran de validation. */
  produitId: string | null;
  /** Nom du produit à créer si aucun produit existant n'est choisi. */
  produitNom: string;
  /** L'utilisateur maintient un prix signalé comme inhabituel. */
  prixConfirme: boolean;
}

export interface MagasinBrouillon {
  numeroFiliale: string;
  nom: string;
  format: FormatMagasin | '';
  localite: string;
  canton: string;
}

export type ChampEntete = 'filiale' | 'magasin' | 'date' | 'heure' | 'total' | 'rabaisTotal';

export type MethodeExtraction = 'ocr_local' | 'import_claude' | 'saisie_manuelle';

export interface TicketBrouillon {
  magasin: MagasinBrouillon;
  /** Date au format AAAA-MM-JJ. */
  date: string;
  /** Heure du pied de ticket, au format HH:MM:SS. */
  heure: string;
  totalCentimes: number | null;
  rabaisTotalCentimes: number | null;
  lignes: LigneBrouillon[];
  douteux: ChampEntete[];
  methode: MethodeExtraction;
}
