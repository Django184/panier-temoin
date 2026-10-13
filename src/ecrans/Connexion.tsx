// Connexion par e-mail et mot de passe. Les comptes sont créés à la main
// dans le tableau de bord Supabase : il n'y a pas d'inscription.

import { useState, type FormEvent } from 'react';
import { connecter } from '../api.ts';
import { MENTION_NON_AFFILIATION } from '../config.ts';

export function Connexion({ raison }: { raison?: string }) {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [etat, setEtat] = useState<'repos' | 'en_cours'>('repos');
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setEtat('en_cours');
    setErreur(null);
    try {
      await connecter(email, motDePasse);
    } catch (er) {
      setErreur(er instanceof Error ? er.message : String(er));
    } finally {
      setEtat('repos');
    }
  };

  return (
    <div className="ecran ecran-etroit">
      <h1>Se connecter</h1>
      <p>{raison ?? 'Connectez-vous pour ajouter des tickets.'}</p>
      <form onSubmit={envoyer} className="formulaire">
        <label className="champ champ-large">
          <span className="champ-etiquette">E-mail</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="champ champ-large">
          <span className="champ-etiquette">Mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
        </label>
        {erreur ? <p className="erreur" role="alert">{erreur}</p> : null}
        <button type="submit" className="bouton-principal" disabled={etat === 'en_cours'}>
          {etat === 'en_cours' ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p className="discret">
        Pas de compte ? Les comptes sont réservés aux contributeurs. La consultation des prix reste ouverte à tous.
      </p>
      <p className="discret">{MENTION_NON_AFFILIATION}</p>
    </div>
  );
}
