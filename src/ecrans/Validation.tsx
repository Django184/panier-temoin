// Écran de validation : l'utilisateur confirme ou corrige chaque ligne,
// le magasin, la date, l'heure et les totaux avant l'envoi. C'est la
// principale garantie de qualité des données.
//
// Convention visuelle : valeur lue sans certitude = surlignée en ambre ;
// valeur corrigée à la main = écrite au stylo bleu.

import { useEffect, useMemo, useState } from 'react';
import type { ChampEntete, ChampLigne, LigneBrouillon, TicketBrouillon } from '../lib/types.ts';
import { etatTicket, ecartLigne, ligneCoherente } from '../lib/coherence.ts';
import { enFrancs, poidsDeduit } from '../lib/montants.ts';
import { ligneVide } from '../lib/lecteurTicket.ts';
import { ChampMontant, ChampNombre, CANTONS } from '../composants/Champs.tsx';
import {
  controlerPrix,
  magasinParFiliale,
  rechercherProduits,
  soumettreTicket,
  type ControlePrix,
  type Magasin,
  type ResultatEnvoi,
  type ResultatRecherche,
} from '../api.ts';

interface Proprietes {
  brouillon: TicketBrouillon;
  /** Reçoit une fonction de mise à jour, appliquée à la dernière version. */
  onChange: (maj: (brouillon: TicketBrouillon) => TicketBrouillon) => void;
  onEnvoye: (resultat: ResultatEnvoi) => void;
  onAbandon: () => void;
  /** Proposé quand le ticket vient d'une photo : relire en la tournant. */
  onRelire?: () => void;
}

