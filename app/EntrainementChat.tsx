"use client";
// app/EntrainementChat.tsx
// Entraînements en mode chatbot : sur un vrai sujet de la banque, un tuteur guide l'élève étape par étape
// dans la conversation (introduction, paragraphe argumenté ou partie III du plan dialectique).
// Le tuteur ne donne jamais la réponse (REGLE_GUIDAGE) ; il pose une question à la fois et commente
// les propositions de l'élève.

import { useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap, RefreshCw, Send } from "lucide-react";
import { REGLE_GUIDAGE, RichText } from "./MethodeChatHome";

type AskAI = (messages: { role: string; content: string }[], maxTokens?: number, light?: boolean) => Promise<string>;
type Sujet = { sujet: string; notion_principale?: string; source?: string };
type Msg = { role: "user" | "assistant"; content: string };
export type ExerciceChat = "intro" | "paragraphe" | "plan";

const SCRIPTS: Record<ExerciceChat, { titre: string; sousTitre: string; degrade: string; bulle: string; script: string }> = {
  intro: {
    titre: "Rédige une introduction de dissertation",
    sousTitre: "Ton tuteur te guide pas à pas : opinion commune, définitions, paradoxe, problématique, annonce du plan.",
    degrade: "from-indigo-600 to-sky-500", bulle: "bg-indigo-600",
    script: `EXERCICE : l'élève construit l'introduction de sa dissertation, dans cet ordre : 1) opinion commune, 2) définitions des termes du sujet, 3) paradoxe, 4) problématique, 5) annonce du plan.
- Traite une seule étape à la fois. Pour chaque étape : rappelle en une phrase ce qu'on attend, puis pose UNE question qui l'aide à trouver.
- Quand sa proposition est correcte pour l'essentiel, dis-le clairement (« Étape validée ») et passe à l'étape suivante.
- Une fois les cinq étapes validées, demande-lui d'écrire son introduction complète d'un seul tenant. Fais alors une appréciation globale en 3 lignes au plus (ce qui est réussi, la principale fragilité), sans réécrire son texte, puis propose-lui un nouveau sujet.`,
  },
  paragraphe: {
    titre: "Rédige un paragraphe argumenté",
    sousTitre: "Ton tuteur te guide pas à pas : thèse, arguments, exemple, citation expliquée, conclusion.",
    degrade: "from-rose-600 to-orange-500", bulle: "bg-rose-600",
    script: `EXERCICE : l'élève rédige un paragraphe argumenté qui répond au sujet, en suivant les étapes du professeur, dans cet ordre : [Thèse], [Arguments], [Exemple], [Citation] (toujours expliquée), [Conclusion].
- Traite une seule étape à la fois. Pour chaque étape : rappelle en une phrase ce qu'on attend, puis pose UNE question qui l'aide à trouver.
- Exemple : une situation concrète de la vie réelle, trouvée par l'élève ; une référence à un auteur ou à une personne célèbre n'est pas un exemple.
- Citation : entre guillemets, d'un auteur identifié, et c'est à l'élève de l'expliquer, pas au correcteur. N'invente et ne fournis aucune citation.
- Quand sa proposition est correcte pour l'essentiel, dis-le clairement (« Étape validée ») et passe à l'étape suivante.
- Une fois les cinq étapes validées, demande-lui d'écrire son paragraphe complet d'un seul tenant (15 à 20 lignes). Corrige-le alors avec la grille du professeur : chaque étape notée de 1 à 4 (1 Non acquis, 2 En cours d'acquisition, 3 Acquis, 4 Très bonne maîtrise), une phrase par étape, la note sur 20 (somme des cinq), puis une appréciation de 3 lignes au plus : début adouci (« plutôt bien structuré »), puis « Il y a cependant des fragilités » ; pas de formule d'encouragement finale. Notes exigeantes. Ne réécris pas son paragraphe.`,
  },
  plan: {
    titre: "Le plan dialectique : crée ta partie III",
    sousTitre: "Ton tuteur te donne la thèse (I) et l'antithèse (II) en une phrase ; à toi de créer la synthèse.",
    degrade: "from-violet-600 to-indigo-600", bulle: "bg-violet-600",
    script: `EXERCICE : partie III d'un plan dialectique.
- Dans ton PREMIER message, donne la partie I (thèse, qui répond « oui ») et la partie II (antithèse, qui répond « non ») en UNE phrase courte chacune, sans arguments ni auteurs. Ne donne SURTOUT PAS de partie III ni de piste de synthèse. Puis demande à l'élève de proposer l'ouverture de sa conclusion (astuce du professeur : cette ouverture devient la question de la partie III).
- Ensuite, guide-le vers sa partie III : la synthèse n'est ni un compromis, ni un mélange, ni un résumé du I et du II, ni une conclusion ; c'est une reformulation du problème grâce à un concept nouveau, défini.
- Une question à la fois. Quand sa partie III respecte ces critères, dis-le clairement (« Partie III validée »), résume en une phrase pourquoi elle fonctionne, puis propose-lui un nouveau sujet.`,
  },
};

