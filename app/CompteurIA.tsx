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

// Seuils où l'on prévient l'élève par un message bien visible
const ALERTES = [10, 5, 1, 0];

export default function CompteurIA({ visitorId }: { visitorId: () => string }) {
  const [q, setQ] = useState<Quota | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [alerte, setAlerte] = useState<number | null>(null);
  const [precedent, setPrecedent] = useState<number | null>(null);

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

  // Message d'alerte quand on franchit un seuil (10, 5, 1, 0 réponses restantes)
  useEffect(() => {
    const r = q?.restant;
    if (r === null || r === undefined) return;
    if (precedent !== null && r < precedent) {
      const franchi = ALERTES.find((s) => r <= s && precedent > s);
      if (franchi !== undefined) {
        setAlerte(r);
        const t = setTimeout(() => setAlerte(null), 8000);
        setPrecedent(r);
        return () => clearTimeout(t);
      }
    }
    setPrecedent(r);
  }, [q?.restant]);

  // Pas de limite fixée par le professeur : rien à afficher
  if (!q || q.restant === null) return null;

  const max = q.limite || Math.max(q.restant, 1);
  const ratio = q.restant / max;
  const ton = q.restant === 0 ? "bg-rose-600 text-white border-rose-700"
    : ratio <= 0.25 ? "bg-amber-400 text-amber-950 border-amber-500"
    : "bg-indigo-600 text-white border-indigo-700";
  const barre = q.restant === 0 ? "bg-white/50" : ratio <= 0.25 ? "bg-amber-900/60" : "bg-white";

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-[calc(100vw-2rem)] flex flex-col items-start gap-2">
      {alerte !== null && (
        <div role="status" className={`shadow-xl rounded-2xl border-2 px-4 py-3 text-sm font-bold max-w-xs ${alerte === 0 ? "bg-rose-50 border-rose-300 text-rose-900" : "bg-amber-50 border-amber-300 text-amber-950"}`}>
          {alerte === 0
            ? "Tu as utilisé toutes tes questions à l'IA pour aujourd'hui. Le compteur repart à zéro à minuit."
            : `Attention : il ne te reste plus que ${alerte} question${alerte > 1 ? "s" : ""} à l'IA aujourd'hui. Choisis-les bien !`}
        </div>
      )}
      <button onClick={() => setOuvert(!ouvert)}
        aria-label="Questions à l'IA restantes aujourd'hui"
        className={`shadow-lg rounded-2xl border-2 px-4 py-2.5 text-left transition-all min-w-[190px] ${ton}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">🤖</span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 leading-none">Questions à l'IA</p>
            <p className="text-base font-black leading-tight whitespace-nowrap">
              {q.restant === 0 ? "Plus rien aujourd'hui" : `${q.restant}${q.limite ? ` / ${q.limite}` : ""} restante${q.restant > 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        {q.limite > 0 && (
          <div className="mt-2 h-2 w-full rounded-full bg-black/20 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barre}`} style={{ width: `${Math.round(Math.min(1, ratio) * 100)}%` }} />
          </div>
        )}
        {ouvert && (
          <p className="text-xs mt-2 leading-snug max-w-[240px] font-medium opacity-95">
            Chaque réponse de l'IA (assistant, correction, indice…) compte pour une question. Le compteur repart à zéro à minuit.
            {q.restant > 0 ? " Pose des questions précises pour en tirer le meilleur parti." : " En attendant, relis ton cours et les fiches méthode."}
          </p>
        )}
      </button>
    </div>
  );
}
