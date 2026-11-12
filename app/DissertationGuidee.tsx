"use client";
// app/DissertationGuidee.tsx
// Construction guidée de la dissertation (remplace l'ancien « Plan guidé » qui générait un plan tout fait).
// L'élève construit lui-même son introduction, ses trois parties et sa conclusion, étape par étape.
// L'IA ne rédige jamais une étape à sa place : elle donne des indices de plus en plus précis (sous forme de
// questions) et vérifie les propositions de l'élève (ce qui est juste, ce qui manque, une question pour améliorer).

import { useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Copy, Lightbulb, PenLine, Sparkles } from "lucide-react";
import { REGLE_GUIDAGE } from "./MethodeChatHome";

type AskAI = (messages: { role: string; content: string }[], maxTokens?: number, light?: boolean) => Promise<string>;

type Step = { key: string; groupe: string; label: string; consigne: string; placeholder: string; rows: number };
const STEPS: Step[] = [
  { key: "opinion", groupe: "Introduction", label: "Opinion commune", rows: 3,
    consigne: "Ce que les gens pensent habituellement du sujet, la réponse spontanée. Le développement montrera en quoi elle est insuffisante.",
    placeholder: "On pense souvent que…" },
  { key: "definitions", groupe: "Introduction", label: "Définitions", rows: 4,
    consigne: "Définis chaque terme important du sujet, en t'appuyant sur le cours, le dictionnaire, ta culture et ton expérience.",
    placeholder: "Mot 1 : … / Mot 2 : …" },
  { key: "paradoxe", groupe: "Introduction", label: "Paradoxe", rows: 3,
    consigne: "Montre ce qui est surprenant dans le sujet : en quoi va-t-il contre l'opinion commune (para = contre, doxa = opinion) ?",
    placeholder: "Pourtant…" },
  { key: "problematique", groupe: "Introduction", label: "Problématique", rows: 3,
    consigne: "Reformule le sujet en faisant apparaître le problème, avec des synonymes, des antonymes ou des adverbes (« vraiment », « nécessairement »).",
    placeholder: "Peut-on vraiment… ?" },
  { key: "partie1", groupe: "Plan", label: "Partie I : thèse (oui)", rows: 4,
    consigne: "Une première réponse qui dit « oui » au sujet : son idée directrice et les arguments qui la soutiennent.",
    placeholder: "Idée directrice : … / Arguments : …" },
  { key: "partie2", groupe: "Plan", label: "Partie II : antithèse (non)", rows: 4,
    consigne: "Les limites de la thèse, qui conduisent à répondre « non » : son idée directrice et ses arguments.",
    placeholder: "Idée directrice : … / Arguments : …" },
  { key: "partie3", groupe: "Plan", label: "Partie III : synthèse", rows: 4,
    consigne: "Ni un compromis, ni un résumé du I et du II, ni une conclusion : un concept nouveau qui pose le problème autrement. Astuce du prof : trouve d'abord l'ouverture de ta conclusion, puis fais-en la question de ton III.",
    placeholder: "Concept nouveau : … / Idée directrice : …" },
  { key: "annonce", groupe: "Introduction", label: "Annonce du plan", rows: 3,
    consigne: "Maintenant que ton plan existe, annonce-le : « Nous verrons dans un premier temps… puis… enfin… ».",
    placeholder: "Nous verrons dans un premier temps…" },
  { key: "conclusion", groupe: "Conclusion", label: "Conclusion", rows: 4,
    consigne: "Le bilan de la progression (I → II → III) avec une réponse claire au problème, puis l'ouverture.",
    placeholder: "Bilan : … / Ouverture : …" },
];

type Retour = { ok: boolean; texte: string };

