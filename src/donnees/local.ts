// Données gardées sur le téléphone : liste de courses, recettes de Chef
// Feta et préférences d'affichage. Utilisables sans réseau au magasin.
// Chaque donnée est un petit magasin observable : tous les écrans qui
// l'affichent se mettent à jour ensemble (onglet Recette compris).

import { useSyncExternalStore } from 'react';
import type { ArticleCourses } from '../lib/courses.ts';
import type { Recette } from '../lib/recettes.ts';

function lire<T>(cle: string, defaut: T): T {
  try {
    const brut = window.localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : defaut;
  } catch {
    return defaut;
  }
}

function ecrire(cle: string, valeur: unknown): void {
  try {
    window.localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    // Stockage plein ou indisponible : la donnée reste en mémoire.
  }
}

interface Magasin<T> {
  lire: () => T;
  /** Changement fait sur ce téléphone (signalé à la synchronisation). */
  modifier: (maj: (v: T) => T) => void;
  /** Version reçue de la base : remplace la copie locale sans être renvoyée. */
  remplacer: (v: T) => void;
  /** Être prévenu des changements faits sur ce téléphone. */
  observer: (f: (avant: T, apres: T) => void) => () => void;
  utiliser: () => T;
}

function creerMagasin<T>(cle: string | null, defaut: T, valider: (v: unknown) => T = (v) => v as T): Magasin<T> {
  let valeur = cle ? valider(lire<unknown>(cle, defaut)) : defaut;
  const ecouteurs = new Set<() => void>();
  const observateurs = new Set<(avant: T, apres: T) => void>();
  const abonner = (f: () => void) => {
    ecouteurs.add(f);
    return () => ecouteurs.delete(f);
  };
  const lireValeur = () => valeur;
  const changer = (nouvelle: T) => {
    valeur = nouvelle;
    if (cle) ecrire(cle, valeur);
    ecouteurs.forEach((f) => f());
  };
  return {
    lire: lireValeur,
    modifier: (maj) => {
      const avant = valeur;
      changer(maj(valeur));
      if (avant !== valeur) observateurs.forEach((f) => f(avant, valeur));
    },
    remplacer: changer,
    observer: (f) => {
      observateurs.add(f);
      return () => observateurs.delete(f);
    },
    utiliser: () => useSyncExternalStore(abonner, lireValeur, lireValeur),
  };
}

const tableau = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export const liste = creerMagasin<ArticleCourses[]>('panier-temoin:courses', [], (v) =>
  // Listes de première version : sans lien vers une recette enregistrée.
  tableau<ArticleCourses>(v).map((a) => ({ ...a, recetteId: a.recetteId ?? null, ingredient: a.ingredient ?? null })),
);

/** Historique des recettes, la plus récente en premier. */
export const recettes = creerMagasin<Recette[]>('panier-temoin:recettes', [], tableau);

/** Recette affichée dans l'onglet Recette. */
export const recetteActive = creerMagasin<string | null>('panier-temoin:recette-active', null);

export interface Preferences {
  /** Aides et tutoriels affichés. */
  aides: boolean;
  /** Aides déjà lues (masquées même si les aides sont actives). */
  aidesVues: string[];
}

export const preferences = creerMagasin<Preferences>('panier-temoin:preferences', { aides: true, aidesVues: [] }, (v) => {
  const p = (v ?? {}) as Partial<Preferences>;
  return { aides: p.aides !== false, aidesVues: Array.isArray(p.aidesVues) ? p.aidesVues : [] };
});

/** Aide d'un écran : visible si les aides sont actives et qu'elle n'a pas été lue. */
export function useAide(cle: string): { visible: boolean; masquer: () => void } {
  const p = preferences.utiliser();
  return {
    visible: p.aides && !p.aidesVues.includes(cle),
    masquer: () => marquerAideVue(cle),
  };
}

export function marquerAideVue(cle: string): void {
  preferences.modifier((p) => (p.aidesVues.includes(cle) ? p : { ...p, aidesVues: [...p.aidesVues, cle] }));
}

/** Identifiant UUID v4 (format attendu par la base). */
export function nouvelId(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const o = c.getRandomValues(new Uint8Array(16));
  o[6] = (o[6] & 0x0f) | 0x40;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = [...o].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** État de la synchronisation avec la base (non gardé). */
export type EtatSynchro = 'local' | 'a_jour' | 'envoi' | 'hors_ligne' | 'erreur';
export const etatSynchro = creerMagasin<EtatSynchro>(null, 'local');

/** Recettes dont des articles sont dans la liste (onglet Recette visible). */
export function useRecettesDeLaListe(): Recette[] {
  const l = liste.utiliser();
  const r = recettes.utiliser();
  const ids = new Set(l.map((a) => a.recetteId).filter(Boolean));
  return r.filter((x) => ids.has(x.id));
}
