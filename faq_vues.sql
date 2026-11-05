-- faq_vues.sql — compteur de lectures pour « Les plus consultées » (FAQ élève)
-- À exécuter une seule fois dans Supabase → SQL Editor.

create table if not exists public.faq_vues (
  faq_id     text primary key,
  vues       integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Accès uniquement par le serveur (clé service_role), comme faq_questions
alter table public.faq_vues enable row level security;

-- +1 lecture, sans risque de perdre des comptes si plusieurs élèves lisent en même temps
create or replace function public.faq_vue_increment(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.faq_vues (faq_id, vues) values (p_id, 1)
  on conflict (faq_id) do update
    set vues = public.faq_vues.vues + 1,
        updated_at = now();
$$;

revoke all on function public.faq_vue_increment(text) from public, anon, authenticated;
