"use client";
// app/EleveMode.tsx — Mode Élève : bibliothèque de textes, colle simulée, carte des notions.
// (extrait de page.tsx)

import { useState, useMemo, useRef, useEffect } from "react";
import { Sparkles, X, Check, Play, RotateCcw, Trophy, LogOut, RefreshCw, ArrowLeft, AlertTriangle, BookOpen, Send, User, PenLine, Shuffle } from "lucide-react";
import { DEFAULT_FEATURES, FeaturesConfig, PHILO_NOTIONS_PROGRAMME, callAI, dbLoadSujetsBac, entryChapter, entryName, getText, matchesMatiere, parseJSON } from "./shared";
import { MethodeMode } from "./MethodeMode";

// ── MODE COLLE SIMULÉE ────────────────────────────────────────────────────────
type CollePhase = "choix" | "preparation" | "oral" | "bilan";

function ModeColle({ matiere, isHLP, eleveNom, serie }: any) {
  const [phase, setPhase] = useState<CollePhase>("choix");
  const [selectedNotion, setSelectedNotion] = useState("");
  const [sujet, setSujet] = useState("");
  const [sujetSource, setSujetSource] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Phase préparation
  const [timeLeft, setTimeLeft] = useState(20 * 60); // 20 min en secondes
  const [timerActive, setTimerActive] = useState(false);
  const [planEleve, setPlanEleve] = useState("");
  const timerRef = useRef<any>(null);

  // Phase oral
  const [messages, setMessages] = useState<{role: string; content: string}[]>([]);
  const [input, setInput] = useState("");
  const [oralLoading, setOralLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Phase bilan
  const [bilan, setBilan] = useState("");
  const [bilanLoading, setBilanLoading] = useState(false);

  const PHILO = PHILO_NOTIONS_PROGRAMME;
  const HLP_CH = [
    "Éducation, transmission et émancipation","Les expressions de la sensibilité",
    "Les métamorphoses du moi","Création, continuités et ruptures",
    "Histoire et violence","L\'humain et ses limites",
  ];
  const notions = isHLP ? HLP_CH : PHILO;

  // Timer
  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0 && timerActive) {
      setTimerActive(false);
    }
    return () => clearTimeout(timerRef.current);
  }, [timerActive, timeLeft]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const timerColor = timeLeft > 600 ? "text-green-700" : timeLeft > 300 ? "text-orange-600" : "text-red-600";

  // Tirer un sujet
  const tirerSujet = async () => {
    if (!selectedNotion) return;
    setIsLoading(true);
    try {
      const tous = await dbLoadSujetsBac(matiere || undefined);
      const compatibles = tous.filter((s: any) => {
        const np = (s.notion_principale || "").toLowerCase();
        const nn = (s.notions || []).map((n: string) => n.toLowerCase());
        const target = selectedNotion.toLowerCase();
        return np === target || nn.includes(target);
      });
      const pool = compatibles.length > 0 ? compatibles : tous.filter((s: any) => s.matiere === matiere);
      if (pool.length === 0) { setIsLoading(false); return; }
      const picked = pool[Math.floor(Math.random() * pool.length)];
      setSujet(picked.sujet);
      setSujetSource(picked.source || "Bac");
      setPhase("preparation");
      setTimeLeft(20 * 60);
      setTimerActive(true);
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  // Démarrer l\'oral avec le plan de l\'élève
  const demarrerOral = async () => {
    setTimerActive(false);
    setPhase("oral");
    setOralLoading(true);
    try {
      const data = await callAI([{ role: "user", content:
        `Tu es un professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} qui fait passer une colle à un lycéen de terminale.
Sujet de la colle : "${sujet}"
${planEleve ? `Plan présenté par l\'élève :\n${planEleve}` : "L\'élève n\'a pas encore présenté son plan."}

Tu joues le rôle d\'un examinateur bienveillant mais exigeant. Tu dois :
1. Réagir au plan proposé (si présent) en soulignant 1 point fort et 1 point à approfondir
2. Poser UNE question précise pour approfondir la réflexion
3. Rester dans le registre d\'un oral de philosophie (5 minutes au total)

Commence directement par ta réaction au plan, sans introduction formelle.` }], 400, true, "revision");
      setMessages([{ role: "assistant", content: getText(data) }]);
      setQuestionCount(1);
    } catch { setMessages([{ role: "assistant", content: "Bien. Présentez-moi votre plan pour ce sujet." }]); }
    setOralLoading(false);
  };

  // Répondre à l\'examinateur
  const repondre = async () => {
    if (!input.trim() || oralLoading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setOralLoading(true);

    if (questionCount >= 5) {
      // Terminer et générer le bilan
      setPhase("bilan");
      setBilanLoading(true);
      try {
        const grilleBac = serie === "techno"
          ? `GRILLE SÉRIE TECHNO (appliquer) :
• 0-5 : devoir inintelligible, hors-sujet ou refus de traiter
• 6-9 : compréhension du sujet mais pas de démarche philosophique
• ≥10 : pose le problème, esquisse un plan, montre qu'on a réfléchi
• ≥12 : + utilise le cours et des exemples concrets
• ≥14 : + raisonnement structuré, distinction thèse/antithèse claire
• ≥16 : + maîtrise du vocabulaire philosophique, synthèse personnelle
Attentes Techno : valoriser l'effort de compréhension et la capacité à expliquer simplement. Ne pas pénaliser l'absence de références nombreuses.`
          : `GRILLE ÉDUSCOL SÉRIE GÉNÉRALE (appliquer strictement) :
• 0-5 : copie inintelligible/vide/refus
• 6-9 : intelligible mais sans traitement philosophique du sujet
• ≥10 : effort réel de problématisation et cohérence globale
• ≥12 : + exemples et références pertinents
• ≥14 : + raisonnement construit et affirmations justifiées
• ≥16 : + maîtrise de concepts philosophiques et culture au service du sujet`;
        const data = await callAI([{ role: "user", content:
          `Tu es un professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} qui vient de faire passer une colle${serie === "techno" ? " (Série Technologique)" : ""}.
Sujet : "${sujet}"
Plan de l\'élève : ${planEleve || "(non fourni)"}
Échange oral : ${newMsgs.slice(-6).map(m => `${m.role === "user" ? "Élève" : "Prof"} : ${m.content.slice(0, 150)}`).join(" | ")}

${grilleBac}

Génère un bilan de colle :
1. 📊 **Note /20** : note précise + palier atteint + justification (2 lignes)
2. ✅ **Points forts** (2-3 points observés durant l\'oral)
3. ⚠️ **Points à améliorer** (2-3 conseils concrets)
4. 💡 **Conseil prioritaire** pour la prochaine colle
5. 💬 **Encouragement** (1 phrase)` }], 500, true, "revision");
        setBilan(getText(data));
      } catch { setBilan("Erreur lors de la génération du bilan."); }
      setBilanLoading(false);
      return;
    }

    try {
      const data = await callAI([
        { role: "user", content:
          `Tu es un professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} qui fait passer une colle sur le sujet : "${sujet}".
Tu es à la question ${questionCount + 1}/5. Reste bref (3-5 phrases), pose UNE seule question précise à la fin.
Si la réponse est bonne, valide et approfondis. Si elle est insuffisante, guide sans donner la réponse.` },
        { role: "assistant", content: "Je suis prêt à mener cet oral." },
        ...newMsgs,
      ], 400);
      setMessages([...newMsgs, { role: "assistant", content: getText(data) }]);
      setQuestionCount(q => q + 1);
    } catch {}
    setOralLoading(false);
  };

  const reset = () => {
    setPhase("choix"); setSujet(""); setPlanEleve(""); setMessages([]);
    setQuestionCount(0); setBilan(""); setTimerActive(false); setTimeLeft(20*60);
    setSelectedNotion("");
  };

  // ── PHASE CHOIX ──
  if (phase === "choix") return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">🎓 Mode colle simulée</h3>
        <p className="text-xs text-gray-500 mb-4">Tire un sujet au sort, prépare ton plan en 20 minutes, puis défends-le face au professeur IA.</p>
        <label className="text-xs font-bold text-gray-700 uppercase mb-2 block">Choisis une notion</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {notions.map(n => (
            <button key={n} onClick={() => setSelectedNotion(selectedNotion === n ? "" : n)}
              className={`text-left text-xs px-3 py-2.5 rounded-xl border-2 font-semibold transition-all ${selectedNotion === n ? (isHLP ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-blue-500 bg-blue-50 text-blue-800") : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
              {selectedNotion === n && "✓ "}{n}
            </button>
          ))}
        </div>
        <button onClick={tirerSujet} disabled={!selectedNotion || isLoading}
          className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${selectedNotion && !isLoading ? "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-md" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
          {isLoading ? <><Sparkles className="w-4 h-4 animate-spin" /> Tirage du sujet…</> : <><Shuffle className="w-4 h-4" /> Tirer un sujet au sort</>}
        </button>
      </div>
    </div>
  );

  // ── PHASE PRÉPARATION ──
  if (phase === "preparation") return (
    <div className="space-y-4">
      <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <span className="text-xs font-black text-violet-600 uppercase">Sujet de colle</span>
            {sujetSource && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">📋 {sujetSource}</span>}
            <p className="text-base font-black text-gray-800 mt-1 italic">"{sujet}"</p>
          </div>
          {/* Chronomètre */}
          <div className="flex-shrink-0 text-center">
            <div className={`text-3xl font-black tabular-nums ${timerColor}`}>{formatTime(timeLeft)}</div>
            <div className="flex gap-1 mt-1">
              <button onClick={() => setTimerActive(t => !t)}
                className="text-xs px-2 py-1 rounded-lg border border-gray-300 font-bold text-gray-600 hover:bg-gray-100">
                {timerActive ? "⏸ Pause" : "▶ Reprendre"}
              </button>
            </div>
          </div>
        </div>
        {timeLeft === 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-xs font-bold text-red-700 text-center mb-2">
            ⏰ Temps écoulé — passe à l\'oral !
          </div>
        )}
        {/* Barre de progression */}
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-1.5 rounded-full transition-all"
            style={{ width: `${(timeLeft / (20*60)) * 100}%`, backgroundColor: timeLeft > 600 ? "#22c55e" : timeLeft > 300 ? "#f97316" : "#ef4444" }} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <label className="text-xs font-black text-gray-700 uppercase mb-2 block">
          📝 Ton plan (brouillon) — optionnel mais recommandé
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Note ici ton plan dialectique : Introduction (5 étapes) + Thèse / Antithèse / Synthèse + Conclusion
        </p>
        <textarea value={planEleve} onChange={e => setPlanEleve(e.target.value)}
          className="w-full h-48 px-4 py-3 border-2 border-gray-200 rounded-xl text-sm resize-none focus:border-violet-400 focus:outline-none text-gray-800 leading-relaxed"
          placeholder={"Introduction\n1. Opinion commune : ...\n2. Définitions : ...\n3. Paradoxe : ...\n4. Problématique : ...\n5. Annonce : Nous verrons…\n\nPartie I — Thèse (OUI) : ...\n  A. ...\n  B. ...\n  C. ...\n→ Transition : ...\n\nPartie II — Antithèse (NON) : ...\n...\n\nPartie III — Synthèse : ...\n..."} />
        <button onClick={demarrerOral}
          className="mt-3 w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md">
          🎤 Passer à l\'oral — défendre mon plan
        </button>
        <button onClick={reset} className="mt-2 w-full py-2 text-xs text-gray-500 hover:text-gray-700 font-semibold">
          ← Changer de sujet
        </button>
      </div>
    </div>
  );

  // ── PHASE ORAL ──
  if (phase === "oral") return (
    <div className="space-y-4">
      <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <span className="text-xs font-black text-violet-600">🎤 Oral en cours</span>
          <p className="text-sm font-bold text-gray-800 italic truncate">"{sujet}"</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs bg-violet-200 text-violet-800 font-black px-2 py-1 rounded-full">
            Question {Math.min(questionCount, 5)}/5
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm flex flex-col overflow-hidden" style={{height: "420px"}}>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" ? (
                <div className="max-w-[85%]">
                  <div className="text-xs font-bold text-violet-600 mb-1 flex items-center gap-1">
                    🎓 Professeur
                  </div>
                  <div className="bg-violet-50 border border-violet-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed text-gray-800">
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div className="max-w-[85%]">
                  <div className="text-xs font-bold text-gray-500 mb-1 text-right">{eleveNom || "Toi"}</div>
                  <div className="bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              )}
            </div>
          ))}
          {oralLoading && (
            <div className="flex justify-start">
              <div className="bg-violet-50 border border-violet-200 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500 animate-spin" />
                <span className="text-sm text-violet-600">Le professeur réfléchit…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="p-3 border-t border-gray-100">
          <div className="flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && repondre()}
              className="flex-1 px-4 py-2.5 border-2 border-violet-200 rounded-xl text-sm focus:border-violet-400 focus:outline-none text-gray-800"
              placeholder="Ta réponse à l\'oral…" disabled={oralLoading} />
            <button onClick={repondre} disabled={!input.trim() || oralLoading}
              className="bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white p-2.5 rounded-xl transition-all">
              <Send className="w-4 h-4" />
            </button>
          </div>
          {questionCount >= 5 && (
            <p className="text-xs text-center text-gray-500 mt-2 font-semibold">
              Réponds à cette dernière question pour terminer l\'oral et obtenir ton bilan
            </p>
          )}
        </div>
      </div>

      {planEleve && (
        <details className="bg-gray-50 rounded-xl border border-gray-200">
          <summary className="px-4 py-2.5 text-xs font-bold text-gray-600 cursor-pointer hover:text-gray-800">
            📝 Voir mon plan de préparation
          </summary>
          <pre className="px-4 pb-3 text-xs text-gray-700 whitespace-pre-wrap font-sans">{planEleve}</pre>
        </details>
      )}
    </div>
  );

  // ── PHASE BILAN ──
  return (
    <div className="space-y-4">
      <div className="bg-violet-50 border-2 border-violet-300 rounded-2xl p-5 text-center">
        <div className="text-4xl mb-2">🎓</div>
        <h3 className="font-black text-violet-800 text-lg">Colle terminée !</h3>
        <p className="text-sm text-violet-700 italic mt-1">"{sujet}"</p>
      </div>

      <div className="bg-white rounded-2xl border-2 border-violet-200 shadow-sm p-5">
        <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2">
          📋 Bilan de colle
        </h3>
        {bilanLoading ? (
          <div className="flex items-center gap-3 py-8 justify-center">
            <Sparkles className="w-6 h-6 text-violet-500 animate-spin" />
            <span className="text-gray-600 font-semibold">Rédaction du bilan…</span>
          </div>
        ) : (
          <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">{bilan}</pre>
        )}
      </div>

      <button onClick={reset}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-sm flex items-center justify-center gap-2 hover:from-violet-700 hover:to-purple-700">
        <RotateCcw className="w-4 h-4" /> Nouvelle colle
      </button>
    </div>
  );
}

// ── CARTE MENTALE DES NOTIONS ─────────────────────────────────────────────────
function CarteMentaleNotions({ filteredLib, isHLP }: any) {
  const PHILO = PHILO_NOTIONS_PROGRAMME;
  const HLP_CH = [
    "Éducation, transmission et émancipation",
    "Les expressions de la sensibilité",
    "Les métamorphoses du moi",
    "Création, continuités et ruptures",
    "Histoire et violence",
    "L\'humain et ses limites",
  ];

  const notions = isHLP ? HLP_CH : PHILO;

  // Construire la carte : notion → textes associés
  const carte = notions.map(notion => {
    const textes = filteredLib.filter((e: any) => {
      const np = (e.notion_principale || "").toLowerCase();
      const ns = (e.notions_secondaires || []).map((n: string) => n.toLowerCase());
      const nn = (e.notions || []).map((n: string) => n.toLowerCase());
      const target = notion.toLowerCase();
      return np === target || ns.includes(target) || nn.some((n: string) => n.includes(target.slice(0, 8)));
    });
    return { notion, textes, count: textes.length };
  });

  const maxCount = Math.max(...carte.map(c => c.count), 1);
  const withTextes = carte.filter(c => c.count > 0);
  const sansTextes = carte.filter(c => c.count === 0);

  const colorForCount = (count: number) => {
    if (count === 0) return { bg: "bg-gray-100", border: "border-gray-200", text: "text-gray-400", dot: "#d1d5db" };
    const ratio = count / maxCount;
    if (ratio > 0.6) return { bg: isHLP ? "bg-emerald-50" : "bg-blue-50", border: isHLP ? "border-emerald-400" : "border-blue-400", text: isHLP ? "text-emerald-800" : "text-blue-800", dot: isHLP ? "#059669" : "#2563eb" };
    if (ratio > 0.3) return { bg: isHLP ? "bg-teal-50" : "bg-indigo-50", border: isHLP ? "border-teal-300" : "border-indigo-300", text: isHLP ? "text-teal-700" : "text-indigo-700", dot: isHLP ? "#0d9488" : "#4f46e5" };
    return { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "#d97706" };
  };

  const [selectedNotion, setSelectedNotion] = useState<string | null>(null);
  const selectedCarte = selectedNotion ? carte.find(c => c.notion === selectedNotion) : null;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
          🗺️ Carte mentale des notions
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Clique sur une notion pour voir les textes associés. La taille reflète la couverture dans tes cours.
        </p>

        {/* Grille des notions */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {carte.map(({ notion, count }) => {
            const colors = colorForCount(count);
            const isSelected = selectedNotion === notion;
            return (
              <button key={notion}
                onClick={() => setSelectedNotion(isSelected ? null : notion)}
                className={`relative text-left p-3 rounded-xl border-2 transition-all ${colors.bg} ${isSelected ? "ring-2 ring-offset-1 " + (isHLP ? "ring-emerald-400" : "ring-blue-400") + " " + colors.border : colors.border + " hover:shadow-md"}`}
                style={{ transform: isSelected ? "scale(1.02)" : "scale(1)" }}>
                <div className="flex items-start justify-between gap-1">
                  <span className={`text-xs font-black ${colors.text} leading-tight`}>{notion}</span>
                  <span className={`flex-shrink-0 text-xs font-black px-1.5 py-0.5 rounded-full ${count > 0 ? (isHLP ? "bg-emerald-200 text-emerald-800" : "bg-blue-200 text-blue-800") : "bg-gray-200 text-gray-500"}`}>
                    {count}
                  </span>
                </div>
                {/* Barre de couverture */}
                <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-1 rounded-full transition-all"
                    style={{
                      width: `${(count / maxCount) * 100}%`,
                      backgroundColor: colors.dot,
                    }} />
                </div>
                {count === 0 && (
                  <p className="text-xs text-gray-400 mt-1 italic">pas encore au programme</p>
                )}
              </button>
            );
          })}
        </div>

        {/* Stats globales */}
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xl font-black text-gray-800">{withTextes.length}</p>
            <p className="text-xs text-gray-500">notions couvertes</p>
          </div>
          <div>
            <p className="text-xl font-black text-gray-800">{filteredLib.length}</p>
            <p className="text-xs text-gray-500">textes au total</p>
          </div>
          <div>
            <p className="text-xl font-black text-gray-400">{sansTextes.length}</p>
            <p className="text-xs text-gray-400">notions sans texte</p>
          </div>
        </div>
      </div>

      {/* Détail de la notion sélectionnée */}
      {selectedCarte && (
        <div className={`bg-white rounded-2xl border-2 shadow-sm p-5 ${isHLP ? "border-emerald-200" : "border-blue-200"}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-gray-800 flex items-center gap-2">
              <span className={`text-xs font-black px-2 py-1 rounded-full ${isHLP ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                {selectedCarte.count} texte{selectedCarte.count > 1 ? "s" : ""}
              </span>
              {selectedCarte.notion}
            </h3>
            <button onClick={() => setSelectedNotion(null)}
              className="text-gray-400 hover:text-gray-600 text-xs font-semibold">
              ✕ Fermer
            </button>
          </div>

          {selectedCarte.count === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <p className="text-gray-500 font-semibold text-sm">Aucun texte associé à cette notion</p>
              <p className="text-gray-400 text-xs mt-1">Le professeur n\'a pas encore ajouté de texte pour cette notion</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedCarte.textes.map((e: any) => {
                const isPrinc = (e.notion_principale || "").toLowerCase() === selectedCarte.notion.toLowerCase();
                return (
                  <div key={e.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 hover:bg-white hover:shadow-sm transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-bold text-gray-800 truncate">
                          {e.work_title || "Sans titre"}
                        </span>
                        {isPrinc && (
                          <span className="text-xs bg-rose-100 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">🎯 notion principale</span>
                        )}
                      </div>
                      {e.author && <p className="text-xs text-gray-500">{e.author}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{e.chapter || "Sans chapitre"}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${e.type === "cours" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
                      {e.type === "cours" ? "📖 Cours" : "📝 Texte"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Alerte notions sans texte */}
      {sansTextes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-xs font-black text-amber-800 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {sansTextes.length} notion{sansTextes.length > 1 ? "s" : ""} sans texte associé
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sansTextes.map(({ notion }) => (
              <span key={notion} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">{notion}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function EleveMode({ matiere, sharedLib, libLoaded, onBack, onStartQuiz, onStartRevision, onStartDissertation, onRefresh, eleveNom, featuresConfig, serie, initialTab, methodeView, methodeContent, faqMethode, onEleveQuestion }: any) {
  const feat: FeaturesConfig = { ...DEFAULT_FEATURES, ...featuresConfig };
  const firstEnabledTab = (["revision","quiz","dissertation","carte","colle"] as const).find(t => {
    if (t === "revision") return feat.tab_revision;
    if (t === "quiz") return feat.tab_quiz;
    if (t === "dissertation") return feat.tab_dissertation;
    if (t === "carte") return feat.tab_carte;
    if (t === "colle") return feat.tab_colle;
    return true;
  }) || "revision";
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [numQ, setNumQ] = useState(10);
  const [difficulty, setDifficulty] = useState("mixte");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"revision" | "quiz" | "dissertation" | "carte" | "colle" | "methode">(initialTab || firstEnabledTab);
  const [revisionSubTab, setRevisionSubTab] = useState<"cours" | "textes">("cours");

  const isHLP = matiere === "hlp";
  const isTechno = serie === "techno";
  const headerBorder = isHLP ? "border-emerald-200" : isTechno ? "border-orange-200" : "border-blue-200";
  const matiereDisplay = isHLP ? "📜 HLP" : isTechno ? "🔧 Philo — Série Techno" : "🧠 Philo — Série Générale";

  const filteredLib = useMemo(() => sharedLib.filter((e: any) => matchesMatiere(e, matiere)), [sharedLib, matiere]);

  const chapters = useMemo(() => {
    const map: Record<string, number> = {};
    filteredLib.forEach((e: any) => { const ch = entryChapter(e); map[ch] = (map[ch] || 0) + 1; });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredLib]);

  const textsInChapter = useMemo(
    () => selectedChapter ? filteredLib.filter((e: any) => entryChapter(e) === selectedChapter) : [],
    [filteredLib, selectedChapter]
  );

  const revisionTexts = textsInChapter.filter((e: any) => !e.type || e.type === "cours" || e.type === "les deux");
  const coursTexts = revisionTexts.filter((e: any) => e.type === "cours");
  const litteraireTexts = revisionTexts.filter((e: any) => e.type !== "cours");
  const quizTexts = textsInChapter.filter((e: any) => !e.type || e.type === "qcm" || e.type === "les deux");
  const quizCoursTexts = quizTexts.filter((e: any) => e.type === "cours");
  const quizLitteraireTexts = quizTexts.filter((e: any) => e.type !== "cours");

  const selectChapter = (ch: string) => {
    setSelectedChapter(ch);
    const ids: Record<string, boolean> = {};
    filteredLib.filter((e: any) => entryChapter(e) === ch && (!e.type || e.type === "qcm" || e.type === "les deux")).forEach((e: any) => (ids[e.id] = true));
    setSelectedIds(ids); setError("");
  };

  const toggleId = (id: string) =>
    setSelectedIds((prev) => { const n = { ...prev }; if (n[id]) delete n[id]; else n[id] = true; return n; });
  const selectedEntries = quizTexts.filter((e: any) => selectedIds[e.id]);
  const allSelected = quizTexts.length > 0 && quizTexts.every((e: any) => selectedIds[e.id]);
  const toggleAll = () => {
    if (allSelected) setSelectedIds({});
    else { const ids: Record<string, boolean> = {}; quizTexts.forEach((e: any) => (ids[e.id] = true)); setSelectedIds(ids); }
  };

  const generateAndStart = async () => {
    if (!selectedEntries.length) { setError("Sélectionne au moins un texte."); return; }
    setIsGenerating(true); setError("");
    const allContent = selectedEntries.map((e: any) => `=== ${entryName(e)} ===\n${e.content}`).join("\n\n");
    const diffHint = difficulty !== "mixte" ? `\nNiveau de difficulté : ${difficulty}` : "\nMélange de niveaux : facile, moyen et difficile";
    try {
      let allQs: any[] = [], rem = numQ;
      while (rem > 0) {
        const batchSize = Math.min(20, rem); rem -= batchSize;
        const already = allQs.length ? "\n\nNe répète pas ces questions déjà générées :\n" + allQs.map((q, i) => `${i + 1}. ${q.question}`).join("\n") : "";
        setProgress(`Génération : ${allQs.length}/${numQ}…`);
        const serieHint = serie === "techno"
          ? "\nSérie Technologique : questions accessibles, vocabulaire simple, mauvaises réponses clairement fausses (pas de subtilité), bonne réponse reformulée avec des mots du quotidien."
          : "";
        const data = await callAI([{ role: "user", content:
          `Génère EXACTEMENT ${batchSize} questions QCM sur le texte littéraire ci-dessous.
Règle de format : la bonne réponse est TOUJOURS en position 0, suivie de 3 mauvaises réponses. 4 choix au total.
${diffHint}${serieHint}${already}
CONSIGNES ABSOLUES pour les mauvaises réponses :
- Chaque mauvaise réponse doit être IMMÉDIATEMENT et SANS AMBIGUÏTÉ fausse.
- OBLIGATOIRE : erreurs grossières (mauvais auteur, mauvaise époque, affirmation contraire, hors-sujet).
Format JSON strict : [{"q":"Question ?","r":["Bonne réponse","Mauvaise 1","Mauvaise 2","Mauvaise 3"]}]
Texte source :
${allContent}` }]);
        const parsed = parseJSON(getText(data));
        allQs = allQs.concat(parsed.map((item: any) => ({ question: item.q, options: item.r, correctAnswer: 0 })));
      }
      onStartQuiz({ questions: allQs, chapter: selectedChapter });
    } catch (e: any) { setError("Erreur : " + e.message); }
    finally { setIsGenerating(false); setProgress(""); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className={`bg-white border-b-2 shadow-sm sticky top-0 z-30 ${headerBorder}`}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedChapter && (
              <button onClick={() => { setSelectedChapter(null); setSelectedIds({}); setError(""); }} className="p-2 text-gray-600 hover:text-indigo-600 rounded-lg">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <span className="text-xl">{isHLP ? "📜" : "🧠"}</span>
            <div>
              <h1 className={`text-lg font-bold leading-tight ${isHLP ? "text-emerald-700" : isTechno ? "text-orange-700" : "text-blue-700"}`}>{matiereDisplay}</h1>
              {selectedChapter && <p className="text-xs text-gray-500 leading-none">{selectedChapter}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {eleveNom && (
              <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full flex items-center gap-1">
                <User className="w-3 h-3" /> {eleveNom}
              </span>
            )}
            <button onClick={onRefresh} className="p-2 text-gray-500 hover:text-indigo-600 rounded-lg"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={onBack} className="text-sm font-semibold text-gray-600 hover:text-gray-800 flex items-center gap-1">
              <LogOut className="w-4 h-4" /> Accueil
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {activeTab === "methode" ? (
          <MethodeMode initialView={methodeView} serie={serie} matiere={matiere} methodeContent={methodeContent} faqMethode={faqMethode || []} eleveNom={eleveNom} onEleveQuestion={onEleveQuestion} />
        ) : !libLoaded ? (
          <div className="text-center py-20 text-gray-700 font-semibold">Chargement…</div>
        ) : filteredLib.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-xl font-bold text-gray-600">Aucun texte disponible</p>
          </div>
        ) : !selectedChapter ? (
          <>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-gray-800 mb-2">
                {eleveNom ? `Bonjour ${eleveNom} ! 👋` : "Que veux-tu faire ?"}
              </h2>
              <p className="text-gray-600">Choisis un chapitre pour réviser ou faire un quiz</p>
            </div>

            {/* Bouton dissertation transversal */}
            <div className="mb-6">
              <button
                onClick={() => onStartDissertation({ matiere })}
                className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-bold py-5 rounded-2xl shadow-lg flex items-center justify-center gap-3 text-lg transition-all hover:shadow-xl">
                <PenLine className="w-6 h-6" />
                ✍️ Travailler un sujet de dissertation inédit
                <span className="text-xs font-normal opacity-80 bg-white/20 px-2 py-0.5 rounded-full">Croiser plusieurs chapitres</span>
              </button>
            </div>

            <div className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-200" />
              ou réviser / faire un quiz par chapitre
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {chapters.map(([ch, count]) => (
                <button key={ch} onClick={() => selectChapter(ch)}
                  className={`bg-white rounded-2xl border-2 border-gray-200 shadow-sm p-6 text-left hover:shadow-lg transition-all group ${isHLP ? "hover:border-emerald-400" : "hover:border-blue-400"}`}>
                  <div className="text-3xl mb-3">📖</div>
                  <h3 className={`font-bold text-gray-800 text-lg mb-1 line-clamp-2 ${isHLP ? "group-hover:text-emerald-700" : "group-hover:text-blue-700"}`}>{ch}</h3>
                  <p className="text-sm text-gray-600 mb-2">{count} texte{count > 1 ? "s" : ""}</p>
                  {/* Étiquettes de notions du chapitre */}
                  {(() => {
                    const notions = ([...new Set(
                      filteredLib.filter((e: any) => entryChapter(e) === ch)
                        .flatMap((e: any) => e.notions || [])
                        .filter(Boolean)
                    )] as string[]).slice(0, 4);
                    return notions.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {notions.map((n: string) => (
                          <span key={n} className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isHLP ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>{n}</span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-2 mb-6">
              {feat.tab_revision && <button onClick={() => setActiveTab("revision")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 font-bold text-xs transition-all ${activeTab === "revision" ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-700 hover:border-green-300"}`}>
                <BookOpen className="w-4 h-4" /> {isHLP ? "📖 Révision HLP" : isTechno ? "📖 Cours — Série Techno" : "📖 Cours — Série Générale"}
              </button>}
              {feat.tab_quiz && <button onClick={() => setActiveTab("quiz")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 font-bold text-xs transition-all ${activeTab === "quiz" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300"}`}>
                <Trophy className="w-4 h-4" /> ✅ Quiz
              </button>}
              {feat.tab_carte && <button onClick={() => setActiveTab("carte")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 font-bold text-xs transition-all ${activeTab === "carte" ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 bg-white text-gray-700 hover:border-purple-300"}`}>
                🗺️ Carte mentale
              </button>}
              {feat.tab_colle && <button onClick={() => setActiveTab("colle")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 font-bold text-xs transition-all ${activeTab === "colle" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-gray-200 bg-white text-gray-700 hover:border-violet-300"}`}>
                🎓 Colle
              </button>}
              <button onClick={() => setActiveTab("methode")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 font-bold text-xs transition-all ${(activeTab as string) === "methode" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 bg-white text-gray-700 hover:border-amber-300"}`}>
                {isHLP ? "📐 Méthode HLP" : isTechno ? "📐 Méthode — Série Techno" : "📐 Méthode — Série Générale"}
              </button>
            </div>

            {activeTab === "revision" && (
              revisionTexts.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                  <p className="text-gray-600 font-semibold">Aucun contenu de révision dans ce chapitre</p>
                </div>
              ) : (
                <>
                  {coursTexts.length > 0 && litteraireTexts.length > 0 && (
                    <div className="flex gap-2 mb-4 bg-gray-100 p-1 rounded-xl">
                      <button onClick={() => setRevisionSubTab("cours")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${revisionSubTab === "cours" ? "bg-white shadow text-amber-700 border border-amber-200" : "text-gray-500 hover:text-gray-700"}`}>
                        📖 Cours du prof
                        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-xs">{coursTexts.length}</span>
                      </button>
                      <button onClick={() => setRevisionSubTab("textes")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${revisionSubTab === "textes" ? "bg-white shadow text-indigo-700 border border-indigo-200" : "text-gray-500 hover:text-gray-700"}`}>
                        📝 Textes d'auteurs
                        <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full text-xs">{litteraireTexts.length}</span>
                      </button>
                    </div>
                  )}
                  {(() => {
                    const toRevise = (coursTexts.length > 0 && litteraireTexts.length > 0)
                      ? (revisionSubTab === "cours" ? coursTexts : litteraireTexts)
                      : revisionTexts;
                    return toRevise.length === 0 ? (
                      <div className="text-center py-8 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                        <p className="text-gray-500 font-semibold text-sm">Aucun contenu dans cet onglet</p>
                      </div>
                    ) : (
                      <button onClick={() => onStartRevision({ entries: toRevise, chapter: selectedChapter })}
                        className={`w-full font-bold py-4 rounded-2xl flex items-center justify-center gap-3 text-white text-lg shadow-lg transition-all bg-gradient-to-r ${revisionSubTab === "cours" || coursTexts.length === 0 ? "from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600" : "from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"}`}>
                        <BookOpen className="w-6 h-6" />
                        Réviser — {toRevise.length} {revisionSubTab === "textes" && litteraireTexts.length > 0 ? "texte" : "cours"}{toRevise.length > 1 ? "s" : ""}
                      </button>
                    );
                  })()}
                </>
              )
            )}

            {activeTab === "quiz" && (
              quizTexts.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                  <p className="text-gray-600 font-semibold">Aucun texte QCM dans ce chapitre</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-black text-gray-800">Choisis tes textes</h2>
                    <button onClick={toggleAll}
                      className={`flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl transition-all ${isHLP ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" : "text-blue-600 bg-blue-50 hover:bg-blue-100"}`}>
                      {allSelected ? <><X className="w-4 h-4" /> Tout désélectionner</> : <><Check className="w-4 h-4" /> Tout sélectionner</>}
                    </button>
                  </div>
                  <div className="space-y-3 mb-6">
                    {quizCoursTexts.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 my-2">
                          <span className="text-xs font-black text-amber-600 uppercase tracking-widest">📖 Cours du prof</span>
                          <div className="flex-1 h-px bg-amber-200" />
                        </div>
                        {quizCoursTexts.map((entry: any) => {
                          const isSel = !!selectedIds[entry.id];
                          return (
                            <button key={entry.id} onClick={() => toggleId(entry.id)}
                              className={`w-full text-left bg-white rounded-2xl border-2 shadow-sm p-5 transition-all ${isSel ? "border-amber-400 ring-2 ring-amber-100" : "border-gray-200 hover:border-amber-300"}`}>
                              <div className="flex items-start gap-3">
                                <div className={`flex-shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center mt-0.5 ${isSel ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}>
                                  {isSel && <Check className="w-4 h-4 text-white" />}
                                </div>
                                <div>
                                  <h3 className={`font-bold text-base ${isSel ? "text-amber-700" : "text-gray-800"}`}>{entryName(entry)}</h3>
                                  <p className="text-xs text-gray-600 mt-0.5">{entry.word_count} mots</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}
                    {quizLitteraireTexts.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 my-2">
                          <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">📝 Textes d'auteurs</span>
                          <div className="flex-1 h-px bg-indigo-200" />
                        </div>
                        {quizLitteraireTexts.map((entry: any) => {
                          const isSel = !!selectedIds[entry.id];
                          return (
                            <button key={entry.id} onClick={() => toggleId(entry.id)}
                              className={`w-full text-left bg-white rounded-2xl border-2 shadow-sm p-5 transition-all ${isSel ? (isHLP ? "border-emerald-500 ring-2 ring-emerald-100" : "border-blue-500 ring-2 ring-blue-100") : "border-gray-200 hover:border-indigo-300"}`}>
                              <div className="flex items-start gap-3">
                                <div className={`flex-shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center mt-0.5 ${isSel ? (isHLP ? "bg-emerald-600 border-emerald-600" : "bg-blue-600 border-blue-600") : "border-gray-300"}`}>
                                  {isSel && <Check className="w-4 h-4 text-white" />}
                                </div>
                                <div>
                                  <h3 className={`font-bold text-base ${isSel ? (isHLP ? "text-emerald-700" : "text-blue-700") : "text-gray-800"}`}>{entryName(entry)}</h3>
                                  <p className="text-xs text-gray-600 mt-0.5">{entry.word_count} mots</p>
                                  {(entry.notions || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                      {entry.notions.slice(0, 4).map((n: string, i: number) => (
                                        <span key={i} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">{n}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                  {selectedEntries.length > 0 && (
                    <div className={`bg-white rounded-2xl border-2 shadow-lg p-6 ${isHLP ? "border-emerald-200" : "border-blue-200"}`}>
                      <div className="flex flex-wrap items-end gap-4 mb-4">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-800">{selectedEntries.length} texte{selectedEntries.length > 1 ? "s" : ""} sélectionné{selectedEntries.length > 1 ? "s" : ""}</p>
                        </div>
                        <div className="flex gap-4">
                          <div>
                            <p className="text-xs font-bold text-gray-700 uppercase mb-1.5">Questions</p>
                            <input type="number" min="5" max="50" value={numQ} onChange={(e) => setNumQ(Math.max(5, Math.min(50, parseInt(e.target.value) || 5)))}
                              className="w-16 p-2 border-2 border-gray-300 rounded-xl text-center font-bold focus:outline-none text-gray-800" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-700 uppercase mb-1.5">Difficulté</p>
                            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                              className="p-2 border-2 border-gray-300 rounded-xl text-sm font-semibold focus:outline-none bg-white text-gray-800">
                              <option value="facile">Facile</option>
                              <option value="moyen">Moyen</option>
                              <option value="difficile">Difficile</option>
                              <option value="mixte">Mixte</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-semibold">{error}</div>}
                      {progress && <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 font-semibold text-center">{progress}</div>}
                      <button onClick={generateAndStart} disabled={isGenerating}
                        className={`w-full font-bold py-4 rounded-2xl flex items-center justify-center gap-3 text-white text-lg shadow-lg transition-all bg-gradient-to-r ${isGenerating ? "from-gray-300 to-gray-300" : isHLP ? "from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700" : "from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"}`}>
                        {isGenerating ? <><Sparkles className="w-6 h-6 animate-spin" /> Génération…</> : <><Play className="w-6 h-6" /> Lancer le quiz — {numQ} questions</>}
                      </button>
                    </div>
                  )}
                </>
              )
            )}

          {activeTab === "carte" && (
            <CarteMentaleNotions filteredLib={filteredLib} matiere={matiere} isHLP={isHLP} />
          )}
          {activeTab === "colle" && (
            <ModeColle filteredLib={filteredLib} matiere={matiere} isHLP={isHLP} eleveNom={eleveNom} serie={serie} />
          )}
          </>
        )}
      </div>
    </div>
  );
}
