-- =====================================================================
-- Imitation minimale de Supabase pour exécuter les migrations et les
-- tests sur un Postgres local ordinaire (version 15 ou plus).
-- NE PAS exécuter sur le projet Supabase : tout ceci y existe déjà.
-- =====================================================================

-- Rôles utilisés par l'API de Supabase
create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;

-- Schémas fournis par Supabase
create schema extensions;
create schema auth;

-- Table des comptes, réduite aux colonnes utiles ici
create table auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  aud        text,
  role       text,
  created_at timestamptz not null default now()
);

-- auth.uid() : identifiant du compte, lu dans les « claims » du jeton,
-- comme le fait Supabase.
create function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Privilèges par défaut identiques à ceux de Supabase : tout est accordé,
-- et c'est la RLS (ou un REVOKE explicite) qui restreint.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
