-- Mémoire des réponses de l'IA (à exécuter une fois dans Supabase → SQL Editor)
-- Quand un élève pose exactement la même demande qu'un autre (explication d'une question de QCM,
-- première question au chatbot de l'accueil…), la réponse est reprise ici au lieu de rappeler l'IA.
-- Elle ne compte pas dans la limite quotidienne de l'élève.
create table if not exists ai_cache (
  key text primary key,
  module text,
  reponse text not null,
  provider text,
  hits integer not null default 0,
  created_at timestamptz not null default now()
);

-- Réservée au serveur (clé service_role) : aucun accès depuis les navigateurs
alter table ai_cache enable row level security;

-- Pour vider la mémoire : delete from ai_cache;
-- Pour vider un seul outil : delete from ai_cache where module = 'qcm';
