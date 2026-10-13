// Synchronisation de la liste de courses et des recettes avec la base,
// pour les partager entre les téléphones du foyer.
//
// Hors ligne d'abord : chaque changement est appliqué tout de suite sur
// le téléphone et mis dans une file d'attente (gardée), envoyée dès que
// possible. La version partagée est relue au démarrage, au retour dans
// l'app, au retour du réseau et en direct quand l'autre téléphone change
// quelque chose (Supabase Realtime). Les changements pas encore envoyés
// l'emportent sur la version relue (voir fusion.ts).

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase.ts';
import { ordreArticles, type ArticleCourses } from '../lib/courses.ts';
import type { Recette } from '../lib/recettes.ts';
import { differences, fusionner, memesListes, type Attente } from './fusion.ts';
import { etatSynchro, liste, recettes } from './local.ts';

type Table = 'courses_articles' | 'recettes';
interface Operation {
  table: Table;
  type: 'upsert' | 'delete';
  id: string;
  /** Moment du changement : une opération remplacée entre-temps n'est pas effacée. */
  a: number;
}

const CLE_FILE = 'panier-temoin:synchro-file';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------
// Correspondance avec les lignes de la base
// ---------------------------------------------------------------------

interface LigneArticle {
  id: string;
  texte: string;
  rayon: string;
  recette_id: string | null;
  recette: string;
  ingredient: number | null;
  coche: boolean;
  manuel: boolean;
  cree_le: string;
}

interface LigneRecette {
  id: string;
  titre: string;
  personnes: number | null;
  portions: number | null;
  infos: string;
  ingredients: Recette['ingredients'];
  etapes: string[];
  astuces: string[];
  nutrition: string;
  importe_le: string;
  modifie_le: string | null;
}

const borner = (n: number | null) => (n === null ? null : Math.min(99, Math.max(1, Math.round(n))));

function ligneArticle(a: ArticleCourses): LigneArticle {
  return {
    id: a.id,
    texte: a.texte.slice(0, 300),
    rayon: a.rayon.slice(0, 80),
    recette_id: a.recetteId && UUID.test(a.recetteId) ? a.recetteId : null,
    recette: (a.recette ?? '').slice(0, 300),
    ingredient: a.ingredient,
    coche: a.coche,
    manuel: a.manuel === true,
    cree_le: a.creeLe ?? new Date(0).toISOString(),
  };
}

function versArticle(l: LigneArticle): ArticleCourses {
  return {
    id: l.id,
    texte: l.texte,
    rayon: l.rayon,
    recetteId: l.recette_id,
    recette: l.recette,
    ingredient: l.ingredient,
    coche: l.coche,
    ...(l.manuel ? { manuel: true } : {}),
    creeLe: new Date(l.cree_le).toISOString(),
  };
}

function ligneRecette(r: Recette): LigneRecette {
  return {
    id: r.id,
    titre: (r.titre || 'Recette').slice(0, 300),
    personnes: borner(r.personnes),
    portions: borner(r.portions),
    infos: r.infos.slice(0, 1000),
    ingredients: r.ingredients,
    etapes: r.etapes,
    astuces: r.astuces,
    nutrition: r.nutrition.slice(0, 1000),
    importe_le: r.importeLe,
    modifie_le: r.modifieLe,
  };
}

function versRecette(l: LigneRecette): Recette {
  return {
    id: l.id,
    titre: l.titre,
    personnes: l.personnes,
    portions: l.portions,
    infos: l.infos,
    ingredients: Array.isArray(l.ingredients) ? l.ingredients : [],
    etapes: Array.isArray(l.etapes) ? l.etapes : [],
    astuces: Array.isArray(l.astuces) ? l.astuces : [],
    nutrition: l.nutrition,
    importeLe: new Date(l.importe_le).toISOString(),
    modifieLe: l.modifie_le ? new Date(l.modifie_le).toISOString() : null,
  };
}

// Comparaison sur la forme envoyée à la base (dates normalisées).
const memeArticle = (a: ArticleCourses, b: ArticleCourses) =>
  JSON.stringify({ ...ligneArticle(a), cree_le: a.creeLe ? new Date(a.creeLe).getTime() : 0 }) ===
  JSON.stringify({ ...ligneArticle(b), cree_le: b.creeLe ? new Date(b.creeLe).getTime() : 0 });
const memeRecette = (a: Recette, b: Recette) => {
  const norme = (r: Recette) => ({
    ...ligneRecette(r),
    importe_le: new Date(r.importeLe).getTime(),
    modifie_le: r.modifieLe ? new Date(r.modifieLe).getTime() : null,
  });
  return JSON.stringify(norme(a)) === JSON.stringify(norme(b));
};
const ordreRecettes = (a: Recette, b: Recette) => b.importeLe.localeCompare(a.importeLe) || a.id.localeCompare(b.id);

