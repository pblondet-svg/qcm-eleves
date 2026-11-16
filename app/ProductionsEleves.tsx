"use client";
// app/ProductionsEleves.tsx
// Mode Prof → Stats → Productions : ce que les élèves ont rédigé dans les entraînements
// (introduction, paragraphe, plan dialectique), avec la note ou le verdict quand il y en a un.
// Lecture via /api/productions (réservé au professeur, en-tête x-prof-code).

import { useEffect, useMemo, useState } from "react";

type Production = {
  id: string; created_at: string; updated_at: string; visitor_id: string | null; eleve_nom: string | null;
  exercice: "intro" | "paragraphe" | "plan"; format: "chat" | "cadres"; sujet: string | null;
  contenu: string | null; note: string | null; nb_reponses: number;
};

const EXO: Record<string, { label: string; cls: string }> = {
  intro: { label: "📝 Introduction", cls: "bg-indigo-50 text-indigo-700" },
  paragraphe: { label: "✍️ Paragraphe", cls: "bg-rose-50 text-rose-700" },
  plan: { label: "🔺 Plan dialectique", cls: "bg-violet-50 text-violet-700" },
};
const codeProf = () => { try { return sessionStorage.getItem("prof_code_session") || ""; } catch { return ""; } };
const dateCourte = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ProductionsEleves() {
  const [prods, setProds] = useState<Production[] | null>(null);
  const [erreur, setErreur] = useState("");
  const [tableAbsente, setTableAbsente] = useState(false);
  const [jours, setJours] = useState(7);
  const [exo, setExo] = useState("all");
  const [eleve, setEleve] = useState("all");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [videsMasques, setVidesMasques] = useState(true);

  const charger = async () => {
    setErreur(""); setProds(null);
    try {
      const r = await fetch(`/api/productions?jours=${jours}`, { headers: { "x-prof-code": codeProf() }, cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { setTableAbsente(!!d.table_absente); setErreur(d.table_absente ? "" : d.error || "Chargement impossible."); setProds([]); return; }
      setProds(d.productions || []);
    } catch { setErreur("Chargement impossible."); setProds([]); }
  };
  useEffect(() => { charger(); }, [jours]);

  const nomDe = (p: Production) => p.eleve_nom?.trim() || "Élève anonyme · " + (p.visitor_id || "????").slice(-4).toUpperCase();
  const eleves = useMemo(() => [...new Set((prods || []).map(nomDe))].sort((a, b) => a.localeCompare(b, "fr")), [prods]);
  const liste = (prods || []).filter((p) =>
    (exo === "all" || p.exercice === exo) && (eleve === "all" || nomDe(p) === eleve) && (!videsMasques || (p.contenu || "").trim()));

  const supprimer = async (id: string) => {
    if (!window.confirm("Supprimer définitivement cette production ?")) return;
    await fetch(`/api/productions?id=${id}`, { method: "DELETE", headers: { "x-prof-code": codeProf() } });
    setProds((l) => (l || []).filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-gray-800">Productions des élèves</h3>
            <p className="text-xs text-gray-500 mt-0.5">Ce que les élèves ont rédigé dans les entraînements, avec la note ou le verdict du tuteur.</p>
          </div>
          <button onClick={charger} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex-shrink-0">Actualiser</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={jours} onChange={(e) => setJours(Number(e.target.value))} className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm bg-white text-gray-800">
            {[[1, "Aujourd'hui"], [7, "7 derniers jours"], [30, "30 derniers jours"], [120, "4 derniers mois"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={exo} onChange={(e) => setExo(e.target.value)} className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm bg-white text-gray-800">
            <option value="all">Tous les exercices</option>
            {Object.entries(EXO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={eleve} onChange={(e) => setEleve(e.target.value)} className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm bg-white text-gray-800 max-w-[220px]">
            <option value="all">Tous les élèves</option>
            {eleves.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs font-bold text-gray-500 cursor-pointer">
            <input type="checkbox" checked={videsMasques} onChange={(e) => setVidesMasques(e.target.checked)} className="accent-indigo-600" />
            Masquer les exercices commencés sans rien écrire
          </label>
        </div>
      </div>

      {tableAbsente && (
        <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3">
          Les productions ne sont pas encore enregistrées : exécutez une fois le fichier <strong>sql/productions_eleves.sql</strong> dans Supabase (SQL Editor).
        </p>
      )}
      {erreur && <p className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">{erreur}</p>}

      {prods === null ? <p className="text-sm text-gray-400">Chargement…</p> : liste.length === 0 && !tableAbsente ? (
        <p className="text-sm text-gray-400 text-center py-6">Aucune production sur cette période.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {liste.map((p) => (
            <div key={p.id}>
              <button onClick={() => setOuvert(ouvert === p.id ? null : p.id)} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-all">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-black text-gray-800">{nomDe(p)}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${EXO[p.exercice]?.cls || "bg-gray-100 text-gray-600"}`}>{EXO[p.exercice]?.label || p.exercice}</span>
                  <span className="text-[11px] text-gray-400">{p.format === "chat" ? "chatbot" : "cadres"} · {p.nb_reponses} réponse{p.nb_reponses > 1 ? "s" : ""} de l'IA · {dateCourte(p.updated_at)}</span>
                  {p.note && <span className="ml-auto text-sm font-black text-emerald-700">{p.note}</span>}
                </div>
                {p.sujet && <p className="text-xs text-gray-600 mt-0.5 truncate">« {p.sujet} »</p>}
              </button>
              {ouvert === p.id && (
                <div className="px-4 pb-4">
                  <pre className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap font-sans bg-gray-50 border border-gray-100 rounded-xl p-3 max-h-[480px] overflow-y-auto">
                    {(p.contenu || "").trim() || "(rien d'écrit)"}
                  </pre>
                  <button onClick={() => supprimer(p.id)} className="mt-2 text-xs font-bold text-rose-600 hover:text-rose-800">Supprimer cette production</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
