// Fiche d'un produit : évolution du prix normal, comparaison des
// magasins, promotions. Lisible sans compte ; favori et renommage pour
// les membres connectés.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  basculerFavori,
  comparaisonMagasins,
  estFavori,
  listeMagasins,
  produit as chargerProduit,
  renommerProduit,
  seriePrix,
  statsPromotions,
  type Magasin,
  type PointSerie,
  type PrixMagasin,
  type Produit,
  type StatsPromotions,
} from '../api.ts';
import { enFrancs } from '../lib/montants.ts';
import { useSession } from '../session.tsx';
import { GraphiqueLigne } from '../composants/GraphiqueLigne.tsx';
import { ComparaisonMagasins } from '../composants/ComparaisonMagasins.tsx';
import { dateSuisse, nomCanton } from '../composants/Champs.tsx';

type Periode = '3m' | '1a' | 'tout';

function debutPeriode(periode: Periode): string | null {
  if (periode === 'tout') return null;
  const d = new Date();
  d.setMonth(d.getMonth() - (periode === '3m' ? 3 : 12));
  return d.toISOString().slice(0, 10);
}

const formatSemaine = (secondes: number) =>
  new Date(secondes * 1000).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' });

export function FicheProduit({ id }: { id: string }) {
  const { session } = useSession();
  const [produit, setProduit] = useState<Produit | null | undefined>(undefined);
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [periode, setPeriode] = useState<Periode>('1a');
  const [magasinId, setMagasinId] = useState('');
  const [canton, setCanton] = useState('');
  const [serie, setSerie] = useState<PointSerie[]>([]);
  const [comparaison, setComparaison] = useState<PrixMagasin[]>([]);
  const [promos, setPromos] = useState<StatsPromotions | null>(null);
  const [favori, setFavori] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    chargerProduit(id).then(setProduit).catch((e: Error) => setErreur(e.message));
    listeMagasins().then(setMagasins).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    if (session) estFavori(id).then(setFavori).catch(() => undefined);
  }, [id, session]);

  // Fruits et légumes : comparaison sur 60 jours, sinon la saison des
  // visites l'emporterait sur l'écart réel entre magasins.
  const joursComparaison = produit?.vendu_au_poids ? 60 : 180;

  useEffect(() => {
    if (!produit) return;
    seriePrix(id, { magasinId: magasinId || null, canton: canton || null, debut: debutPeriode(periode) })
      .then(setSerie)
      .catch((e: Error) => setErreur(e.message));
  }, [id, produit, periode, magasinId, canton]);

  useEffect(() => {
    if (!produit) return;
    comparaisonMagasins(id, joursComparaison).then(setComparaison).catch((e: Error) => setErreur(e.message));
    statsPromotions(id, 365).then(setPromos).catch((e: Error) => setErreur(e.message));
  }, [id, produit, joursComparaison]);

  const cantons = useMemo(() => [...new Set(magasins.map((m) => m.canton))].sort(), [magasins]);
  const parKilo = serie[0]?.unite === 'kg' || produit?.vendu_au_poids === true;
  const formatPrix = useCallback((v: number) => enFrancs(v), []);
  const x = useMemo(() => serie.map((p) => Date.parse(`${p.semaine}T12:00:00Z`) / 1000), [serie]);
  const y = useMemo(() => serie.map((p) => p.mediane_centimes), [serie]);
  const releves = serie.reduce((s, p) => s + p.nb_releves, 0);
  const dernier = serie[serie.length - 1];

  if (produit === undefined && !erreur) return <div className="ecran"><p>Chargement…</p></div>;
  if (produit === null) return <div className="ecran"><p className="vide">Ce produit n’existe pas ou a été supprimé.</p></div>;

  return (
    <div className="ecran fiche">
      {produit ? (
        <EnteteProduit
          produit={produit}
          peutModifier={session !== null}
          onRenomme={(nom) => setProduit({ ...produit, nom })}
          favori={favori}
          onFavori={
            session
              ? async () => {
                  await basculerFavori(produit.id, session.user.id, !favori);
                  setFavori(!favori);
                }
              : undefined
          }
        />
      ) : null}

      {erreur ? <p className="erreur" role="alert">{erreur}</p> : null}

      <section className="bloc">
        <h2>Prix normal dans le temps</h2>
        <p className="discret explication">Médiane par semaine, promotions exclues{parKilo ? ', prix au kilo' : ''}.</p>
        <div className="filtres">
          <div className="segments" role="radiogroup" aria-label="Période">
            {(['3m', '1a', 'tout'] as Periode[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={periode === p}
                className={`interrupteur ${periode === p ? 'actif' : ''}`}
                onClick={() => setPeriode(p)}
              >
                {p === '3m' ? '3 mois' : p === '1a' ? '1 an' : 'Tout'}
              </button>
            ))}
          </div>
          <select aria-label="Magasin" value={magasinId} onChange={(e) => setMagasinId(e.target.value)}>
            <option value="">Tous les magasins</option>
            {magasins.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>
          <select aria-label="Canton" value={canton} onChange={(e) => setCanton(e.target.value)}>
            <option value="">Tous les cantons</option>
            {cantons.map((c) => (
              <option key={c} value={c}>
                {nomCanton(c)}
              </option>
            ))}
          </select>
        </div>

        {serie.length === 0 ? (
          <p className="vide">Pas encore de relevé pour ces filtres.</p>
        ) : (
          <>
            <p className="chiffre-cle">
              <span className="chiffre">{enFrancs(dernier.mediane_centimes)}</span>
              {parKilo ? <span className="discret"> /kg</span> : null}
              <span className="discret"> la semaine du {dateSuisse(dernier.semaine)}</span>
            </p>
            <GraphiqueLigne
              x={x}
              y={y}
              formatX={formatSemaine}
              formatY={formatPrix}
              description={`Prix normal médian par semaine de ${produit?.nom ?? 'ce produit'}`}
            />
            <p className="discret">
              {releves} relevé{releves > 1 ? 's' : ''} sur la période.
            </p>
          </>
        )}
      </section>

      <section className="bloc">
        <h2>Selon le magasin</h2>
        <p className="discret explication">
          Prix normal médian des {joursComparaison} derniers jours
          {produit?.vendu_au_poids ? ' (période courte pour un produit de saison)' : ''}.
        </p>
        {comparaison.length === 0 ? (
          <p className="vide">Pas de relevé sur cette période.</p>
        ) : (
          <ComparaisonMagasins lignes={comparaison} />
        )}
      </section>

      <section className="bloc">
        <h2>Promotions sur un an</h2>
        {!promos || promos.nb_achats === 0 ? (
          <p className="vide">Pas encore d’achat relevé.</p>
        ) : (
          <dl className="tuiles">
            <div className="tuile">
              <dt>Achats en promotion</dt>
              <dd className="chiffre">{promos.part_promo_pct ?? 0} %</dd>
              <dd className="discret">
                {promos.nb_promos} sur {promos.nb_achats}
              </dd>
            </div>
            <div className="tuile">
              <dt>Rabais moyen</dt>
              <dd className="chiffre">{promos.rabais_moyen_pct !== null ? `${promos.rabais_moyen_pct} %` : '–'}</dd>
              <dd className="discret">
                {promos.rabais_max_pct !== null ? `jusqu’à ${promos.rabais_max_pct} %` : 'aucune promotion'}
              </dd>
            </div>
            <div className="tuile">
              <dt>Dernière promotion</dt>
              <dd className="chiffre">{promos.derniere_promo ? dateSuisse(promos.derniere_promo) : '–'}</dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}

function EnteteProduit({
  produit,
  peutModifier,
  onRenomme,
  favori,
  onFavori,
}: {
  produit: Produit;
  peutModifier: boolean;
  onRenomme: (nom: string) => void;
  favori: boolean;
  onFavori?: () => Promise<void>;
}) {
  const [edition, setEdition] = useState(false);
  const [nom, setNom] = useState(produit.nom);
  const [erreur, setErreur] = useState<string | null>(null);

  if (edition) {
    return (
      <header className="entete-ecran">
        <label className="champ champ-large">
          <span className="champ-etiquette">Nom du produit</span>
          <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} />
        </label>
        {erreur ? <p className="erreur">{erreur}</p> : null}
        <div className="actions">
          <button type="button" className="bouton-secondaire" onClick={() => setEdition(false)}>
            Annuler
          </button>
          <button
            type="button"
            className="bouton-principal"
            disabled={nom.trim().length < 2}
            onClick={async () => {
              try {
                await renommerProduit(produit.id, nom);
                onRenomme(nom.trim());
                setEdition(false);
              } catch (e) {
                setErreur(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Renommer
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="entete-ecran entete-produit">
      <h1>{produit.nom}</h1>
      <div className="actions">
        {onFavori ? (
          <button type="button" className={`bouton-favori ${favori ? 'actif' : ''}`} aria-pressed={favori} onClick={() => void onFavori()}>
            {favori ? '★ Favori' : '☆ Ajouter aux favoris'}
          </button>
        ) : null}
        {peutModifier ? (
          <button type="button" className="bouton-lien" onClick={() => setEdition(true)}>
            Renommer
          </button>
        ) : null}
      </div>
    </header>
  );
}
