// app/api/productions/route.ts
// Productions des élèves dans les entraînements (table `productions_eleves`, voir sql/productions_eleves.sql).
//   POST  : l'élève enregistre ou met à jour son exercice en cours (sans pouvoir toucher au compteur nb_reponses)
//   GET   : le professeur (en-tête x-prof-code) consulte les productions
//   DELETE: le professeur supprime une production (?id=…)
// Utilise la clé SUPABASE_SERVICE_ROLE_KEY (déjà utilisée pour la FAQ).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const EXERCICES = ["intro", "paragraphe", "plan"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

async function isProf(client: ReturnType<typeof db>, req: NextRequest) {
  const code = req.headers.get("x-prof-code") || "";
  if (!code) return false;
  const { data } = await client.from("config").select("value").eq("key", "prof_code").maybeSingle();
  return code === (data?.value || "prof1234");
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!UUID.test(String(b.id || "")) || !EXERCICES.includes(b.exercice)) return json({ error: "requête invalide" }, 400);
    const client = db();
    const row = {
      id: b.id,
      visitor_id: txt(b.visitor_id, 80),
      eleve_nom: txt(b.eleve_nom, 60),
      exercice: b.exercice,
      format: b.format === "cadres" ? "cadres" : "chat",
      sujet: txt(b.sujet, 400),
      contenu: txt(b.contenu, 30000),
      note: txt(b.note, 120),
      updated_at: new Date().toISOString(),
    };
    // Une production existante ne peut être modifiée que depuis le même navigateur
    const { data: ex } = await client.from("productions_eleves").select("visitor_id").eq("id", b.id).maybeSingle();
    if (ex && ex.visitor_id !== row.visitor_id) return json({ error: "interdit" }, 403);
    const { error } = ex
      ? await client.from("productions_eleves").update(row).eq("id", b.id)
      : await client.from("productions_eleves").insert(row);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

export async function GET(req: NextRequest) {
  const client = db();
  if (!(await isProf(client, req))) return json({ error: "réservé au professeur" }, 401);
  const jours = Math.min(120, Math.max(1, parseInt(req.nextUrl.searchParams.get("jours") || "30", 10)));
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();
  const { data, error } = await client.from("productions_eleves")
    .select("id, created_at, updated_at, visitor_id, eleve_nom, exercice, format, sujet, contenu, note, nb_reponses")
    .gte("created_at", depuis).order("updated_at", { ascending: false }).limit(1000);
  if (error) return json({ error: error.message, table_absente: /relation|does not exist|schema cache/i.test(error.message) }, 500);
  return json({ productions: data || [] });
}

export async function DELETE(req: NextRequest) {
  const client = db();
  if (!(await isProf(client, req))) return json({ error: "réservé au professeur" }, 401);
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!UUID.test(id)) return json({ error: "requête invalide" }, 400);
  const { error } = await client.from("productions_eleves").delete().eq("id", id);
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}
