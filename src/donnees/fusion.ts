// Fusion entre la copie locale (utilisable sans réseau) et la version
// partagée dans la base. Règle : ce que ce téléphone n'a pas encore
// envoyé l'emporte ; pour tout le reste, la base fait foi.

export type Attente = Map<string, 'upsert' | 'delete'>;

/** Changements locaux entre deux versions d'une collection. */
export function differences<T extends { id: string }>(
  avant: T[],
  apres: T[],
  egal: (a: T, b: T) => boolean,
): { modifies: T[]; supprimes: string[] } {
  const anciens = new Map(avant.map((x) => [x.id, x]));
  const nouveaux = new Set(apres.map((x) => x.id));
  return {
    modifies: apres.filter((x) => {
      const ancien = anciens.get(x.id);
      return !ancien || !egal(ancien, x);
    }),
    supprimes: avant.filter((x) => !nouveaux.has(x.id)).map((x) => x.id),
  };
}

/**
 * Version partagée + changements locaux en attente d'envoi. Les objets
 * locaux inchangés sont réutilisés tels quels (pas de rendu inutile).
 */
export function fusionner<T extends { id: string }>(
  local: T[],
  distants: T[],
  attente: Attente,
  egal: (a: T, b: T) => boolean,
  ordre: (a: T, b: T) => number,
): T[] {
  const locaux = new Map(local.map((x) => [x.id, x]));
  const resultat: T[] = [];
  const vus = new Set<string>();
  for (const d of distants) {
    vus.add(d.id);
    const op = attente.get(d.id);
    if (op === 'delete') continue;
    const l = locaux.get(d.id);
    if (op === 'upsert' && l) resultat.push(l);
    else resultat.push(l && egal(l, d) ? l : d);
  }
  for (const l of local) {
    if (!vus.has(l.id) && attente.get(l.id) === 'upsert') resultat.push(l);
  }
  return resultat.sort(ordre);
}

/** Même contenu, même ordre. */
export function memesListes<T>(a: T[], b: T[], egal: (x: T, y: T) => boolean): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i] || egal(x, b[i]));
}
