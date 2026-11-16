"use client";
// app/MethodeMode.tsx — Partie Méthode : assistant, fiches méthode, entraînements, FAQ.
// (extrait de page.tsx)

import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, ChevronDown } from "lucide-react";
import { FaqEleve } from "./FaqComponents";
import PlanTrainer from "./PlanTrainer";
import ParagrapheTrainer from "./ParagrapheTrainer";
import IntroductionTrainer from "./IntroductionTrainer";
import EntrainementChat from "./EntrainementChat";
import { REGLE_LONGUEUR, REGLE_GUIDAGE, DEMANDES_RAPIDES, RichText, HLP_INSTRUCTION } from "./MethodeChatHome";
import { DEFAULT_METHODE_CONTENT, EleveQuestion, FaqItem, MethodeContent, MethodeView, callAI, dbLoadSujetsBac, dbLoadTextes, entryChapter, entryName, getText, matchesMatiere, uid } from "./shared";
import { FicheMarkdown } from "./ComposantsCommuns";

// ── ÉLÈVE MODE ────────────────────────────────────────────────────────────────

// ── MODE MÉTHODE ──────────────────────────────────────────────────────────────
// Sujets d'explication de texte du bac (1996-2024), chargés une seule fois et seulement quand on en a besoin
type TexteBac = { id: string; auteur: string; reference: string; session: number; notions: string[]; texte: string; notes: string };
let textesBacCache: Promise<{ id: string; titre: string; chapitre: string; contenu: string; notions: string[]; origine: "bac" }[]> | null = null;
const chargerTextesBac = () => (textesBacCache ||= fetch("/data/textes-bac.json")
  .then((r) => r.json())
  .then((d: { textes: TexteBac[] }) => d.textes.map((t) => ({
    id: t.id,
    titre: `${t.auteur}${t.reference ? ", " + t.reference : ""} (bac ${t.session})`,
    chapitre: t.notions[0] || "",
    contenu: t.texte + (t.notes ? "\n\n" + t.notes : ""),
    notions: t.notions,
    origine: "bac" as const,
  })))
  .catch(() => { textesBacCache = null; return []; }));

