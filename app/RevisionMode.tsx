"use client";
// app/RevisionMode.tsx — Révision d'un texte : chat de révision, fiche, flashcards, interrogation, carte mentale, podcast…
// (extrait de page.tsx)

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Check, RotateCcw, ArrowLeft, BookOpen, Send, MessageCircle, Layers, FileText } from "lucide-react";
import { REGLE_GUIDAGE } from "./MethodeChatHome";
import { DEFAULT_FEATURES, FeaturesConfig, callAI, dbSaveSession, entryName, getText, parseJSON } from "./shared";

// ── FLASHCARDS MODE ───────────────────────────────────────────────────────────
function FlashcardsMode({ entry, onBack }: any) {
  const [cards, setCards] = useState<{ recto: string; verso: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => { generateCards(); }, []);

  const generateCards = async () => {
    setLoading(true);
    try {
      const dbNotions: string[] = (entry.notions || []).filter((n: string) => n.trim());
      const data = await callAI([{ role: "user", content:
        `Flashcards de révision.
${dbNotions.length > 0 ? "Notions déjà identifiées : " + dbNotions.join(", ") + ". Crée une flashcard pour chacune, puis ajoute d'autres notions importantes du texte." : "Identifie les notions clés du texte et crée une flashcard pour chacune."}
Format JSON strict : [{"recto":"Notion ou question courte","verso":"Définition ou explication en 2-3 phrases max, en lien avec le texte"}]
Génère entre 6 et 10 flashcards au total.
Texte :
${entry.content.slice(0, 4000)}` }], 800, true, "flashcards");
      const parsed = parseJSON(getText(data));
      setCards(parsed);
      setKnown(new Array(parsed.length).fill(false));
    } catch {
      setCards([{ recto: "Erreur", verso: "Impossible de générer les flashcards." }]);
    }
    setLoading(false);
  };

  const handleKnow = (val: boolean) => {
    const newKnown = [...known];
    newKnown[current] = val;
    setKnown(newKnown);
    setFlipped(false);
    if (current < cards.length - 1) { setCurrent(current + 1); } else { setDone(true); }
  };

  const handleRestart = () => {
    setCurrent(0); setFlipped(false);
    setKnown(new Array(cards.length).fill(false)); setDone(false);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <Sparkles className="w-10 h-10 text-purple-500 animate-pulse mb-4" />
      <p className="text-gray-700 font-semibold">Génération des flashcards…</p>
    </div>
  );

  if (done) {
    const score = known.filter(Boolean).length;
    return (
      <div className="max-w-md mx-auto py-10 px-4 text-center">
        <div className="text-6xl mb-4">{score === cards.length ? "🌟" : score >= cards.length / 2 ? "👍" : "💪"}</div>
        <h2 className="text-2xl font-black text-gray-800 mb-2">{score}/{cards.length} notions maîtrisées</h2>
        <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
          <div className="h-3 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
            style={{ width: (score / cards.length) * 100 + "%" }} />
        </div>
        <div className="flex flex-col gap-3">
          <button onClick={handleRestart}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
            <RotateCcw className="w-4 h-4" /> Recommencer
          </button>
          <button onClick={onBack} className="text-sm text-gray-600 hover:text-gray-800 font-semibold">← Retour</button>
        </div>
      </div>
    );
  }

  const card = cards[current];
  return (
    <div className="max-w-lg mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-gray-600">{current + 1} / {cards.length}</p>
        <div className="flex gap-1">
          {cards.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full ${i < current ? (known[i] ? "bg-green-400" : "bg-red-400") : i === current ? "bg-purple-500" : "bg-gray-200"}`} />
          ))}
        </div>
      </div>
      <div onClick={() => setFlipped(!flipped)} className="relative w-full cursor-pointer select-none mb-6" style={{ perspective: "1000px", height: "220px" }}>
        <div style={{ position: "absolute", width: "100%", height: "100%", transformStyle: "preserve-3d", transition: "transform 0.5s", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}>
          <div style={{ backfaceVisibility: "hidden", position: "absolute", width: "100%", height: "100%" }}
            className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-3xl shadow-xl flex flex-col items-center justify-center p-8 text-center">
            <p className="text-xs font-bold text-purple-200 uppercase mb-3 tracking-widest">Notion</p>
            <p className="text-xl font-black text-white leading-snug">{card.recto}</p>
            <p className="text-purple-300 text-xs mt-4">Clique pour voir la définition</p>
          </div>
          <div style={{ backfaceVisibility: "hidden", position: "absolute", width: "100%", height: "100%", transform: "rotateY(180deg)" }}
            className="bg-white border-2 border-purple-200 rounded-3xl shadow-xl flex flex-col items-center justify-center p-8 text-center">
            <p className="text-xs font-bold text-purple-500 uppercase mb-3 tracking-widest">Définition</p>
            <p className="text-base font-semibold text-gray-800 leading-relaxed">{card.verso}</p>
          </div>
        </div>
      </div>
      {flipped ? (
        <div className="flex gap-3">
          <button onClick={() => handleKnow(false)}
            className="flex-1 bg-red-50 hover:bg-red-100 border-2 border-red-200 text-red-700 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all">
            <X className="w-5 h-5" /> À revoir
          </button>
          <button onClick={() => handleKnow(true)}
            className="flex-1 bg-green-50 hover:bg-green-100 border-2 border-green-200 text-green-700 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all">
            <Check className="w-5 h-5" /> Je sais !
          </button>
        </div>
      ) : (
        <button onClick={() => setFlipped(true)} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-2xl transition-all">
          Retourner la carte
        </button>
      )}
      <button onClick={onBack} className="mt-4 w-full text-sm text-gray-600 hover:text-gray-800 font-semibold text-center">← Retour</button>
    </div>
  );
}

// ── MODE RÉVISION ─────────────────────────────────────────────────────────────
export function RevisionMode({ entries, onBack, allTextes, eleveNom, featuresConfig, serie }: any) {
  const feat: FeaturesConfig = { ...DEFAULT_FEATURES, ...featuresConfig };
  const firstEnabledRevTab = (["chat","fiche","flashcards","interrogation"] as const).find(t => feat[("rev_" + t) as keyof FeaturesConfig] !== false) || "chat";
  const [selectedEntry, setSelectedEntry] = useState<any>(entries.length === 1 ? entries[0] : null);
  const [activeTab, setActiveTab] = useState<"chat" | "fiche" | "flashcards" | "interrogation">(firstEnabledRevTab);
  const [messages, setMessages] = useState<{ role: string; content: string; source?: "texte" | "synthese" | "hors_texte" }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fiche, setFiche] = useState<string | null>(null);
  const [ficheLoading, setFicheLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // États mode interrogation
  const [interrogMessages, setInterrogMessages] = useState<{role: string; content: string; correct?: boolean; explication?: string}[]>([]);
  const [interrogInput, setInterrogInput] = useState("");
  const [interrogLoading, setInterrogLoading] = useState(false);
  const [interrogScore, setInterrogScore] = useState({ correct: 0, total: 0 });
  const [interrogStarted, setInterrogStarted] = useState(false);
  const interrogRef = useRef<HTMLDivElement>(null);
  useEffect(() => { interrogRef.current?.scrollIntoView({ behavior: "smooth" }); }, [interrogMessages]);
  const sessionStart = useRef<number>(Date.now());

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Sauvegarder la session quand l'élève quitte ou change de texte
  useEffect(() => {
    if (!selectedEntry) return;
    sessionStart.current = Date.now();
    return () => {
      const duree = Math.round((Date.now() - sessionStart.current) / 1000);
      if (duree > 10) {
        dbSaveSession({
          eleveNom: eleveNom || "Anonyme",
          texte_id: selectedEntry.id,
          texte_titre: selectedEntry.work_title || selectedEntry.author || "Sans titre",
          chapitre: selectedEntry.chapter || "",
          matiere: selectedEntry.matiere || "hlp",
          notion_principale: selectedEntry.notion_principale || "",
          duree_secondes: duree,
          nb_messages: messages.length,
        }).catch(() => {});
      }
    };
  }, [selectedEntry?.id]);

  const loadFiche = async () => {
    if (fiche || ficheLoading || !selectedEntry) return;
    setFicheLoading(true);
    try {
      const data = await callAI([{ role: "user", content:
        `Génère une fiche de lecture structurée pour ce texte littéraire. Réponds en markdown simple (pas de titres #, utilise des **gras** et des listes -).
Structure :
**Auteur & œuvre** : ...
**Contexte** : (époque, mouvement littéraire, 2 phrases)
**Thèmes principaux** :
- ...
**Points clés à retenir** :
- ... (5 points max, formulés comme des phrases mémorisables)
**Citation emblématique** : (si présente dans le texte)
Texte :
${selectedEntry.content.slice(0, 5000)}` }], 600, true, "interrogation");
      setFiche(getText(data));
    } catch { setFiche("Impossible de générer la fiche."); }
    setFicheLoading(false);
  };

  const handleTabChange = (tab: "chat" | "fiche" | "flashcards" | "interrogation") => {
    setActiveTab(tab);
    if (tab === "fiche") loadFiche();
    if (tab === "interrogation" && !interrogStarted) startInterrogation();
  };

  const startInterrogation = async () => {
    if (!selectedEntry || interrogStarted) return;
    setInterrogStarted(true);
    setInterrogLoading(true);
    setInterrogMessages([]);
    setInterrogScore({ correct: 0, total: 0 });
    try {
      const data = await callAI([{ role: "user", content:
        `Tu es un professeur de ${selectedEntry.matiere === "philosophie" ? "Philosophie" : "HLP"} qui interroge un élève sur un texte.
TEXTE ÉTUDIÉ :
${selectedEntry.content.slice(0, 4000)}

Pose une première question ouverte sur ce texte pour vérifier la compréhension de l'élève. La question doit :
- Être précise et porter sur un point essentiel du texte
- Être formulée de façon claire pour un lycéen
- Ne pas être un simple "oui/non" mais demander une explication

Commence directement par la question, sans introduction.` }], 400, true, "interrogation");
      setInterrogMessages([{ role: "assistant", content: getText(data) }]);
    } catch { setInterrogMessages([{ role: "assistant", content: "Explique-moi en quelques mots ce que dit l'auteur dans ce texte." }]); }
    setInterrogLoading(false);
  };

  const sendInterrogResponse = async () => {
    if (!interrogInput.trim() || interrogLoading) return;
    const userMsg = { role: "user", content: interrogInput.trim() };
    const newMsgs = [...interrogMessages, userMsg];
    setInterrogMessages(newMsgs);
    setInterrogInput("");
    setInterrogLoading(true);
    try {
      const data = await callAI([
        { role: "user", content:
          `Tu es un professeur de ${selectedEntry?.matiere === "philosophie" ? "Philosophie" : "HLP"} qui interroge un élève.
TEXTE ÉTUDIÉ :
${selectedEntry?.content.slice(0, 3000)}

Historique de l'interrogation :
${newMsgs.map(m => `${m.role === "user" ? "Élève" : "Professeur"} : ${m.content}`).join("\n")}

Réponds en JSON UNIQUEMENT :
{
  "evaluation": "correct" | "partiel" | "incorrect",
  "feedback": "correction courte et bienveillante (2-3 phrases max) — ce qui est juste, ce qui manque ; si la réponse est incorrecte ou partielle, NE DONNE PAS la bonne réponse : donne un indice qui l'aide à la trouver",
  "prochaine_question": "nouvelle question sur un autre aspect du texte (si évaluation correct ou partiel) OU reformulation de la même question (si incorrect)"
}` },
        { role: "assistant", content: '{"evaluation":"' }
      ], 600);
      const raw = getText(data);
      let parsed: any = {};
      try { parsed = parseJSON('{"evaluation":"' + raw); } catch { parsed = parseJSON(raw); }
      const isCorrect = parsed.evaluation === "correct";
      const isPartiel = parsed.evaluation === "partiel";
      const newScore = {
        correct: interrogScore.correct + (isCorrect ? 1 : isPartiel ? 0.5 : 0),
        total: interrogScore.total + 1,
      };
      setInterrogScore(newScore);
      const assistantMsg = {
        role: "assistant",
        content: parsed.feedback || "Continuons.",
        correct: isCorrect,
        explication: parsed.prochaine_question || "",
      };
      const withFeedback = [...newMsgs, assistantMsg];
      setInterrogMessages(withFeedback);
      // Ajouter la prochaine question après un délai
      if (parsed.prochaine_question && newScore.total < 8) {
        setTimeout(() => {
          setInterrogMessages(prev => [...prev, { role: "assistant", content: parsed.prochaine_question }]);
        }, 300);
      } else if (newScore.total >= 8) {
        const pct = Math.round((newScore.correct / newScore.total) * 100);
        setTimeout(() => {
          setInterrogMessages(prev => [...prev, {
            role: "assistant",
            content: `🎓 Interrogation terminée ! Tu as obtenu ${newScore.correct}/${newScore.total} (${pct}%). ${pct >= 70 ? "Très bon travail !" : pct >= 50 ? "Pas mal, continue à réviser !" : "Continue tes révisions sur ce texte."}`,
          }]);
        }, 300);
      }
    } catch { setInterrogMessages(prev => [...prev, { role: "assistant", content: "Bonne tentative, continuons." }]); }
    setInterrogLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !selectedEntry) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      // Construire le contexte : texte sélectionné EN PREMIER, puis les autres textes de la matière
      const autresTextes = (allTextes || [])
        .filter((t: any) => t.id !== selectedEntry.id)
        .map((t: any) => `--- ${entryName(t)} (${t.chapter || "Sans chapitre"}) ---\n${t.content.slice(0, 800)}`)
        .join("\n\n");
      const systemPrompt = `Tu es un assistant pédagogique bienveillant. Tu aides un élève à réviser ses cours de ${selectedEntry.matiere === "philosophie" ? "Philosophie" : "HLP"}${serie === "techno" ? " (Série Technologique)" : ""}. ${serie === "techno" ? "Adapte ton niveau : explications simples et concrètes, exemples du quotidien accessibles, vocabulaire clair. Pas de références trop académiques." : ""}
Tu dois TOUJOURS répondre en JSON valide, rien d'autre. Format strict :
{"source": "texte" | "synthese" | "hors_texte", "contenu": "ta réponse ici"}

Règles pour choisir la source :
- "texte" : la réponse s'appuie DIRECTEMENT sur un passage d'un des textes fournis (précise lequel entre guillemets)
- "synthese" : la réponse synthétise ou met en lien plusieurs textes du corpus
- "hors_texte" : l'information demandée ne figure dans AUCUN des textes fournis (commence par "⚠️ Cette information ne figure pas dans les textes du cours.")

Si l'élève te demande de faire un exercice à sa place (explication de texte, réponse à une question du devoir, introduction, plan, paragraphe, dissertation…), applique cette règle :
${REGLE_GUIDAGE}
Pour une simple question de compréhension du cours ou du texte, tu peux répondre normalement.

TEXTE PRINCIPAL (celui que l'élève révise) :
${selectedEntry.content}
${autresTextes ? "\n\nAUTRES TEXTES ET COURS DISPONIBLES (mobilise-les si pertinent) :\n" + autresTextes : ""}`;
      const historyForAPI = newMessages.map(m => ({ role: m.role, content: m.content }));
      const data = await callAI([
        { role: "user", content: systemPrompt },
        { role: "assistant", content: '{"source":"synthese","contenu":"Bien sûr, je suis prêt à répondre à tes questions sur ce texte."}' },
        ...historyForAPI,
      ], 900);
      const raw = getText(data);
      let source: "texte" | "synthese" | "hors_texte" = "synthese";
      let contenu = raw;
      try {
        const parsed = parseJSON(raw);
        source = parsed.source || "synthese";
        contenu = parsed.contenu || raw;
      } catch {
        if (raw.includes("⚠️")) source = "hors_texte";
        else if (raw.includes("«") || raw.includes("\"")) source = "texte";
      }
      setMessages([...newMessages, { role: "assistant", content: contenu, source }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Désolé, une erreur s'est produite.", source: "synthese" }]);
    }
    setLoading(false);
  };

  if (!selectedEntry) return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h2 className="text-xl font-black text-gray-800 mb-5">Choisir un texte à réviser</h2>
      <div className="space-y-3">
        {entries.map((e: any) => (
          <button key={e.id} onClick={() => setSelectedEntry(e)}
            className="w-full text-left bg-white rounded-2xl border-2 border-gray-200 hover:border-indigo-400 shadow-sm p-5 transition-all">
            <h3 className="font-bold text-gray-800 text-base">{entryName(e)}</h3>
            <p className="text-xs text-gray-600 mt-1">{e.word_count} mots</p>
            <p className="text-sm text-gray-700 mt-2 line-clamp-2">{e.content.slice(0, 150)}…</p>
          </button>
        ))}
      </div>
      <button onClick={onBack} className="mt-6 text-sm text-gray-600 hover:text-gray-800 font-semibold flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>
    </div>
  );

  if (activeTab === "flashcards") {
    return (
      <div className="max-w-3xl mx-auto py-6 px-4">
        <div className="bg-white rounded-2xl border-2 border-purple-200 shadow-sm mb-4 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" />
            <h3 className="font-bold text-purple-800 text-sm">{entryName(selectedEntry)} — Flashcards</h3>
          </div>
          <button onClick={() => setActiveTab("chat")} className="text-xs text-purple-600 hover:text-purple-800 font-semibold">← Retour au chat</button>
        </div>
        <FlashcardsMode entry={selectedEntry} onBack={() => setActiveTab("chat")} />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-57px)] w-full overflow-hidden">
      <div className="flex flex-col" style={{ width: "42%", minWidth: 0 }}>
        <div className="bg-white border-r-2 border-indigo-100 flex flex-col h-full">
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <h3 className="font-bold text-indigo-800 text-sm truncate">{entryName(selectedEntry)}</h3>
            </div>
            {entries.length > 1 && (
              <button onClick={() => { setSelectedEntry(null); setMessages([]); setFiche(null); setActiveTab("chat"); }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex-shrink-0 ml-2">Changer</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{selectedEntry.content}</p>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex-shrink-0">
            <p className="text-xs text-gray-500 font-semibold text-center">{selectedEntry.word_count} mots</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col flex-1 min-w-0 p-4">
        <div className="flex gap-2 mb-3 flex-shrink-0">
          {([
            ["chat", "💬 Chat IA", "border-indigo-500 bg-indigo-50 text-indigo-700"],
            ["interrogation", "🎓 Interrogation", "border-rose-500 bg-rose-50 text-rose-700"],
            ["fiche", "📋 Fiche", "border-amber-500 bg-amber-50 text-amber-700"],
            ["flashcards", "🃏 Flashcards", "border-purple-500 bg-purple-50 text-purple-700"],
          ] as [string, string, string][]).filter(([tab]) => feat[("rev_" + tab) as keyof FeaturesConfig] !== false).map(([tab, label, activeClass]) => (
            <button key={tab} onClick={() => handleTabChange(tab as any)}
              className={`flex-1 py-2.5 rounded-xl border-2 font-bold text-xs transition-all ${activeTab === tab ? activeClass : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
              {label}
            </button>
          ))}
        </div>
        {activeTab === "interrogation" && (
          <div className="flex-1 bg-white rounded-2xl border-2 border-rose-200 shadow-sm flex flex-col overflow-hidden">
            {/* Header score */}
            <div className="flex items-center justify-between px-4 py-3 bg-rose-50 border-b border-rose-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-rose-800 text-sm">🎓 Interrogation orale</span>
                <span className="text-xs text-rose-600">L'IA te pose des questions sur le texte</span>
              </div>
              {interrogScore.total > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-1 rounded-full">
                    {interrogScore.correct}/{interrogScore.total} ({Math.round((interrogScore.correct / interrogScore.total) * 100)}%)
                  </span>
                  <button onClick={() => { setInterrogStarted(false); setInterrogMessages([]); setInterrogScore({ correct: 0, total: 0 }); startInterrogation(); }}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Recommencer
                  </button>
                </div>
              )}
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {interrogLoading && interrogMessages.length === 0 && (
                <div className="flex justify-center items-center h-full">
                  <div className="flex items-center gap-2 text-rose-600">
                    <Sparkles className="w-5 h-5 animate-spin" />
                    <span className="font-semibold text-sm">Préparation des questions…</span>
                  </div>
                </div>
              )}
              {interrogMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" ? (
                    <div className="max-w-[85%] space-y-1">
                      {/* Badge évaluation */}
                      {msg.correct !== undefined && (
                        <div className="flex items-center gap-1 px-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${msg.correct ? "bg-green-100 text-green-700 border border-green-300" : "bg-red-100 text-red-700 border border-red-300"}`}>
                            {msg.correct ? "✅ Correct" : "❌ À retravailler"}
                          </span>
                        </div>
                      )}
                      <div className={`rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed border ${msg.correct === true ? "bg-green-50 border-green-200" : msg.correct === false ? "bg-red-50 border-red-200" : "bg-rose-50 border-rose-200"}`}>
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed bg-indigo-600 text-white">
                      {msg.content}
                    </div>
                  )}
                </div>
              ))}
              {interrogLoading && interrogMessages.length > 0 && (
                <div className="flex justify-start">
                  <div className="bg-rose-50 rounded-2xl rounded-bl-sm px-4 py-3 border border-rose-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-rose-500 animate-spin" />
                    <span className="text-sm text-rose-600">Correction en cours…</span>
                  </div>
                </div>
              )}
              <div ref={interrogRef} />
            </div>
            {/* Input */}
            {interrogScore.total < 8 && (
              <div className="p-3 border-t border-rose-100 flex-shrink-0">
                <div className="flex gap-2">
                  <input value={interrogInput} onChange={e => setInterrogInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendInterrogResponse()}
                    className="flex-1 px-4 py-2.5 border-2 border-rose-200 rounded-xl text-sm focus:border-rose-400 focus:outline-none text-gray-800"
                    placeholder="Ta réponse…" disabled={interrogLoading} />
                  <button onClick={sendInterrogResponse} disabled={!interrogInput.trim() || interrogLoading}
                    className="bg-rose-600 hover:bg-rose-700 disabled:bg-gray-300 text-white p-2.5 rounded-xl transition-all">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

                {activeTab === "fiche" && (
          <div className="flex-1 bg-white rounded-2xl border-2 border-amber-200 shadow-sm overflow-y-auto flex flex-col">
            {ficheLoading ? (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <Sparkles className="w-8 h-8 text-amber-500 animate-spin mb-3" />
                <p className="text-gray-600 font-semibold text-sm">Génération de la fiche…</p>
              </div>
            ) : fiche ? (
              <>
                <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-amber-100 flex-shrink-0">
                  <span className="text-xs font-bold text-amber-700 uppercase">📋 Fiche de révision</span>
                  <button onClick={() => {
                    const w = window.open("", "_blank");
                    if (!w) return;
                    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fiche — ${entryName(selectedEntry)}</title><style>
                      body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; }
                      h1 { font-size: 1.3rem; color: #92400e; border-bottom: 2px solid #f59e0b; padding-bottom: 8px; margin-bottom: 20px; }
                      h2 { font-size: 1rem; color: #374151; margin-top: 20px; margin-bottom: 6px; }
                      strong { color: #1e40af; }
                      p, li { margin: 4px 0; }
                      ul { padding-left: 20px; }
                      .footer { margin-top: 30px; font-size: 0.75rem; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
                      @media print { body { margin: 20px; } }
                    </style></head><body>
                      <h1>📋 ${entryName(selectedEntry)}</h1>
                      <pre style="white-space:pre-wrap;font-family:Georgia,serif;font-size:0.95rem;line-height:1.8">${(fiche || "").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre>
                      <div class="footer">Généré par QCM Entraînement — ${new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" })}</div>
                    </body></html>`);
                    w.document.close();
                    setTimeout(() => w.print(), 500);
                  }}
                    className="flex items-center gap-1.5 text-xs font-bold text-amber-700 border border-amber-300 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-all">
                    <FileText className="w-3.5 h-3.5" /> Imprimer / PDF
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                  <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">{fiche}</pre>
                </div>
              </>
            ) : null}
          </div>
        )}
        {activeTab === "chat" && (
          <div className="flex-1 bg-white rounded-2xl border-2 border-gray-200 shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-gray-600" />
                <h3 className="font-bold text-gray-700 text-sm">Chat IA — questions sur le cours</h3>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="bg-yellow-100 text-yellow-700 border border-yellow-300 px-1.5 py-0.5 rounded-full font-bold">🟡 Cours</span>
                <span className="bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">🔵 IA</span>
                <span className="bg-orange-100 text-orange-700 border border-orange-300 px-1.5 py-0.5 rounded-full font-bold">🟠 Général</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-10">
                  <div className="text-4xl mb-3">💬</div>
                  <p className="text-gray-600 font-semibold">Pose une question sur le texte !</p>
                  <p className="text-gray-500 text-xs mt-1">L'IA répond en se basant sur le cours</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" ? (
                    <div className="max-w-[85%] flex flex-col gap-1">
                      {msg.source && (
                        <div className="flex items-center gap-1.5 px-1">
                          {msg.source === "texte" && <span className="flex items-center gap-1 text-xs font-bold text-yellow-700 bg-yellow-100 border border-yellow-300 px-2 py-0.5 rounded-full">🟡 Extrait de tes cours</span>}
                          {msg.source === "synthese" && <span className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">🔵 Synthèse IA (basée sur tes cours)</span>}
                          {msg.source === "hors_texte" && <span className="flex items-center gap-1 text-xs font-bold text-orange-700 bg-orange-100 border border-orange-300 px-2 py-0.5 rounded-full">🟠 Connaissance générale (hors tes cours)</span>}
                        </div>
                      )}
                      <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed rounded-bl-sm border ${msg.source === "texte" ? "bg-yellow-50 border-yellow-200 text-gray-800" : msg.source === "hors_texte" ? "bg-orange-50 border-orange-200 text-gray-800" : "bg-gray-100 border-gray-200 text-gray-800"}`}>
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-indigo-600 text-white rounded-br-sm">{msg.content}</div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 border border-gray-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-500 animate-spin" />
                    <span className="text-sm text-gray-600">Réflexion en cours…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="p-3 border-t border-gray-100 flex-shrink-0">
              <div className="flex gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none text-gray-800"
                  placeholder="Ta question sur le cours…" disabled={loading} />
                <button onClick={sendMessage} disabled={!input.trim() || loading}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white p-2.5 rounded-xl transition-all">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
        <button onClick={onBack} className="mt-3 text-sm text-gray-600 hover:text-gray-800 font-semibold flex items-center gap-1 justify-center flex-shrink-0">
          <ArrowLeft className="w-4 h-4" /> Retour aux chapitres
        </button>
      </div>
    </div>
  );
}
