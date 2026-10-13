// Écran de vérification : le ticket lu est présenté comme un ticket de
// caisse. Chaque ligne tient sur une rangée ; on la touche pour la
// corriger. L'envoi n'est possible que lorsque tout tombe juste.
//
// Convention visuelle : valeur lue sans certitude = surlignée en ambre ;
// valeur corrigée à la main = écrite au stylo bleu.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChampEntete, ChampLigne, LigneBrouillon, TicketBrouillon } from '../lib/types.ts';
import { etatTicket, ecartLigne, ligneCoherente } from '../lib/coherence.ts';
import { enFrancs, poidsDeduit } from '../lib/montants.ts';
import { ligneVide } from '../lib/lecteurTicket.ts';
import { ChampMontant, ChampNombre, CANTONS, dateSuisse } from '../composants/Champs.tsx';
import {
  controlerPrix,
  magasinParFiliale,
  rechercherProduits,
  soumettreTicket,
  type ControlePrix,
  type ResultatEnvoi,
  type ResultatRecherche,
} from '../api.ts';

type Modifier = (maj: (brouillon: TicketBrouillon) => TicketBrouillon) => void;

interface Proprietes {
  brouillon: TicketBrouillon;
  /** Reçoit une fonction de mise à jour, appliquée à la dernière version. */
  onChange: Modifier;
  onEnvoye: (resultat: ResultatEnvoi) => void;
  onAbandon: () => void;
  /** Photo du ticket, pour comparer pendant la vérification. */
  apercu?: string | null;
}

/** Une ligne est réglée si elle tombe juste, a un produit et rien à vérifier. */
function ligneReglee(l: LigneBrouillon): boolean {
  return ligneCoherente(l) && l.douteux.length === 0 && (l.produitId !== null || l.produitNom.trim().length >= 2);
}