export default function EntrainementChat({ exercice, askAI, methode, matiere, serie, loadSujets }: {
  exercice: ExerciceChat; askAI: AskAI; methode: string; matiere: string;
  serie: "generale" | "techno" | null; loadSujets: () => Promise<Sujet[]>;
}) {
  const conf = SCRIPTS[exercice];
  const [bank, setBank] = useState<Sujet[] | null>(null);
  const [bankErr, setBankErr] = useState(false);
  const [notion, setNotion] = useState("all");
  const [sujet, setSujet] = useState<Sujet | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSujets()
      .then((all) => setBank((all || []).filter((x) => x?.sujet && x.sujet.trim().endsWith("?"))))
      .catch(() => setBankErr(true));
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  const notions = useMemo(() => {
    const m: Record<string, number> = {};
    (bank || []).forEach((x) => { const n = (x.notion_principale || "").trim(); if (n) m[n] = (m[n] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [bank]);

  const contexte = (s: Sujet) => `Tu es le tuteur de philosophie d'un élève de ${matiere === "hlp" ? "spécialité HLP" : serie === "techno" ? "Terminale technologique" : "Terminale générale"}. Tu le tutoies, avec bienveillance et exigence.
${REGLE_GUIDAGE}

=== MÉTHODE DU PROFESSEUR (référence absolue) ===
${methode}

${conf.script}

STYLE : réponses courtes et directes (3 à 5 phrases au plus), une seule question à la fois.${serie === "techno" ? " Langage clair et accessible." : ""}

SUJET : « ${s.sujet} »`;

  const repondre = async (s: Sujet, histo: Msg[]) => {
    setLoading(true); setErr("");
    try {
      // On garde les derniers échanges pour limiter la taille des requêtes
      // (l'historique alterne tuteur / élève et commence toujours par une réponse du tuteur)
      let recents = histo.slice(-14);
      if (recents[0]?.role === "user") recents = recents.slice(1);
      const reply = await askAI([
        { role: "user", content: contexte(s) + "\n\nCommence l'exercice : présente le sujet en une phrase et pose ta première question." },
        ...recents,
      ], 700);
      setMessages([...histo, { role: "assistant", content: reply.trim() || "Je n'ai pas réussi à répondre. Reformule ta proposition ?" }]);
    } catch {
      setErr("Le tuteur n'a pas pu répondre. Réessaie dans un instant.");
    }
    setLoading(false);
  };

  const tirerSujet = () => {
    setErr("");
    const pool = (bank || []).filter((x) => notion === "all" || (x.notion_principale || "").trim() === notion);
    if (!pool.length) { setErr("Aucun sujet disponible pour cette notion."); return; }
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && sujet && pick.sujet === sujet.sujet) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    const s = { ...pick, sujet: pick.sujet.trim() };
    setSujet(s); setMessages([]); setInput("");
    repondre(s, []);
  };

  const envoyer = () => {
    const t = input.trim();
    if (!t || !sujet || loading) return;
    const histo: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(histo); setInput("");
    repondre(sujet, histo);
  };

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      <div className={`bg-gradient-to-r ${conf.degrade} text-white rounded-2xl p-5 flex-shrink-0`}>
        <h3 className="text-lg font-black">{conf.titre}</h3>
        <p className="text-sm text-white/90 mt-1 leading-relaxed">{conf.sousTitre}</p>
      </div>

      <div className="bg-white border-2 border-gray-200 rounded-2xl p-3 flex flex-col sm:flex-row gap-2 flex-shrink-0">
        <button onClick={tirerSujet} disabled={!bank || loading}
          className={`flex items-center justify-center gap-2 ${conf.bulle} hover:opacity-90 disabled:opacity-40 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all`}>
          <RefreshCw className="w-4 h-4" /> {sujet ? "Nouveau sujet" : "Commencer avec un sujet au hasard"}
        </button>
        <select value={notion} onChange={(e) => setNotion(e.target.value)} disabled={!bank || notions.length === 0}
          className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-gray-400 focus:outline-none text-gray-800 bg-white">
          <option value="all">Toutes les notions</option>
          {notions.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
        </select>
      </div>
      {bankErr && <p className="text-xs text-red-600 px-1">La banque de sujets n'a pas pu être chargée.</p>}

      {sujet && (
        <div className="bg-white border-2 border-gray-200 rounded-2xl flex flex-col min-h-[420px] flex-1 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sujet{sujet.notion_principale ? ` · ${sujet.notion_principale}` : ""}</p>
            <p className="text-sm font-black text-gray-800">« {sujet.sujet} »</p>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[60vh]">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className={`max-w-[85%] ${conf.bulle} text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap`}>{m.content}</div>
                </div>
              ) : (
                <div key={i} className="flex gap-2 items-end">
                  <div className={`w-8 h-8 rounded-full ${conf.bulle} text-white flex items-center justify-center flex-shrink-0`}><GraduationCap className="w-4 h-4" /></div>
                  <div className="max-w-[85%] bg-white border border-gray-200 shadow-sm rounded-2xl rounded-bl-md px-4 py-3 text-sm text-gray-800 leading-relaxed">
                    <RichText text={m.content} />
                  </div>
                </div>
              )
            )}
            {loading && (
              <div className="flex gap-2 items-end">
                <div className={`w-8 h-8 rounded-full ${conf.bulle} text-white flex items-center justify-center flex-shrink-0`}><GraduationCap className="w-4 h-4" /></div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                </div>
              </div>
            )}
            {err && <p className="text-sm font-semibold rounded-xl px-3 py-2 border bg-red-50 text-red-700 border-red-200">{err}</p>}
          </div>

          <div className="border-t border-gray-100 p-3 flex gap-2 items-end bg-white flex-shrink-0">
            <textarea value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(); } }}
              rows={2} disabled={loading}
              className="flex-1 resize-none px-4 py-2.5 border-2 border-gray-200 rounded-2xl text-sm focus:border-gray-400 focus:outline-none text-gray-800 disabled:bg-gray-50 max-h-40"
              placeholder="Ta proposition… (Entrée pour envoyer, Maj + Entrée pour aller à la ligne)" />
            <button onClick={envoyer} disabled={loading || !input.trim()}
              className={`w-11 h-11 rounded-full ${conf.bulle} hover:opacity-90 disabled:opacity-30 text-white flex items-center justify-center flex-shrink-0`}>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
