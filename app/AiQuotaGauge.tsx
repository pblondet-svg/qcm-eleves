"use client";
// app/AiQuotaGauge.tsx
// Jauge de consommation IA (Mode Prof → Stats → Usage IA).
// - « Utilisé aujourd'hui » : appels comptés dans usage_stats (action « leger:groq », « lourd:google »…)
// - « Reste » : on prend la limite la plus contraignante entre les requêtes par jour (exactes quand le
//   fournisseur les indique, sinon estimées) et, pour Groq et Cloudflare, les tokens / neurones par jour,
//   calculés à partir des tokens réellement consommés (colonnes tokens_in / tokens_out, sql/usage_tokens.sql).

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ProviderKey = "google" | "google-bis" | "google-lite" | "groq" | "openrouter" | "cloudflare" | "mistral";
type Limits = Record<ProviderKey, number> & { groq_tokens: number; cloudflare_neurones: number };
type QuotaSnap = { headers?: Record<string, string>; at?: string; last_error?: string; last_error_at?: string; last_ok_at?: string };

const PROVIDERS: { key: ProviderKey; nom: string; role: string }[] = [
  { key: "google", nom: "Google Gemini", role: "Principal pour les réponses longues (assistant, corrections, plans)" },
  { key: "google-bis", nom: "Gemini (2e modèle)", role: "Relais de Gemini, avec son propre quota" },
  { key: "google-lite", nom: "Gemini Flash-Lite", role: "Relais de Gemini quand son quota est épuisé" },
  { key: "groq", nom: "Groq", role: "Secours rapide (limité aussi en tokens par jour)" },
  { key: "openrouter", nom: "OpenRouter", role: "Secours : modèles gratuits (50 par jour, 1 000 avec 10 $ de crédit)" },
  { key: "cloudflare", nom: "Cloudflare Workers AI", role: "Secours : 10 000 neurones gratuits par jour" },
  { key: "mistral", nom: "Mistral", role: "Dernier secours" },
];

// Limites gratuites indicatives (requêtes par jour) — modifiables ci-dessous,
// car les fournisseurs les changent régulièrement.
const DEFAULT_LIMITS: Limits = { google: 20, "google-bis": 20, "google-lite": 1000, groq: 1000, openrouter: 50, cloudflare: 1000, mistral: 5000,
  groq_tokens: 200000, cloudflare_neurones: 10000 };
// Quand les tokens réels ne sont pas encore enregistrés : consommation moyenne d'une réponse du site
const MOYENNE_TOKENS = 3000;
const MOYENNE_NEURONES = 150;
// Cloudflare (llama-3.3-70b-instruct-fp8-fast) : neurones par token d'entrée et de sortie
const neurones = (tin: number, tout: number) => tin * 0.0264 + tout * 0.2045;

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const isToday = (iso?: string) => !!iso && new Date(iso).toDateString() === new Date().toDateString();
const heure = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "");
const num = (v?: string) => { const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };

// Lit, dans les en-têtes enregistrés, le quota de requêtes du jour (limite et reste)
function exactDaily(key: ProviderKey, snap?: QuotaSnap): { limit: number | null; remaining: number | null } {
  const h = snap?.headers || {};
  if (key === "groq") return { limit: num(h["x-ratelimit-limit-requests"]), remaining: num(h["x-ratelimit-remaining-requests"]) };
  return { limit: null, remaining: null };
}

const isQuotaError = (msg?: string) => !!msg && /429|quota|rate.?limit|exhaust|too many/i.test(msg);