// ---------------------------------------------------------------------
// File d'attente
// ---------------------------------------------------------------------

function lireFile(): Record<string, Operation> {
  try {
    const brut = window.localStorage.getItem(CLE_FILE);
    return brut ? (JSON.parse(brut) as Record<string, Operation>) : {};
  } catch {
    return {};
  }
}

let file = lireFile();

function garderFile(): void {
  try {
    window.localStorage.setItem(CLE_FILE, JSON.stringify(file));
  } catch {
    // La file reste en mémoire jusqu'au prochain envoi.
  }
}

function mettreEnFile(table: Table, type: Operation['type'], ids: string[]): void {
  const a = Date.now();
  for (const id of ids) {
    if (UUID.test(id)) file[`${table}:${id}`] = { table, type, id, a };
  }
  garderFile();
}

function attentePour(table: Table): Attente {
  return new Map(Object.values(file).filter((o) => o.table === table).map((o) => [o.id, o.type]));
}

// Changements faits sur ce téléphone → file d'attente.
liste.observer((avant, apres) => {
  const d = differences(avant, apres, memeArticle);
  mettreEnFile('courses_articles', 'upsert', d.modifies.map((x) => x.id));
  mettreEnFile('courses_articles', 'delete', d.supprimes);
  planifierEnvoi();
});

recettes.observer((avant, apres) => {
  const d = differences(avant, apres, memeRecette);
  mettreEnFile('recettes', 'upsert', d.modifies.map((x) => x.id));
  mettreEnFile('recettes', 'delete', d.supprimes);
  planifierEnvoi();
});

// ---------------------------------------------------------------------
// Envoi et relecture
// ---------------------------------------------------------------------

let actif = false;
let envoiEnCours = false;
let generation = 0; // augmente à chaque envoi réussi
let minuterieEnvoi: number | undefined;
let minuterieRelecture: number | undefined;
let canal: RealtimeChannel | null = null;
let intervalle: number | undefined;

function etatApresEnvoi(): void {
  if (!actif) return etatSynchro.remplacer('local');
  if (Object.keys(file).length === 0) etatSynchro.remplacer('a_jour');
  else etatSynchro.remplacer(navigator.onLine ? 'envoi' : 'hors_ligne');
}

function planifierEnvoi(delai = 600): void {
  if (!actif) return;
  window.clearTimeout(minuterieEnvoi);
  minuterieEnvoi = window.setTimeout(() => void envoyer(), delai);
}

function planifierRelecture(delai = 350): void {
  if (!actif) return;
  window.clearTimeout(minuterieRelecture);
  minuterieRelecture = window.setTimeout(() => void relire(), delai);
}

/** Envoie des lignes ; en cas de ligne refusée par la base, l'écarte et envoie les autres. */
async function envoyerLignes(table: Table, lignes: object[]): Promise<boolean> {
  if (lignes.length === 0) return true;
  const { error } = await supabase.from(table).upsert(lignes);
  if (!error) return true;
  if (!/^2[23]/.test(error.code ?? '')) throw error;
  for (const ligne of lignes) {
    const { error: e } = await supabase.from(table).upsert(ligne);
    if (e && !/^2[23]/.test(e.code ?? '')) throw e;
    if (e) console.warn(`Ligne refusée par la base (${table}) :`, e.message);
  }
  return true;
}

async function envoyer(): Promise<void> {
  if (!actif || envoiEnCours) return;
  const ops = Object.values(file);
  if (ops.length === 0) return etatApresEnvoi();
  if (!navigator.onLine) return etatSynchro.remplacer('hors_ligne');

  envoiEnCours = true;
  etatSynchro.remplacer('envoi');
  try {
    const articles = new Map(liste.lire().map((a) => [a.id, a]));
    const recs = new Map(recettes.lire().map((r) => [r.id, r]));
    const ups = (table: Table) => ops.filter((o) => o.table === table && o.type === 'upsert').map((o) => o.id);
    const dels = (table: Table) => ops.filter((o) => o.table === table && o.type === 'delete').map((o) => o.id);

    // Recettes d'abord : les articles y font référence.
    await envoyerLignes('recettes', ups('recettes').flatMap((id) => (recs.has(id) ? [ligneRecette(recs.get(id) as Recette)] : [])));
    await envoyerLignes(
      'courses_articles',
      ups('courses_articles').flatMap((id) => (articles.has(id) ? [ligneArticle(articles.get(id) as ArticleCourses)] : [])),
    );
    for (const table of ['courses_articles', 'recettes'] as const) {
      const ids = dels(table);
      if (ids.length > 0) {
        const { error } = await supabase.from(table).delete().in('id', ids);
        if (error) throw error;
      }
    }

    // Retire de la file ce qui a été envoyé, sauf ce qui a changé depuis.
    for (const op of ops) {
      const cle = `${op.table}:${op.id}`;
      if (file[cle]?.a === op.a) delete file[cle];
    }
    garderFile();
    generation++;
    etatApresEnvoi();
  } catch (e) {
    console.warn('Synchronisation : envoi reporté', e);
    etatSynchro.remplacer(navigator.onLine ? 'erreur' : 'hors_ligne');
    window.clearTimeout(minuterieEnvoi);
    minuterieEnvoi = window.setTimeout(() => void envoyer(), 15000);
  } finally {
    envoiEnCours = false;
  }
  if (actif && Object.keys(file).length > 0) planifierEnvoi();
}