export function Validation({ brouillon, onChange, onEnvoye, onAbandon, onRelire }: Proprietes) {
  const etat = useMemo(() => etatTicket(brouillon), [brouillon]);
  const [envoi, setEnvoi] = useState<'repos' | 'en_cours'>('repos');
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);

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

  return (
    <div className="validation">
      <header className="entete-ecran">
        <h1>Vérifier le ticket</h1>
        <p className="discret">
          Les valeurs <mark className="exemple-douteux">surlignées</mark> sont à vérifier ; vos corrections
          s’affichent <span className="exemple-corrige">au stylo</span>.
        </p>
        {onRelire ? (
          <button type="button" className="bouton-lien" onClick={onRelire}>
            Lecture ratée ? Relire la photo en la tournant d’un quart de tour
          </button>
        ) : null}
      </header>

      <SectionMagasin brouillon={brouillon} majTicket={majTicket} />

      <section className="ticket-papier" aria-label="Lignes du ticket">
        <h2>Articles</h2>
        <ol className="lignes">
          {brouillon.lignes.map((ligne, index) => (
            <CarteLigne
              key={ligne.cle}
              numero={index + 1}
              ligne={ligne}
              date={brouillon.date}
              majLigne={majLigne}
              supprimer={() => onChange((b) => ({ ...b, lignes: b.lignes.filter((l) => l.cle !== ligne.cle) }))}
            />
          ))}
        </ol>
        <button
          type="button"
          className="bouton-secondaire"
          onClick={() => onChange((b) => ({ ...b, lignes: [...b.lignes, ligneVide()] }))}
        >
          Ajouter une ligne
        </button>

        <div className="totaux">
          <ChampMontant
            etiquette="Total CHF du ticket"
            valeur={brouillon.totalCentimes}
            douteux={brouillon.douteux.includes('total')}
            onChange={(v) => majTicket(() => ({ totalCentimes: v }), 'total')}
          />
          <ChampMontant
            etiquette="« Vous économisez au total »"
            valeur={brouillon.rabaisTotalCentimes}
            onChange={(v) => majTicket(() => ({ rabaisTotalCentimes: v ?? 0 }), 'rabaisTotal')}
          />
          <p className={etat.ecartTotalCentimes === 0 ? 'somme somme-juste' : 'somme somme-fausse'}>
            Somme des lignes : <span className="chiffre">{enFrancs(etat.sommeLignesCentimes)}</span>
            {etat.ecartTotalCentimes !== null && etat.ecartTotalCentimes !== 0 ? (
              <> (écart de <span className="chiffre">{enFrancs(etat.ecartTotalCentimes)}</span>)</>
            ) : null}
          </p>
        </div>
      </section>

      <footer className="pied-validation">
        {etat.problemes.length > 0 ? (
          <ul className="problemes">
            {etat.problemes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="pret">Tout tombe juste.</p>
        )}
        {erreurEnvoi ? <p className="erreur" role="alert">{erreurEnvoi}</p> : null}
        <div className="actions">
          <button type="button" className="bouton-secondaire" onClick={onAbandon}>
            Abandonner
          </button>
          <button
            type="button"
            className="bouton-principal"
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
// Magasin, date et heure
// ---------------------------------------------------------------------

function SectionMagasin({
  brouillon,
  majTicket,
}: {
  brouillon: TicketBrouillon;
  majTicket: (patch: (b: TicketBrouillon) => Partial<TicketBrouillon>, champ?: ChampEntete) => void;
}) {
  const m = brouillon.magasin;
  const [connu, setConnu] = useState<Magasin | null>(null);
  const [recherche, setRecherche] = useState<'repos' | 'en_cours'>('repos');

  useEffect(() => {
    let actif = true;
    if (!/^\d{4,8}$/.test(m.numeroFiliale)) {
      setConnu(null);
      return;
    }
    setRecherche('en_cours');
    magasinParFiliale(m.numeroFiliale)
      .then((magasin) => {
        if (!actif) return;
        setConnu(magasin);
        if (magasin) {
          majTicket(() => ({
            magasin: {
              numeroFiliale: magasin.numero_filiale,
              nom: magasin.nom,
              format: magasin.format,
              localite: magasin.localite ?? '',
              canton: magasin.canton,
            },
          }), 'magasin');
        }
      })
      .catch(() => {
        if (actif) setConnu(null);
      })
      .finally(() => {
        if (actif) setRecherche('repos');
      });
    return () => {
      actif = false;
    };
    // Recherche seulement quand le numéro de filiale change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.numeroFiliale]);

  const majMagasin = (patch: Partial<TicketBrouillon['magasin']>) =>
    majTicket((b) => ({ magasin: { ...b.magasin, ...patch } }), 'magasin');

  return (
    <section className="bloc" aria-label="Magasin et date">
      <h2>Magasin et date</h2>
      <div className="grille-champs">
        <label className={`champ champ-chiffre ${brouillon.douteux.includes('filiale') ? 'est-douteux' : ''}`}>
          <span className="champ-etiquette">N° de filiale (pied du ticket)</span>
          <input
            type="text"
            inputMode="numeric"
            value={m.numeroFiliale}
            onChange={(e) => {
              const numero = e.target.value.replace(/\D/g, '');
              majTicket((b) => ({ magasin: { ...b.magasin, numeroFiliale: numero } }), 'filiale');
            }}
          />
        </label>
        <label className={`champ ${brouillon.douteux.includes('date') ? 'est-douteux' : ''}`}>
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
        <label className={`champ ${brouillon.douteux.includes('heure') ? 'est-douteux' : ''}`}>
          <span className="champ-etiquette">Heure (pied du ticket)</span>
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

      {recherche === 'en_cours' ? <p className="discret">Recherche du magasin…</p> : null}

      {connu ? (
        <p className="magasin-connu">
          {connu.nom}
          {connu.localite ? `, ${connu.localite}` : ''} ({connu.canton})
        </p>
      ) : (
        <div className={`grille-champs ${brouillon.douteux.includes('magasin') ? 'bloc-douteux' : ''}`}>
          <label className="champ champ-large">
            <span className="champ-etiquette">Nom du magasin</span>
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
    </section>
  );
}

// ---------------------------------------------------------------------
// Une ligne d'article
// ---------------------------------------------------------------------

function CarteLigne({
  numero,
  ligne,
  date,
  majLigne,
  supprimer,
}: {
  numero: number;
  ligne: LigneBrouillon;
  date: string;
  majLigne: (cle: string, patch: Partial<LigneBrouillon>, champ?: ChampLigne) => void;
  supprimer: () => void;
}) {
  const coherente = ligneCoherente(ligne);
  const ecart = ecartLigne(ligne);
  const pese = ligne.unite === 'kg';
  const d = (champ: ChampLigne) => ligne.douteux.includes(champ);
  const c = (champ: ChampLigne) => ligne.corriges.includes(champ);
  const maj = (patch: Partial<LigneBrouillon>, champ?: ChampLigne) => majLigne(ligne.cle, patch, champ);

  return (
    <li className={`ligne ${coherente ? '' : 'ligne-fausse'}`}>
      <div className="ligne-tete">
        <span className="ligne-numero">{numero}</span>
        <label className={`champ champ-large ${d('libelle') ? 'est-douteux' : ''} ${c('libelle') ? 'est-corrige' : ''}`}>
          <span className="champ-etiquette">Libellé du ticket</span>
          <input type="text" value={ligne.libelle} onChange={(e) => maj({ libelle: e.target.value }, 'libelle')} />
        </label>
        <button type="button" className="bouton-icone" aria-label={`Supprimer la ligne ${numero}`} onClick={supprimer}>
          ×
        </button>
      </div>

      <ChoixProduit ligne={ligne} maj={maj} />

      <div className="ligne-unite" role="radiogroup" aria-label="Vente">
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
          className={`interrupteur ${pese ? 'actif' : ''} ${d('unite') ? 'est-douteux' : ''}`}
          onClick={() => maj({ unite: 'kg' }, 'unite')}
        >
          Pesé
        </button>
      </div>

      <div className="ligne-chiffres">
        {pese ? (
          <ChampNombre etiquette="Poids" suffixe="kg" valeur={ligne.quantite} decimales={3} lectureSeule onChange={() => undefined} />
        ) : (
          <ChampNombre
            etiquette="Quant."
            valeur={ligne.quantite}
            douteux={d('quantite')}
            corrige={c('quantite')}
            onChange={(v) => maj({ quantite: Math.round(v) }, 'quantite')}
          />
        )}
        <ChampMontant
          etiquette="Prix"
          suffixe={pese ? '/kg' : undefined}
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
        <p className="ligne-message">
          {ecart === null
            ? 'Complétez le prix et le total.'
            : `Quantité × prix − rabais ne tombe pas juste (écart de ${enFrancs(ecart)}).`}
        </p>
      ) : null}

      <ControleDuPrix ligne={ligne} date={date} maj={maj} />
    </li>
  );
}

/** Choix du produit canonique : alias connu, suggestion, ou nouveau produit. */
function ChoixProduit({ ligne, maj }: { ligne: LigneBrouillon; maj: (patch: Partial<LigneBrouillon>, champ?: ChampLigne) => void }) {
  const [suggestions, setSuggestions] = useState<ResultatRecherche[]>([]);
  const [recherche, setRecherche] = useState(ligne.libelle);

  // Libellé déjà vu : le produit est choisi d'office (score 1).
  useEffect(() => {
    if (ligne.produitId || ligne.libelle.trim().length < 2) return;
    let actif = true;
    const minuterie = window.setTimeout(() => {
      rechercherProduits(ligne.libelle, 5)
        .then((resultats) => {
          if (!actif) return;
          const exact = resultats.find((r) => r.score >= 1);
          if (exact) maj({ produitId: exact.produit_id, produitNom: exact.nom });
          else setSuggestions(resultats);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      actif = false;
      window.clearTimeout(minuterie);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligne.libelle, ligne.produitId]);

  if (ligne.produitId) {
    return (
      <div className="produit-choisi">
        <span>
          Produit : <strong>{ligne.produitNom}</strong>
        </span>
        <button
          type="button"
          className="bouton-lien"
          onClick={() => {
            setRecherche(ligne.libelle);
            maj({ produitId: null, produitNom: ligne.libelle });
          }}
        >
          Changer
        </button>
      </div>
    );
  }

  const chercher = (texte: string) => {
    setRecherche(texte);
    if (texte.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    rechercherProduits(texte, 5).then(setSuggestions).catch(() => undefined);
  };

  return (
    <div className="produit-choix">
      {suggestions.length > 0 ? (
        <div className="suggestions">
          <span className="champ-etiquette">Produit existant ?</span>
          {suggestions.map((s) => (
            <button
              key={s.produit_id}
              type="button"
              className="suggestion"
              onClick={() => maj({ produitId: s.produit_id, produitNom: s.nom })}
            >
              {s.nom}
            </button>
          ))}
        </div>
      ) : null}
      <label className="champ champ-large">
        <span className="champ-etiquette">Chercher un produit</span>
        <input type="search" value={recherche} onChange={(e) => chercher(e.target.value)} />
      </label>
      <label className="champ champ-large">
        <span className="champ-etiquette">Ou créer le produit</span>
        <input
          type="text"
          value={ligne.produitNom}
          placeholder="Nom lisible, par ex. Linguine Agnesi n° 10"
          onChange={(e) => maj({ produitNom: e.target.value })}
        />
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
        Prix inhabituel : le prix normal médian est de <span className="chiffre">{enFrancs(controle.mediane_centimes)}</span>{' '}
        sur les {controle.nb} derniers relevés. Vérifiez la lecture.
      </p>
      <label className="case">
        <input type="checkbox" checked={ligne.prixConfirme} onChange={(e) => maj({ prixConfirme: e.target.checked })} />
        Le prix est bien celui du ticket
      </label>
    </div>
  );
}
