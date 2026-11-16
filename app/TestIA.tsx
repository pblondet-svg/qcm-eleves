"use client";
// app/TestIA.tsx
// Mode Prof → Stats → Usage IA : vérifie que chaque IA (principale et de secours) répond bien.
// Envoie une toute petite question à chacune (GET /api/ai?test=ia, réservé au professeur).

import { useState } from "react";

type Resultat = { nom: string; ok: boolean; ms: number; erreur?: string; modele?: string; modeles?: string[] };
const NOMS: Record<string, string> = { google: "Google Gemini", "google-lite": "Gemini Flash-Lite", groq: "Groq", mistral: "Mistral" };
const codeProf = () => { try { return sessionStorage.getItem("prof_code_session") || ""; } catch { return ""; } };

export default function TestIA() {
  const [res, setRes] = useState<Resultat[] | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [err, setErr] = useState("");

  const tester = async () => {
    setEnCours(true); setErr(""); setRes(null);
    try {
      const r = await fetch("/api/ai?test=ia", { headers: { "x-prof-code": codeProf() }, cache: "no-store" });
      const d = await r.json();
      if (!r.ok) setErr(d.error || "Le test n'a pas pu être lancé.");
      else setRes(d.resultats || []);
    } catch { setErr("Le test n'a pas pu être lancé."); }
    setEnCours(false);
  };

  const ok = res?.filter((r) => r.ok).length ?? 0;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-gray-800">Les IA répondent-elles ?</h3>
          <p className="text-xs text-gray-500 mt-0.5">Envoie une toute petite question à chaque IA, principale et de secours, pour vérifier qu'elle est disponible (environ 15 secondes).</p>
        </div>
        <button onClick={tester} disabled={enCours}
          className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white px-3 py-2 rounded-xl flex-shrink-0">
          {enCours ? "Test en cours…" : "Tester les IA"}
        </button>
      </div>
      {err && <p className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2">{err}</p>}
      {res && (
        <>
          <p className={`text-sm font-bold ${ok === res.length ? "text-green-700" : "text-amber-700"}`}>
            {ok === res.length ? "Toutes les IA répondent." : `${ok} IA sur ${res.length} répondent.`}
          </p>
          <div className="divide-y divide-gray-100 border-2 border-gray-100 rounded-xl">
            {res.map((r) => (
              <div key={r.nom} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-800">{r.ok ? "✅" : "❌"} {NOMS[r.nom] || r.nom}{r.modele && <span className="text-[11px] font-normal text-gray-400"> · {r.modele}</span>}</p>
                  <p className="text-xs text-gray-400">{(r.ms / 1000).toFixed(1)} s</p>
                </div>
                {!r.ok && r.erreur && <p className="text-xs text-red-700 mt-0.5 break-words">{r.erreur}</p>}
                {!r.ok && r.modeles && r.modeles.length > 0 && (
                  <p className="text-[11px] text-gray-600 mt-1 break-words">Modèles accessibles avec cette clé : {r.modeles.join(", ")}</p>
                )}
              </div>
            ))}
          </div>
          {ok < res.length && (
            <p className="text-[11px] text-gray-500">
              « clé API absente » : la clé n'est pas renseignée dans Vercel (Settings → Environment Variables). « 429 » ou « quota » : le quota gratuit du jour est épuisé, il revient demain.
              « 401 » ou « 403 » : la clé n'est plus valable. « 404 » : le modèle n'existe plus chez ce fournisseur. « 402 » : ce modèle est devenu payant pour ce compte. Pour changer de modèle sans toucher au code : variable GROQ_MODEL, MISTRAL_MODEL, GEMINI_MODEL ou GEMINI_LITE_MODEL dans Vercel, puis Redeploy.
            </p>
          )}
        </>
      )}
    </div>
  );
}