export default function AiQuotaGauge() {
  const [used, setUsed] = useState<Record<string, number>>({});
  const [tokens, setTokens] = useState<Record<string, { tok: number; neur: number; mesures: number }>>({});
  const [tokensDispo, setTokensDispo] = useState(true);
  const [totalToday, setTotalToday] = useState<number | null>(null);
  const [quota, setQuota] = useState<Record<string, QuotaSnap>>({});
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Limits>(DEFAULT_LIMITS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bloques, setBloques] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const since = startOfToday();
    const counts = await Promise.allSettled([
      ...PROVIDERS.map((p) =>
        supabase.from("usage_stats").select("*", { count: "exact", head: true }).gte("created_at", since).like("action", `%:${p.key}`)
      ),
      supabase.from("usage_stats").select("*", { count: "exact", head: true }).gte("created_at", since).neq("action", "call").neq("action", "limite"),
    ]);
    const u: Record<string, number> = {};
    PROVIDERS.forEach((p, i) => {
      const r = counts[i];
      if (r.status === "fulfilled") u[p.key] = (r.value as any)?.count || 0;
    });
    setUsed(u);

    // Tokens réellement consommés aujourd'hui, par fournisseur
    const tk = await supabase.from("usage_stats").select("action, tokens_in, tokens_out").gte("created_at", since).like("action", "%:%").limit(10000);
    setTokensDispo(!tk.error);
    const t2: Record<string, { tok: number; neur: number; mesures: number }> = {};
    (tk.data || []).forEach((r: any) => {
      if (r.tokens_in == null && r.tokens_out == null) return;
      const k = String(r.action).split(":").pop() as string;
      const x = (t2[k] ||= { tok: 0, neur: 0, mesures: 0 });
      x.tok += (r.tokens_in || 0) + (r.tokens_out || 0);
      x.neur += neurones(r.tokens_in || 0, r.tokens_out || 0);
      x.mesures++;
    });
    setTokens(t2);
    const t = counts[counts.length - 1];
    setTotalToday(t.status === "fulfilled" ? (t.value as any)?.count ?? null : null);

    const lim = await supabase.from("usage_stats").select("visitor_id").gte("created_at", since).eq("action", "limite").limit(2000);
    setBloques(lim.error ? null : new Set((lim.data || []).map((r: any) => r.visitor_id)).size);

    const cfg = await supabase.from("config").select("key, value").in("key", ["ai_quota", "ai_limits"]);
    (cfg.data || []).forEach((row: any) => {
      try {
        if (row.key === "ai_quota") setQuota(JSON.parse(row.value) || {});
        if (row.key === "ai_limits") { const saved = JSON.parse(row.value); delete saved.cerebras; if (saved.google === 250) delete saved.google; const l = { ...DEFAULT_LIMITS, ...saved }; setLimits(l); setDraft(l); }
      } catch { /* ignore */ }
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveLimits = async () => {
    setSaving(true);
    try {
      await supabase.from("config").upsert({ key: "ai_limits", value: JSON.stringify(draft) }, { onConflict: "key" });
      setLimits(draft);
      setEditing(false);
    } catch { /* ignore */ }
    setSaving(false);
  };

  // Ligne par fournisseur
  const rows = PROVIDERS.map((p) => {
    const snap = quota[p.key];
    const ex = isToday(snap?.at) ? exactDaily(p.key, snap) : { limit: null, remaining: null };
    const limReq = ex.limit ?? limits[p.key];
    const u = used[p.key] || 0;
    const resteReq = ex.remaining ?? Math.max(0, limReq - u);
    // Limite en tokens (Groq) ou en neurones (Cloudflare) : on estime le nombre de réponses restantes
    let resteTok: number | null = null;
    let detailTok = "";
    const m = tokens[p.key];
    if (p.key === "groq" || p.key === "cloudflare") {
      const parNeurones = p.key === "cloudflare";
      const plafond = parNeurones ? limits.cloudflare_neurones : limits.groq_tokens;
      const moyenneDefaut = parNeurones ? MOYENNE_NEURONES : MOYENNE_TOKENS;
      const mesure = m && m.mesures ? (parNeurones ? m.neur : m.tok) : 0;
      const moyenne = m && m.mesures ? mesure / m.mesures : moyenneDefaut;
      // appels non mesurés (avant l'enregistrement des tokens) : comptés à la moyenne
      const consomme = mesure + Math.max(0, u - (m?.mesures || 0)) * moyenne;
      resteTok = Math.max(0, Math.floor((plafond - consomme) / Math.max(1, moyenne)));
      detailTok = `~${Math.round(consomme).toLocaleString("fr-FR")} ${parNeurones ? "neurones" : "tokens"} utilisés sur ${plafond.toLocaleString("fr-FR")} / jour`;
    }
    const remaining = resteTok === null ? resteReq : Math.min(resteReq, resteTok);
    const limit = u + remaining;
    const pctUsed = limit > 0 ? Math.min(100, Math.round((u / limit) * 100)) : 0;
    // Une erreur n'est « actuelle » que si aucun succès ni relevé de quota ne l'a suivie
    const apres = (a?: string, b?: string) => !b || (!!a && new Date(a) > new Date(b));
    const erreurActuelle = isToday(snap?.last_error_at) && apres(snap?.last_error_at, snap?.at) && apres(snap?.last_error_at, snap?.last_ok_at);
    const blocked = erreurActuelle && isQuotaError(snap?.last_error);
    const lastError = erreurActuelle ? snap?.last_error : "";
    return { ...p, limit, limReq, used: u, remaining: blocked ? 0 : remaining, pctUsed: blocked ? 100 : pctUsed, exact: ex.remaining !== null && resteTok === null, at: snap?.at, blocked, blockedAt: snap?.last_error_at, lastError, detailTok, parTokens: resteTok !== null && resteTok < resteReq };
  });

  const main = rows[0];
  const color = (pct: number) => (pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500");
  const textColor = (pct: number) => (pct >= 90 ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-green-700");

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-gray-800">Consommation IA aujourd'hui</h3>
          <p className="text-xs text-gray-500 mt-0.5">Les quotas gratuits se remettent à zéro chaque jour. Le site passe automatiquement au modèle suivant quand l'un est épuisé.</p>
        </div>
        <button onClick={load} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex-shrink-0">{loading ? "…" : "Actualiser"}</button>
      </div>

      {/* Jauge principale : le modèle le plus sollicité */}
      <div className="rounded-2xl border-2 border-gray-100 p-4">
        <div className="flex items-end justify-between mb-2 gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-400">Modèle principal</p>
            <p className="font-black text-gray-800">{main.nom}</p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-black ${textColor(main.pctUsed)}`}>{main.pctUsed} %</p>
            <p className="text-xs text-gray-500">utilisé</p>
          </div>
        </div>
        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-4 rounded-full transition-all ${color(main.pctUsed)}`} style={{ width: `${Math.max(main.pctUsed, 2)}%` }} />
        </div>
        <p className="text-sm text-gray-700 mt-2">
          {main.blocked
            ? <>Quota atteint vers {heure(main.blockedAt)} : les élèves sont servis par les modèles de secours.</>
            : <>Il reste environ <strong>{main.remaining.toLocaleString("fr-FR")}</strong> réponses sur {main.limit.toLocaleString("fr-FR")} aujourd'hui.</>}
        </p>
      </div>

      {/* Détail par fournisseur */}
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="flex items-center justify-between text-sm gap-2">
              <div className="min-w-0">
                <span className="font-bold text-gray-800">{r.nom}</span>
                <span className="text-xs text-gray-400 ml-2 hidden sm:inline">{r.role}</span>
              </div>
              <span className={`text-xs font-black flex-shrink-0 ${textColor(r.pctUsed)}`}>
                {r.blocked ? "épuisé" : `reste ~${r.remaining.toLocaleString("fr-FR")}`}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1">
              <div className={`h-2 rounded-full ${color(r.pctUsed)}`} style={{ width: `${Math.max(r.pctUsed, 1)}%` }} />
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {r.used.toLocaleString("fr-FR")} appel{r.used > 1 ? "s" : ""} aujourd'hui · {r.detailTok
                ? <>{r.detailTok}{r.parTokens ? " (c'est cette limite qui compte)" : ""}</>
                : r.exact ? `reste exact relevé à ${heure(r.at)}` : `estimation sur une limite de ${r.limReq.toLocaleString("fr-FR")} réponses / jour`}
            </p>
            {r.lastError && (
              <p className="text-[11px] text-red-500 mt-0.5 break-words">Dernière erreur ({heure(r.blockedAt)}) : {r.lastError}</p>
            )}
          </div>
        ))}
      </div>

      {!tokensDispo && (
        <p className="text-[11px] bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
          Pour Groq et Cloudflare, l'estimation se fait pour l'instant sur une consommation moyenne. Pour une estimation précise, exécute une fois <strong>sql/usage_tokens.sql</strong> dans Supabase (SQL Editor).
        </p>
      )}

      {bloques !== null && (
        <p className="text-sm text-gray-700">
          <strong>{bloques}</strong> élève{bloques > 1 ? "s ont" : " a"} atteint sa limite quotidienne aujourd'hui
          <span className="text-xs text-gray-400"> (réglable dans Fonctionnalités)</span>
        </p>
      )}

      {totalToday !== null && Object.values(used).reduce((a, b) => a + b, 0) < totalToday && (
        <p className="text-[11px] text-gray-400">
          Certains appels d'aujourd'hui ont été faits avant la mise en place de la jauge : ils ne sont pas attribués à un modèle.
        </p>
      )}

      {/* Limites modifiables */}
      <div className="border-t border-gray-100 pt-3">
        {!editing ? (
          <button onClick={() => { setDraft(limits); setEditing(true); }} className="text-xs font-bold text-gray-500 hover:text-gray-800">
            Modifier les limites quotidiennes
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              Requêtes gratuites par jour. Pour Google, vérifie ta limite dans Google AI Studio (rubrique « Rate limit ») : c'est la plus importante, car Google n'indique pas ce qu'il reste.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[...PROVIDERS.map((p) => ({ key: p.key as keyof Limits, nom: p.nom + " (réponses)" })),
                { key: "groq_tokens" as keyof Limits, nom: "Groq (tokens)" }, { key: "cloudflare_neurones" as keyof Limits, nom: "Cloudflare (neurones)" }].map((p) => (
                <label key={p.key} className="text-xs font-bold text-gray-600">
                  {p.nom}
                  <input
                    type="number"
                    min={0}
                    value={draft[p.key]}
                    onChange={(e) => setDraft({ ...draft, [p.key]: Math.max(0, parseInt(e.target.value || "0", 10)) })}
                    className="mt-1 w-full px-2 py-1.5 border-2 border-gray-200 rounded-lg text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={saveLimits} disabled={saving} className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg">
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button onClick={() => setEditing(false)} className="text-xs font-bold text-gray-500 px-3 py-1.5">Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
