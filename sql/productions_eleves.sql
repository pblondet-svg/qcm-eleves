-- productions_eleves.sql — productions des élèves dans les entraînements
-- (introduction, paragraphe, plan dialectique), consultables en Mode Prof → Stats → Productions.
-- Sert aussi à compter les entraînements du jour (un exercice complet = une seule « question »).
-- À exécuter une seule fois dans Supabase → SQL Editor.

create table if not exists public.productions_eleves (
  id          uuid primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  visitor_id  text,
  eleve_nom   text,
  exercice    text not null,            -- intro | paragraphe | plan
  format      text not null default 'chat', -- chat | cadres
  sujet       text,
  contenu     text,                     -- conversation ou travail de l'élève
  note        text,                     -- note ou verdict final, s'il y en a un
  nb_reponses integer not null default 0 -- réponses de l'IA dans cet exercice (compté par le serveur)
);

create index if not exists productions_eleves_visitor_jour on public.productions_eleves (visitor_id, created_at);
create index if not exists productions_eleves_created on public.productions_eleves (created_at desc);

-- Accès uniquement par le serveur (clé service_role) : les élèves ne peuvent pas lire les productions des autres
alter table public.productions_eleves enable row level security;