export default function DissertationGuidee({ sujet, matiere, methode, contexte, askAI, onRediger }: {
  sujet: string; matiere: string; methode: string; contexte?: string; askAI: AskAI;
  onRediger: (recap: string) => void;
}) {
  const [i, setI] = useState(0);
  const [textes, setTextes] = useState<Record<string, string>>({});
  const [indices, setIndices] = useState<Record<string, string[]>>({});
  const [retours, setRetours] = useState<Record<string, Retour>>({});
  const [loading, setLoading] = useState<"" | "indice" | "verif">("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const fini = i >= STEPS.length;
  const step = STEPS[Math.min(i, STEPS.length - 1)];
  const discipline = matiere === "hlp" ? "HLP" : "philosophie";

  const travailEleve = (jusqua: number) =>
    STEPS.slice(0, jusqua).filter((s) => (textes[s.key] || "").trim())
      .map((s) => `${s.label} : ${textes[s.key].trim()}`).join("\n") || "(rien encore)";

  const recap = () => STEPS.filter((s) => (textes[s.key] || "").trim()).map((s) => `${s.label.toUpperCase()}\n${textes[s.key].trim()}`).join("\n\n");

  const base = () => `Tu es professeur de ${discipline} en Terminale et tu accompagnes un élève qui construit lui-même sa dissertation, étape par étape.
${REGLE_GUIDAGE}

${methode}
${contexte ? `\nTextes du cours (pour t'orienter, ne les cite pas à sa place) :\n${contexte.slice(0, 800)}\n` : ""}
SUJET : « ${sujet} »

CE QUE L'ÉLÈVE A DÉJÀ CONSTRUIT :
${travailEleve(i)}

ÉTAPE EN COURS : ${step.label}
Ce qu'on attend : ${step.consigne}`;

  const demanderIndice = async () => {
    if (loading) return;
    const deja = indices[step.key] || [];
    setLoading("indice"); setErr("");
    try {
      const r = await askAI([{ role: "user", content: `${base()}

Proposition actuelle de l'élève pour cette étape : ${(textes[step.key] || "").trim() || "(vide)"}
Indices déjà donnés : ${deja.length ? deja.map((d, k) => `${k + 1}. ${d}`).join(" / ") : "aucun"}

L'élève demande un indice (niveau ${deja.length + 1}). Donne UN indice, un peu plus précis que les précédents, en 2 ou 3 phrases maximum, terminé par UNE question qui l'aide à trouver lui-même. Par exemple : un mot du sujet à interroger, une distinction à faire, une situation de la vie courante à imaginer. Ne formule JAMAIS la réponse de cette étape pour son sujet, même partiellement. Réponds seulement par l'indice, sans titre.` }], 350, true);
      setIndices({ ...indices, [step.key]: [...deja, r.trim()] });
    } catch { setErr("L'indice n'a pas pu être obtenu. Réessaie dans un instant."); }
    setLoading("");
  };

  const verifier = async () => {
    const t = (textes[step.key] || "").trim();
    if (!t || loading) return;
    setLoading("verif"); setErr("");
    try {
      const r = await askAI([{ role: "user", content: `${base()}

PROPOSITION DE L'ÉLÈVE POUR CETTE ÉTAPE :
${t}

Vérifie cette proposition, avec bienveillance et exigence, en 4 phrases maximum : dis ce qui est juste, puis ce qui manque ou ce qui ne va pas, puis termine par UNE question qui l'aide à améliorer lui-même sa proposition. Ne réécris pas sa proposition et ne donne pas de version corrigée.
Commence ta réponse par « VALIDÉ : » si l'étape est réussie pour l'essentiel, sinon par « À REVOIR : ».` }], 450, true);
      const ok = /^\s*\**\s*VALID/i.test(r);
      setRetours({ ...retours, [step.key]: { ok, texte: r.replace(/^\s*\**\s*(VALIDÉ|VALIDE|À REVOIR|A REVOIR)\s*\**\s*:?\s*/i, "").trim() } });
    } catch { setErr("La vérification n'a pas pu être faite. Réessaie dans un instant."); }
    setLoading("");
  };

  const copier = async () => {
    try { await navigator.clipboard.writeText(`Sujet : ${sujet}\n\n${recap()}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignoré */ }
  };

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-5">
        <h2 className="font-black text-indigo-800">📋 Construis ta dissertation pas à pas</h2>
        <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
          C'est toi qui construis chaque étape. Si tu bloques, demande un indice ; quand tu as une proposition, fais-la vérifier.
          L'IA ne te donnera pas la réponse : elle t'aide à la trouver.
        </p>
        {/* Progression */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {STEPS.map((s, k) => (
            <button key={s.key} onClick={() => setI(k)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full border-2 transition-all ${k === i ? "bg-indigo-600 border-indigo-600 text-white" : retours[s.key]?.ok ? "bg-green-50 border-green-300 text-green-700" : (textes[s.key] || "").trim() ? "bg-white border-indigo-300 text-indigo-700" : "bg-white border-gray-200 text-gray-500"}`}>
              {retours[s.key]?.ok ? "✓ " : ""}{s.label.split(" :")[0]}
            </button>
          ))}
          <button onClick={() => setI(STEPS.length)}
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full border-2 ${fini ? "bg-gray-800 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-500"}`}>
            Récapitulatif
          </button>
        </div>
      </div>

      {!fini ? (
        <div className="bg-white border-2 border-indigo-200 rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{step.groupe} · étape {i + 1}/{STEPS.length}</p>
            <h3 className="font-black text-gray-800">{step.label}</h3>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">{step.consigne}</p>
          </div>

          <textarea value={textes[step.key] || ""} rows={step.rows}
            onChange={(e) => setTextes({ ...textes, [step.key]: e.target.value })}
            placeholder={step.placeholder}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none resize-y text-gray-800 leading-relaxed" />

          {(indices[step.key] || []).map((ind, k) => (
            <div key={k} className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm text-amber-900 leading-relaxed">
              <span className="font-black">💡 Indice {k + 1} : </span>{ind}
            </div>
          ))}

          {retours[step.key] && (
            <div className={`rounded-xl border-2 px-3 py-2.5 text-sm leading-relaxed ${retours[step.key].ok ? "bg-green-50 border-green-300 text-green-900" : "bg-rose-50 border-rose-200 text-rose-900"}`}>
              <p className="font-black text-xs mb-0.5">{retours[step.key].ok ? "✅ Étape validée" : "🔁 À revoir"}</p>
              {retours[step.key].texte}
            </div>
          )}

          {err && <p className="text-sm font-semibold rounded-xl px-3 py-2 border bg-red-50 text-red-700 border-red-200">{err}</p>}

          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={demanderIndice} disabled={!!loading}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading === "indice" ? <Sparkles className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
              {(indices[step.key] || []).length ? "Un autre indice" : "Un indice"}
            </button>
            <button onClick={verifier} disabled={!!loading || !(textes[step.key] || "").trim()}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white flex items-center justify-center gap-2">
              {loading === "verif" ? <Sparkles className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Faire vérifier ma proposition
            </button>
          </div>

          <div className="flex justify-between pt-1">
            <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}
              className="text-xs font-bold text-gray-500 hover:text-gray-800 disabled:opacity-30 flex items-center gap-1">
              <ChevronLeft className="w-4 h-4" /> Étape précédente
            </button>
            <button onClick={() => setI(i + 1)} className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1">
              {i === STEPS.length - 1 ? "Voir mon récapitulatif" : "Étape suivante"} <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="font-black text-gray-800">Ton travail</h3>
            <p className="text-xs text-gray-500">Voici ce que tu as construit. Les étapes vides restent à faire : clique sur leur nom ci-dessus pour y revenir.</p>
          </div>
          {recap() ? (
            <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans bg-gray-50 border border-gray-100 rounded-xl p-4">{recap()}</pre>
          ) : (
            <p className="text-sm text-gray-400">Tu n'as encore rien rédigé.</p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={copier} disabled={!recap()}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center gap-2">
              <Copy className="w-4 h-4" /> {copied ? "Copié !" : "Copier mon travail"}
            </button>
            <button onClick={() => onRediger(`Sujet : ${sujet}\n\n${recap()}`)} disabled={!recap()}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-violet-600 to-purple-600 text-white disabled:opacity-40 flex items-center justify-center gap-2">
              <PenLine className="w-4 h-4" /> Rédiger partie par partie
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