export function MethodeMode({ initialView, serie, matiere, methodeContent, faqMethode, eleveNom, onEleveQuestion }: { initialView?: MethodeView; serie: "generale" | "techno" | null; matiere: string; methodeContent?: MethodeContent; faqMethode?: FaqItem[]; eleveNom?: string; onEleveQuestion?: (q: EleveQuestion) => void }) {
  // Textes philosophiques de la bibliothèque du professeur, pour le paragraphe « à partir d'un texte »
  // (hors cours rédigés, ni trop courts ni trop longs pour un exercice)
  // + sujets d'explication de texte du bac 1996-2024 (public/data/textes-bac.json, philosophie uniquement)
  const chargerTextesEntrainement = async () => {
    const [prof, bac] = await Promise.all([
      dbLoadTextes().catch(() => []),
      matiere === "philosophie" ? chargerTextesBac() : Promise.resolve([]),
    ]);
    return [
      ...prof
        .filter((e: any) => matchesMatiere(e, matiere) && e.type !== "cours" && (e.content || "").trim().length >= 300 && (e.content || "").length <= 9000)
        .map((e: any) => ({ id: String(e.id), titre: entryName(e), chapitre: entryChapter(e), contenu: String(e.content).trim(), origine: "prof" as const })),
      ...bac,
    ];
  };
  const [view, setView] = useState<"chat" | "fiche" | "faq" | "plan">(initialView === "intro" || initialView === "paragraphe" ? "plan" : initialView || "faq");
  const [trainer, setTrainer] = useState<"paragraphe" | "plan" | "intro">(initialView === "intro" && matiere !== "hlp" ? "intro" : "paragraphe");
  // Entraînements : chatbot par défaut, version « cadres » au choix de l'élève
  const [enCadres, setEnCadres] = useState(false);
  const [eleveQ, setEleveQ] = useState("");
  const [eleveQSent, setEleveQSent] = useState(false);
  const [activeFiche, setActiveFiche] = useState<string>(matiere === "hlp" ? "hlp_interpretation" : "intro_dissertation");
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isTechno = serie === "techno";
  const isHLP = matiere === "hlp";

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const serieLabel = isTechno ? "Série Technologique" : isHLP ? "HLP" : "Série Générale";
  const serieIcon = isTechno ? "🔧" : isHLP ? "📜" : "🧠";
  const headerBg = isTechno ? "bg-orange-50 border-orange-200 text-orange-800" : isHLP ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-blue-50 border-blue-200 text-blue-800";
  const accentBtn = isTechno ? "bg-orange-600 hover:bg-orange-700" : isHLP ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700";

  // Fiches disponibles selon la série : la HLP n'a que ses propres fiches
  const fiches = isHLP ? [
    { id: "hlp_interpretation", label: "Question d'interprétation philosophique", icon: "🔍" },
    { id: "hlp_essai", label: "Essai — question de réflexion philosophique", icon: "🖋️" },
  ] : [
    { id: "intro_dissertation", label: "Introduction — Dissertation", icon: "📝" },
    { id: "plan_tas", label: "Plan dialectique (Thèse / Antithèse / Synthèse)", icon: "🔺" },
    { id: "plan_notionnel", label: "Plan notionnel (distinction des sens)", icon: "🔎" },
    { id: "plan_critique", label: "Plan critique (examen des présupposés)", icon: "🧭" },
    { id: "paragraphe", label: "Rédiger un paragraphe", icon: "✍️" },
    isTechno
      ? { id: "expl_techno", label: "Explication de texte — Techno", icon: "🔧" }
      : { id: "expl_generale", label: "Explication de texte — Générale", icon: "📖" },
  ];

  // Contexte méthode injecté dans le prompt selon la série
  // Construire le contexte méthode depuis les fiches (contenu Supabase ou défaut)
  const mc = methodeContent || DEFAULT_METHODE_CONTENT;
  const fichesDissertation = isHLP
    ? [mc.hlp_interpretation, mc.hlp_essai].filter(t => (t || "").trim()).join("\n\n---\n\n")
    : [mc.intro_dissertation, mc.plan_tas, mc.plan_notionnel, mc.plan_critique, mc.paragraphe].filter(t => (t || "").trim()).join("\n\n---\n\n");
  const ficheExpl = isHLP ? "" : isTechno ? mc.expl_techno : mc.expl_generale;
  const serieInstruction = isTechno
    ? "Adapte tes explications au niveau Série Technologique : langage clair, exemples concrets du quotidien, encourageant. Pas de références trop académiques."
    : isHLP
    ? HLP_INSTRUCTION
    : "Sois précis, pédagogique et encourage la rigueur philosophique. Niveau Série Générale.";

  // Filtrer les FAQ pertinentes pour cette série
  // HLP : uniquement les questions marquées HLP ; philo : tronc commun + série de l'élève
  const faqRelevantes = (faqMethode || []).filter(f => isHLP
    ? f.serie === "hlp"
    : f.serie === "toutes" || f.serie === serie || (!serie && f.serie === "generale")
  );
  const faqContext = faqRelevantes.length > 0
    ? "\n\n=== FAQ ET CONSEILS DU PROFESSEUR ===\n" + faqRelevantes.map(f => `Q: ${f.question}\nR: ${f.reponse}`).join("\n\n")
    : "";

  const methodeContext = `Tu es un assistant pédagogique spécialisé en méthodologie ${isHLP ? "de HLP (Humanités, Littérature et Philosophie)" : "de philosophie" + (isTechno ? " (Série Technologique)" : " (Série Générale)")} en Terminale.
Tu dois répondre en te basant sur les fiches méthode et la FAQ rédigées par le professeur. C'est la référence absolue.

${isHLP ? "=== FICHES MÉTHODE HLP ===\n" + (fichesDissertation || "(Le professeur n'a pas encore rédigé de fiche HLP.)") : "=== FICHES DISSERTATION ===\n" + fichesDissertation + "\n\n=== FICHE EXPLICATION DE TEXTE ===\n" + ficheExpl}${faqContext}

${serieInstruction}
${REGLE_LONGUEUR}
${REGLE_GUIDAGE}
Si l'élève pose une question hors méthode (contenu philosophique pur, auteurs…), tu peux répondre brièvement mais ramène toujours à la méthode.`;

  const sendMessage = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if (!text || loading) return;
    const userMsg = { role: "user", content: text };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);
    try {
      const data = await callAI([
        { role: "user", content: methodeContext },
        { role: "assistant", content: `Bonjour ! Je suis ton assistant méthode en philosophie (${serieLabel}). Pose-moi toutes tes questions sur la dissertation, l'explication de texte, la rédaction de paragraphes… Je suis là pour t'aider !` },
        ...newMsgs,
      ], 800);
      setMessages([...newMsgs, { role: "assistant", content: getText(data) }]);
    } catch { setMessages([...newMsgs, { role: "assistant", content: "Désolé, une erreur s'est produite. Réessaie !" }]); }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header série + toggle Chat/Fiches */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 font-bold text-xs ${headerBg}`}>
          <span>{serieIcon}</span>
          <span>Méthode — {serieLabel}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView("chat")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 text-xs font-bold transition-all ${view === "chat" ? accentBtn + " text-white border-transparent" : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"}`}>
            💬 Assistant méthode
          </button>
          <button onClick={() => setView("fiche")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 text-xs font-bold transition-all ${view === "fiche" ? "bg-amber-600 hover:bg-amber-700 text-white border-transparent" : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"}`}>
            📋 Fiches méthode
          </button>
          {(
          <button onClick={() => setView("plan")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 text-xs font-bold transition-all ${view === "plan" ? "bg-violet-600 hover:bg-violet-700 text-white border-transparent" : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"}`}>
            🎯 S'entraîner
          </button>
          )}
          <button onClick={() => setView("faq")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 text-xs font-bold transition-all ${view === "faq" ? "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent" : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"}`}>
            ❓ FAQ {faqRelevantes.length > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full font-black ${view === "faq" ? "bg-white/30 text-white" : "bg-indigo-100 text-indigo-700"}`}>{faqRelevantes.length}</span>}
          </button>
        </div>
      </div>

      {/* VUE CHAT */}
      {view === "chat" && (
        <div className="flex flex-col flex-1 bg-white rounded-2xl border-2 border-gray-200 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-8 space-y-4">
                <div className="text-5xl">📐</div>
                <div>
                  <p className="font-black text-gray-800 text-base mb-1">Assistant Méthode — {serieLabel}</p>
                  <p className="text-sm text-gray-500 max-w-sm">Pose tes questions sur la dissertation, l'explication de texte, la rédaction de paragraphes…</p>
                </div>
                <div className="grid grid-cols-1 gap-2 w-full max-w-sm mt-2">
                  {[
                    "Comment rédiger une bonne introduction ?",
                    "C'est quoi la différence entre thèse et antithèse ?",
                    isTechno ? "Comment répondre aux questions de l'explication de texte ?" : "Comment faire un commentaire linéaire ?",
                    "Comment construire la synthèse ?",
                  ].map(q => (
                    <button key={q} onClick={() => { setInput(q); }}
                      className="text-left text-xs px-3 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 font-semibold transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "bg-gray-800 text-white" : "bg-gray-50 border border-gray-200 text-gray-800"}`}>
                  {msg.role === "user" ? <p className="whitespace-pre-wrap">{msg.content}</p> : <RichText text={msg.content} />}
                </div>
              </div>
            ))}
            {!loading && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
              <div className="flex flex-wrap gap-2">
                {DEMANDES_RAPIDES.map((d) => (
                  <button key={d.label} onClick={() => sendMessage(d.texte)}
                    className="text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:border-amber-400 hover:bg-amber-50 rounded-full px-3 py-1.5 transition-all">
                    {d.label}
                  </button>
                ))}
              </div>
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 animate-spin text-amber-500" />
                  <span className="text-sm text-gray-500">Réflexion…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {/* Input */}
          <div className="border-t border-gray-100 p-3 flex gap-2 flex-shrink-0">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-amber-400 focus:outline-none"
              placeholder="Ta question sur la méthode…" disabled={loading} />
            <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
              className={`px-4 py-2.5 rounded-xl font-bold text-sm text-white transition-all ${!input.trim() || loading ? "bg-gray-300" : accentBtn}`}>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* VUE FICHES */}
      {view === "fiche" && (
        <div className="flex gap-3 flex-1 overflow-hidden">
          {/* Mini sidebar fiches */}
          <div className="w-52 flex-shrink-0 space-y-1">
            {fiches.map(f => (
              <button key={f.id} onClick={() => setActiveFiche(f.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${activeFiche === f.id ? "bg-amber-600 text-white border-amber-600" : "border-gray-200 bg-white text-gray-700 hover:border-amber-300"}`}>
                {f.icon} {f.label}
              </button>
            ))}
          </div>
          {/* Contenu fiche */}
          <div className="flex-1 bg-white rounded-2xl border-2 border-gray-200 overflow-y-auto">
            {activeFiche === "intro_dissertation" && <FicheMarkdown title="📝 Introduction — Dissertation" content={mc.intro_dissertation} />}
            {activeFiche === "plan_tas" && <FicheMarkdown title="🔺 Le plan dialectique — Thèse / Antithèse / Synthèse" content={mc.plan_tas} />}
            {activeFiche === "plan_notionnel" && <FicheMarkdown title="🔎 Le plan notionnel — Distinction des sens" content={mc.plan_notionnel} />}
            {activeFiche === "plan_critique" && <FicheMarkdown title="🧭 Le plan critique — Examen des présupposés" content={mc.plan_critique} />}
            {activeFiche === "paragraphe" && <FicheMarkdown title="✍️ Rédiger un paragraphe" content={mc.paragraphe} />}
            {activeFiche === "expl_techno" && <FicheMarkdown title="🔧 Explication de texte — Série Techno" content={mc.expl_techno} />}
            {activeFiche === "expl_generale" && <FicheMarkdown title="📖 Explication de texte — Série Générale" content={mc.expl_generale} />}
            {(activeFiche === "hlp_interpretation" || activeFiche === "hlp_essai") && (
              (mc[activeFiche as keyof MethodeContent] || "").trim()
                ? <FicheMarkdown title={activeFiche === "hlp_essai" ? "🖋️ Essai — question de réflexion philosophique (HLP)" : "🔍 Question d'interprétation philosophique (HLP)"} content={mc[activeFiche as keyof MethodeContent]} />
                : <div className="h-full flex flex-col items-center justify-center text-center p-10">
                    <div className="text-4xl mb-3">📜</div>
                    <p className="font-black text-gray-800">Fiche HLP bientôt disponible</p>
                    <p className="text-sm text-gray-500 mt-1 max-w-sm">Ton professeur prépare cette fiche. Attention : les fiches de philosophie du tronc commun (dissertation, explication de texte) ne s'appliquent pas à la HLP.</p>
                  </div>
            )}
          </div>
        </div>
      )}
      {/* VUE ENTRAÎNEMENT AU PLAN */}
      {view === "plan" && (
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {!isHLP && (
            <div className="flex gap-2 flex-shrink-0">
              {([["intro", "📝 L'introduction"], ["paragraphe", "✍️ Le paragraphe argumenté"], ["plan", "🔺 Le plan dialectique"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTrainer(k)}
                  className={`px-3 py-1.5 rounded-xl border-2 text-xs font-bold transition-all ${trainer === k ? "bg-gray-800 border-gray-800 text-white" : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"}`}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 flex-shrink-0 items-center">
            <span className="text-[11px] font-bold text-gray-400 mr-1">Format :</span>
            {([[false, "💬 Chatbot"], [true, "🧩 Étapes en cadres"]] as const).map(([v, l]) => (
              <button key={String(v)} onClick={() => setEnCadres(v)}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all ${enCadres === v ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"}`}>
                {l}
              </button>
            ))}
          </div>
          {!enCadres ? (
            <EntrainementChat
              key={(isHLP ? "paragraphe" : trainer) + serie}
              exercice={isHLP ? "paragraphe" : trainer}
              methode={isHLP || trainer === "paragraphe" ? mc.paragraphe : trainer === "intro" ? mc.intro_dissertation : mc.plan_tas}
              matiere={matiere}
              serie={serie}
              loadSujets={() => dbLoadSujetsBac(matiere)}
              loadTextes={chargerTextesEntrainement}
              askAI={async (m: { role: string; content: string }[], maxTokens = 700, light = false, session?: string) => getText(await callAI(m, maxTokens, light, "entrainement_chat_" + (isHLP ? "paragraphe" : trainer), false, session))}
            />
          ) : !isHLP && trainer === "intro" ? (
            <IntroductionTrainer
              methode={mc.intro_dissertation}
              matiere={matiere}
              loadSujets={() => dbLoadSujetsBac(matiere)}
              askAI={async (m: { role: string; content: string }[], maxTokens = 450, light = true, session?: string) => getText(await callAI(m, maxTokens, light, "entrainement_intro", false, session))}
            />
          ) : (isHLP || trainer === "paragraphe") ? (
            <ParagrapheTrainer
              fiche={mc.paragraphe}
              matiere={matiere}
              serie={serie}
              loadSujets={() => dbLoadSujetsBac(matiere)}
              loadTextes={chargerTextesEntrainement}
              askAI={async (m: { role: string; content: string }[], maxTokens = 1500, light = false, session?: string) => getText(await callAI(m, maxTokens, light, "entrainement_paragraphe", !light, session))}
            />
          ) : (
            <PlanTrainer
              ficheTas={mc.plan_tas}
              matiere={matiere}
              serie={serie}
              loadSujets={() => dbLoadSujetsBac(matiere)}
              askAI={async (m: { role: string; content: string }[], maxTokens = 1500, light = false, session?: string) => getText(await callAI(m, maxTokens, light, "entrainement_plan", !light, session))}
            />
          )}
        </div>
      )}
      {/* VUE FAQ */}
      {view === "faq" && <div className="flex-1 overflow-y-auto pb-6"><FaqEleve items={faqRelevantes} serie={serie} matiere={matiere} eleveNom={eleveNom}
        askAI={async (m: { role: string; content: string }[]) => getText(await callAI(m, 900, true, "faq_quiz"))} /></div>} {false && (
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Formulaire question élève */}
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4">
            <p className="text-xs font-black text-indigo-800 mb-2">💬 Poser une question au professeur</p>
            {eleveQSent ? (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <span className="text-lg">✓</span>
                <span className="text-sm font-bold">Question envoyée ! Le professeur vous répondra bientôt.</span>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={eleveQ} onChange={e => setEleveQ(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && eleveQ.trim() && onEleveQuestion) {
                    onEleveQuestion({ id: uid(), question: eleveQ.trim(), serie, eleveNom: eleveNom || "Anonyme", createdAt: Date.now() });
                    setEleveQ(""); setEleveQSent(true); setTimeout(() => setEleveQSent(false), 4000);
                  }}}
                  className="flex-1 px-3 py-2.5 border-2 border-indigo-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none bg-white"
                  placeholder="Ta question sur la méthode…" />
                <button
                  onClick={() => {
                    if (!eleveQ.trim() || !onEleveQuestion) return;
                    onEleveQuestion({ id: uid(), question: eleveQ.trim(), serie, eleveNom: eleveNom || "Anonyme", createdAt: Date.now() });
                    setEleveQ(""); setEleveQSent(true); setTimeout(() => setEleveQSent(false), 4000);
                  }}
                  disabled={!eleveQ.trim()}
                  className={`px-4 py-2.5 rounded-xl font-bold text-sm text-white transition-all ${eleveQ.trim() ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-300"}`}>
                  Envoyer
                </button>
              </div>
            )}
            <p className="text-xs text-indigo-400 mt-1.5">La réponse apparaîtra ici quand le professeur l'aura ajoutée à la FAQ.</p>
          </div>

          {/* FAQ existante */}
          {faqRelevantes.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border-2 border-dashed border-gray-200">
              <div className="text-3xl mb-2">❓</div>
              <p className="font-bold text-gray-600 text-sm">Aucun conseil disponible pour l'instant</p>
              <p className="text-xs text-gray-400 mt-1">Pose ta question ci-dessus, le professeur te répondra !</p>
            </div>
          ) : (
            faqRelevantes.map((item) => (
              <details key={item.id} className="bg-white rounded-2xl border-2 border-indigo-100 overflow-hidden group">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-indigo-50 transition-colors list-none">
                  <div className="flex items-center gap-3">
                    <span className="text-indigo-500 font-black text-lg">?</span>
                    <span className="font-bold text-gray-800 text-sm">{item.question}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform flex-shrink-0" />
                </summary>
                <div className="px-5 pb-4 pt-1 border-t border-indigo-50">
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{item.reponse}</p>
                </div>
              </details>
            ))
          )}
        </div>
      )}
    </div>
  );
}