export function Validation({ brouillon, onChange, onEnvoye, onAbandon, apercu }: Proprietes) {
  const etat = useMemo(() => etatTicket(brouillon), [brouillon]);
  const [ouvertes, setOuvertes] = useState<Set<string>>(() => new Set());
  const [envoi, setEnvoi] = useState<'repos' | 'en_cours'>('repos');
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [detailsProblemes, setDetailsProblemes] = useState(false);

  const majTicket = (patch: (b: TicketBrouillon) => Partial<TicketBrouillon>, champ?: ChampEntete) => {
    onChange((b) => ({
      ...b,
      ...patch(b),
      douteux: champ ? b.douteux.filter((d) => d !== champ) : b.douteux,
    }));
  };

  const majLigne = (cle: string, patch: Partial<LigneBrouillon>, champ?: ChampLigne) => {
    onChange((b) => ({
      ...b,
      lignes: b.lignes.map((l) => {
        if (l.cle !== cle) return l;
        const nouvelle: LigneBrouillon = { ...l, ...patch };
        if (champ) {
          nouvelle.douteux = l.douteux.filter((d) => d !== champ);
          if (!l.corriges.includes(champ)) nouvelle.corriges = [...l.corriges, champ];
        }
        // Article pesé : le poids n'est pas imprimé, il se déduit toujours.
        if (nouvelle.unite === 'kg' && nouvelle.prixCentimes && nouvelle.totalCentimes !== null) {
          nouvelle.quantite = poidsDeduit(nouvelle.totalCentimes, nouvelle.rabaisCentimes, nouvelle.prixCentimes);
        }
        return nouvelle;
      }),
    }));
  };

  const basculer = (cle: string) =>
    setOuvertes((o) => {
      const n = new Set(o);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });

  const ajouterLigne = () => {
    const ligne = ligneVide();
    onChange((b) => ({ ...b, lignes: [...b.lignes, ligne] }));
    setOuvertes((o) => new Set(o).add(ligne.cle));
  };

  const envoyer = async () => {
    setEnvoi('en_cours');
    setErreurEnvoi(null);
    try {
      onEnvoye(await soumettreTicket(brouillon));
    } catch (e) {
      setErreurEnvoi(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi('repos');
    }
  };

  // Libellé déjà vu : son produit est retrouvé d'office (alias, score 1),
  // même pour les lignes fermées. Une seule recherche par libellé.
  const dejaCherches = useRef(new Set<string>());
  useEffect(() => {
    for (const ligne of brouillon.lignes) {
      const libelle = ligne.libelle.trim();
      const cle = `${ligne.cle}|${libelle}`;
      if (ligne.produitId || libelle.length < 2 || dejaCherches.current.has(cle)) continue;
      dejaCherches.current.add(cle);
      rechercherProduits(libelle, 3)
        .then((resultats) => {
          const exact = resultats.find((r) => r.score >= 1);
          if (exact) majLigne(ligne.cle, { produitId: exact.produit_id, produitNom: exact.nom });
        })
        .catch(() => undefined);
    }
    // majLigne applique une mise à jour sur la dernière version : sûr ici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brouillon.lignes]);

  const aRegler = brouillon.lignes.filter((l) => !ligneReglee(l)).length;

  return (
    <div className="validation">
      <header className="entete-ecran">
        <h1>Vérifier le ticket</h1>
        <p className="discret">
          {aRegler === 0
            ? 'Comparez avec le ticket, puis envoyez.'
            : `Touchez une ligne pour la corriger. ${aRegler} ligne${aRegler > 1 ? 's' : ''} à vérifier.`}
        </p>
        {apercu ? (
          <details className="photo-ticket">
            <summary>Voir la photo du ticket</summary>
            <img src={apercu} alt="Photo du ticket en cours de vérification" />
          </details>
        ) : null}
      </header>

      <article className="ticket-papier" aria-label="Ticket">
        <EnteteTicket brouillon={brouillon} majTicket={majTicket} />

        <ol className="lignes" aria-label="Articles">
          {brouillon.lignes.map((ligne) => (
            <LigneTicket
              key={ligne.cle}
              ligne={ligne}
              date={brouillon.date}
              ouverte={ouvertes.has(ligne.cle)}
              basculer={() => basculer(ligne.cle)}
              majLigne={majLigne}
              supprimer={() => onChange((b) => ({ ...b, lignes: b.lignes.filter((l) => l.cle !== ligne.cle) }))}
            />
          ))}
        </ol>

        <button type="button" className="bouton-ajout-ligne" onClick={ajouterLigne}>
          + Ajouter une ligne
        </button>

        <div className="totaux">
          <div className="total-ligne">
            <span>Somme des lignes</span>
            <span className={`chiffre ${etat.ecartTotalCentimes === 0 ? 'juste' : 'faux'}`}>
              {enFrancs(etat.sommeLignesCentimes)}
            </span>
          </div>
          <div className="totaux-champs">
            <ChampMontant
              etiquette="Total CHF imprimé"
              valeur={brouillon.totalCentimes}
              douteux={brouillon.douteux.includes('total')}
              onChange={(v) => majTicket(() => ({ totalCentimes: v }), 'total')}
            />
            <ChampMontant
              etiquette="Vous économisez"
              valeur={brouillon.rabaisTotalCentimes}
              onChange={(v) => majTicket(() => ({ rabaisTotalCentimes: v ?? 0 }), 'rabaisTotal')}
            />
          </div>
          {etat.ecartTotalCentimes !== null && etat.ecartTotalCentimes !== 0 ? (
            <p className="ecart">
              Écart de <span className="chiffre">{enFrancs(Math.abs(etat.ecartTotalCentimes))}</span> avec le total imprimé :
              une ligne manque ou est mal lue.
            </p>
          ) : null}
        </div>
      </article>

      <footer className="pied-validation">
        {etat.pret ? (
          <p className="statut statut-pret">Tout tombe juste.</p>
        ) : (
          <div className="statut">
            <button
              type="button"
              className="bouton-lien statut-a-regler"
              aria-expanded={detailsProblemes}
              onClick={() => setDetailsProblemes(!detailsProblemes)}
            >
              {etat.problemes.length === 1 ? '1 point à régler' : `${etat.problemes.length} points à régler`}
            </button>
            {detailsProblemes ? (
              <ul className="problemes">
                {etat.problemes.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
        {erreurEnvoi ? (
          <p className="erreur" role="alert">
            {erreurEnvoi}
          </p>
        ) : null}
        <div className="actions">
          <button type="button" className="bouton-secondaire" onClick={onAbandon}>
            Abandonner
          </button>
          <button
            type="button"
            className="bouton-principal bouton-envoyer"
            disabled={!etat.pret || envoi === 'en_cours'}
            onClick={envoyer}
          >
            {envoi === 'en_cours' ? 'Envoi…' : 'Envoyer le ticket'}
          </button>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------
// En-tête : magasin, date, heure
// ---------------------------------------------------------------------

function EnteteTicket({
  brouillon,
  majTicket,
}: {
  brouillon: TicketBrouillon;
  majTicket: (patch: (b: TicketBrouillon) => Partial<TicketBrouillon>, champ?: ChampEntete) => void;
}) {
  const m = brouillon.magasin;
  const [connu, setConnu] = useState(false);
  const [edition, setEdition] = useState(false);

  useEffect(() => {
    let actif = true;
    if (!/^\d{4,8}$/.test(m.numeroFiliale)) {
      setConnu(false);
      return;
    }
    magasinParFiliale(m.numeroFiliale)
      .then((magasin) => {
        if (!actif) return;
        setConnu(magasin !== null);
        if (magasin) {
          majTicket(
            () => ({
              magasin: {
                numeroFiliale: magasin.numero_filiale,
                nom: magasin.nom,
                format: magasin.format,
                localite: magasin.localite ?? '',
                canton: magasin.canton,
              },
            }),
            'magasin',
          );
        }
      })
      .catch(() => {
        if (actif) setConnu(false);
      });
    return () => {
      actif = false;
    };
    // Recherche seulement quand le numéro de filiale change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.numeroFiliale]);

  const complet =
    /^\d{4,8}$/.test(m.numeroFiliale) &&
    m.nom.trim().length >= 2 &&
    m.format !== '' &&
    /^[A-Z]{2}$/.test(m.canton) &&
    /^\d{4}-\d{2}-\d{2}$/.test(brouillon.date) &&
    /^\d{2}:\d{2}:\d{2}$/.test(brouillon.heure);
  const douteux = brouillon.douteux.some((d) => d !== 'total' && d !== 'rabaisTotal');

  if (complet && !douteux && !edition) {
    return (
      <div className="entete-ticket">
        <div>
          <p className="entete-ticket-magasin">{m.nom}</p>
          <p className="discret">
            {[m.localite, m.canton, `filiale ${m.numeroFiliale}`].filter(Boolean).join(', ')}
          </p>
          <p className="entete-ticket-date chiffre">
            {dateSuisse(brouillon.date)} à {brouillon.heure}
          </p>
        </div>
        <button type="button" className="bouton-lien" onClick={() => setEdition(true)}>
          Modifier
        </button>
      </div>
    );
  }

  const majMagasin = (patch: Partial<TicketBrouillon['magasin']>) =>
    majTicket((b) => ({ magasin: { ...b.magasin, ...patch } }), 'magasin');
  const d = (champ: ChampEntete) => (brouillon.douteux.includes(champ) ? 'est-douteux' : '');

  return (
    <div className="entete-ticket entete-ticket-edition">
      <div className="grille-champs">
        <label className={`champ champ-chiffre ${d('filiale')}`}>
          <span className="champ-etiquette">N° de filiale</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="064590"
            value={m.numeroFiliale}
            onChange={(e) => {
              const numero = e.target.value.replace(/\D/g, '');
              majTicket((b) => ({ magasin: { ...b.magasin, numeroFiliale: numero } }), 'filiale');
            }}
          />
        </label>
        <label className={`champ ${d('date')}`}>
          <span className="champ-etiquette">Date</span>
          <input
            type="date"
            value={brouillon.date}
            onChange={(e) => {
              const date = e.target.value;
              majTicket(() => ({ date }), 'date');
            }}
          />
        </label>
        <label className={`champ ${d('heure')}`}>
          <span className="champ-etiquette">Heure</span>
          <input
            type="time"
            step={1}
            value={brouillon.heure}
            onChange={(e) => {
              const v = e.target.value;
              majTicket(() => ({ heure: v.length === 5 ? `${v}:00` : v }), 'heure');
            }}
          />
        </label>
      </div>
      <p className="aide">Numéro de filiale, date et heure : dernière ligne du ticket, sous « Filiale … Date Heure ».</p>

      {connu ? (
        <p className="entete-ticket-magasin">
          {m.nom}
          <span className="discret">
            {' '}
            {[m.localite, m.canton].filter(Boolean).join(', ')}
          </span>
        </p>
      ) : (
        <div className={`grille-champs ${d('magasin')}`}>
          <label className="champ champ-large">
            <span className="champ-etiquette">Magasin (en-tête du ticket)</span>
            <input type="text" value={m.nom} placeholder="MM Métropole Renens" onChange={(e) => majMagasin({ nom: e.target.value })} />
          </label>
          <label className="champ">
            <span className="champ-etiquette">Format</span>
            <select value={m.format} onChange={(e) => majMagasin({ format: e.target.value as TicketBrouillon['magasin']['format'] })}>
              <option value="">Choisir</option>
              <option value="M">M</option>
              <option value="MM">MM</option>
              <option value="MMM">MMM</option>
            </select>
          </label>
          <label className="champ">
            <span className="champ-etiquette">Localité</span>
            <input type="text" value={m.localite} onChange={(e) => majMagasin({ localite: e.target.value })} />
          </label>
          <label className="champ">
            <span className="champ-etiquette">Canton</span>
            <select value={m.canton} onChange={(e) => majMagasin({ canton: e.target.value })}>
              <option value="">Choisir</option>
              {CANTONS.map(([code, nom]) => (
                <option key={code} value={code}>
                  {nom}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {complet ? (
        <button type="button" className="bouton-lien" onClick={() => setEdition(false)}>
          Terminé
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// Une ligne d'article : rangée compacte, éditeur au toucher
// ---------------------------------------------------------------------

function resumeQuantite(l: LigneBrouillon): string {
  const prix = l.prixCentimes === null ? '?' : enFrancs(l.prixCentimes);
  if (l.unite === 'kg') return `${l.quantite.toFixed(3)} kg × ${prix}/kg`;
  return l.quantite === 1 ? prix : `${l.quantite} × ${prix}`;
}

function LigneTicket({
  ligne,
  date,
  ouverte,
  basculer,
  majLigne,
  supprimer,
}: {
  ligne: LigneBrouillon;
  date: string;
  ouverte: boolean;
  basculer: () => void;
  majLigne: (cle: string, patch: Partial<LigneBrouillon>, champ?: ChampLigne) => void;
  supprimer: () => void;
}) {
  const reglee = ligneReglee(ligne);
  const maj = (patch: Partial<LigneBrouillon>, champ?: ChampLigne) => majLigne(ligne.cle, patch, champ);

  return (
    <li className={`ligne ${reglee ? '' : 'ligne-a-verifier'} ${ouverte ? 'ligne-ouverte' : ''}`}>
      <button type="button" className="ligne-rangee" aria-expanded={ouverte} onClick={basculer}>
        <span className="ligne-texte">
          <span className="ligne-libelle">{ligne.libelle || 'Nouvelle ligne'}</span>
          <span className="ligne-detail chiffre">
            {resumeQuantite(ligne)}
            {ligne.rabaisCentimes > 0 ? <span className="ligne-rabais"> − {enFrancs(ligne.rabaisCentimes)}</span> : null}
          </span>
          <span className="ligne-lien-produit">
            {ligne.produitId
              ? `→ ${ligne.produitNom}`
              : !ligne.produitNom.trim()
                ? 'Produit à choisir'
                : ligne.produitNom.trim() === ligne.libelle.trim()
                  ? 'Nouveau produit'
                  : `Nouveau produit : ${ligne.produitNom}`}
          </span>
        </span>
        <span className="ligne-droite">
          <span className="ligne-total chiffre">{ligne.totalCentimes === null ? '–' : enFrancs(ligne.totalCentimes)}</span>
          {reglee ? null : <span className="pastille">À vérifier</span>}
        </span>
      </button>

      {ouverte ? <EditeurLigne ligne={ligne} date={date} maj={maj} supprimer={supprimer} fermer={basculer} /> : null}
    </li>
  );
}

function EditeurLigne({
  ligne,
  date,
  maj,
  supprimer,
  fermer,
}: {
  ligne: LigneBrouillon;
  date: string;
  maj: (patch: Partial<LigneBrouillon>, champ?: ChampLigne) => void;
  supprimer: () => void;
  fermer: () => void;
}) {
  const pese = ligne.unite === 'kg';
  const d = (champ: ChampLigne) => ligne.douteux.includes(champ);
  const c = (champ: ChampLigne) => ligne.corriges.includes(champ);
  const ecart = ecartLigne(ligne);
  const coherente = ligneCoherente(ligne);

  return (
    <div className="editeur-ligne">
      <label className={`champ champ-large ${d('libelle') ? 'est-douteux' : ''} ${c('libelle') ? 'est-corrige' : ''}`}>
        <span className="champ-etiquette">Libellé imprimé</span>
        <input type="text" value={ligne.libelle} onChange={(e) => maj({ libelle: e.target.value }, 'libelle')} />
      </label>

      <ChoixProduit ligne={ligne} maj={maj} />

      <div className="segments" role="radiogroup" aria-label="Mode de vente">
        <button
          type="button"
          role="radio"
          aria-checked={!pese}
          className={`interrupteur ${!pese ? 'actif' : ''}`}
          onClick={() => maj({ unite: 'piece', quantite: 1 }, 'unite')}
        >
          À la pièce
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={pese}
          className={`interrupteur ${pese ? 'actif' : ''}`}
          onClick={() => maj({ unite: 'kg' }, 'unite')}
        >
          Pesé
        </button>
      </div>

      <div className="grille-chiffres">
        {pese ? (
          <ChampNombre etiquette="Poids calculé" suffixe="kg" valeur={ligne.quantite} decimales={3} lectureSeule onChange={() => undefined} />
        ) : (
          <ChampNombre
            etiquette="Quantité"
            valeur={ligne.quantite}
            douteux={d('quantite')}
            corrige={c('quantite')}
            onChange={(v) => maj({ quantite: Math.round(v) }, 'quantite')}
          />
        )}
        <ChampMontant
          etiquette={pese ? 'Prix au kilo' : 'Prix'}
          valeur={ligne.prixCentimes}
          douteux={d('prix')}
          corrige={c('prix')}
          onChange={(v) => maj({ prixCentimes: v, prixConfirme: false }, 'prix')}
        />
        <ChampMontant
          etiquette="Rabais"
          valeur={ligne.rabaisCentimes}
          douteux={d('rabais')}
          corrige={c('rabais')}
          onChange={(v) => maj({ rabaisCentimes: v ?? 0 }, 'rabais')}
        />
        <ChampMontant
          etiquette="Total"
          valeur={ligne.totalCentimes}
          douteux={d('total')}
          corrige={c('total')}
          onChange={(v) => maj({ totalCentimes: v }, 'total')}
        />
      </div>

      {!coherente ? (
        <p className="ecart">
          {ecart === null
            ? 'Indiquez le prix et le total.'
            : `Quantité × prix − rabais donne ${enFrancs((ligne.totalCentimes ?? 0) + ecart)}, pas ${enFrancs(ligne.totalCentimes)}.`}
        </p>
      ) : null}

      <ControleDuPrix ligne={ligne} date={date} maj={maj} />

      <div className="actions actions-editeur">
        <button type="button" className="bouton-lien bouton-danger" onClick={supprimer}>
          Supprimer la ligne
        </button>
        <button
          type="button"
          className="bouton-secondaire"
          onClick={() => {
            // Fermer vaut confirmation des valeurs affichées.
            if (ligne.douteux.length > 0 && coherente) maj({ douteux: [] });
            fermer();
          }}
        >
          {ligne.douteux.length > 0 && coherente ? 'Valider la ligne' : 'Fermer'}
        </button>
      </div>
    </div>
  );
}

/** Choix du produit canonique : alias connu, suggestion, ou nouveau produit. */
function ChoixProduit({ ligne, maj }: { ligne: LigneBrouillon; maj: (patch: Partial<LigneBrouillon>, champ?: ChampLigne) => void }) {
  const [suggestions, setSuggestions] = useState<ResultatRecherche[]>([]);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    if (ligne.produitId || ligne.libelle.trim().length < 2) return;
    let actif = true;
    const minuterie = window.setTimeout(() => {
      rechercherProduits(recherche.trim().length >= 2 ? recherche : ligne.libelle, 5)
        .then((r) => {
          if (actif) setSuggestions(r);
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      actif = false;
      window.clearTimeout(minuterie);
    };
  }, [ligne.libelle, ligne.produitId, recherche]);

  if (ligne.produitId) {
    return (
      <div className="produit-choisi">
        <span className="champ-etiquette">Produit</span>
        <span className="produit-choisi-nom">{ligne.produitNom}</span>
        <button type="button" className="bouton-lien" onClick={() => maj({ produitId: null, produitNom: ligne.libelle })}>
          Changer
        </button>
      </div>
    );
  }

  return (
    <div className="produit-choix">
      <label className="champ champ-large">
        <span className="champ-etiquette">Produit</span>
        <input
          type="search"
          value={recherche}
          placeholder="Chercher un produit existant"
          onChange={(e) => setRecherche(e.target.value)}
        />
      </label>
      {suggestions.length > 0 ? (
        <div className="suggestions">
          {suggestions.map((s) => (
            <button key={s.produit_id} type="button" className="suggestion" onClick={() => maj({ produitId: s.produit_id, produitNom: s.nom })}>
              {s.nom}
            </button>
          ))}
        </div>
      ) : null}
      <label className="champ champ-large">
        <span className="champ-etiquette">Sinon, nom du nouveau produit</span>
        <input type="text" value={ligne.produitNom} onChange={(e) => maj({ produitNom: e.target.value })} />
      </label>
    </div>
  );
}

/** Avertit si le prix s'écarte nettement des relevés récents du produit. */
function ControleDuPrix({
  ligne,
  date,
  maj,
}: {
  ligne: LigneBrouillon;
  date: string;
  maj: (patch: Partial<LigneBrouillon>, champ?: ChampLigne) => void;
}) {
  const [controle, setControle] = useState<ControlePrix | null>(null);

  useEffect(() => {
    setControle(null);
    if (!ligne.produitId || !ligne.prixCentimes) return;
    let actif = true;
    const minuterie = window.setTimeout(() => {
      controlerPrix(ligne.produitId as string, ligne.unite, ligne.prixCentimes as number, date)
        .then((r) => {
          if (actif) setControle(r);
        })
        .catch(() => undefined);
    }, 600);
    return () => {
      actif = false;
      window.clearTimeout(minuterie);
    };
  }, [ligne.produitId, ligne.unite, ligne.prixCentimes, date]);

  if (!controle?.signale) return null;
  return (
    <div className="alerte-prix" role="status">
      <p>
        Prix inhabituel : d’habitude <span className="chiffre">{enFrancs(controle.mediane_centimes)}</span> ({controle.nb} relevés
        récents). Vérifiez la lecture.
      </p>
      <label className="case">
        <input type="checkbox" checked={ligne.prixConfirme} onChange={(e) => maj({ prixConfirme: e.target.checked })} />
        Le prix est bien celui du ticket
      </label>
    </div>
  );
}
