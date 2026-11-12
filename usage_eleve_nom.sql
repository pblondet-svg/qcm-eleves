-- usage_eleve_nom.sql
-- À exécuter une fois dans Supabase (SQL Editor).
-- Ajoute le prénom de l'élève aux statistiques d'usage de l'IA, pour que le professeur
-- voie qui approche de la limite (Mode Prof → Stats → Usage IA).
alter table usage_stats add column if not exists eleve_nom text;
