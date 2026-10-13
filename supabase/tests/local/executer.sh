#!/usr/bin/env bash
# =====================================================================
# Exécute migrations, tests et données de démonstration sur une instance
# Postgres jetable (aucun effet sur le projet Supabase).
#
# Prérequis : Postgres 15+ installé localement, avec ses extensions
# « contrib » (pg_trgm, unaccent). Sous Debian/Ubuntu : postgresql-16.
#
# Usage : supabase/tests/local/executer.sh [dossier_binaires_postgres]
# Exemple : supabase/tests/local/executer.sh /usr/lib/postgresql/16/bin
# =====================================================================
set -euo pipefail

BIN="${1:-$(dirname "$(command -v postgres || echo /usr/lib/postgresql/16/bin/postgres)")}"
RACINE="$(cd "$(dirname "$0")/../../.." && pwd)"
TRAVAIL="$(mktemp -d)"
PORT=54329
export PGHOST="$TRAVAIL" PGPORT="$PORT" PGUSER=postgres PGDATABASE=postgres

arreter() {
  "$BIN/pg_ctl" -D "$TRAVAIL/donnees" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TRAVAIL"
}
trap arreter EXIT

echo "→ Création d'une instance temporaire"
"$BIN/initdb" -D "$TRAVAIL/donnees" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
"$BIN/pg_ctl" -D "$TRAVAIL/donnees" -o "-k $TRAVAIL -p $PORT -c listen_addresses=''" -l "$TRAVAIL/journal.txt" -w start >/dev/null

executer() {
  echo "→ ${1#"$RACINE"/}"
  # Résultats des requêtes masqués ; les messages « OK : … » et les
  # erreurs restent affichés.
  psql -X -q -v ON_ERROR_STOP=1 -o /dev/null -f "$1" 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e 's/^NOTICE:  /  /'
  return "${PIPESTATUS[0]}"
}

executer "$RACINE/supabase/tests/local/supabase_minimal.sql"
for fichier in "$RACINE"/supabase/migrations/*.sql; do
  executer "$fichier"
done
executer "$RACINE/supabase/tests/tests_backend.sql"
executer "$RACINE/supabase/demo/donnees_demo.sql"
executer "$RACINE/supabase/demo/verifier_demo.sql"
executer "$RACINE/supabase/demo/purge_demo.sql"

echo "✓ Migrations, tests et démonstration exécutés sans erreur."
