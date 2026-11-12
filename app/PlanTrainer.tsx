"use client";
// app/PlanTrainer.tsx
// Entraînement au plan dialectique (thèse / antithèse / synthèse).
// L'élève reçoit un sujet avec ses parties I et II, puis propose
// l'ouverture de sa conclusion et la partie III qui en découle
// (astuce du professeur : recycler l'ouverture pour en faire la question du III).
// La correction s'appuie sur la fiche « Plan Thèse / Antithèse / Synthèse » du professeur.

import { useEffect, useMemo, useState } from "react";
import { Lightbulb, RefreshCw, Sparkles } from "lucide-react";

type Sujet = { sujet: string; notion_principale?: string; notions?: string[]; source?: string };
type Repere = { auteur: string; oeuvre: string; idee: string };
type Partie = { titre: string; arguments: string[]; reperes: Repere[] };
type Plan = { I: Partie; II: Partie };

// Sujets « officiels » : source qui mentionne le bac, une session, des annales ou une année
const isBacSource = (src?: string) => !!src && /bac|session|annale|m[ée]tropole|polyn[ée]sie|antilles|liban|asie|am[ée]rique|centres? [ée]trangers|\b(19|20)\d{2}\b/i.test(src);

const toPartie = (x: any): Partie => ({
  titre: String(x?.titre || ""),
  arguments: (Array.isArray(x?.arguments) ? x.arguments : []).map((a: any) => (typeof a === "string" ? a : a?.idee || a?.texte || "")).filter(Boolean).slice(0, 3),
  reperes: (Array.isArray(x?.reperes) ? x.reperes : [])
    .filter((r: any) => r && r.auteur)
    .map((r: any) => ({ auteur: String(r.auteur), oeuvre: String(r.oeuvre || ""), idee: String(r.idee || "") }))
    .slice(0, 2),
});
type Critere = { nom: string; ok: boolean; commentaire: string };
type Correction = {
  verdict: "reussi" | "presque" | "a_retravailler";
  criteres: Critere[];
  points_forts: string;
  conseil: string;
  piste: string;
};

const parseJSONLoose = (txt: string) => {
  const c = txt.replace(/```json/g, "").replace(/```/g, "").trim();
  const m = c.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : c);
};

const CRITERES = [
  "Ni compromis, ni résumé du I et du II, ni conclusion",
  "Un concept nouveau est introduit et défini",
  "Le problème est reformulé : la question avance",
  "L'ouverture mène bien au III, sans sortir du sujet",
];

const VERDICT_UI: Record<Correction["verdict"], { label: string; cls: string; icon: string }> = {
  reussi: { label: "Synthèse réussie", cls: "bg-green-50 border-green-300 text-green-800", icon: "🏆" },
  presque: { label: "Presque : encore un effort", cls: "bg-amber-50 border-amber-300 text-amber-900", icon: "👍" },
  a_retravailler: { label: "À retravailler", cls: "bg-rose-50 border-rose-300 text-rose-800", icon: "🔁" },
};

// Demande du JSON à l'IA ; si la réponse est illisible, on réessaie une fois avec l'autre chaîne de modèles
async function askJSON(
  askAI: (m: { role: string; content: string }[], maxTokens?: number, light?: boolean) => Promise<string>,
  prompt: string, maxTokens: number, valid: (x: any) => boolean,
) {
  for (const light of [false, true]) {
    try {
      const x = parseJSONLoose(await askAI([{ role: "user", content: prompt }], maxTokens, light));
      if (valid(x)) return x;
    } catch { /* on tente l'autre chaîne */ }
  }
  throw new Error("json");
}

