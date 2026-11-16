-- usage_tokens.sql — tokens consommés par chaque réponse de l'IA, pour estimer précisément
-- ce qu'il reste des quotas gratuits (Mode Prof → Stats → Usage IA).
-- À exécuter une seule fois dans Supabase → SQL Editor.
alter table usage_stats add column if not exists tokens_in integer;
alter table usage_stats add column if not exists tokens_out integer;
