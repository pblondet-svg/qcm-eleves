"use client";
// app/DissertationMode.tsx — Mode Dissertation : choix du sujet, construction guidée, brainstorming, rédaction et corrigé.
// (extrait de page.tsx)

import { useState, useMemo, useRef, useEffect } from "react";
import { Sparkles, Check, RotateCcw, Eye, ArrowLeft, CheckCircle2, BookOpen, Send, PenLine, Brain, Zap } from "lucide-react";
import DissertationGuidee from "./DissertationGuidee";
import { REGLE_GUIDAGE } from "./MethodeChatHome";
import { DEFAULT_FEATURES, FeaturesConfig, PHILO_NOTIONS_PROGRAMME, callAI, dbLoadSujetsBac, dbSaveDissertation, entryChapter, entryName, getText, matchesMatiere, parseJSON, wc } from "./shared";

// ── DISSERTATION MODE ─────────────────────────────────────────────────────────
type DissWorkMode = "plan" | "brainstorm" | "corrige" | "combined";

export function DissertationMode({ sharedLib, matiere, eleveNom, onBack, featuresConfig }: any) {
  const feat: FeaturesConfig = { ...DEFAULT_FEATURES, ...featuresConfig };
  // Étape : "select" | "working"
  const [step, setStep] = useState<"select" | "working">("select");

  // Sélection des notions
  const [selectionMode, setSelectionMode] = useState<"chapitres" | "notions">("chapitres");
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [selectedNotions, setSelectedNotions] = useState<string[]>([]);
  const [sujet, setSujet] = useState("");
  const [sujetAlt, setSujetAlt] = useState(""); // sujet contre-intuitif
  const [activeSujet, setActiveSujet] = useState<"main" | "alt">("main");
  const [isGeneratingSujet, setIsGeneratingSujet] = useState(false);
  const [isLoadingBac, setIsLoadingBac] = useState(false);
  const [sujetBacSource, setSujetBacSource] = useState("");
  const [sujetBacNotions] = useState<string[]>([]);
  const [workMode, setWorkMode] = useState<DissWorkMode>("plan");

  // Plan guidé
  const [plan, setPlan] = useState("");

  // Brainstorming
  const [brainstormMessages, setBrainstormMessages] = useState<{ role: string; content: string }[]>([]);
  const [brainstormInput, setBrainstormInput] = useState("");
  const [brainstormLoading, setBrainstormLoading] = useState(false);
  const brainstormRef = useRef<HTMLDivElement>(null);

  // Corrigé différé
  const [eleveTexte, setEleveTexte] = useState("");
  const [corrige, setCorrige] = useState("");
  const [corrigeLoading, setCorrigeLoading] = useState(false);
  const [corrigeSubmitted, setCorrigeSubmitted] = useState(false);

  useEffect(() => { brainstormRef.current?.scrollIntoView({ behavior: "smooth" }); }, [brainstormMessages]);

  // Liste des chapitres disponibles dans la bibliothèque
  const filteredLib = useMemo(
    () => sharedLib.filter((e: any) => !matiere || matchesMatiere(e, matiere)),
    [sharedLib, matiere]
  );
  const allChapters = useMemo(() => {
    const set = new Set<string>();
    filteredLib.forEach((e: any) => { const ch = entryChapter(e); if (ch !== "Non classé") set.add(ch); });
    return Array.from(set).sort();
  }, [filteredLib]);

  // Notions extraites des textes sélectionnés (chapitres OU notions du programme)
  const notionsFromSelected = useMemo(() => {
    const notions = new Set<string>();
    if (selectionMode === "chapitres") {
      filteredLib
        .filter((e: any) => selectedChapters.includes(entryChapter(e)))
        .forEach((e: any) => {
          (e.notions || []).forEach((n: string) => notions.add(n));
          if (e.notion_principale) notions.add(e.notion_principale);
          (e.notions_secondaires || []).forEach((n: string) => notions.add(n));
        });
    } else {
      selectedNotions.forEach(n => notions.add(n));
    }
    return Array.from(notions).filter(Boolean);
  }, [filteredLib, selectedChapters, selectedNotions, selectionMode]);

  // Textes correspondant aux notions sélectionnées (mode notions)
  const textesForNotions = useMemo(() => {
    if (selectionMode !== "notions" || selectedNotions.length === 0) return [];
    return filteredLib.filter((e: any) => {
      const eNotions = [
        e.notion_principale || "",
        ...(e.notions_secondaires || []),
        ...(e.notions || []),
      ].map((n: string) => n.toLowerCase());
      return selectedNotions.some(n =>
        eNotions.some(en => en.includes(n.toLowerCase().slice(0, 8)) || n.toLowerCase().includes(en.slice(0, 8)))
      );
    });
  }, [filteredLib, selectedNotions, selectionMode]);

  const activeTextes = selectionMode === "chapitres"
    ? filteredLib.filter((e: any) => selectedChapters.includes(entryChapter(e)))
    : textesForNotions;

  const contextForAI = activeTextes
    .map((e: any) => `=== ${entryName(e)} (${entryChapter(e)}) ===\n${e.content.slice(0, 1500)}`)
    .join("\n\n");

  const toggleChapter = (ch: string) => {
    setSelectedChapters(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    );
  };

  // Génération du sujet (surprise ou classique)
  const generateSujets = async () => {
    if (selectedChapters.length < 1) return;
    setIsGeneratingSujet(true);
    try {
      const notionsStr = notionsFromSelected.length > 0
        ? `Notions clés identifiées : ${notionsFromSelected.join(", ")}.`
        : "";
      const chapitresStr = selectionMode === "chapitres"
        ? selectedChapters.join(", ")
        : selectedNotions.join(", ");
      const isPhilo = matiere === "philosophie";
      const philoExamples = `Exemples du BON style (vrais sujets bac philosophie) :
"La conscience fait-elle obstacle au bonheur ?"
"Peut-on être esclave de soi-même ?"
"L'artiste travaille-t-il ?"
"Faut-il préférer la vérité au bonheur ?"
"La technique nous libère-t-elle ?"
"Suffit-il de faire son devoir pour être juste ?"`;
      const hlpExamples = `Exemples du BON style (vrais sujets bac HLP) :
"Parvient-on jamais à être soi-même ?"
"La nature me parle-t-elle de moi ?"
"L'art peut-il sublimer la souffrance ?"
"Nos sentiments résistent-ils au temps ?"
"La souffrance transforme-t-elle le sujet ?"
"La littérature libère-t-elle de l'assignation à une identité ?"`;
      const styleInstructions = isPhilo
        ? `STYLE PHILOSOPHIE — imite exactement les vrais sujets du baccalauréat de philosophie :
- TRÈS COURT : 5 à 10 mots maximum
- Une seule question directe
- Commence souvent par : "Peut-on...", "Faut-il...", "Est-il...", "La... est-elle...", "Le... est-il...", "Suffit-il de...", "Doit-on..."
- JAMAIS : "comment", "dans quelle mesure", "en quoi", "pourquoi" au début
- INTERDITS : formulations longues, méta-questions, périphrases
${philoExamples}`
        : `STYLE HLP — imite exactement les vrais sujets du baccalauréat HLP :
- COURT : 6 à 12 mots maximum
- Une seule question directe, littéraire ou philosophique
- Formulations typiques : "Parvient-on jamais à...", "La... est-elle...", "L'art peut-il...", "Nos... résistent-ils au...", "Peut-on... sans..."
- Le sujet doit mettre en lien une notion littéraire/humaine et un enjeu philosophique
- JAMAIS de formulations scolaires ou académiques lourdes
${hlpExamples}`;
      const data = await callAI([{ role: "user", content:
        `Tu es un professeur de ${isPhilo ? "Philosophie" : "HLP (Humanités, Littérature et Philosophie)"} en terminale.
Tu dois formuler deux sujets de dissertation INÉDITS qui croisent les notions suivantes :
Chapitres/notions : ${chapitresStr}
${notionsStr}

CONTRAINTE ABSOLUE : ces sujets doivent CROISER au moins deux chapitres/notions différents de façon inattendue. Ils ne doivent pas avoir été traités en classe.

${styleInstructions}

Génère exactement 2 sujets :
1. "classique" : rigoureux, format bac, croise les notions sélectionnées
2. "surprenant" : paradoxal ou contre-intuitif, même format bac court, formulation qui surprend

Réponds UNIQUEMENT en JSON (rien d'autre) :
{"classique":"Sujet classique ?","surprenant":"Sujet surprenant ?"}` }], 500, true, "sujets");
      const parsed = parseJSON(getText(data));
      setSujet(parsed.classique || "");
      setSujetAlt(parsed.surprenant || "");
      setActiveSujet("main");
    } catch {
      setSujet("Erreur lors de la génération du sujet.");
    }
    setIsGeneratingSujet(false);
  };

  // Piocher dans la BDD — BDD en priorité, fallback IA si vide
  const piocherSujetBac = async () => {
    const hasSelection = selectionMode === "chapitres" ? selectedChapters.length > 0 : selectedNotions.length > 0;
    if (!hasSelection) return;
    setIsLoadingBac(true);
    try {
      const tous = await dbLoadSujetsBac(matiere || undefined);
      const termes = selectionMode === "chapitres" ? selectedChapters : selectedNotions;
      // Filtrer par notions/chapitres sélectionnés
      const compatibles = tous.filter((s: any) => {
        const sNotions = [...(s.notions || []), s.notion_principale || ""].map((n: string) => n.toLowerCase());
        return termes.some((t: string) =>
          sNotions.some(n => n.includes(t.toLowerCase().slice(0, 8)) || t.toLowerCase().includes(n.slice(0, 8)))
        );
      });
      if (compatibles.length > 0) {
        // ✅ On a des vrais sujets — on pioche dedans
        const picked = compatibles[Math.floor(Math.random() * compatibles.length)];
        setSujet(picked.sujet);
        setSujetBacSource(picked.source || "Bac");
        setSujetAlt("");
        setActiveSujet("main");
      } else {
        // 🔄 Fallback IA — aucun sujet en BDD pour ces notions
        setSujetBacSource("");
        await generateSujets();
      }
    } catch (e) { console.error(e); }
    setIsLoadingBac(false);
  };

  // Démarrer le travail sur un sujet
  const startWorking = (mode: DissWorkMode) => {
    setWorkMode(mode);
    setStep("working");
    setPlan("");
    setBrainstormMessages([]);
    setEleveTexte("");
    setCorrige("");
    setCorrigeSubmitted(false);
  };

  // ── Méthode complète du professeur ──────────────────────────────────────────
  const METHODE_PROF = `═══ MÉTHODE DE DISSERTATION (à respecter scrupuleusement) ═══

▶ INTRODUCTION (5 étapes obligatoires dans cet ordre) :
1. OPINION COMMUNE (doxa) : formuler ce que les gens pensent habituellement du sujet — cette opinion sera progressivement dépassée dans le développement
2. DÉFINITIONS : définir clairement chaque terme clé du sujet (s'appuyer sur le dictionnaire, les cours, la culture générale)
3. PARADOXE DU SUJET : montrer pourquoi cette question semble absurde ou évidente de prime abord, puis révéler son caractère paradoxal — tout sujet invite à critiquer un préjugé (para = contre, doxa = opinion commune). Exemples de paradoxes : sujet provocant, contradiction dans les termes, concepts apparemment opposés mis en rapport, distinction inattendue...
4. PROBLÉMATIQUE : reformuler le sujet en soulignant ses paradoxes internes, en utilisant des synonymes, antonymes, et adverbes comme "vraiment", "nécessairement", "inévitablement". Montrer qu'il y a un vrai problème philosophique là où on n'en voyait pas.
5. ANNONCE DE PLAN : indiquer clairement les 3 parties — "Nous verrons dans un premier temps… puis nous montrerons… enfin nous tenterons de…"

▶ PLAN DIALECTIQUE (Thèse / Antithèse / Synthèse) :
• PARTIE I — THÈSE : hypothèse de réponse initiale qui répond "oui" à la question. Défendre une première position de façon convaincante.
• PARTIE II — ANTITHÈSE : examiner les limites de la thèse et proposer l'hypothèse contraire qui répond "non". Montrer en quoi la thèse est insuffisante.
• PARTIE III — SYNTHÈSE : NI un résumé, NI un compromis "ni oui ni non", NI une conclusion. C'est un NOUVEL ÉCLAIRAGE qui introduit un concept IMPRÉVU pour dépasser l'alternative. La synthèse reformule le problème différemment. ASTUCE : recycler l'ouverture de la conclusion pour en faire la question traitée au III.

⚠️ RÈGLE ABSOLUE : L'Introduction et les 3 Parties sont des sections DISTINCTES. Jamais : "I. Introduction", "II. Première partie"...

▶ STRUCTURE D'UN PARAGRAPHE (5 éléments obligatoires) :
1. THÈSE DU PARAGRAPHE : une idée et une seule, formulée clairement en début de paragraphe
2. ARGUMENTATION : raisons qui justifient l'idée (jamais une simple opinion subjective "je pense que...")
3. EXEMPLE : fait concret, situation de la vie quotidienne ou référence culturelle illustrant l'argument — à généraliser
4. CITATION : d'un auteur, du cours ou du texte étudié — toujours EXPLIQUÉE et commentée (le correcteur ne fait pas ce travail à ta place)
5. MINI-CONCLUSION : montrer en quoi ce paragraphe répond directement au sujet et permettre la transition vers le suivant

▶ CONCLUSION (2 étapes) :
1. BILAN : récapituler la progression en 3 temps (thèse → antithèse → synthèse) et formuler la réponse au problème posé
2. OUVERTURE : poser une nouvelle question qui prolonge la réflexion vers un autre horizon philosophique`;

  // État pour l'explication de la logique du plan

  // États rédaction assistée
  const [showRedaction, setShowRedaction] = useState(false);
  const [redacStep, setRedacStep] = useState<"intro"|"partie1"|"partie2"|"partie3"|"conclusion">("intro");
  const [redacTextes, setRedacTextes] = useState<Record<string, string>>({});
  const [redacFeedbacks, setRedacFeedbacks] = useState<Record<string, string>>({});
  const [redacLoading, setRedacLoading] = useState(false);

  const corrigerPartie = async (step: string, texte: string) => {
    if (!texte.trim()) return;
    setRedacLoading(true);
    const currentSujet = activeSujet === "main" ? sujet : sujetAlt;
    try {
      const data = await callAI([{ role: "user", content:
        `Tu es professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en terminale.
Sujet : "${currentSujet}"
${plan ? "\n\nPlan de l'élève :\n" + plan.slice(0, 1000) : ""}
${contextForAI ? "\n\nTextes étudiés :\n" + contextForAI.slice(0, 800).slice(0, 1500) : ""}

L'élève a rédigé la partie suivante : **\${stepInfo?.label}**
Méthode attendue : \${stepInfo?.desc}

TEXTE RÉDIGÉ PAR L'ÉLÈVE :
\${texte}

Corrige en 150 mots max, de façon bienveillante et précise :
1. ✅ Ce qui est bien réussi (1-2 points)
2. ⚠️ Ce qui manque ou peut être amélioré (1-2 points concrets)
3. 💡 Une question qui l'aide à améliorer lui-même cette partie

Ne réécris aucun passage et ne propose pas de version corrigée : c'est à l'élève de reprendre son texte.
Sois direct et encourageant.` }], 400, true, "dissertation");
      setRedacFeedbacks(prev => ({ ...prev, [step]: getText(data) }));
    } catch { setRedacFeedbacks(prev => ({ ...prev, [step]: "Erreur lors de la correction." })); }
    setRedacLoading(false);
  };

  // Brainstorming : premier message auto
  const startBrainstorm = async () => {
    if (brainstormMessages.length > 0) return;
    setBrainstormLoading(true);
    const currentSujet = activeSujet === "main" ? sujet : sujetAlt;
    try {
      const data = await callAI([{ role: "user", content:
        `Tu es un professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en terminale qui guide un élève en brainstorming socratique.
Sujet : "${currentSujet}"
Chapitres : ${selectedChapters.join(", ")}
${contextForAI ? "\n\nAuteurs étudiés (pour référence uniquement, ne pas citer) :\n" + activeTextes.map((e: any) => "- " + entryName(e)).join("\n") : ""}

Guide la réflexion de l'élève sur le SUJET (pas sur les auteurs). Lance le brainstorming par une question ouverte sur les termes clés du sujet. Sois bref (3-4 phrases max) et pose UNE seule question à la fin.
${REGLE_GUIDAGE}` }], 500, true, "brainstorming");
      setBrainstormMessages([{ role: "assistant", content: getText(data) }]);
    } catch { setBrainstormMessages([{ role: "assistant", content: "Commençons ! Qu'est-ce que le sujet te demande selon toi ?" }]); }
    setBrainstormLoading(false);
  };

  const sendBrainstorm = async () => {
    if (!brainstormInput.trim() || brainstormLoading) return;
    const userMsg = { role: "user", content: brainstormInput.trim() };
    const newMsgs = [...brainstormMessages, userMsg];
    setBrainstormMessages(newMsgs);
    setBrainstormInput("");
    setBrainstormLoading(true);
    const currentSujet = activeSujet === "main" ? sujet : sujetAlt;
    try {
      const data = await callAI([
        { role: "user", content:
          `Tu es un professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en terminale en session de brainstorming socratique avec un élève.
Sujet : "${currentSujet}"
Chapitres : ${selectedChapters.join(", ")}
${contextForAI ? "\n\nAuteurs étudiés (référence uniquement, ne pas s'y limiter) :\n" + activeTextes.map((e: any) => "- " + entryName(e)).join("\n") : ""}
Règles : guide par des questions, ne donne pas de plan tout fait, encourage la réflexion autonome, sois bienveillant. Pose une seule question à la fois. Réponds en 3-5 phrases max.
${REGLE_GUIDAGE}` },
        { role: "assistant", content: "Bien sûr, je suis prêt à guider ta réflexion." },
        ...newMsgs,
      ], 600);
      setBrainstormMessages([...newMsgs, { role: "assistant", content: getText(data) }]);
    } catch { setBrainstormMessages([...newMsgs, { role: "assistant", content: "Continue ta réflexion ! Qu'est-ce que cela t'évoque ?" }]); }
    setBrainstormLoading(false);
  };

  // Corrigé : soumettre le texte de l'élève
  const submitCorrige = async () => {
    if (!eleveTexte.trim()) return;
    setCorrigeLoading(true);
    const currentSujet = activeSujet === "main" ? sujet : sujetAlt;
    try {
      const data = await callAI([{ role: "user", content:
        `Tu es professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en terminale. Corrige et commente la copie d'un élève.
Sujet : "${currentSujet}"
Chapitres mobilisés : ${selectedChapters.join(", ")}
${contextForAI ? "\n\nExtraits :\n" + contextForAI.slice(0, 800).slice(0, 800) : ""}

COPIE DE L'ÉLÈVE :
${eleveTexte}

Fournis une correction bienveillante et détaillée :
1. **Points forts** (ce qui est réussi) — liste de 2-4 points
2. **Points à améliorer** (avec des explications précises) — liste de 2-4 points
3. **Sur le fond** : la problématique est-elle bien posée ? Les arguments sont-ils pertinents ?
4. **Sur la forme** : structure, transitions, introduction/conclusion
5. **Suggestion principale** : une seule chose prioritaire à travailler
6. **Note indicative** /20 avec justification courte

Ne réécris aucun passage de la copie et ne propose ni plan, ni introduction, ni paragraphe « modèle » : explique ce qui manque et pose des questions pour que l'élève l'améliore lui-même.

Sois encourageant mais précis. Termine par un mot d'encouragement.` }], 2000, false, "corrige");
      const corrigeTexte = getText(data);
      setCorrige(corrigeTexte);
      setCorrigeSubmitted(true);
      // Sauvegarder la dissertation
      try {
        await dbSaveDissertation({
          eleveNom: eleveNom || "Anonyme",
          sujet: currentSujet,
          matiere: matiere || "philosophie",
          notions: notionsFromSelected,
          notion_principale: (selectionMode === "notions" ? selectedNotions[0] : selectedChapters[0]) || "",
          texte_eleve: eleveTexte,
          corrige_ia: corrigeTexte,
          mode_travail: "corrige",
        });
      } catch (e) { console.error("Erreur sauvegarde dissertation:", e); }
    } catch { setCorrige("Erreur lors de la correction."); }
    setCorrigeLoading(false);
  };

  const currentSujetText = activeSujet === "main" ? sujet : sujetAlt;

  // ── ÉCRAN DE SÉLECTION ────────────────────────────────────────────────────
  if (step === "select") {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-2 text-gray-500 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-gray-800">✍️ Dissertation</h1>
            <p className="text-sm text-gray-500">Travaille un sujet inédit croisant plusieurs notions</p>
          </div>
        </div>

        {/* Étape 1 : choix des notions/chapitres */}
        <div className="bg-white rounded-2xl border-2 border-rose-100 shadow-sm p-6 mb-5">
          <h2 className="text-base font-black text-gray-800 mb-3 flex items-center gap-2">
            <span className="w-6 h-6 bg-rose-600 text-white rounded-full text-xs flex items-center justify-center font-black">1</span>
            Choisis les notions à travailler
          </h2>

          {/* Toggle mode sélection */}
          <div className="flex gap-2 mb-4 bg-gray-100 p-1 rounded-xl">
            <button onClick={() => { setSelectionMode("chapitres"); setSelectedNotions([]); }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${selectionMode === "chapitres" ? "bg-white shadow text-rose-700 border border-rose-200" : "text-gray-500 hover:text-gray-700"}`}>
              📖 Par chapitres travaillés en classe
            </button>
            <button onClick={() => { setSelectionMode("notions"); setSelectedChapters([]); }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${selectionMode === "notions" ? "bg-white shadow text-rose-700 border border-rose-200" : "text-gray-500 hover:text-gray-700"}`}>
              🎯 Par notions du programme
            </button>
          </div>

          {/* Mode Chapitres */}
          {selectionMode === "chapitres" && (
            allChapters.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-gray-500 font-semibold text-sm">Aucun chapitre disponible</p>
                <p className="text-gray-400 text-xs mt-1">Le professeur doit d'abord ajouter des textes.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allChapters.map((ch) => {
                  const isSel = selectedChapters.includes(ch);
                  const textesCh = filteredLib.filter((e: any) => entryChapter(e) === ch);
                  const notionsPrinc = [...new Set(textesCh.map((e: any) => e.notion_principale).filter(Boolean))] as string[];
                  const notionsSec = [...new Set(textesCh.flatMap((e: any) => e.notions_secondaires || []).filter(Boolean))] as string[];
                  return (
                    <button key={ch} onClick={() => toggleChapter(ch)}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${isSel ? "border-rose-500 bg-rose-50 ring-2 ring-rose-100" : "border-gray-200 hover:border-rose-300 bg-white"}`}>
                      <div className="flex items-start gap-2 min-w-0 mb-2">
                        <div className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center ${isSel ? "bg-rose-500 border-rose-500" : "border-gray-300"}`}>
                          {isSel && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className={`text-sm font-bold leading-snug ${isSel ? "text-rose-700" : "text-gray-700"}`}>{ch}</span>
                      </div>
                      {/* Étiquettes notions du chapitre */}
                      {(notionsPrinc.length > 0 || notionsSec.length > 0) && (
                        <div className="flex flex-wrap gap-1 ml-7">
                          {notionsPrinc.map((n: string) => (
                            <span key={n} className="text-xs bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-bold">🎯 {n}</span>
                          ))}
                          {notionsSec.map((n: string) => (
                            <span key={n} className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">{n}</span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )
          )}

          {/* Mode Notions du programme */}
          {selectionMode === "notions" && (
            <div>
              <p className="text-xs text-gray-500 mb-3">Sélectionne 1 à 3 notions — les sujets du bac correspondants seront proposés en priorité</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(matiere === "philosophie" ? PHILO_NOTIONS_PROGRAMME : [
                  "Éducation, transmission et émancipation",
                  "Les expressions de la sensibilité",
                  "Les métamorphoses du moi",
                  "Création, continuités et ruptures",
                  "Histoire et violence",
                  "L'humain et ses limites",
                ]).map((notion) => {
                  const isSel = selectedNotions.includes(notion);
                  // Compter les textes et sujets disponibles pour cette notion
                  const nbTextes = filteredLib.filter((e: any) =>
                    e.notion_principale === notion || (e.notions_secondaires || []).includes(notion) || (e.notions || []).includes(notion)
                  ).length;
                  return (
                    <button key={notion} onClick={() => setSelectedNotions(prev =>
                      prev.includes(notion) ? prev.filter(n => n !== notion) : [...prev, notion]
                    )}
                      className={`text-left p-3 rounded-xl border-2 transition-all ${isSel ? "border-rose-500 bg-rose-50 ring-2 ring-rose-100" : "border-gray-200 hover:border-rose-300 bg-white"}`}>
                      <div className="flex items-start gap-2">
                        <div className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center ${isSel ? "bg-rose-500 border-rose-500" : "border-gray-300"}`}>
                          {isSel && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div className="min-w-0">
                          <span className={`text-xs font-bold leading-snug block ${isSel ? "text-rose-700" : "text-gray-700"}`}>{notion}</span>
                          {nbTextes > 0 && <span className="text-xs text-gray-400">{nbTextes} texte{nbTextes > 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Récap sélection */}
          {(selectedChapters.length > 0 || selectedNotions.length > 0) && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-rose-700">
              <Check className="w-3.5 h-3.5" />
              {selectionMode === "chapitres"
                ? `${selectedChapters.length} chapitre${selectedChapters.length > 1 ? "s" : ""} sélectionné${selectedChapters.length > 1 ? "s" : ""}`
                : `${selectedNotions.length} notion${selectedNotions.length > 1 ? "s" : ""} sélectionnée${selectedNotions.length > 1 ? "s" : ""}`}
              {notionsFromSelected.length > 0 && ` · ${notionsFromSelected.length} notion${notionsFromSelected.length > 1 ? "s" : ""} mobilisée${notionsFromSelected.length > 1 ? "s" : ""}`}
            </div>
          )}
        </div>

        {/* Étape 2 : générer le sujet */}
        <div className="bg-white rounded-2xl border-2 border-rose-100 shadow-sm p-6 mb-5">
          <h2 className="text-base font-black text-gray-800 mb-1 flex items-center gap-2">
            <span className="w-6 h-6 bg-rose-600 text-white rounded-full text-xs flex items-center justify-center font-black">2</span>
            Génère ton sujet
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            {selectionMode === "notions" && selectedNotions.length > 0
              ? `Sujets de bac liés à : ${selectedNotions.join(", ")}`
              : "L'IA propose un sujet classique et un sujet surprenant"}
          </p>

          <div className="flex gap-2">
            <button
              onClick={generateSujets}
              disabled={(selectedChapters.length === 0 && selectedNotions.length === 0) || isGeneratingSujet || isLoadingBac}
              className={`flex-1 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                selectedChapters.length === 0 ? "bg-gray-100 text-gray-400 cursor-not-allowed" :
                "bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white shadow-md"
              }`}>
              {isGeneratingSujet ? (
                <><Sparkles className="w-4 h-4 animate-spin" /> Génération…</>
              ) : (
                <><Zap className="w-4 h-4" /> Sujet inédit IA</>
              )}
            </button>
            <button
              onClick={piocherSujetBac}
              disabled={(selectedChapters.length === 0 && selectedNotions.length === 0) || isLoadingBac || isGeneratingSujet}
              className={`flex-1 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all border-2 ${
                (selectedChapters.length === 0 && selectedNotions.length === 0) ? "border-gray-200 text-gray-400 cursor-not-allowed" :
                "border-rose-400 text-rose-700 hover:bg-rose-50 bg-white"
              }`}>
              {isLoadingBac ? (
                <><Sparkles className="w-4 h-4 animate-spin" /> Pioche…</>
              ) : (
                <><BookOpen className="w-4 h-4" /> Vrai sujet de bac</>
              )}
            </button>
          </div>

          {(sujet || sujetAlt) && (
            <div className="mt-4 space-y-3">
              {/* Sujet classique */}
              {sujet && (
                <button onClick={() => setActiveSujet("main")}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${activeSujet === "main" ? "border-rose-500 bg-rose-50 ring-2 ring-rose-100" : "border-gray-200 hover:border-rose-300"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${activeSujet === "main" ? "bg-rose-500 border-rose-500" : "border-gray-300"}`}>
                      {activeSujet === "main" && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-rose-600 uppercase tracking-wide">Sujet classique</span>
                        {sujetBacSource && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">📋 {sujetBacSource}</span>}
                        {sujetBacNotions.length > 0 && sujetBacNotions[0] && (
                          <span className="text-xs text-gray-400 italic">classé sous : {sujetBacNotions[0]}</span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-gray-800 mt-1 leading-snug">{sujet}</p>
                      {/* Notions réelles du sujet (si vrai sujet de bac) ou notions sélectionnées */}
                      {(sujetBacNotions.length > 0 ? sujetBacNotions : notionsFromSelected).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(sujetBacNotions.length > 0 ? sujetBacNotions : notionsFromSelected).slice(0, 5).map((n: string) => (
                            <span key={n} className="text-xs bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-semibold">{n}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )}
              {/* Sujet surprenant */}
              {sujetAlt && (
                <button onClick={() => setActiveSujet("alt")}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${activeSujet === "alt" ? "border-amber-500 bg-amber-50 ring-2 ring-amber-100" : "border-gray-200 hover:border-amber-300"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${activeSujet === "alt" ? "bg-amber-500 border-amber-500" : "border-gray-300"}`}>
                      {activeSujet === "alt" && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <div>
                      <span className="text-xs font-black text-amber-600 uppercase tracking-wide">⚡ Sujet surprenant</span>
                      <p className="text-sm font-bold text-gray-800 mt-1 leading-snug">{sujetAlt}</p>
                      {notionsFromSelected.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {notionsFromSelected.slice(0, 5).map((n: string) => (
                            <span key={n} className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">{n}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Étape 3 : choisir le mode de travail */}
        {currentSujetText && (
          <div className="bg-white rounded-2xl border-2 border-rose-100 shadow-sm p-6">
            <h2 className="text-base font-black text-gray-800 mb-1 flex items-center gap-2">
              <span className="w-6 h-6 bg-rose-600 text-white rounded-full text-xs flex items-center justify-center font-black">3</span>
              Choisis ton mode de travail
            </h2>
            <p className="text-xs text-gray-500 mb-2">Sujet retenu : <span className="font-bold text-gray-700 italic">"{currentSujetText}"</span></p>
          {/* Étiquettes notions actives */}
          <div className="flex flex-wrap gap-1 mb-4">
            {(selectionMode === "notions" ? selectedNotions : selectedChapters).map((n: string) => (
              <span key={n} className="text-xs bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-semibold">{n}</span>
            ))}
          </div>

            <div className="grid grid-cols-2 gap-3">
              {([
                ["plan", "📋 Construction guidée", "Construis toi-même ton introduction et ton plan, étape par étape, avec des indices", "border-indigo-300 hover:border-indigo-500", "bg-indigo-600", "text-indigo-700 bg-indigo-50"],
                ["brainstorm", "💬 Brainstorming", "L'IA te guide par des questions socratiques pour développer ta réflexion", "border-teal-300 hover:border-teal-500", "bg-teal-600", "text-teal-700 bg-teal-50"],
                ["corrige", "✏️ Corrigé différé", "Rédige ta dissertation, puis l'IA la corrige et la commente", "border-amber-300 hover:border-amber-500", "bg-amber-600", "text-amber-700 bg-amber-50"],
                ["combined", "🔀 Vue combinée", "Accède aux 3 modes en simultané dans des onglets", "border-purple-300 hover:border-purple-500", "bg-purple-600", "text-purple-700 bg-purple-50"],
              ] as [DissWorkMode, string, string, string, string, string][]).filter(([mode]) => feat[("diss_" + mode) as keyof FeaturesConfig] !== false).map(([mode, label, desc, border, btnBg, activeBg]) => (
                <button key={mode} onClick={() => { if (mode === "brainstorm") startBrainstorm(); startWorking(mode); }}
                  className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${border} bg-white`}>
                  <p className="font-black text-gray-800 text-sm mb-1">{label}</p>
                  <p className="text-xs text-gray-500 leading-snug">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── ÉCRAN DE TRAVAIL ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b-2 border-rose-100 sticky top-0 z-20 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setStep("select")} className="p-2 text-gray-500 hover:text-rose-600 rounded-xl hover:bg-rose-50">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-rose-600 font-black uppercase tracking-wide">Dissertation</p>
          <p className="text-sm font-bold text-gray-800 truncate italic">"{currentSujetText}"</p>
        </div>
        <div className="flex gap-1 text-xs text-gray-400 font-semibold flex-shrink-0">
          {selectedChapters.slice(0, 2).map(ch => (
            <span key={ch} className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">{ch.slice(0, 20)}{ch.length > 20 ? "…" : ""}</span>
          ))}
          {selectedChapters.length > 2 && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">+{selectedChapters.length - 2}</span>}
        </div>
      </div>

      {/* Vue combinée */}
      {workMode === "combined" && (
        <CombinedDissView
          sujet={currentSujetText}
          selectedChapters={selectedChapters}
          matiere={matiere}
          contextForAI={contextForAI}
          brainstormMessages={brainstormMessages}
          setBrainstormMessages={setBrainstormMessages}
          onStartBrainstorm={startBrainstorm}
        />
      )}

      {/* Construction guidée (l'élève construit lui-même son introduction et son plan) */}
      {workMode === "plan" && (
        <div className="max-w-3xl mx-auto py-6 px-4">
          <div className={showRedaction ? "hidden" : ""}>
            <DissertationGuidee
              sujet={currentSujetText}
              matiere={matiere}
              methode={METHODE_PROF}
              contexte={contextForAI}
              askAI={async (m: { role: string; content: string }[], maxTokens = 450, light = true) => getText(await callAI(m, maxTokens, light, "dissertation_guidee"))}
              onRediger={(r: string) => { setPlan(r); setRedacTextes({}); setRedacFeedbacks({}); setRedacStep("intro"); setShowRedaction(true); }}
            />
          </div>

          {plan && showRedaction && (
            <div className="bg-white rounded-2xl border-2 border-violet-200 shadow-sm overflow-hidden">
              {/* Navigation étapes */}
              <div className="flex border-b border-violet-100 overflow-x-auto">
                {([
                  ["intro","1️⃣ Introduction"],
                  ["partie1","🔹 Thèse"],
                  ["partie2","🔸 Antithèse"],
                  ["partie3","🔺 Synthèse"],
                  ["conclusion","✅ Conclusion"],
                ] as [string,string][]).map(([key, label]) => (
                  <button key={key} onClick={() => setRedacStep(key as any)}
                    className={`flex-shrink-0 px-4 py-3 text-xs font-bold border-b-2 transition-all ${redacStep === key ? "border-violet-600 text-violet-700 bg-violet-50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                    {label}
                    {redacFeedbacks[key] && <span className="ml-1 text-green-500">✓</span>}
                  </button>
                ))}
              </div>
              {/* Contenu de l'étape */}
              <div className="p-5">
                {(() => {
                  const stepInfo = ([
                    { key: "intro", label: "Introduction", desc: "Rédige ton introduction en suivant les 5 étapes : Opinion commune → Définitions → Paradoxe → Problématique → Annonce de plan" },
                    { key: "partie1", label: "Partie I — Thèse", desc: "Rédige ta première partie (réponse OUI). Pour chaque sous-partie : Thèse → Argumentation → Exemple → Citation → Mini-conclusion. Pense à la transition vers l'antithèse." },
                    { key: "partie2", label: "Partie II — Antithèse", desc: "Rédige ta deuxième partie (réponse NON). Montre les limites de la thèse. Même structure par paragraphe. Transition vers la synthèse." },
                    { key: "partie3", label: "Partie III — Synthèse", desc: "Rédige ta synthèse. ATTENTION : ce n'est PAS un résumé du I et II. Introduis un concept NOUVEAU qui dépasse l'alternative oui/non." },
                    { key: "conclusion", label: "Conclusion", desc: "Rédige ta conclusion : Bilan de la progression (I→II→III) puis Ouverture vers un autre horizon philosophique." },
                  ] as const).find(s => s.key === redacStep)!;
                  return (
                    <div className="space-y-4">
                      <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
                        <p className="text-xs font-bold text-violet-800 mb-1">{stepInfo.label}</p>
                        <p className="text-xs text-violet-700">{stepInfo.desc}</p>
                      </div>
                      <textarea
                        value={redacTextes[redacStep] || ""}
                        onChange={e => setRedacTextes(prev => ({ ...prev, [redacStep]: e.target.value }))}
                        className="w-full h-40 px-4 py-3 border-2 border-gray-200 rounded-xl text-sm resize-none focus:border-violet-400 focus:outline-none text-gray-800 leading-relaxed"
                        placeholder={`Rédige ta ${stepInfo.label.toLowerCase()} ici…`}
                      />
                      <button onClick={() => corrigerPartie(redacStep, redacTextes[redacStep] || "")}
                        disabled={!redacTextes[redacStep]?.trim() || redacLoading}
                        className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 text-white font-bold text-sm flex items-center justify-center gap-2">
                        {redacLoading ? <><Sparkles className="w-4 h-4 animate-spin" /> Correction en cours…</> : <><Sparkles className="w-4 h-4" /> Corriger cette partie</>}
                      </button>
                      {redacFeedbacks[redacStep] && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <p className="text-xs font-black text-amber-800 uppercase mb-2">📝 Retour du professeur</p>
                          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{redacFeedbacks[redacStep]}</p>
                          {redacStep !== "conclusion" && (
                            <button onClick={() => {
                              const steps = ["intro","partie1","partie2","partie3","conclusion"];
                              const next = steps[steps.indexOf(redacStep) + 1];
                              if (next) setRedacStep(next as any);
                            }}
                              className="mt-3 text-xs font-bold text-amber-700 flex items-center gap-1 hover:text-amber-900">
                              Passer à la partie suivante →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="px-5 pb-4 flex justify-between items-center border-t border-violet-100 pt-3">
                <button onClick={() => setShowRedaction(false)}
                  className="text-xs text-gray-500 hover:text-gray-700 font-semibold">← Retour au plan</button>
                <span className="text-xs text-gray-400">
                  {Object.keys(redacFeedbacks).length}/5 parties corrigées
                </span>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Brainstorming */}
      {workMode === "brainstorm" && (
        <div className="max-w-2xl mx-auto py-6 px-4 flex flex-col" style={{ minHeight: "calc(100vh - 65px)" }}>
          <div className="bg-teal-50 border-2 border-teal-200 rounded-2xl p-4 mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-teal-600 flex-shrink-0" />
            <p className="text-sm font-bold text-teal-800">Brainstorming socratique — L'IA te guide par des questions</p>
          </div>
          <div className="flex-1 bg-white rounded-2xl border-2 border-teal-200 shadow-sm flex flex-col overflow-hidden" style={{ minHeight: "400px" }}>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {brainstormLoading && brainstormMessages.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                  <Sparkles className="w-4 h-4 animate-spin text-teal-500" /> Lancement du brainstorming…
                </div>
              )}
              {brainstormMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "assistant" ? "bg-teal-50 border border-teal-200 text-gray-800 rounded-bl-sm" : "bg-teal-600 text-white rounded-br-sm"}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {brainstormLoading && brainstormMessages.length > 0 && (
                <div className="flex justify-start">
                  <div className="bg-teal-50 rounded-2xl rounded-bl-sm px-4 py-3 border border-teal-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-500 animate-spin" />
                    <span className="text-sm text-gray-600">Réflexion…</span>
                  </div>
                </div>
              )}
              <div ref={brainstormRef} />
            </div>
            <div className="p-3 border-t border-teal-100 flex-shrink-0">
              <div className="flex gap-2">
                <input value={brainstormInput} onChange={(e) => setBrainstormInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendBrainstorm()}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-teal-400 focus:outline-none text-gray-800"
                  placeholder="Ta réflexion…" disabled={brainstormLoading} />
                <button onClick={sendBrainstorm} disabled={!brainstormInput.trim() || brainstormLoading}
                  className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white p-2.5 rounded-xl transition-all">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Corrigé différé */}
      {workMode === "corrige" && (
        <div className="max-w-3xl mx-auto py-6 px-4">
          {!corrigeSubmitted ? (
            <>
              <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 mb-5">
                <h2 className="font-black text-amber-800 mb-1 flex items-center gap-2"><PenLine className="w-5 h-5" /> Rédige ta dissertation</h2>
                <p className="text-xs text-amber-600">Rédige ton introduction, ton développement ou ta dissertation complète. L'IA corrigera après.</p>
              </div>
              <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-700">Sujet : {currentSujetText}</span>
                  {eleveTexte && <span className="text-xs text-gray-500">{wc(eleveTexte)} mots</span>}
                </div>
                <textarea
                  value={eleveTexte}
                  onChange={(e) => setEleveTexte(e.target.value)}
                  className="w-full h-80 p-5 text-sm text-gray-800 leading-relaxed resize-none focus:outline-none"
                  placeholder="Rédige ta dissertation ici…&#10;&#10;Tu peux écrire ton introduction, tes arguments, ta conclusion…&#10;L'IA analysera ta copie et te donnera un retour détaillé." />
              </div>
              <button
                onClick={submitCorrige}
                disabled={!eleveTexte.trim() || corrigeLoading}
                className={`mt-4 w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${eleveTexte.trim() ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
                {corrigeLoading ? <><Sparkles className="w-4 h-4 animate-spin" /> Correction en cours…</> : <><Eye className="w-4 h-4" /> Soumettre pour correction</>}
              </button>
            </>
          ) : (
            <>
              <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 mb-5 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-green-800 text-sm">Copie corrigée !</p>
                  <p className="text-xs text-green-600">{wc(eleveTexte)} mots rédigés</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm p-4 overflow-y-auto max-h-96">
                  <h3 className="font-black text-gray-700 text-xs uppercase mb-3 flex items-center gap-1.5"><PenLine className="w-3.5 h-3.5" /> Ta copie</h3>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{eleveTexte}</p>
                </div>
                <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm p-4 overflow-y-auto max-h-96">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-black text-amber-700 text-xs uppercase flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Correction IA</h3>
                    <div className="flex gap-1.5">
                      <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-semibold">🔵 Évaluation IA</span>
                      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">📋 Grille Éduscol</span>
                    </div>
                  </div>
                  <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-semibold">
                    ⚠️ Cette correction est générée par IA et applique la grille officielle Éduscol. Elle ne remplace pas l'appréciation de ton professeur.
                  </div>
                  <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">{corrige}</pre>
                </div>
              </div>
              <button onClick={() => { setCorrigeSubmitted(false); setCorrige(""); }}
                className="w-full py-3 rounded-xl border-2 border-amber-300 text-amber-700 font-bold text-sm hover:bg-amber-50 transition-all flex items-center justify-center gap-2">
                <RotateCcw className="w-4 h-4" /> Recommencer avec une nouvelle copie
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── VUE COMBINÉE ──────────────────────────────────────────────────────────────
function CombinedDissView({ sujet, selectedChapters, matiere, contextForAI, brainstormMessages, setBrainstormMessages, onStartBrainstorm }: any) {
  const [activeTab, setActiveTab] = useState<"plan" | "brainstorm" | "corrige">("plan");
  const [brainstormInput, setBrainstormInput] = useState("");
  const [brainstormLoading, setBrainstormLoading] = useState(false);
  const [eleveTexte, setEleveTexte] = useState("");
  const [corrige, setCorrige] = useState("");
  const [corrigeLoading, setCorrigeLoading] = useState(false);
  const [corrigeSubmitted, setCorrigeSubmitted] = useState(false);
  const brainstormRef = useRef<HTMLDivElement>(null);

  useEffect(() => { brainstormRef.current?.scrollIntoView({ behavior: "smooth" }); }, [brainstormMessages]);

  useEffect(() => {
    if (activeTab === "brainstorm" && brainstormMessages.length === 0) onStartBrainstorm();
  }, [activeTab]);

  const METHODE_INTRO_C = `MÉTHODE D'INTRODUCTION : 1. Opinion commune (doxa) → 2. Définitions des termes → 3. Paradoxe du sujet → 4. Problématique (reformulation) → 5. Annonce de plan`;
  const METHODE_PLAN_C = `PLAN DIALECTIQUE : Partie I = THÈSE (oui), Partie II = ANTITHÈSE (non), Partie III = SYNTHÈSE (concept nouveau qui dépasse le oui/non — pas un résumé ni un compromis).`;

  const sendBrainstorm = async () => {
    if (!brainstormInput.trim() || brainstormLoading) return;
    const userMsg = { role: "user", content: brainstormInput.trim() };
    const newMsgs = [...brainstormMessages, userMsg];
    setBrainstormMessages(newMsgs);
    setBrainstormInput("");
    setBrainstormLoading(true);
    try {
      const data = await callAI([
        { role: "user", content: `Tu es professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en brainstorming socratique.\nSujet : "${sujet}"\nChapitres : ${selectedChapters.join(", ")}\n\nGuide la réflexion sur le SUJET (pas sur les textes). Lance par une question ouverte sur les termes clés. 3-4 phrases max, UNE seule question.\n${REGLE_GUIDAGE}` },
        { role: "assistant", content: "Bien sûr, je guide ta réflexion." },
        ...newMsgs,
      ], 500);
      setBrainstormMessages([...newMsgs, { role: "assistant", content: getText(data) }]);
    } catch { setBrainstormMessages([...newMsgs, { role: "assistant", content: "Continue !" }]); }
    setBrainstormLoading(false);
  };

  const submitCorrige = async () => {
    if (!eleveTexte.trim()) return;
    setCorrigeLoading(true);
    try {
      const data = await callAI([{ role: "user", content:
        `Tu es professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en terminale. Sujet : "${sujet}". Chapitres : ${selectedChapters.join(", ")}.
COPIE : ${eleveTexte}
Correction bienveillante : 1. Points forts 2. Points à améliorer 3. Fond 4. Forme 5. Suggestion prioritaire 6. Note /20
Ne réécris aucun passage de la copie et ne propose ni plan, ni introduction, ni paragraphe « modèle » : explique ce qui manque et pose des questions pour que l'élève l'améliore lui-même.` }], 2000, false, "correction");
      setCorrige(getText(data)); setCorrigeSubmitted(true);
    } catch { setCorrige("Erreur."); }
    setCorrigeLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto py-4 px-4">
      <div className="flex gap-2 mb-4">
        {([
          ["plan", "📋 Construction guidée", "border-indigo-500 bg-indigo-50 text-indigo-700"],
          ["brainstorm", "💬 Brainstorming", "border-teal-500 bg-teal-50 text-teal-700"],
          ["corrige", "✏️ Corrigé", "border-amber-500 bg-amber-50 text-amber-700"],
        ] as [string, string, string][]).map(([tab, label, activeClass]) => (
          <button key={tab} onClick={() => setActiveTab(tab as any)}
            className={`flex-1 py-3 rounded-xl border-2 font-bold text-xs transition-all ${activeTab === tab ? activeClass : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "plan" && (
        <DissertationGuidee
          sujet={sujet}
          matiere={matiere}
          methode={METHODE_INTRO_C + "\n" + METHODE_PLAN_C}
          contexte={contextForAI}
          askAI={async (m: { role: string; content: string }[], maxTokens = 450, light = true) => getText(await callAI(m, maxTokens, light, "dissertation_guidee"))}
          onRediger={(r: string) => { setEleveTexte(r + "\n\n— Rédige ici ta dissertation à partir de ton travail —\n"); setActiveTab("corrige"); }}
        />
      )}

      {activeTab === "brainstorm" && (
        <div className="bg-white rounded-2xl border-2 border-teal-200 shadow-sm flex flex-col" style={{ minHeight: "400px" }}>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-96">
            {brainstormMessages.map((msg: any, i: number) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.role === "assistant" ? "bg-teal-50 border border-teal-200 text-gray-800" : "bg-teal-600 text-white"}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {brainstormLoading && <div className="flex justify-start"><div className="bg-teal-50 rounded-2xl px-4 py-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-teal-500 animate-spin" /><span className="text-sm text-gray-600">Réflexion…</span></div></div>}
            <div ref={brainstormRef} />
          </div>
          <div className="p-3 border-t border-teal-100">
            <div className="flex gap-2">
              <input value={brainstormInput} onChange={(e) => setBrainstormInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendBrainstorm()}
                className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-teal-400 focus:outline-none text-gray-800"
                placeholder="Ta réflexion…" disabled={brainstormLoading} />
              <button onClick={sendBrainstorm} disabled={!brainstormInput.trim() || brainstormLoading}
                className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white p-2.5 rounded-xl">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "corrige" && (
        <div>
          {!corrigeSubmitted ? (
            <>
              <textarea value={eleveTexte} onChange={(e) => setEleveTexte(e.target.value)}
                className="w-full h-64 p-4 border-2 border-amber-200 rounded-2xl text-sm text-gray-800 leading-relaxed resize-none focus:outline-none mb-3"
                placeholder="Rédige ta dissertation ici…" />
              <button onClick={submitCorrige} disabled={!eleveTexte.trim() || corrigeLoading}
                className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${eleveTexte.trim() ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
                {corrigeLoading ? <><Sparkles className="w-4 h-4 animate-spin" /> Correction…</> : <><Eye className="w-4 h-4" /> Soumettre pour correction</>}
              </button>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border-2 border-gray-200 p-4 max-h-96 overflow-y-auto">
                <h3 className="font-black text-xs text-gray-500 uppercase mb-3">Ta copie</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{eleveTexte}</p>
              </div>
              <div className="bg-white rounded-2xl border-2 border-amber-200 p-4 max-h-96 overflow-y-auto">
                <h3 className="font-black text-xs text-amber-600 uppercase mb-3">Correction IA</h3>
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{corrige}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