async function relire(): Promise<void> {
  if (!actif || !navigator.onLine) return;
  const generationDebut = generation;
  const [a, r] = await Promise.all([
    supabase.from('courses_articles').select('id, texte, rayon, recette_id, recette, ingredient, coche, manuel, cree_le'),
    supabase.from('recettes').select('id, titre, personnes, portions, infos, ingredients, etapes, astuces, nutrition, importe_le, modifie_le'),
  ]);
  if (a.error || r.error) {
    // Tables pas encore créées (migration 8 non exécutée) : on reste en local.
    console.warn('Synchronisation : relecture impossible', a.error ?? r.error);
    etatSynchro.remplacer('erreur');
    return;
  }
  // Un envoi s'est terminé pendant la lecture : la version lue peut être périmée.
  if (generation !== generationDebut) return planifierRelecture(0);

  const articles = fusionner(
    liste.lire(),
    (a.data as LigneArticle[]).map(versArticle),
    attentePour('courses_articles'),
    memeArticle,
    ordreArticles,
  );
  if (!memesListes(articles, liste.lire(), memeArticle)) liste.remplacer(articles);

  const recs = fusionner(recettes.lire(), (r.data as LigneRecette[]).map(versRecette), attentePour('recettes'), memeRecette, ordreRecettes);
  if (!memesListes(recs, recettes.lire(), memeRecette)) recettes.remplacer(recs);
  etatApresEnvoi();
}

const auRetour = () => {
  if (document.visibilityState === 'visible') {
    void envoyer();
    planifierRelecture(0);
  }
};
const auReseau = () => {
  void envoyer();
  planifierRelecture(0);
};

/**
 * Démarre la synchronisation pour le compte connecté. La première fois
 * sur ce téléphone pour ce compte, la liste locale est versée dans la
 * liste partagée (elle s'y ajoute, rien n'est effacé).
 */
export function demarrerSynchro(compteId: string): void {
  if (actif) return;
  actif = true;
  const cleInitiale = `panier-temoin:synchro-initiale:${compteId}`;
  try {
    if (!window.localStorage.getItem(cleInitiale)) {
      mettreEnFile('recettes', 'upsert', recettes.lire().map((x) => x.id));
      mettreEnFile('courses_articles', 'upsert', liste.lire().map((x) => x.id));
      window.localStorage.setItem(cleInitiale, new Date().toISOString());
    }
  } catch {
    // Stockage indisponible : la liste locale reste sur ce téléphone.
  }

  document.addEventListener('visibilitychange', auRetour);
  window.addEventListener('online', auReseau);
  window.addEventListener('offline', etatApresEnvoi);
  canal = supabase
    .channel('courses-du-foyer')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courses_articles' }, () => planifierRelecture())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recettes' }, () => planifierRelecture())
    .subscribe();
  // Filet de sécurité si le direct est coupé : relecture chaque minute, app ouverte.
  intervalle = window.setInterval(() => {
    if (document.visibilityState === 'visible') planifierRelecture(0);
  }, 60000);

  void envoyer().then(() => relire());
}

export function arreterSynchro(): void {
  if (!actif) return;
  actif = false;
  window.clearTimeout(minuterieEnvoi);
  window.clearTimeout(minuterieRelecture);
  window.clearInterval(intervalle);
  document.removeEventListener('visibilitychange', auRetour);
  window.removeEventListener('online', auReseau);
  window.removeEventListener('offline', etatApresEnvoi);
  if (canal) void supabase.removeChannel(canal);
  canal = null;
  etatSynchro.remplacer('local');
}
