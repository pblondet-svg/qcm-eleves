"use client";
// app/AiQuotaGauge.tsx
// Jauge de consommation IA (Mode Prof → Stats → Usage IA).
// - « Utilisé aujourd'hui » : appels comptés dans usage_stats (action « leger:groq », « lourd:google »…)
// - « Reste » : exact quand le fournisseur l'indique (Groq, Cerebras, Mistral via config.ai_quota),
//   sinon estimé à partir de la limite quotidienne saisie par le professeur (Google ne donne rien).

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ProviderKey = "google" | "google-lite" | "groq" | "cerebras" | "mistral";
type Limits = Record<ProviderKey, number>;
type QuotaSnap = { headers?: Record<string, string>; at?: string; last_error?: string; last_error_at?: string };

const PROVIDERS: { key: ProviderKey; nom: string; role: string }[] = [
  { key: "google", nom: "Google Gemini", role: "Principal pour les réponses longues (assistant, corrections, plans)" },
  { key: "google-lite", nom: "Gemini Flash-Lite", role: "Relais de Gemini quand son quota est épuisé" },
  { key: "groq", nom: "Groq", role: "Principal pour les réponses courtes (flashcards, FAQ, petits retours)" },
  { key: "cerebras", nom: "Cerebras", role: "Secours n° 2" },
  { key: "mistral", nom: "Mistral", role: "Dernier secours" },
];

// Limites gratuites indicatives (requêtes par jour) — modifiables ci-dessous,
// car les fournisseurs les changent régulièrement.
const DEFAULT_LIMITS: Limits = { google: 250, "google-lite": 1000, groq: 14400, cerebras: 14400, mistral: 5000 };

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const isToday = (iso?: string) => !!iso && new Date(iso).toDateString() === new Date().toDateString();
const heure = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "");
const num = (v?: string) => { const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };

// Lit, dans les en-têtes enregistrés, le quota de requêtes du jour (limite et reste)
function exactDaily(key: ProviderKey, snap?: QuotaSnap): { limit: number | null; remaining: number | null } {
  const h = snap?.headers || {};
  if (key === "cerebras") return { limit: num(h["x-ratelimit-limit-requests-day"]), remaining: num(h["x-ratelimit-remaining-requests-day"]) };
  if (key === "groq") return { limit: num(h["x-ratelimit-limit-requests"]), remaining: num(h["x-ratelimit-remaining-requests"]) };
  return { limit: null, remaining: null };
}

const isQuotaError = (msg?: string) => !!msg && /429|quota|rate.?limit|exhaust|too many/i.test(msg);

export default function AiQuotaGauge() {
  const [used, setUsed] = useState<Record<string, number>>({});
  const [totalToday, setTotalToday] = useState<number | null>(null);
  const [quota, setQuota] = useState<Record<string, QuotaSnap>>({});
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Limits>(DEFAULT_LIMITS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const since = startOfToday();
    const counts = await Promise.allSettled([
      ...PROVIDERS.map((p) =>
        supabase.from("usage_stats").select("*", { count: "exact", head: true }).gte("created_at", since).like("action", `%:${p.key}`)
      ),
      supabase.from("usage_stats").select("*", { count: "exact", head: true }).gte("created_at", since).neq("action", "call"),
    ]);
    const u: Record<string, number> = {};
    PROVIDERS.forEach((p, i) => {
      const r = counts[i];
      if (r.status === "fulfilled") u[p.key] = (r.value as any)?.count || 0;
    });
    setUsed(u);
    const t = counts[counts.length - 1];
    setTotalToday(t.status === "fulfilled" ? (t.value as any)?.count ?? null : null);

    const cfg = await supabase.from("config").select("key, value").in("key", ["ai_quota", "ai_limits"]);
    (cfg.data || []).forEach((row: any) => {
      try {
        if (row.key === "ai_quota") setQuota(JSON.parse(row.value) || {});
        if (row.key === "ai_limits") { const l = { ...DEFAULT_LIMITS, ...JSON.parse(row.value) }; setLimits(l); setDraft(l); }
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
    const limit = ex.limit ?? limits[p.key];
    const u = used[p.key] || 0;
    const remaining = ex.remaining ?? Math.max(0, limit - u);
    const pctUsed = limit > 0 ? Math.min(100, Math.round(((limit - remaining) / limit) * 100)) : 0;
    const blocked = isToday(snap?.last_error_at) && isQuotaError(snap?.last_error)
      && (!snap?.at || new Date(snap.last_error_at!) > new Date(snap.at));
    const lastError = isToday(snap?.last_error_at) && (!snap?.at || new Date(snap.last_error_at!) > new Date(snap.at)) ? snap?.last_error : "";
    return { ...p, limit, used: u, remaining: blocked ? 0 : remaining, pctUsed: blocked ? 100 : pctUsed, exact: ex.remaining !== null, at: snap?.at, blocked, blockedAt: snap?.last_error_at, lastError };
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
              {r.used.toLocaleString("fr-FR")} appel{r.used > 1 ? "s" : ""} aujourd'hui · {r.exact ? `reste exact relevé à ${heure(r.at)}` : `estimation sur une limite de ${r.limit.toLocaleString("fr-FR")} / jour`}
            </p>
            {r.lastError && (
              <p className="text-[11px] text-red-500 mt-0.5 break-words">Dernière erreur ({heure(r.blockedAt)}) : {r.lastError}</p>
            )}
          </div>
        ))}
      </div>

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
              {PROVIDERS.map((p) => (
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
