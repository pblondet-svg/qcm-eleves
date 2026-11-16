"use client";
// app/EntrainementChat.tsx
// Entraînements en mode chatbot : sur un vrai sujet de la banque, un tuteur guide l'élève étape par étape
// dans la conversation (introduction, paragraphe argumenté ou partie III du plan dialectique).
// Le tuteur ne donne jamais la réponse (REGLE_GUIDAGE) ; il pose une question à la fois et commente
// les propositions de l'élève.

import { useEffect, useMemo, useRef, useState } from "react";
import { GraduationCap, RefreshCw, Send } from "lucide-react";
import { REGLE_GUIDAGE, RichText } from "./MethodeChatHome";
import { nouvelleSeance, noteDepuisTexte, sauverProduction, type AskAIAvecSeance } from "./productions";

type AskAI = AskAIAvecSeance;
type Sujet = { sujet: string; notion_principale?: string; source?: string; texte?: string };
// Texte de la bibliothèque du professeur, pour le paragraphe argumenté « à partir d'un texte »
export type TexteEntrainement = { id: string; titre: string; chapitre: string; contenu: string };
type Msg = { role: "user" | "assistant"; content: string };
export type ExerciceChat = "intro" | "paragraphe" | "plan";

const SCRIPTS: Record<ExerciceChat | "paragrapheTexte", { titre: string; sousTitre: string; degrade: string; bulle: string; script: string }> = {
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
- Pour argumenter, l'élève peut définir les mots importants (du sujet ou du texte), comme le font les philosophes eux-mêmes avant de raisonner : rappelle-lui ce conseil à l'étape [Arguments], sans lui donner les définitions.
- Exemple : une situation concrète de la vie réelle, trouvée par l'élève ; une référence à un auteur ou à une personne célèbre n'est pas un exemple.
- Citation : entre guillemets, d'un auteur identifié, et c'est à l'élève de l'expliquer, pas au correcteur. N'invente et ne fournis aucune citation.
- Quand sa proposition est correcte pour l'essentiel, dis-le clairement (« Étape validée ») et passe à l'étape suivante.
- Une fois les cinq étapes validées, demande-lui d'écrire son paragraphe complet d'un seul tenant (15 à 20 lignes). Corrige-le alors avec la grille du professeur : chaque étape notée de 1 à 4 (1 Non acquis, 2 En cours d'acquisition, 3 Acquis, 4 Très bonne maîtrise), une phrase par étape, la note sur 20 (somme des cinq), puis une appréciation de 3 lignes au plus : début adouci (« plutôt bien structuré »), puis « Il y a cependant des fragilités » ; pas de formule d'encouragement finale. Notes exigeantes. Ne réécris pas son paragraphe.`,
  },
  paragrapheTexte: {
    titre: "Rédige un paragraphe argumenté à partir d'un texte",
    sousTitre: "Lis le texte, puis ton tuteur te guide pas à pas : thèse de l'auteur, arguments, exemple, citation du texte expliquée, conclusion.",
    degrade: "from-rose-600 to-orange-500", bulle: "bg-rose-600",
    script: `EXERCICE : l'élève rédige un paragraphe argumenté à partir du TEXTE PHILOSOPHIQUE donné plus bas, en suivant les étapes du professeur, dans cet ordre : [Thèse], [Arguments], [Exemple], [Citation] (toujours expliquée), [Conclusion].
- Dans ton PREMIER message, pose en une phrase la question à laquelle répond le texte, formulée comme un sujet (par exemple « Être libre, est-ce faire ce que l'on veut ? »), puis demande à l'élève quelle est la thèse de l'auteur.
- Traite une seule étape à la fois : rappelle en une phrase ce qu'on attend, puis pose UNE question qui l'aide à trouver dans le texte.
- [Thèse] : ce que l'auteur affirme, dit avec les mots de l'élève, en réponse à la question.
- [Arguments] : reconstituer le raisonnement du texte, pas répéter la thèse. Pour argumenter, l'élève peut définir les mots importants (du sujet ou du texte), comme le font les philosophes eux-mêmes avant de raisonner : rappelle-lui ce conseil à l'étape [Arguments], sans lui donner les définitions.
- [Exemple] : une situation concrète de la vie réelle trouvée par l'élève. Reprendre l'exemple du texte ne montre pas qu'il a compris : un exemple personnel le montre.
- [Citation] : un passage exact DU TEXTE, entre guillemets, que l'élève explique lui-même. Vérifie que la citation figure bien dans le texte.
- [Conclusion] : répond clairement à la question.
- Signale tout contresens sur le texte, avec bienveillance, et aide l'élève à le corriger en relisant le passage concerné.
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

export default function EntrainementChat({ exercice, askAI, methode, matiere, serie, loadSujets, loadTextes }: {
  exercice: ExerciceChat; askAI: AskAI; methode: string; matiere: string;
  serie: "generale" | "techno" | null; loadSujets: () => Promise<Sujet[]>;
  loadTextes?: () => Promise<TexteEntrainement[]>;
}) {
  // Paragraphe : à partir d'un texte de la bibliothèque (par défaut) ou d'un sujet seul
  const [appui, setAppui] = useState<"texte" | "sujet">(exercice === "paragraphe" && loadTextes ? "texte" : "sujet");
  const [textes, setTextes] = useState<Sujet[] | null>(null);
  const avecTexte = exercice === "paragraphe" && appui === "texte";
  const conf = SCRIPTS[avecTexte ? "paragrapheTexte" : exercice];
  const [bank, setBank] = useState<Sujet[] | null>(null);
  const [bankErr, setBankErr] = useState(false);
  const [notion, setNotion] = useState("all");
  const [sujet, setSujet] = useState<Sujet | null>(null);
  const [seance, setSeance] = useState("");
  const [note, setNote] = useState<string | undefined>();
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

  useEffect(() => {
    if (exercice !== "paragraphe" || !loadTextes) return;
    loadTextes()
      .then((l) => setTextes(l.map((t) => ({ sujet: t.titre, notion_principale: t.chapitre, source: "texte", texte: t.contenu }))))
      .catch(() => setTextes([]));
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  const source = avecTexte ? textes : bank;
  const notions = useMemo(() => {
    const m: Record<string, number> = {};
    (source || []).forEach((x) => { const n = (x.notion_principale || "").trim(); if (n) m[n] = (m[n] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [source]);

  const contexte = (s: Sujet) => `Tu es le tuteur de philosophie d'un élève de ${matiere === "hlp" ? "spécialité HLP" : serie === "techno" ? "Terminale technologique" : "Terminale générale"}. Tu le tutoies, avec bienveillance et exigence.
${REGLE_GUIDAGE}

=== MÉTHODE DU PROFESSEUR (référence absolue) ===
${methode}

${conf.script}

STYLE : réponses courtes et directes (3 à 5 phrases au plus), une seule question à la fois.${serie === "techno" ? " Langage clair et accessible." : ""}

${s.texte ? `TEXTE À ÉTUDIER (${s.sujet}) :\n"""\n${s.texte.slice(0, 4500)}\n"""` : `SUJET : « ${s.sujet} »`}`;

  const transcription = (h: Msg[]) => h.map((m) => `${m.role === "user" ? "ÉLÈVE" : "TUTEUR"} : ${m.content}`).join("\n\n");

  const repondre = async (s: Sujet, histo: Msg[], id: string) => {
    setLoading(true); setErr("");
    try {
      // On garde les derniers échanges pour limiter la taille des requêtes
      // (l'historique alterne tuteur / élève et commence toujours par une réponse du tuteur)
      let recents = histo.slice(-14);
      if (recents[0]?.role === "user") recents = recents.slice(1);
      const reply = await askAI([
        { role: "user", content: contexte(s) + (s.texte ? "\n\nCommence l'exercice : pose la question à laquelle répond le texte, puis ta première question." : "\n\nCommence l'exercice : présente le sujet en une phrase et pose ta première question.") },
        ...recents,
      ], 700, false, id);
      const fin: Msg[] = [...histo, { role: "assistant", content: reply.trim() || "Je n'ai pas réussi à répondre. Reformule ta proposition ?" }];
      setMessages(fin);
      const n = noteDepuisTexte(reply) || note;
      if (n) setNote(n);
      sauverProduction({ id, exercice, format: "chat", sujet: (s.texte ? "Texte : " : "") + s.sujet, contenu: transcription(fin), note: n });
    } catch {
      setErr("Le tuteur n'a pas pu répondre. Réessaie dans un instant.");
    }
    setLoading(false);
  };

  const tirerSujet = () => {
    setErr("");
    const pool = (source || []).filter((x) => notion === "all" || (x.notion_principale || "").trim() === notion);
    if (!pool.length) { setErr(avecTexte ? "Aucun texte disponible pour l'instant." : "Aucun sujet disponible pour cette notion."); return; }
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && sujet && pick.sujet === sujet.sujet) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    const s = { ...pick, sujet: pick.sujet.trim() };
    const id = nouvelleSeance();
    setSujet(s); setMessages([]); setInput(""); setSeance(id); setNote(undefined);
    setLoading(true);
    // L'exercice est enregistré avant la première réponse : il compte pour un entraînement du jour
    sauverProduction({ id, exercice, format: "chat", sujet: (s.texte ? "Texte : " : "") + s.sujet, contenu: "" }).then(() => repondre(s, [], id));
  };

  const envoyer = () => {
    const t = input.trim();
    if (!t || !sujet || loading) return;
    const histo: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(histo); setInput("");
    repondre(sujet, histo, seance);
  };

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      <div className={`bg-gradient-to-r ${conf.degrade} text-white rounded-2xl p-5 flex-shrink-0`}>
        <h3 className="text-lg font-black">{conf.titre}</h3>
        <p className="text-sm text-white/90 mt-1 leading-relaxed">{conf.sousTitre}</p>
      </div>

      {exercice === "paragraphe" && loadTextes && (
        <div className="flex gap-1.5 items-center flex-shrink-0">
          <span className="text-[11px] font-bold text-gray-400 mr-1">À partir :</span>
          {([["texte", "📜 d'un texte"], ["sujet", "❓ d'un sujet seul"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setAppui(k); setSujet(null); setMessages([]); setNotion("all"); }} disabled={loading}
              className={`px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all ${appui === k ? "bg-gray-800 border-gray-800 text-white" : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"}`}>
              {l}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border-2 border-gray-200 rounded-2xl p-3 flex flex-col sm:flex-row gap-2 flex-shrink-0">
        <button onClick={tirerSujet} disabled={!source || loading}
          className={`flex items-center justify-center gap-2 ${conf.bulle} hover:opacity-90 disabled:opacity-40 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all`}>
          <RefreshCw className="w-4 h-4" /> {avecTexte ? (sujet ? "Autre texte" : "Commencer avec un texte au hasard") : (sujet ? "Nouveau sujet" : "Commencer avec un sujet au hasard")}
        </button>
        <select value={notion} onChange={(e) => setNotion(e.target.value)} disabled={!source || notions.length === 0}
          className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-gray-400 focus:outline-none text-gray-800 bg-white">
          <option value="all">{avecTexte ? "Tous les chapitres" : "Toutes les notions"}</option>
          {notions.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
        </select>
      </div>
      {bankErr && !avecTexte && <p className="text-xs text-red-600 px-1">La banque de sujets n'a pas pu être chargée.</p>}
      {avecTexte && textes && textes.length === 0 && <p className="text-xs text-gray-500 px-1">Aucun texte n'est encore disponible dans la bibliothèque du professeur : choisis « d'un sujet seul ».</p>}

      {sujet && (
        <div className="bg-white border-2 border-gray-200 rounded-2xl flex flex-col min-h-[420px] flex-1 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{sujet.texte ? "Texte" : "Sujet"}{sujet.notion_principale ? ` · ${sujet.notion_principale}` : ""}</p>
            <p className="text-sm font-black text-gray-800">{sujet.texte ? sujet.sujet : `« ${sujet.sujet} »`}</p>
            {sujet.texte && (
              <details open className="mt-2">
                <summary className="text-xs font-bold text-rose-700 cursor-pointer">Lire le texte</summary>
                <div className="mt-2 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl p-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-serif">{sujet.texte}</div>
              </details>
            )}
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