export default function PlanTrainer({
  askAI, ficheTas, matiere, serie, loadSujets,
}: {
  askAI: (messages: { role: string; content: string }[], maxTokens?: number, light?: boolean) => Promise<string>;
  ficheTas: string;
  matiere: string;
  serie: "generale" | "techno" | null;
  loadSujets: () => Promise<Sujet[]>;
}) {
  const isTechno = serie === "techno";
  const niveau = isTechno ? "Terminale technologique" : matiere === "hlp" ? "Terminale HLP" : "Terminale générale";

  const [sujet, setSujet] = useState<Sujet | null>(null);
  const [bank, setBank] = useState<Sujet[] | null>(null);
  const [bankErr, setBankErr] = useState(false);
  const [notion, setNotion] = useState("all");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [ouverture, setOuverture] = useState("");
  const [partie3, setPartie3] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [err, setErr] = useState("");

  // Banque de vrais sujets : questions uniquement (le plan dialectique suppose un oui / non),
  // en gardant les sujets d'examen quand la banque en indique la source.
  useEffect(() => {
    loadSujets()
      .then((all) => {
        const questions = (all || []).filter((x) => x?.sujet && x.sujet.trim().endsWith("?"));
        const officiels = questions.filter((x) => isBacSource(x.source));
        setBank(officiels.length >= 30 ? officiels : questions);
      })
      .catch(() => setBankErr(true));
  }, []);

  const notions = useMemo(() => {
    const m: Record<string, number> = {};
    (bank || []).forEach((x) => { const n = (x.notion_principale || "").trim(); if (n) m[n] = (m[n] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [bank]);

  const resetAnswer = () => {
    setOuverture(""); setPartie3(""); setCorrection(null); setShowHint(false); setErr("");
  };

  // Les parties I et II sont rédigées par l'IA : l'élève se concentre sur la synthèse
  const preparePlan = async (sj: Sujet) => {
    setSujet(sj); setPlan(null); resetAnswer(); setLoadingPlan(true);
    const notionTxt = sj.notion_principale ? `Notion principale du programme : ${sj.notion_principale}.` : "";
    try {
      const p = await askJSON(askAI, `Tu es professeur agrégé de philosophie. Sujet de dissertation (${niveau}) : « ${sj.sujet} »
${notionTxt}

Donne seulement l'idée directrice des deux premières parties d'un plan dialectique, en UNE phrase courte chacune (20 mots au plus), en suivant la méthode du professeur :
${ficheTas}

- Partie I (thèse) : répond « oui » au sujet par une vraie raison philosophique (un concept, une distinction), pas une opinion.
- Partie II (antithèse) : montre la limite de la thèse et répond « non ».
- Pas d'arguments détaillés, pas d'auteurs, pas d'exemples : l'élève doit se concentrer sur la partie III.
- Ne donne SURTOUT PAS la partie III ni aucune piste de synthèse.
${isTechno ? "- Langage clair et accessible." : ""}
Réponds uniquement en JSON :
{"I":{"titre":"..."},"II":{"titre":"..."}}`,
        600, (x) => !!(x?.I?.titre && x?.II?.titre));
      setPlan({ I: toPartie(p.I), II: toPartie(p.II) });
    } catch {
      setErr("Impossible de préparer le plan pour l'instant. Réessaie dans un instant.");
      setSujet(null);
    }
    setLoadingPlan(false);
  };

  const randomSujet = () => {
    setErr("");
    const pool = (bank || []).filter((x) => notion === "all" || (x.notion_principale || "").trim() === notion);
    if (pool.length === 0) { setErr("Aucun sujet disponible pour cette notion."); return; }
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && sujet && pick.sujet === sujet.sujet) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    preparePlan({ ...pick, sujet: pick.sujet.trim() });
  };

  const corriger = async () => {
    if (!plan || correcting) return;
    setCorrecting(true); setErr(""); setCorrection(null);
    try {
      const c = await askJSON(askAI, `Tu es professeur de philosophie et tu corriges l'exercice d'un élève de ${niveau}.

=== MÉTHODE DU PROFESSEUR (référence absolue) ===
${ficheTas}

Rappels essentiels de cette méthode :
- La synthèse n'est ni un compromis, ni un mélange, ni un résumé du I et du II, ni une conclusion.
- C'est une reformulation du problème, une nouvelle façon de l'aborder qui fait avancer la question, grâce à un concept nouveau, imprévu au départ, qui rompt l'alternative oui / non.
- Astuce : l'ouverture de la conclusion est recyclée pour devenir la question traitée au III.
- Attention : « ni l'un ni l'autre » ou « un peu des deux » n'est valable que si un concept nouveau, défini, change vraiment la question.

=== SUJET ===
« ${sujet?.sujet} »

=== PLAN DONNÉ À L'ÉLÈVE ===
I. ${plan.I.titre}
II. ${plan.II.titre}

=== RÉPONSE DE L'ÉLÈVE ===
Ouverture de conclusion : ${ouverture.trim() || "(vide)"}
Partie III : ${partie3.trim() || "(vide)"}

Évalue la réponse avec bienveillance mais exigence, critère par critère :
${CRITERES.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Juge en philosophe : le concept proposé est-il vraiment un concept (et non un mot vague) ? Est-il défini ? Change-t-il réellement les termes du problème ? Un « réalisme » ou un « juste milieu » non défini est un compromis déguisé.
Tutoie l'élève. Sois court et direct : une seule phrase par critère, une phrase pour les points forts, une phrase pour le conseil. Ne réécris pas sa copie.
Dans "piste", ne donne PAS de partie III ni de concept tout fait : donne un indice (2 ou 3 phrases, terminé par une question) qui aide l'élève à trouver lui-même son concept nouveau, par exemple un mot du sujet que le I et le II ont pris pour acquis, ou une distinction à interroger.
Réponds uniquement en JSON :
{"verdict":"reussi|presque|a_retravailler","criteres":[{"nom":"...","ok":true,"commentaire":"..."}],"points_forts":"...","conseil":"le conseil le plus utile pour progresser","piste":"..."}`,
        2500, (x) => Array.isArray(x?.criteres) && x.criteres.length > 0);
      setCorrection({
        verdict: ["reussi", "presque", "a_retravailler"].includes(c.verdict) ? c.verdict : "presque",
        criteres: c.criteres.slice(0, CRITERES.length).map((x: any, i: number) => ({
          nom: String(x?.nom || CRITERES[i] || ""), ok: !!x?.ok, commentaire: String(x?.commentaire || ""),
        })),
        points_forts: String(c.points_forts || ""),
        conseil: String(c.conseil || ""),
        piste: String(c.piste || ""),
      });
    } catch {
      setErr("La correction n'a pas pu être faite. Réessaie dans un instant.");
    }
    setCorrecting(false);
  };

  const canSubmit = ouverture.trim().length >= 10 && partie3.trim().length >= 20 && !correcting;

  return (
    <div className="flex-1 overflow-y-auto space-y-4">
      {/* Présentation */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-2xl p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-violet-200">🎯 S'entraîner au plan</p>
        <h3 className="text-lg font-black mt-1">Le plan dialectique : trouve ta synthèse</h3>
        <p className="text-sm text-violet-100 mt-1 leading-relaxed">
          Tu reçois un vrai sujet avec sa thèse (I) et son antithèse (II) en une phrase. À toi de créer la <strong>partie III</strong> : trouve l'ouverture de ta conclusion, puis fais-en la question de ton III.
        </p>
      </div>

      {/* Choix du sujet */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={randomSujet}
            disabled={loadingPlan || !bank}
            className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all">
            <RefreshCw className={`w-4 h-4 ${loadingPlan ? "animate-spin" : ""}`} /> {plan ? "Autre sujet au hasard" : "Un sujet au hasard"}
          </button>
          <select
            value={notion}
            onChange={(e) => setNotion(e.target.value)}
            disabled={!bank || notions.length === 0}
            className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-violet-400 focus:outline-none text-gray-800 bg-white">
            <option value="all">Toutes les notions</option>
            {notions.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
          </select>
        </div>
        <p className="text-[11px] text-gray-400">
          {bankErr ? "La banque de sujets n'a pas pu être chargée." : !bank ? "Chargement de la banque de sujets…" : `${bank.length} sujets de dissertation tirés de la banque de vrais sujets.`}
        </p>
        {loadingPlan && (
          <p className="text-sm text-gray-500 flex items-center gap-2"><Sparkles className="w-4 h-4 animate-spin text-violet-500" /> Préparation du sujet…</p>
        )}
      </div>

      {err && <p className="text-sm font-semibold rounded-xl px-3 py-2 border bg-red-50 text-red-700 border-red-200">{err}</p>}

      {/* Plan donné */}
      {plan && (
        <div className="bg-white border-2 border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sujet</p>
            <p className="font-black text-gray-800">« {sujet?.sujet} »</p>
            {(sujet?.source || sujet?.notion_principale) && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {sujet?.notion_principale && <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{sujet.notion_principale}</span>}
                {sujet?.source && <span className="text-[11px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">📌 {sujet.source}</span>}
              </div>
            )}
          </div>
          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
            {([["I", "Thèse : oui", plan.I, "text-blue-700 bg-blue-50"], ["II", "Antithèse : non", plan.II, "text-rose-700 bg-rose-50"]] as const).map(([num, lab, part, cls]) => (
              <div key={num} className="p-4">
                <span className={`inline-block text-[11px] font-black px-2 py-0.5 rounded-full ${cls}`}>{num}. {lab}</span>
                <p className="font-bold text-gray-800 text-sm mt-2 leading-snug">{part.titre}</p>
                <ul className="mt-2 space-y-1">
                  {part.arguments.map((a, i) => (
                    <li key={i} className="text-xs text-gray-600 flex gap-1.5"><span className="text-gray-300">•</span>{a}</li>
                  ))}
                </ul>
                {part.reperes.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {part.reperes.map((r, i) => (
                      <div key={i} className="text-xs bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
                        <span className="font-black text-gray-800">📚 {r.auteur}</span>
                        {r.oeuvre && <span className="italic text-gray-500">, {r.oeuvre}</span>}
                        {r.idee && <p className="text-gray-600 mt-0.5">{r.idee}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-violet-50 border-t border-violet-100 flex items-center gap-2">
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full text-violet-700 bg-white border border-violet-200">III. Synthèse</span>
            <span className="text-xs font-bold text-violet-700">À toi de jouer ↓</span>
          </div>
        </div>
      )}

      {/* Réponse de l'élève */}
      {plan && (
        <div className="bg-white border-2 border-violet-200 rounded-2xl p-5 space-y-4">
          <div>
            <label className="text-sm font-black text-gray-800">1. L'ouverture de ta conclusion</label>
            <p className="text-xs text-gray-500 mb-2">Une question qui ouvre le sujet sous un angle nouveau.</p>
            <textarea
              value={ouverture}
              onChange={(e) => setOuverture(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-violet-400 focus:outline-none resize-none text-gray-800"
              placeholder="Ex. : Mais à quelles conditions… ? / Que faut-il entendre par… ?"
            />
          </div>
          <div>
            <label className="text-sm font-black text-gray-800">2. Ta partie III</label>
            <p className="text-xs text-gray-500 mb-2">En 2 ou 3 phrases : ton concept nouveau, et la réponse qu'il permet de donner à ton ouverture.</p>
            <textarea
              value={partie3}
              onChange={(e) => setPartie3(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-violet-400 focus:outline-none resize-none text-gray-800"
              placeholder="Concept nouveau : … Il permet de répondre que…"
            />
          </div>

          <button onClick={() => setShowHint(!showHint)} className="flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-900">
            <Lightbulb className="w-4 h-4" /> {showHint ? "Masquer l'aide" : "Besoin d'aide ?"}
          </button>
          {showHint && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed space-y-1">
              <p><strong>L'astuce du prof :</strong> trouve d'abord l'ouverture de ta conclusion, puis fais-en la question de ton III.</p>
              <p><strong>Pour la trouver :</strong> regarde un mot du sujet que le I et le II ont pris pour acquis. Que veut-il vraiment dire ? À quelles conditions ? Pour qui ?</p>
              <p><strong>Les pièges :</strong> le compromis (« un peu des deux »), le résumé du I et du II, la conclusion déguisée, l'ouverture qui sort du sujet.</p>
            </div>
          )}

          <button
            onClick={corriger}
            disabled={!canSubmit}
            className={`w-full py-3 rounded-xl font-black text-sm text-white transition-all flex items-center justify-center gap-2 ${canSubmit ? "bg-violet-600 hover:bg-violet-700" : "bg-gray-300"}`}>
            {correcting ? <><Sparkles className="w-4 h-4 animate-spin" /> Correction en cours…</> : "Faire corriger ma synthèse"}
          </button>
        </div>
      )}

      {/* Correction */}
      {correction && (
        <div className="space-y-3">
          <div className={`rounded-2xl border-2 p-4 ${VERDICT_UI[correction.verdict].cls}`}>
            <p className="font-black text-base">{VERDICT_UI[correction.verdict].icon} {VERDICT_UI[correction.verdict].label}</p>
            {correction.points_forts && <p className="text-sm mt-1 leading-relaxed">{correction.points_forts}</p>}
          </div>

          <div className="bg-white border-2 border-gray-200 rounded-2xl divide-y divide-gray-100">
            {correction.criteres.map((c, i) => (
              <div key={i} className="px-4 py-3 flex gap-3">
                <span className="text-lg leading-none mt-0.5">{c.ok ? "✅" : "⚠️"}</span>
                <div>
                  <p className="text-sm font-bold text-gray-800">{c.nom}</p>
                  {c.commentaire && <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{c.commentaire}</p>}
                </div>
              </div>
            ))}
          </div>

          {correction.conseil && (
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4">
              <p className="text-xs font-black uppercase tracking-widest text-indigo-700">Pour progresser</p>
              <p className="text-sm text-indigo-900 mt-1 leading-relaxed">{correction.conseil}</p>
            </div>
          )}

          {correction.piste && (
            <details className="bg-white border-2 border-violet-200 rounded-2xl overflow-hidden">
              <summary className="px-4 py-3 cursor-pointer text-sm font-bold text-violet-700 hover:bg-violet-50 list-none">
                💡 Voir un indice pour trouver ta partie III
              </summary>
              <p className="px-4 pb-4 pt-1 text-sm text-gray-700 leading-relaxed">{correction.piste}</p>
            </details>
          )}

          <div className="flex gap-2">
            <button onClick={() => setCorrection(null)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-violet-200 text-violet-700 hover:bg-violet-50">
              Retravailler ma réponse
            </button>
            <button onClick={randomSujet} className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-violet-600 hover:bg-violet-700 text-white">
              Nouveau sujet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
