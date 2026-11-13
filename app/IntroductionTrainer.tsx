"use client";
// app/IntroductionTrainer.tsx
// Entraînement « Rédiger une introduction » : sur un vrai sujet de la banque, l'élève construit lui-même
// son introduction (opinion commune, définitions, paradoxe, problématique, annonce du plan),
// avec des indices et une vérification à chaque étape (voir DissertationGuidee, mode introSeule).

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import DissertationGuidee from "./DissertationGuidee";

type AskAI = (messages: { role: string; content: string }[], maxTokens?: number, light?: boolean) => Promise<string>;
type Sujet = { sujet: string; notion_principale?: string; source?: string };

export default function IntroductionTrainer({ askAI, methode, matiere, loadSujets }: {
  askAI: AskAI; methode: string; matiere: string; loadSujets: () => Promise<Sujet[]>;
}) {
  const [bank, setBank] = useState<Sujet[] | null>(null);
  const [bankErr, setBankErr] = useState(false);
  const [notion, setNotion] = useState("all");
  const [sujet, setSujet] = useState<Sujet | null>(null);
  const [tirage, setTirage] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => {
    loadSujets()
      .then((all) => setBank((all || []).filter((x) => x?.sujet && x.sujet.trim().endsWith("?"))))
      .catch(() => setBankErr(true));
  }, []);

  const notions = useMemo(() => {
    const m: Record<string, number> = {};
    (bank || []).forEach((x) => { const n = (x.notion_principale || "").trim(); if (n) m[n] = (m[n] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [bank]);

  const tirerSujet = () => {
    setErr("");
    const pool = (bank || []).filter((x) => notion === "all" || (x.notion_principale || "").trim() === notion);
    if (!pool.length) { setErr("Aucun sujet disponible pour cette notion."); return; }
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && sujet && pick.sujet === sujet.sujet) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    setSujet({ ...pick, sujet: pick.sujet.trim() });
    setTirage((t) => t + 1);
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-4">
      <div className="bg-gradient-to-r from-indigo-600 to-sky-500 text-white rounded-2xl p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-100">📝 S'entraîner à l'introduction</p>
        <h3 className="text-lg font-black mt-1">Rédige une introduction de dissertation</h3>
        <p className="text-sm text-indigo-50 mt-1 leading-relaxed">
          Opinion commune, définitions, paradoxe, problématique, annonce du plan : construis-les toi-même sur un vrai sujet, étape par étape.
        </p>
      </div>

      <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={tirerSujet} disabled={!bank}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all">
            <RefreshCw className="w-4 h-4" /> {sujet ? "Autre sujet au hasard" : "Un sujet au hasard"}
          </button>
          <select value={notion} onChange={(e) => setNotion(e.target.value)} disabled={!bank || notions.length === 0}
            className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none text-gray-800 bg-white">
            <option value="all">Toutes les notions</option>
            {notions.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
          </select>
        </div>
        <p className="text-[11px] text-gray-400">
          {bankErr ? "La banque de sujets n'a pas pu être chargée." : !bank ? "Chargement de la banque de sujets…" : `${bank.length} vrais sujets disponibles.`}
        </p>
        {err && <p className="text-sm font-semibold rounded-xl px-3 py-2 border bg-red-50 text-red-700 border-red-200">{err}</p>}
        {sujet && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sujet</p>
            <p className="font-black text-gray-800">« {sujet.sujet} »</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {sujet.notion_principale && <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{sujet.notion_principale}</span>}
              {sujet.source && <span className="text-[11px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">📌 {sujet.source}</span>}
            </div>
          </div>
        )}
      </div>

      {sujet && <DissertationGuidee key={tirage} introSeule sujet={sujet.sujet} matiere={matiere} methode={methode} askAI={askAI} />}
    </div>
  );
}
