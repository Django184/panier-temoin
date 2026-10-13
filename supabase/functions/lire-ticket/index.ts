// =====================================================================
// Fonction Edge « lire-ticket » : lecture d'une photo de ticket par un
// modèle d'image Mistral (offre gratuite « Experiment »).
//
// Entrée  (POST, JSON) : { "image": "<JPEG en base64>", "type": "image/jpeg" }
// Sortie  (200, JSON)  : { "texte": "<JSON du ticket, au format de la consigne>" }
// Erreurs (JSON)       : { "erreur": "<code>", "message": "<texte pour l'utilisateur>" }
//
// Seuls les comptes connectés de l'app peuvent l'appeler. La clé Mistral
// est un secret Supabase (MISTRAL_API_KEY), jamais envoyé au navigateur.
// La photo n'est ni enregistrée ni journalisée ici.
// =====================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://tpovnthrvlajmyjrfltn.supabase.co';
// Clé publique de l'app : sert seulement à vérifier la session de l'appelant.
const CLE_PUBLIQUE = 'sb_publishable_PstYw1ciAo1ubEygjMRDsA__EsKrFyS';
const MODELE = Deno.env.get('MISTRAL_MODELE') ?? 'mistral-small-latest';
const TAILLE_MAX_BASE64 = 8_000_000; // environ 6 Mo d'image
const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp'];

const ORIGINES_AUTORISEES = [
  'https://django184.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

const CONSIGNE = `Tu lis la photo d'un ticket de caisse d'un supermarché Migros (Suisse).
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de cette forme :

{
  "magasin": { "numero_filiale": "064590", "nom": "MM Métropole Renens", "localite": "Renens", "cooperative": "Vaud" },
  "date": "2026-10-12",
  "heure": "19:00:05",
  "total": "24.60",
  "vous_economisez": "4.00",
  "lignes": [
    { "libelle": "Agnesi Linguine N.10", "quantite": "3", "prix": "2.40", "rabais": "2.88", "total": "4.32" },
    { "libelle": "Aubergines", "quantite": "1", "prix": "4.00", "rabais": "", "total": "2.00" }
  ]
}

Règles :
- Recopie chaque ligne d'article exactement comme imprimée : colonnes Désignation article, Quant., Prix, Rabais, Total. Garde l'ordre du ticket.
- Ne recalcule rien et n'invente rien : si une valeur est illisible, mets une chaîne vide.
- Les fruits et légumes pesés ont une quantité 1, un prix au kilo et un total différent du prix : recopie-les tels quels.
- « nom » est la ligne du magasin sous l'en-tête (par exemple « MM Métropole Renens ») ; « cooperative » est le mot après « Société Coopérative Migros ».
- « numero_filiale », « date » et « heure » viennent de la DERNIÈRE ligne du ticket (Filiale … Date Heure), pas de l'heure du paiement. Date au format AAAA-MM-JJ.
- « total » est le montant de la ligne « Total CHF » ; « vous_economisez » celui de « Vous économisez au total », ou "" s'il n'y en a pas.
- N'inclus JAMAIS le numéro Cumulus, les points, les données de carte ou de paiement, ni aucun identifiant de transaction.`;

function entetesCors(origine: string | null): Record<string, string> {
  const autorisee = origine && ORIGINES_AUTORISEES.includes(origine) ? origine : ORIGINES_AUTORISEES[0];
  return {
    'Access-Control-Allow-Origin': autorisee,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function repondre(corps: unknown, statut: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function echec(code: string, message: string, statut: number, cors: Record<string, string>): Response {
  return repondre({ erreur: code, message }, statut, cors);
}

/** Vérifie que l'appelant a une session valide dans le projet. */
async function sessionValide(autorisation: string): Promise<boolean> {
  if (!autorisation.startsWith('Bearer ')) return false;
  const reponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: autorisation, apikey: CLE_PUBLIQUE },
  });
  return reponse.ok;
}

/** Le contenu renvoyé par Mistral peut être une chaîne ou une liste de morceaux. */
function texteDuMessage(contenu: unknown): string {
  if (typeof contenu === 'string') return contenu;
  if (Array.isArray(contenu)) {
    return contenu
      .map((morceau) => (typeof morceau === 'object' && morceau !== null && 'text' in morceau ? String(morceau.text) : ''))
      .join('');
  }
  return '';
}

Deno.serve(async (requete: Request): Promise<Response> => {
  const cors = entetesCors(requete.headers.get('origin'));

  if (requete.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (requete.method !== 'POST') return echec('methode', 'Méthode non autorisée.', 405, cors);

  if (!(await sessionValide(requete.headers.get('authorization') ?? ''))) {
    return echec('non_connecte', 'Connectez-vous pour faire lire un ticket.', 401, cors);
  }

  let image = '';
  let type = 'image/jpeg';
  try {
    const corps = (await requete.json()) as { image?: unknown; type?: unknown };
    image = typeof corps.image === 'string' ? corps.image : '';
    type = typeof corps.type === 'string' ? corps.type : type;
  } catch {
    return echec('donnees', 'Requête illisible.', 400, cors);
  }
  if (!image || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) {
    return echec('donnees', 'Photo manquante.', 400, cors);
  }
  if (image.length > TAILLE_MAX_BASE64) {
    return echec('trop_grande', 'Photo trop lourde. Réessayez avec une photo plus petite.', 413, cors);
  }
  if (!TYPES_ACCEPTES.includes(type)) {
    return echec('format', 'Format de photo non pris en charge.', 415, cors);
  }

  const cle = Deno.env.get('MISTRAL_API_KEY');
  if (!cle) {
    return echec('configuration', 'La lecture automatique n’est pas encore configurée (clé Mistral manquante).', 503, cors);
  }

  let reponse: Response;
  try {
    reponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELE,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: CONSIGNE },
              { type: 'image_url', image_url: `data:${type};base64,${image}` },
            ],
          },
        ],
      }),
    });
  } catch {
    return echec('service', 'Le service de lecture est injoignable. Réessayez dans un instant.', 502, cors);
  }

  if (reponse.status === 429) {
    return echec('limite', 'Trop de lectures en peu de temps. Réessayez dans une minute.', 429, cors);
  }
  if (!reponse.ok) {
    // Le détail reste dans les journaux de la fonction, sans la photo.
    console.error(`Mistral ${reponse.status} : ${(await reponse.text()).slice(0, 500)}`);
    return echec('service', `Le service de lecture a répondu par une erreur (${reponse.status}).`, 502, cors);
  }

  const donnees = (await reponse.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
  const texte = texteDuMessage(donnees.choices?.[0]?.message?.content);
  if (!texte.trim()) {
    return echec('vide', 'Le service n’a rien pu lire sur cette photo.', 502, cors);
  }
  return repondre({ texte }, 200, cors);
});
