// Champs de saisie numériques : la valeur affichée reste celle tapée
// (« 2. » pendant la frappe) et la valeur transmise est en centimes.

import { useEffect, useState } from 'react';
import { enFrancs, versCentimes } from '../lib/montants.ts';

interface ProprietesMontant {
  etiquette: string;
  valeur: number | null;
  onChange: (centimes: number | null) => void;
  /** Valeur lue sans certitude : surlignée. */
  douteux?: boolean;
  /** Valeur corrigée à la main : écrite au stylo. */
  corrige?: boolean;
  lectureSeule?: boolean;
  suffixe?: string;
}

export function ChampMontant({ etiquette, valeur, onChange, douteux, corrige, lectureSeule, suffixe }: ProprietesMontant) {
  const [texte, setTexte] = useState(enFrancs(valeur));

  useEffect(() => {
    if (versCentimes(texte) !== valeur) setTexte(enFrancs(valeur));
    // La valeur externe ne remplace le texte que si elle a vraiment changé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur]);

  const classes = ['champ', 'champ-chiffre', douteux ? 'est-douteux' : '', corrige ? 'est-corrige' : ''].join(' ');
  return (
    <label className={classes}>
      <span className="champ-etiquette">
        {etiquette}
        {suffixe ? <span className="champ-suffixe"> {suffixe}</span> : null}
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={texte}
        readOnly={lectureSeule}
        onChange={(e) => {
          setTexte(e.target.value);
          const t = e.target.value.trim();
          onChange(t === '' ? null : versCentimes(t));
        }}
      />
    </label>
  );
}

interface ProprietesNombre {
  etiquette: string;
  valeur: number;
  onChange: (valeur: number) => void;
  douteux?: boolean;
  corrige?: boolean;
  lectureSeule?: boolean;
  decimales?: number;
  suffixe?: string;
}

export function ChampNombre({ etiquette, valeur, onChange, douteux, corrige, lectureSeule, decimales = 0, suffixe }: ProprietesNombre) {
  const formater = (v: number) => (decimales > 0 ? v.toFixed(decimales) : String(v));
  const [texte, setTexte] = useState(formater(valeur));

  useEffect(() => {
    if (Number(texte.replace(',', '.')) !== valeur) setTexte(formater(valeur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur]);

  const classes = ['champ', 'champ-chiffre', douteux ? 'est-douteux' : '', corrige ? 'est-corrige' : ''].join(' ');
  return (
    <label className={classes}>
      <span className="champ-etiquette">
        {etiquette}
        {suffixe ? <span className="champ-suffixe"> {suffixe}</span> : null}
      </span>
      <input
        type="text"
        inputMode={decimales > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={texte}
        readOnly={lectureSeule}
        onChange={(e) => {
          setTexte(e.target.value);
          const v = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(v) && v > 0) onChange(v);
        }}
      />
    </label>
  );
}

/** Les 26 cantons, pour les listes de choix. */
export const CANTONS: Array<[string, string]> = [
  ['AG', 'Argovie'], ['AI', 'Appenzell Rh.-Int.'], ['AR', 'Appenzell Rh.-Ext.'], ['BE', 'Berne'],
  ['BL', 'Bâle-Campagne'], ['BS', 'Bâle-Ville'], ['FR', 'Fribourg'], ['GE', 'Genève'], ['GL', 'Glaris'],
  ['GR', 'Grisons'], ['JU', 'Jura'], ['LU', 'Lucerne'], ['NE', 'Neuchâtel'], ['NW', 'Nidwald'],
  ['OW', 'Obwald'], ['SG', 'Saint-Gall'], ['SH', 'Schaffhouse'], ['SO', 'Soleure'], ['SZ', 'Schwyz'],
  ['TG', 'Thurgovie'], ['TI', 'Tessin'], ['UR', 'Uri'], ['VD', 'Vaud'], ['VS', 'Valais'],
  ['ZG', 'Zoug'], ['ZH', 'Zurich'],
];

export function nomCanton(code: string): string {
  return CANTONS.find(([c]) => c === code)?.[1] ?? code;
}

/** « 2026-10-12 » → « 12.10.2026 ». */
export function dateSuisse(iso: string | null | undefined): string {
  if (!iso) return '';
  const [a, m, j] = iso.slice(0, 10).split('-');
  return `${j}.${m}.${a}`;
}
