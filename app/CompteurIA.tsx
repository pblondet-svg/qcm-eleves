"use client";
// app/CompteurIA.tsx
// Compteur affiché à l'élève : nombre de réponses de l'IA qu'il lui reste aujourd'hui.
// La limite est réglée dans Mode Prof → Fonctionnalités (« Limites d'utilisation de l'IA »).
// Valeur initiale lue sur GET /api/ai, puis mise à jour après chaque réponse (via signalerQuota).

import { useEffect, useState } from "react";

type Quota = { limite: number; restant: number | null };
const EVT = "philo-quota-ia";

// Appelée par callAI à chaque réponse de l'API
export function signalerQuota(q: Quota) {
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: q })); } catch { /* ignoré */ }
}

export default function CompteurIA({ visitorId }: { visitorId: () => string }) {
  const [q, setQ] = useState<Quota | null>(null);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    const charger = () =>
      fetch(`/api/ai?visitor_id=${encodeURIComponent(visitorId())}`)
        .then((r) => r.json()).then((d) => setQ(d)).catch(() => {});
    charger();
    const onQuota = (e: Event) => setQ((e as CustomEvent<Quota>).detail);
    // À minuit (ou après une longue absence), on relit le compteur quand l'élève revient sur l'onglet
    const onVisible = () => { if (document.visibilityState === "visible") charger(); };
    window.addEventListener(EVT, onQuota);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener(EVT, onQuota); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  // Pas de limite fixée par le professeur : rien à afficher
  if (!q || q.restant === null) return null;

  const max = q.limite || Math.max(q.restant, 1);
  const ratio = q.restant / max;
  const ton = q.restant === 0 ? "bg-rose-600 text-white border-rose-700"
    : ratio <= 0.25 ? "bg-amber-100 text-amber-900 border-amber-300"
    : "bg-white text-gray-800 border-gray-200";
  const barre = q.restant === 0 ? "bg-white/60" : ratio <= 0.25 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="fixed bottom-3 left-3 z-50 max-w-[calc(100vw-1.5rem)]">
      <button onClick={() => setOuvert(!ouvert)}
        aria-label="Réponses de l'IA restantes aujourd'hui"
        className={`shadow-md rounded-2xl border-2 px-3 py-2 text-left transition-all ${ton}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm">🤖</span>
          <span className="text-xs font-black whitespace-nowrap">
            {q.restant === 0 ? "Plus de questions aujourd'hui" : `${q.restant}${q.limite ? ` / ${q.limite}` : ""} question${q.restant > 1 ? "s" : ""} restante${q.restant > 1 ? "s" : ""}`}
          </span>
        </div>
        {q.limite > 0 && (
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/10 overflow-hidden">
            <div className={`h-full rounded-full ${barre}`} style={{ width: `${Math.round(Math.min(1, ratio) * 100)}%` }} />
          </div>
        )}
        {ouvert && (
          <p className="text-[11px] mt-2 leading-snug max-w-[240px] font-medium opacity-90">
            Chaque réponse de l'IA (assistant, correction, indice…) compte pour une question. Le compteur repart à zéro à minuit.
            {q.restant > 0 ? " Pose des questions précises pour en tirer le meilleur parti." : " En attendant, relis ton cours et les fiches méthode."}
          </p>
        )}
      </button>
    </div>
  );
}
