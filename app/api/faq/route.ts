// app/api/faq/route.ts
// Gère les questions des élèves (table Supabase `faq_questions`), l'e-mail de
// notification (Resend) et les actions du prof (répondre, ignorer, supprimer).
//
// Variables d'environnement à définir dans Vercel :
//   SUPABASE_SERVICE_ROLE_KEY  (clé "service_role", jamais côté navigateur)
//   RESEND_API_KEY             (clé API Resend)
//   NOTIFY_EMAIL               (adresse qui reçoit les notifications)
//   NOTIFY_FROM                (optionnel, défaut : PhiloMentor <onboarding@resend.dev>)
//   NEXT_PUBLIC_SITE_URL       (optionnel, pour le lien dans l'e-mail)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const db = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

const SERIES = ["generale", "techno", "hlp"];
const SERIE_LABEL: Record<string, string> = {
  generale: "Série Générale",
  techno: "Série Techno",
  hlp: "HLP",
};

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Le code prof est celui stocké dans la table `config` (clé prof_code).
async function isProf(client: ReturnType<typeof db>, req: NextRequest) {
  const code = req.headers.get("x-prof-code") || "";
  if (!code) return false;
  const { data } = await client
    .from("config")
    .select("value")
    .eq("key", "prof_code")
    .maybeSingle();
  return code === (data?.value || "prof1234");
}

// E-mail au prof. Ne bloque jamais l'enregistrement de la question.
async function notifyProf(question: string, eleve: string, serie: string | null) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!key || !to) return false;

  const label = serie ? SERIE_LABEL[serie] : "série non précisée";
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://qcm-eleves.vercel.app";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;line-height:1.5;color:#1f2937">
      <h2 style="margin:0 0 8px">Nouvelle question d'élève</h2>
      <p style="margin:0 0 4px;color:#6b7280">${esc(eleve)} · ${esc(label)}</p>
      <blockquote style="margin:12px 0;padding:12px 16px;background:#eef2ff;border-left:4px solid #6366f1;border-radius:6px">
        ${esc(question).replace(/\n/g, "<br>")}
      </blockquote>
      <p><a href="${site}" style="color:#4f46e5;font-weight:bold">Ouvrir le Mode Prof → FAQ Méthode</a></p>
    </div>`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || "PhiloMentor <onboarding@resend.dev>",
        to: [to],
        subject: `Nouvelle question d'élève (${label})`,
        html,
      }),
    });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ── GET ──────────────────────────────────────────────────────────────────────
//  ?visitor_id=xxx  → les questions de cet élève (et leurs réponses)
//  ?scope=count     → nombre de questions en attente (prof)
//  ?scope=all       → toutes les questions (prof)
//  ?scope=popular   → nombre de lectures par question publiée (public)
export async function GET(req: NextRequest) {
  const client = db();
  const p = req.nextUrl.searchParams;
  const visitor = p.get("visitor_id");
  const scope = p.get("scope");

  if (visitor) {
    const { data, error } = await client
      .from("faq_questions")
      .select("id, question, statut, reponse, created_at")
      .eq("visitor_id", visitor.slice(0, 64))
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return json({ error: "db" }, 500);
    const questions = (data || []).map((q) => ({
      ...q,
      reponse: q.statut === "repondue" || q.statut === "publiee" ? q.reponse : null,
    }));
    return json({ questions });
  }

  // Nombre de lectures de chaque question publiée (public, pour « Les plus consultées »)
  if (scope === "popular") {
    const { data, error } = await client
      .from("faq_vues")
      .select("faq_id, vues")
      .order("vues", { ascending: false })
      .limit(50);
    if (error) return json({ vues: {} }); // table absente : on n'affiche simplement rien
    const vues: Record<string, number> = {};
    (data || []).forEach((r: any) => { vues[r.faq_id] = r.vues; });
    return json({ vues });
  }

  if (scope === "count" || scope === "all") {
    if (!(await isProf(client, req))) return json({ error: "unauthorized" }, 401);

    if (scope === "count") {
      const { count } = await client
        .from("faq_questions")
        .select("id", { count: "exact", head: true })
        .eq("statut", "en_attente");
      return json({ pending: count || 0 });
    }

    const { data, error } = await client
      .from("faq_questions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return json({ error: "db" }, 500);
    return json({ questions: data || [] });
  }

  return json({ error: "bad request" }, 400);
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const client = db();

  // Un élève pose une question
  if (body.action === "ask") {
    if (body.website) return json({ ok: true }); // champ piège rempli : on ignore

    const question = String(body.question || "").trim();
    const visitor = String(body.visitor_id || "").slice(0, 64);
    const eleve = String(body.eleve_nom || "Anonyme").trim().slice(0, 60) || "Anonyme";
    const serie = SERIES.includes(body.serie) ? (body.serie as string) : null;
    if (question.length < 5 || question.length > 1000 || !visitor) {
      return json({ error: "invalid" }, 400);
    }

    // Anti-spam : 5 questions par heure et par visiteur
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await client
      .from("faq_questions")
      .select("id", { count: "exact", head: true })
      .eq("visitor_id", visitor)
      .gte("created_at", since);
    if ((count || 0) >= 5) return json({ error: "rate_limited" }, 429);

    const { data, error } = await client
      .from("faq_questions")
      .insert({ question, visitor_id: visitor, eleve_nom: eleve, serie })
      .select("id")
      .single();
    if (error || !data) return json({ error: "db" }, 500);

    const notified = await notifyProf(question, eleve, serie);
    return json({ ok: true, id: data.id, notified });
  }

  // Un élève ouvre une réponse de la FAQ (compté une fois par élève côté navigateur)
  if (body.action === "view") {
    const id = String(body.id || "").slice(0, 64);
    if (!id) return json({ error: "invalid" }, 400);
    await client.rpc("faq_vue_increment", { p_id: id });
    return json({ ok: true });
  }

  // Tout le reste est réservé au prof
  if (!(await isProf(client, req))) return json({ error: "unauthorized" }, 401);
  const id = String(body.id || "");
  if (!id) return json({ error: "invalid" }, 400);

  if (body.action === "answer") {
    const reponse = String(body.reponse || "").trim();
    if (!reponse) return json({ error: "invalid" }, 400);
    const { error } = await client
      .from("faq_questions")
      .update({
        reponse,
        statut: body.publier ? "publiee" : "repondue",
        repondu_at: new Date().toISOString(),
      })
      .eq("id", id);
    return error ? json({ error: "db" }, 500) : json({ ok: true });
  }

  if (body.action === "reject") {
    const { error } = await client
      .from("faq_questions")
      .update({ statut: "rejetee", repondu_at: new Date().toISOString() })
      .eq("id", id);
    return error ? json({ error: "db" }, 500) : json({ ok: true });
  }

  if (body.action === "delete") {
    const { error } = await client.from("faq_questions").delete().eq("id", id);
    return error ? json({ error: "db" }, 500) : json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
}
