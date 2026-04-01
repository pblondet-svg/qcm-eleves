"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import mammoth from "mammoth";
import { supabase } from "@/lib/supabase";
import {
  Plus, Trash2, Sparkles, FileUp, Search, X, Edit2,
  Check, FolderOpen, Play, RotateCcw, Trophy, ChevronRight, ChevronLeft,
  Lock, LogOut, Eye, RefreshCw, ArrowLeft, CheckCircle2, AlertTriangle,
  BookOpen, Send, MessageCircle, User, Layers, PenLine, Lightbulb,
  Shuffle, ChevronDown, ChevronUp, FileText, Brain, Zap, ListChecks,
} from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────
const callAI = async (messages: { role: string; content: string }[], max_tokens = 4000) => {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, max_tokens }),
  });
  if (!res.ok) throw new Error("Erreur API " + res.status);
  return res.json();
};

const getText = (d: any) =>
  (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
const parseJSON = (txt: string) => {
  const c = txt.replace(/```json/g, "").replace(/```/g, "").trim();
  const m = c.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : c);
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const wc = (c: string) => c.trim().split(/\s+/).filter(Boolean).length;
const entryName = (e: any) =>
  e.author && e.work_title ? `${e.author} — ${e.work_title}` : e.work_title || "Sans titre";
const entryChapter = (e: any) => e.chapter?.trim() || "Non classé";

// Code prof chargé dynamiquement depuis Supabase (voir vérification dans ProfMode)

// ── Programme HLP ─────────────────────────────────────────────────────────────
const HLP_CHAPITRES = [
  {
    semestre: "Semestre 1 — La recherche de soi",
    subtitle: "Du romantisme au XXe siècle",
    items: [
      "Éducation, transmission et émancipation",
      "Les expressions de la sensibilité",
      "Les métamorphoses du moi",
    ],
  },
  {
    semestre: "Semestre 2 — L'Humanité en question",
    subtitle: "Période contemporaine (XXe-XXIe siècles)",
    items: [
      "Création, continuités et ruptures",
      "Histoire et violence",
      "L'humain et ses limites",
    ],
  },
];

// ── Notions officielles du programme de Philosophie ──────────────────────────
const PHILO_NOTIONS_PROGRAMME = [
  "L'art", "Le bonheur", "La conscience", "Le devoir", "L'État",
  "L'inconscient", "La justice", "Le langage", "La liberté", "La nature",
  "La raison", "La religion", "La science", "La technique", "Le temps",
  "Le travail", "La vérité",
];

// ── Programme Philosophie ─────────────────────────────────────────────────────
const PHILO_CHAPITRES = [
  "Sujet 1 - Peut-on être esclave de soi-même ?",
  "Sujet 2 - Pour être juste, suffit-il d'être juste ?",
  "Sujet 3 - La technique nous permet-elle de ne plus avoir peur de la nature ?",
  "Sujet 4 - L'artiste travaille-t-il ?",
  "Sujet 5 - Est-ce un devoir d'être heureux ?",
];

const matchesMatiere = (entry: any, matiere: string) => {
  const m = (entry.matiere || "").toLowerCase().trim();
  if (matiere === "philosophie") return m === "philosophie";
  return m === "hlp" || m === "";
};

const matiereLabel = (m: string) =>
  m === "hlp" ? "📜 HLP" : "🧠 Philosophie";

const matiereColor = (m: string) =>
  m === "hlp" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700";

// ── Supabase DB ───────────────────────────────────────────────────────────────
const dbLoadTextes = async () => {
  const { data, error } = await supabase
    .from("textes").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

const dbAddTexte = async (entry: any) => {
  const { error } = await supabase.from("textes").insert([{
    id: entry.id,
    chapter: entry.chapter,
    author: entry.author,
    work_title: entry.workTitle || entry.work_title,
    notions: entry.notions,
    content: entry.content,
    word_count: entry.wordCount || entry.word_count,
    created_at: entry.createdAt || entry.created_at || Date.now(),
    type: entry.type || "les deux",
    matiere: entry.matiere || "hlp",
    notion_principale: entry.notion_principale || "",
    notions_secondaires: entry.notions_secondaires || [],
  }]);
  if (error) throw error;
};

const dbDeleteTexte = async (id: string) => {
  const { error } = await supabase.from("textes").delete().eq("id", id);
  if (error) throw error;
};

const dbUpdateTexte = async (id: string, fields: any) => {
  const { error } = await supabase.from("textes").update({
    chapter: fields.chapter,
    author: fields.author,
    work_title: fields.workTitle || fields.work_title,
    content: fields.content,
    word_count: wc(fields.content || ""),
    type: fields.type || "les deux",
    matiere: fields.matiere || "hlp",
    notion_principale: fields.notion_principale || "",
    notions_secondaires: fields.notions_secondaires || [],
  }).eq("id", id);
  if (error) throw error;
};

const dbSaveResultat = async (resultat: any) => {
  const { error } = await supabase.from("resultats").insert([{
    id: uid(),
    eleve_nom: resultat.eleveNom || "Anonyme",
    chapter: resultat.chapter,
    score: resultat.score,
    total: resultat.total,
    pourcentage: resultat.pourcentage,
  }]);
  if (error) throw error;
};

const dbLoadResultats = async () => {
  const { data, error } = await supabase
    .from("resultats").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

// ── Sujets Bac DB ─────────────────────────────────────────────────────────────
const dbLoadSujetsBac = async (matiere?: string, notions?: string[]) => {
  let query = supabase.from("sujets_bac").select("*").order("notion_principale");
  if (matiere) query = query.eq("matiere", matiere);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const dbInsertSujetBac = async (s: any) => {
  const { error } = await supabase.from("sujets_bac").insert([{
    id: s.id || uid(),
    sujet: s.sujet,
    matiere: s.matiere,
    notions: s.notions || [],
    notion_principale: s.notion_principale || "",
    source: s.source || "Import prof",
  }]);
  if (error) throw error;
};

const dbDeleteSujetBac = async (id: string) => {
  const { error } = await supabase.from("sujets_bac").delete().eq("id", id);
  if (error) throw error;
};

const dbCountSujetsBac = async () => {
  const { count, error } = await supabase.from("sujets_bac").select("*", { count: "exact", head: true });
  if (error) return 0;
  return count || 0;
};

// ── Config DB (code prof) ─────────────────────────────────────────────────────
const dbGetConfig = async (key: string) => {
  const { data, error } = await supabase.from("config").select("value").eq("key", key).single();
  if (error) return null;
  return data?.value || null;
};

const dbSetConfig = async (key: string, value: string) => {
  const { error } = await supabase.from("config").upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
};

// ── Dissertations DB ──────────────────────────────────────────────────────────
const dbSaveDissertation = async (d: any) => {
  const { error } = await supabase.from("dissertations").insert([{
    id: uid(),
    eleve_nom: d.eleveNom || "Anonyme",
    sujet: d.sujet,
    matiere: d.matiere || "philosophie",
    notions: d.notions || [],
    notion_principale: d.notion_principale || "",
    texte_eleve: d.texte_eleve || "",
    corrige_ia: d.corrige_ia || "",
    mode_travail: d.mode_travail || "corrige",
    created_at: Date.now(),
  }]);
  if (error) throw error;
};

const dbLoadDissertations = async () => {
  const { data, error } = await supabase
    .from("dissertations").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

// ── Sessions révision DB ──────────────────────────────────────────────────────
const dbSaveSession = async (s: any) => {
  const { error } = await supabase.from("sessions_revision").insert([{
    id: uid(),
    eleve_nom: s.eleveNom || "Anonyme",
    texte_id: s.texte_id,
    texte_titre: s.texte_titre || "",
    chapitre: s.chapitre || "",
    matiere: s.matiere || "hlp",
    notion_principale: s.notion_principale || "",
    duree_secondes: s.duree_secondes || 0,
    nb_messages: s.nb_messages || 0,
    created_at: Date.now(),
  }]);
  if (error) throw error;
};

const dbLoadSessions = async () => {
  const { data, error } = await supabase
    .from("sessions_revision").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

const dbLoadResultatsAll = async () => {
  const { data, error } = await supabase
    .from("resultats").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

// ── File extraction ───────────────────────────────────────────────────────────
async function extractFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "txt") return file.text();
  if (ext === "docx" || ext === "doc") {
    const buf = await file.arrayBuffer();
    return (await mammoth.extractRawText({ arrayBuffer: buf })).value;
  }
  throw new Error("Format non supporté (.txt, .docx)");
}

async function extractMetadataWithAI(content: string, filename: string, chapterHint: string) {
  const snippet = content.slice(0, 3000);
  const hint = chapterHint ? `\nHint chapitre : "${chapterHint}"` : "";
  const data = await callAI([{ role: "user", content:
    `Analyse ce texte et extrais ses métadonnées. Réponds UNIQUEMENT en JSON valide.${hint}
Format: {"author":"Prénom Nom","workTitle":"Titre","chapter":"Mouvement littéraire","notions":["notion1","notion2","notion3"]}
Fichier: ${filename}
Texte: ${snippet}` }], 600);
  return parseJSON(getText(data));
}

// ── Quiz utils ────────────────────────────────────────────────────────────────
const shuffle = (arr: any[]) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const prepareQuiz = (questions: any[]) =>
  questions.map((q) => {
    const correctText = q.options[q.correctAnswer];
    const shuffled = shuffle(q.options);
    return { question: q.question, options: shuffled, correctIndex: shuffled.indexOf(correctText) };
  });

// ── Sélecteur de chapitre ────────────────────────────────────────────────────
function ChapterSelect({ matiere, value, onChange, existingChapters, forceType }: {
  matiere: string; value: string; onChange: (v: string) => void;
  existingChapters: string[]; forceType?: string;
}) {
  if (matiere === "hlp") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none text-gray-800">
        <option value="">— Choisir une entrée du programme —</option>
        {HLP_CHAPITRES.map((s) => (
          <optgroup key={s.semestre} label={`${s.semestre} (${s.subtitle})`}>
            {s.items.map((item) => <option key={item} value={item}>{item}</option>)}
          </optgroup>
        ))}
      </select>
    );
  }
  if (matiere === "philosophie") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none text-gray-800">
        <option value="">— Choisir un sujet de philosophie —</option>
        <optgroup label="Sujets du programme">
          {PHILO_CHAPITRES.map((item) => <option key={item} value={item}>{item}</option>)}
        </optgroup>
        {existingChapters.filter((ch) => !PHILO_CHAPITRES.includes(ch) && ch !== "Non classé").length > 0 && (
          <optgroup label="Chapitres personnalisés">
            {existingChapters
              .filter((ch) => !PHILO_CHAPITRES.includes(ch) && ch !== "Non classé")
              .map((ch) => <option key={ch} value={ch}>{ch}</option>)}
          </optgroup>
        )}
      </select>
    );
  }
  if (forceType === "cours") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none text-gray-800">
        <option value="">-- Choisir un chapitre existant --</option>
        {existingChapters.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
      </select>
    );
  }
  return (
    <>
      <input value={value} onChange={(e) => onChange(e.target.value)} list="chapters-list"
        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none text-gray-800"
        placeholder="Ex: Le Romantisme" />
      <datalist id="chapters-list">
        {existingChapters.map((ch) => <option key={ch} value={ch} />)}
      </datalist>
    </>
  );
}

// ── VALIDATION MODAL ──────────────────────────────────────────────────────────
function ValidationModal({ pending, existingChapters, defaultMatiere, onConfirm, onCancel }: any) {
  const [entries, setEntries] = useState(
    pending.map((e: any) => ({ ...e, matiere: e.matiere || defaultMatiere || "hlp" }))
  );

  const update = (id: string, field: string, val: string) =>
    setEntries((prev: any[]) => prev.map((e: any) => e.id === id ? { ...e, [field]: val } : e));
  const updateNotion = (id: string, i: number, val: string) =>
    setEntries((prev: any[]) => prev.map((e: any) =>
      e.id === id ? { ...e, notions: e.notions.map((n: string, ni: number) => ni === i ? val : n) } : e));
  const addNotion = (id: string) =>
    setEntries((prev: any[]) => prev.map((e: any) =>
      e.id === id ? { ...e, notions: [...e.notions, ""] } : e));
  const removeNotion = (id: string, i: number) =>
    setEntries((prev: any[]) => prev.map((e: any) =>
      e.id === id ? { ...e, notions: e.notions.filter((_: any, ni: number) => ni !== i) } : e));
  const removeEntry = (id: string) =>
    setEntries((prev: any[]) => prev.filter((e: any) => e.id !== id));

  const handleConfirm = () => {
    onConfirm(entries.filter((e: any) => e.content).map((e: any) => ({
      ...e,
      chapter: e.chapter || "Non classé",
      notions: e.notions.filter((n: string) => n.trim()),
      wordCount: wc(e.content),
      createdAt: Date.now(),
      type: e.type || "les deux",
      matiere: e.matiere || "hlp",
    })));
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-black text-gray-800">Validation des métadonnées</h2>
          <button onClick={onCancel} className="p-2 text-gray-600 hover:text-gray-800 rounded-xl hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
          {entries.map((entry: any) => (
            <div key={entry.id} className={`rounded-2xl border-2 overflow-hidden ${entry.status === "done" ? "border-green-200" : "border-red-200"}`}>
              <div className={`flex items-center justify-between px-4 py-2.5 text-xs font-bold ${entry.status === "done" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                <span className="flex items-center gap-2">
                  {entry.status === "done" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  {entry.filename}
                </span>
                <button onClick={() => removeEntry(entry.id)}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase mb-1.5 block">Matière</label>
                  <div className="flex gap-2">
                    {[
                      ["hlp", "📜 HLP", "border-emerald-400 bg-emerald-50 text-emerald-700"],
                      ["philosophie", "🧠 Philosophie", "border-blue-400 bg-blue-50 text-blue-700"],
                    ].map(([val, label, activeClass]) => (
                      <button key={val} onClick={() => update(entry.id, "matiere", val)}
                        className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold transition-all ${entry.matiere === val ? activeClass : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase mb-1 block">Chapitre</label>
                  <ChapterSelect matiere={entry.matiere || "hlp"} value={entry.chapter || ""}
                    onChange={(v) => update(entry.id, "chapter", v)} existingChapters={existingChapters} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {([["Auteur", "author"], ["Titre", "workTitle"]] as [string, string][]).map(([label, field]) => (
                    <div key={field}>
                      <label className="text-xs font-bold text-gray-600 uppercase mb-1 block">{label}</label>
                      <input value={entry[field] || ""} onChange={(e) => update(entry.id, field, e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none text-gray-800" />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase mb-1 block">Utilisation</label>
                  <select value={entry.type || "les deux"} onChange={(e) => update(entry.id, "type", e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none text-gray-800">
                    <option value="les deux">Cours ET QCM</option>
                    <option value="cours">Cours uniquement</option>
                    <option value="qcm">QCM uniquement</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase mb-1 block">Notions</label>
                  <div className="flex flex-wrap gap-2">
                    {(entry.notions || []).map((n: string, i: number) => (
                      <div key={i} className="flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-lg px-2 py-1">
                        <input value={n} onChange={(e) => updateNotion(entry.id, i, e.target.value)}
                          className="text-xs font-semibold text-purple-700 bg-transparent border-none outline-none min-w-12 max-w-32" />
                        <button onClick={() => removeNotion(entry.id, i)} className="text-purple-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                    <button onClick={() => addNotion(entry.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-purple-600 border border-dashed border-gray-300 rounded-lg px-2 py-1">
                      <Plus className="w-3 h-3" /> Ajouter
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-xl text-sm">Annuler</button>
          <button onClick={handleConfirm}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
            <Check className="w-4 h-4" /> Confirmer {entries.length} texte{entries.length > 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

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
        `À partir de ce texte littéraire, génère des flashcards de révision.
${dbNotions.length > 0 ? "Notions déjà identifiées : " + dbNotions.join(", ") + ". Crée une flashcard pour chacune, puis ajoute d'autres notions importantes du texte." : "Identifie les notions clés du texte et crée une flashcard pour chacune."}
Format JSON strict : [{"recto":"Notion ou question courte","verso":"Définition ou explication en 2-3 phrases max, en lien avec le texte"}]
Génère entre 6 et 10 flashcards au total.
Texte :
${entry.content.slice(0, 4000)}` }], 1200);
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
function RevisionMode({ entries, chapter, onBack, allTextes, eleveNom }: any) {
  const [selectedEntry, setSelectedEntry] = useState<any>(entries.length === 1 ? entries[0] : null);
  const [activeTab, setActiveTab] = useState<"chat" | "fiche" | "flashcards" | "interrogation">("chat");
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
${selectedEntry.content.slice(0, 5000)}` }], 1000);
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

Commence directement par la question, sans introduction.` }], 400);
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
  "feedback": "correction courte et bienveillante (2-3 phrases max) — ce qui est juste, ce qui manque",
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
      const systemPrompt = `Tu es un assistant pédagogique bienveillant. Tu aides un élève à réviser ses cours de ${selectedEntry.matiere === "philosophie" ? "Philosophie" : "HLP"}.
Tu dois TOUJOURS répondre en JSON valide, rien d'autre. Format strict :
{"source": "texte" | "synthese" | "hors_texte", "contenu": "ta réponse ici"}

Règles pour choisir la source :
- "texte" : la réponse s'appuie DIRECTEMENT sur un passage d'un des textes fournis (précise lequel entre guillemets)
- "synthese" : la réponse synthétise ou met en lien plusieurs textes du corpus
- "hors_texte" : l'information demandée ne figure dans AUCUN des textes fournis (commence par "⚠️ Cette information ne figure pas dans les textes du cours.")

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
          ] as [string, string, string][]).map(([tab, label, activeClass]) => (
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
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <MessageCircle className="w-4 h-4 text-gray-600" />
              <h3 className="font-bold text-gray-700 text-sm">Chat IA — questions sur le texte</h3>
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
                          {msg.source === "texte" && <span className="flex items-center gap-1 text-xs font-bold text-yellow-700 bg-yellow-100 border border-yellow-300 px-2 py-0.5 rounded-full">🟡 Extrait du texte</span>}
                          {msg.source === "synthese" && <span className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">🔵 Synthèse IA du cours</span>}
                          {msg.source === "hors_texte" && <span className="flex items-center gap-1 text-xs font-bold text-orange-700 bg-orange-100 border border-orange-300 px-2 py-0.5 rounded-full">🟠 Hors texte — connaissance générale</span>}
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

// ── DISSERTATION MODE ─────────────────────────────────────────────────────────
type DissWorkMode = "plan" | "brainstorm" | "corrige" | "combined";
type PlanLevel = 1 | 2 | 3 | 4;

function DissertationMode({ sharedLib, matiere, eleveNom, onBack }: any) {
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
  const [workMode, setWorkMode] = useState<DissWorkMode>("plan");

  // Plan guidé
  const [planLevel, setPlanLevel] = useState<PlanLevel>(1);
  const [plan, setPlan] = useState("");
  const [planLoading, setPlanLoading] = useState(false);

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

  // Chapitres actifs selon le mode de sélection
  const activeChaptersForContext = selectionMode === "chapitres"
    ? selectedChapters
    : [...new Set(textesForNotions.map((e: any) => entryChapter(e)))];

  // Textes sélectionnés (pour contexte IA)
  const selectedTextes = useMemo(
    () => filteredLib.filter((e: any) => selectedChapters.includes(entryChapter(e))),
    [filteredLib, selectedChapters]
  );

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
{"classique":"Sujet classique ?","surprenant":"Sujet surprenant ?"}` }], 500);
      const parsed = parseJSON(getText(data));
      setSujet(parsed.classique || "");
      setSujetAlt(parsed.surprenant || "");
      setActiveSujet("main");
    } catch (e: any) {
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
  const [planLogique, setPlanLogique] = useState("");
  const [planLogiqueLoading, setPlanLogiqueLoading] = useState(false);
  const [planLogiqueMessages, setPlanLogiqueMessages] = useState<{role: string; content: string}[]>([]);
  const [planLogiqueInput, setPlanLogiqueInput] = useState("");
  const [planLogiqueChatLoading, setPlanLogiqueChatLoading] = useState(false);
  const [showLogiqueChat, setShowLogiqueChat] = useState(false);
  const planLogiqueRef = useRef<HTMLDivElement>(null);

  // États rédaction assistée
  const [showRedaction, setShowRedaction] = useState(false);
  const [redacStep, setRedacStep] = useState<"intro"|"partie1"|"partie2"|"partie3"|"conclusion">("intro");
  const [redacTextes, setRedacTextes] = useState<Record<string, string>>({});
  const [redacFeedbacks, setRedacFeedbacks] = useState<Record<string, string>>({});
  const [redacLoading, setRedacLoading] = useState(false);
  const [redacInput, setRedacInput] = useState("");

  useEffect(() => { planLogiqueRef.current?.scrollIntoView({ behavior: "smooth" }); }, [planLogiqueMessages]);

  const REDAC_STEPS = [
    { key: "intro", label: "Introduction", icon: "1️⃣", desc: "Opinion commune → Définitions → Paradoxe → Problématique → Annonce" },
    { key: "partie1", label: "Partie I — Thèse", icon: "🔹", desc: "3 paragraphes (Thèse/Argument/Exemple/Citation/Mini-conclusion) + transition" },
    { key: "partie2", label: "Partie II — Antithèse", icon: "🔸", desc: "3 paragraphes + transition vers la synthèse" },
    { key: "partie3", label: "Partie III — Synthèse", icon: "🔺", desc: "Concept nouveau — PAS un résumé du I et II" },
    { key: "conclusion", label: "Conclusion", icon: "✅", desc: "Bilan de la progression + Ouverture" },
  ] as const;

  const corrigerPartie = async (step: string, texte: string) => {
    if (!texte.trim()) return;
    setRedacLoading(true);
    const currentSujet = activeSujet === "main" ? sujet : sujetAlt;
    const stepInfo = REDAC_STEPS.find(s => s.key === step);
    try {
      const data = await callAI([{ role: "user", content:
        `Tu es professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en terminale.
Sujet : "${currentSujet}"
${plan ? "\n\nPlan de l'élève :\n" + plan.slice(0, 1000) : ""}
${contextForAI ? "\n\nTextes étudiés :\n" + contextForAI.slice(0, 1500) : ""}

L'élève a rédigé la partie suivante : **\${stepInfo?.label}**
Méthode attendue : \${stepInfo?.desc}

TEXTE RÉDIGÉ PAR L'ÉLÈVE :
\${texte}

Corrige en 150 mots max, de façon bienveillante et précise :
1. ✅ Ce qui est bien réussi (1-2 points)
2. ⚠️ Ce qui manque ou peut être amélioré (1-2 points concrets)
3. 💡 Conseil prioritaire pour améliorer cette partie

Sois direct et encourageant.` }], 700);
      setRedacFeedbacks(prev => ({ ...prev, [step]: getText(data) }));
    } catch { setRedacFeedbacks(prev => ({ ...prev, [step]: "Erreur lors de la correction." })); }
    setRedacLoading(false);
  };

  const genererExplicationLogique = async (planTexte: string, currentSujet: string) => {
    setPlanLogiqueLoading(true);
    setPlanLogique("");
    try {
      const data = await callAI([{ role: "user", content:
        `Tu es professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en terminale.
Voici le plan d'une dissertation sur le sujet : "${currentSujet}"

${planTexte}

Explique en 200 mots maximum, de façon claire et pédagogique pour un lycéen :
1. Pourquoi ce plan progresse de la Thèse vers l'Antithèse puis la Synthèse (la logique dialectique)
2. Quel est le concept-clé introduit en III qui permet de dépasser le simple "oui/non"
3. Un conseil sur la transition la plus délicate à rédiger

Sois direct, encourageant, évite le jargon.` }], 600);
      setPlanLogique(getText(data));
      setPlanLogiqueMessages([{ role: "assistant", content: getText(data) }]);
      setShowLogiqueChat(true);
    } catch { setPlanLogique("Erreur."); }
    setPlanLogiqueLoading(false);
  };

  const sendLogiqueQuestion = async () => {
    if (!planLogiqueInput.trim() || planLogiqueChatLoading) return;
    const userMsg = { role: "user", content: planLogiqueInput.trim() };
    const newMsgs = [...planLogiqueMessages, userMsg];
    setPlanLogiqueMessages(newMsgs);
    setPlanLogiqueInput("");
    setPlanLogiqueChatLoading(true);
    const currentSujet = activeSujet === "main" ? sujet : sujetAlt;
    try {
      const data = await callAI([
        { role: "user", content: `Tu es professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en terminale. Tu expliques la logique dialectique d'un plan de dissertation sur : "${currentSujet}". Réponds en 3-5 phrases max, de façon claire et bienveillante pour un lycéen.` },
        { role: "assistant", content: "Je suis prêt à t'expliquer la logique du plan." },
        ...newMsgs,
      ], 500);
      setPlanLogiqueMessages([...newMsgs, { role: "assistant", content: getText(data) }]);
    } catch {}
    setPlanLogiqueChatLoading(false);
  };

  // Générer le plan selon le niveau
  const generatePlan = async (level: PlanLevel) => {
    setPlanLevel(level);
    setPlan("");
    setPlanLogique("");
    setPlanLogiqueMessages([]);
    setShowLogiqueChat(false);
    setShowRedaction(false);
    setRedacTextes({});
    setRedacFeedbacks({});
    setRedacStep("intro");
    setPlanLoading(true);
    const currentSujet = activeSujet === "main" ? sujet : sujetAlt;

    const levelPrompts: Record<PlanLevel, string> = {
      1: `Génère un SQUELETTE DE PLAN en suivant EXACTEMENT cette structure :

═══ INTRODUCTION ═══
1️⃣ Opinion commune : [en quelques mots — ce que les gens pensent habituellement]
2️⃣ Définitions : [liste les termes à définir]
3️⃣ Paradoxe : [en une phrase — pourquoi le sujet semble absurde ou évident, puis révèle sa tension interne]
4️⃣ Problématique : [reformulation courte du problème]
5️⃣ Annonce : Nous verrons dans un premier temps [titre I], puis nous montrerons [titre II], enfin nous tenterons de [titre III].

═══ PARTIE I — THÈSE (répond OUI) ═══
Titre : [formulation courte qui soutient le "oui"]
A. [sous-partie A — titre court]
B. [sous-partie B — titre court]
C. [sous-partie C — titre court]
→ Transition : [une phrase qui montre la limite du "oui" et ouvre vers le "non"]

═══ PARTIE II — ANTITHÈSE (répond NON) ═══
Titre : [formulation courte qui soutient le "non"]
A. [sous-partie A — titre court]
B. [sous-partie B — titre court]
C. [sous-partie C — titre court]
→ Transition : [une phrase qui montre que ni "oui" ni "non" ne suffit, et qu'il faut dépasser]

═══ PARTIE III — SYNTHÈSE (concept nouveau qui dépasse le oui/non) ═══
Titre : [formulation qui introduit l'angle nouveau — PAS "entre les deux" mais vraiment nouveau]
A. [sous-partie A — titre court]
B. [sous-partie B — titre court]
C. [sous-partie C — titre court]

═══ CONCLUSION ═══
Bilan : [résumé en une ligne de la progression I → II → III]
Ouverture : [une nouvelle question vers un autre horizon]`,

      2: `Génère un PLAN AVEC AMORCES DE RÉDACTION en suivant EXACTEMENT cette structure :

═══ INTRODUCTION ═══
1️⃣ Opinion commune : [rédigée en 1-2 phrases — "On dit souvent que…" / "Il est communément admis que…"]
2️⃣ Définitions : [définir précisément chaque terme clé du sujet]
3️⃣ Paradoxe : [montrer en 1-2 phrases pourquoi le sujet est plus complexe qu'il n'y paraît — la tension interne]
4️⃣ Problématique : [reformulation du sujet avec adverbes : "vraiment", "nécessairement", "inévitablement"]
5️⃣ Annonce : "Nous verrons dans un premier temps [titre I bref]. Puis nous montrerons [titre II bref]. Enfin, nous tenterons de [titre III bref]."

═══ PARTIE I — THÈSE (OUI) : [titre complet] ═══
A. [sous-titre]
   ✏️ Amorce : [1 phrase de début de rédaction pour cette sous-partie]
B. [sous-titre]
   ✏️ Amorce : [1 phrase de début de rédaction]
C. [sous-titre]
   ✏️ Amorce : [1 phrase de début de rédaction]
→ Transition : [1 phrase qui montre la limite de la thèse — "Cependant, cette position…"]

═══ PARTIE II — ANTITHÈSE (NON) : [titre complet] ═══
A. [sous-titre] ✏️ Amorce : [1 phrase]
B. [sous-titre] ✏️ Amorce : [1 phrase]
C. [sous-titre] ✏️ Amorce : [1 phrase]
→ Transition : [1 phrase qui annonce que ni I ni II ne suffisent — "Il faut donc aller plus loin…"]

═══ PARTIE III — SYNTHÈSE : [titre avec le concept nouveau] ═══
A. [sous-titre] ✏️ Amorce : [1 phrase]
B. [sous-titre] ✏️ Amorce : [1 phrase]
C. [sous-titre] ✏️ Amorce : [1 phrase]

═══ CONCLUSION ═══
Bilan (2-3 phrases) : [récapituler la progression thèse → antithèse → synthèse et la réponse au problème]
Ouverture : [1 question vers un autre horizon philosophique]`,

      3: `Génère un PLAN SOCRATIQUE en suivant EXACTEMENT cette structure (une question ❓ par sous-partie pour guider la réflexion de l'élève) :

═══ INTRODUCTION ═══
1️⃣ Opinion commune : [formulée]
2️⃣ Définitions : [termes clés à définir]
3️⃣ Paradoxe : [tension interne du sujet]
4️⃣ Problématique : [reformulation]
5️⃣ Annonce de plan

═══ PARTIE I — THÈSE (OUI) : [titre] ═══
A. [sous-titre]
   ❓ Pour développer : [question qui aide l'élève à trouver l'argument — commence par "En quoi…", "Comment…", "Pourquoi peut-on dire que…"]
B. [sous-titre]
   ❓ Pour développer : [question]
C. [sous-titre]
   ❓ Pour développer : [question]
→ ❓ Transition : [question qui fait percevoir la limite de la thèse — "Mais peut-on vraiment dire que…"]

═══ PARTIE II — ANTITHÈSE (NON) : [titre] ═══
A. [sous-titre] ❓ Pour développer : [question]
B. [sous-titre] ❓ Pour développer : [question]
C. [sous-titre] ❓ Pour développer : [question]
→ ❓ Transition : [question qui ouvre vers le dépassement — "Comment dépasser cette contradiction…"]

═══ PARTIE III — SYNTHÈSE (concept nouveau) : [titre] ═══
A. [sous-titre] ❓ Pour développer : [question]
B. [sous-titre] ❓ Pour développer : [question]
C. [sous-titre] ❓ Pour développer : [question]

═══ CONCLUSION ═══
Bilan : [récapitulation]
❓ Ouverture : [question vers un autre horizon]`,

      4: `Génère un PLAN COMPLET en suivant EXACTEMENT cette structure, en mobilisant les textes étudiés :

═══ INTRODUCTION ═══
1️⃣ Opinion commune (rédigée) : [1-2 phrases — "Il est naturel de penser que…"]
2️⃣ Définitions (rédigées) : [définir précisément chaque terme clé]
3️⃣ Paradoxe (rédigé) : [montrer la tension — "Pourtant, si l'on y réfléchit…"]
4️⃣ Problématique (rédigée) : [reformuler avec "vraiment", "nécessairement" — faire apparaître le problème]
5️⃣ Annonce de plan (rédigée)

═══ PARTIE I — THÈSE (OUI) : [titre complet] ═══
A. [sous-titre]
   📌 Argument : [l'idée principale du paragraphe]
   📚 Texte/auteur : [extrait des textes étudiés avec explication de pourquoi il illustre l'argument]
   💬 Citation : [auteur et idée à citer + explication de ce qu'elle apporte]
   → Mini-conclusion : [montrer en quoi A répond au sujet]
B. [sous-titre — même structure : Argument / Texte / Citation / Mini-conclusion]
C. [sous-titre — même structure]
→ Transition rédigée : ["Si [thèse] semble convaincante, elle ne prend pas en compte…"]

═══ PARTIE II — ANTITHÈSE (NON) : [titre complet] ═══
A, B, C : même structure 📌 Argument / 📚 Texte / 💬 Citation / Mini-conclusion
→ Transition rédigée : ["Cependant, se limiter à dire [antithèse] ne suffit pas à rendre compte de…"]

═══ PARTIE III — SYNTHÈSE (concept nouveau imprévu) : [titre — PAS un résumé] ═══
A, B, C : même structure
⚠️ RAPPEL : la synthèse introduit un concept NOUVEAU qui n'était pas présent en I et II

═══ CONCLUSION ═══
Bilan rédigé : [récapituler en 3 temps — "Dans un premier temps… Puis… Enfin…" — et formuler la réponse]
Ouverture rédigée : [question vers un autre horizon philosophique]`,
    };

    try {
      const data = await callAI([{ role: "user", content:
        `Tu es professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en terminale.
Sujet de dissertation : "${currentSujet}"
Chapitres mobilisés : ${selectedChapters.join(", ")}
${contextForAI ? "\n\nExtraits des textes étudiés :\n" + contextForAI : ""}

${METHODE_PROF}

${levelPrompts[level]}

RÈGLES ABSOLUES :
- L'INTRODUCTION et les PARTIES I, II, III sont des sections ENTIÈREMENT DISTINCTES — ne jamais les confondre
- La Partie I = THÈSE (oui), Partie II = ANTITHÈSE (non), Partie III = SYNTHÈSE (concept nouveau imprévu)
- La synthèse N'EST PAS un résumé ni un compromis — elle introduit quelque chose d'inédit
- Respecte EXACTEMENT le format visuel demandé avec les émojis et symboles (═══, 1️⃣, ✏️, ❓, 📌, etc.)
- Sois précis, pédagogique, adapté au niveau terminale` }], 2500);
      // Générer aussi l'explication de la logique
      const planTexte = getText(data);
      genererExplicationLogique(planTexte, currentSujet);
      setPlan(getText(data));
    } catch { setPlan("Erreur lors de la génération du plan."); }
    setPlanLoading(false);
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
${contextForAI ? "\n\nContexte des textes étudiés :\n" + contextForAI.slice(0, 2000) : ""}

Lance le brainstorming par une question ouverte qui pousse l'élève à définir les termes clés du sujet. Sois bref (3-4 phrases max) et pose UNE seule question à la fin.` }], 500);
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
${contextForAI ? "\n\nContexte textes : " + contextForAI.slice(0, 1500) : ""}
Règles : guide par des questions, ne donne pas de plan tout fait, encourage la réflexion autonome, sois bienveillant. Pose une seule question à la fois. Réponds en 3-5 phrases max.` },
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
${contextForAI ? "\n\nExtraits des textes étudiés :\n" + contextForAI.slice(0, 2000) : ""}

COPIE DE L'ÉLÈVE :
${eleveTexte}

Fournis une correction bienveillante et détaillée :
1. **Points forts** (ce qui est réussi) — liste de 2-4 points
2. **Points à améliorer** (avec des explications précises) — liste de 2-4 points
3. **Sur le fond** : la problématique est-elle bien posée ? Les arguments sont-ils pertinents ?
4. **Sur la forme** : structure, transitions, introduction/conclusion
5. **Suggestion principale** : une seule chose prioritaire à travailler
6. **Note indicative** /20 avec justification courte

Sois encourageant mais précis. Termine par un mot d'encouragement.` }], 2000);
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
                  const notionsPrinc = [...new Set(textesCh.map((e: any) => e.notion_principale).filter(Boolean))];
                  const notionsSec = [...new Set(textesCh.flatMap((e: any) => e.notions_secondaires || []).filter(Boolean))];
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
          <p className="text-xs text-gray-500 mb-4">L'IA propose un sujet classique et un sujet surprenant</p>

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
                      </div>
                      <p className="text-sm font-bold text-gray-800 mt-1 leading-snug">{sujet}</p>
                      {notionsFromSelected.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {notionsFromSelected.slice(0, 5).map((n: string) => (
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
                ["plan", "📋 Plan guidé", "Génère un plan I/II/III avec le niveau de détail que tu choisis", "border-indigo-300 hover:border-indigo-500", "bg-indigo-600", "text-indigo-700 bg-indigo-50"],
                ["brainstorm", "💬 Brainstorming", "L'IA te guide par des questions socratiques pour développer ta réflexion", "border-teal-300 hover:border-teal-500", "bg-teal-600", "text-teal-700 bg-teal-50"],
                ["corrige", "✏️ Corrigé différé", "Rédige ta dissertation, puis l'IA la corrige et la commente", "border-amber-300 hover:border-amber-500", "bg-amber-600", "text-amber-700 bg-amber-50"],
                ["combined", "🔀 Vue combinée", "Accède aux 3 modes en simultané dans des onglets", "border-purple-300 hover:border-purple-500", "bg-purple-600", "text-purple-700 bg-purple-50"],
              ] as [DissWorkMode, string, string, string, string, string][]).map(([mode, label, desc, border, btnBg, activeBg]) => (
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

      {/* Plan guidé */}
      {workMode === "plan" && (
        <div className="max-w-3xl mx-auto py-6 px-4">
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-5 mb-5">
            <h2 className="font-black text-indigo-800 mb-1 flex items-center gap-2"><ListChecks className="w-5 h-5" /> Plan guidé</h2>
            <p className="text-xs text-indigo-600 mb-4">Choisis ton niveau de détail :</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                [1, "Niveau 1 — Squelette", "Intro (5 étapes) + Thèse / Antithèse / Synthèse + titres de sous-parties + Conclusion"],
                [2, "Niveau 2 — Amorces rédigées", "Structure complète + amorces de rédaction pour chaque sous-partie + transitions"],
                [3, "Niveau 3 — Socratique", "Structure complète + questions socratiques ❓ pour guider ta réflexion"],
                [4, "Niveau 4 — Complet", "Structure + amorces + arguments + exemples des textes + citations + conclusion rédigée"],
              ] as [PlanLevel, string, string][]).map(([lvl, label, desc]) => (
                <button key={lvl} onClick={() => generatePlan(lvl)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${planLevel === lvl && plan ? "border-indigo-500 bg-white ring-2 ring-indigo-100" : "border-indigo-200 bg-white hover:border-indigo-400"}`}>
                  <p className="font-bold text-indigo-800 text-xs">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {planLoading && (
            <div className="flex flex-col items-center py-16">
              <Sparkles className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
              <p className="text-gray-600 font-semibold">Génération du plan niveau {planLevel}…</p>
            </div>
          )}

          {plan && !planLoading && !showRedaction && (
            <button onClick={() => setShowRedaction(true)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md">
              <PenLine className="w-4 h-4" /> Rédiger partie par partie avec l'IA
            </button>
          )}

          {plan && !planLoading && showRedaction && (
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

          {plan && !planLoading && !showRedaction && (
            <div className="space-y-4">
              {/* Plan généré */}
              <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-gray-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Plan — Niveau {planLevel}
                  </h3>
                  <button onClick={() => generatePlan(planLevel)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Regénérer
                  </button>
                </div>
                <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">{plan}</pre>
              </div>

              {/* Explication de la logique */}
              <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-5">
                <h3 className="font-black text-indigo-800 mb-3 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" /> Comprendre la logique de ce plan
                </h3>
                {planLogiqueLoading ? (
                  <div className="flex items-center gap-2 text-indigo-600 text-sm">
                    <Sparkles className="w-4 h-4 animate-spin" /> Analyse de la progression…
                  </div>
                ) : planLogique ? (
                  <p className="text-sm text-indigo-900 leading-relaxed">{planLogique}</p>
                ) : null}

                {/* Chat sur la logique */}
                {showLogiqueChat && (
                  <div className="mt-4 bg-white rounded-xl border border-indigo-200 overflow-hidden">
                    <div className="max-h-48 overflow-y-auto p-3 space-y-2">
                      {planLogiqueMessages.slice(1).map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${msg.role === "user" ? "bg-indigo-600 text-white" : "bg-indigo-50 border border-indigo-200 text-indigo-900"}`}>
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {planLogiqueChatLoading && (
                        <div className="flex justify-start">
                          <div className="bg-indigo-50 rounded-xl px-3 py-2 flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 animate-spin text-indigo-500" />
                            <span className="text-xs text-indigo-600">Réflexion…</span>
                          </div>
                        </div>
                      )}
                      <div ref={planLogiqueRef} />
                    </div>
                    <div className="border-t border-indigo-100 p-2 flex gap-2">
                      <input
                        value={planLogiqueInput}
                        onChange={e => setPlanLogiqueInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendLogiqueQuestion()}
                        className="flex-1 px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 text-gray-800"
                        placeholder="Pose une question sur la logique du plan…"
                        disabled={planLogiqueChatLoading}
                      />
                      <button onClick={sendLogiqueQuestion} disabled={!planLogiqueInput.trim() || planLogiqueChatLoading}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white px-3 py-2 rounded-lg text-sm font-bold transition-all">
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                {!showLogiqueChat && planLogique && (
                  <button onClick={() => setShowLogiqueChat(true)}
                    className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1.5 border border-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-all">
                    <MessageCircle className="w-3.5 h-3.5" /> Poser une question sur ce plan
                  </button>
                )}
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
                  <h3 className="font-black text-amber-700 text-xs uppercase mb-3 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Correction IA</h3>
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
  const [planLevel, setPlanLevel] = useState<PlanLevel>(1);
  const [plan, setPlan] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
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

  const generatePlan = async (level: PlanLevel) => {
    setPlanLevel(level); setPlan(""); setPlanLoading(true);
    const levelPrompts: Record<PlanLevel, string> = {
      1: `Squelette : INTRODUCTION (5 étapes numérotées) + PARTIE I THÈSE / PARTIE II ANTITHÈSE / PARTIE III SYNTHÈSE, chacune avec sous-parties A, B, C (titres courts) + transitions + CONCLUSION (bilan + ouverture). Pas de rédaction.`,
      2: `Plan avec amorces : INTRODUCTION rédigée (5 étapes) + PARTIE I THÈSE / PARTIE II ANTITHÈSE / PARTIE III SYNTHÈSE avec sous-parties A, B, C + une amorce rédigée (1 phrase) par sous-partie + transitions rédigées + CONCLUSION rédigée.`,
      3: `Plan socratique : INTRODUCTION (5 étapes) + PARTIE I THÈSE / PARTIE II ANTITHÈSE / PARTIE III SYNTHÈSE avec sous-parties A, B, C + une question socratique ❓ par sous-partie pour guider l'élève + transitions sous forme de questions + CONCLUSION.`,
      4: `Plan complet : INTRODUCTION rédigée (5 étapes) + PARTIE I THÈSE / PARTIE II ANTITHÈSE / PARTIE III SYNTHÈSE avec sous-parties A, B, C + argument + exemple des textes étudiés + citation par sous-partie + transitions rédigées + CONCLUSION rédigée (bilan + ouverture).`,
    };
    try {
      const data = await callAI([{ role: "user", content:
        `Tu es professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en terminale.
Sujet : "${sujet}" — Chapitres : ${selectedChapters.join(", ")}
${contextForAI ? "\n\nExtraits textes :\n" + contextForAI : ""}
${METHODE_INTRO_C}
${METHODE_PLAN_C}
${levelPrompts[level]}
RÈGLE : Ne jamais confondre Introduction et Partie I. La synthèse introduit un concept NOUVEAU et IMPRÉVU.` }], 2000);
      setPlan(getText(data));
    } catch { setPlan("Erreur."); }
    setPlanLoading(false);
  };

  const sendBrainstorm = async () => {
    if (!brainstormInput.trim() || brainstormLoading) return;
    const userMsg = { role: "user", content: brainstormInput.trim() };
    const newMsgs = [...brainstormMessages, userMsg];
    setBrainstormMessages(newMsgs);
    setBrainstormInput("");
    setBrainstormLoading(true);
    try {
      const data = await callAI([
        { role: "user", content: `Tu es professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en brainstorming socratique. Sujet : "${sujet}". Chapitres : ${selectedChapters.join(", ")}. Contexte : ${contextForAI.slice(0, 1000)}. Guide par questions, 3-5 phrases max, une seule question.` },
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
Correction bienveillante : 1. Points forts 2. Points à améliorer 3. Fond 4. Forme 5. Suggestion prioritaire 6. Note /20` }], 2000);
      setCorrige(getText(data)); setCorrigeSubmitted(true);
    } catch { setCorrige("Erreur."); }
    setCorrigeLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto py-4 px-4">
      <div className="flex gap-2 mb-4">
        {([
          ["plan", "📋 Plan guidé", "border-indigo-500 bg-indigo-50 text-indigo-700"],
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
        <div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {([
              [1, "Squelette", "Titres seuls"],
              [2, "Amorces", "Plan + rédaction"],
              [3, "Socratique", "Plan + questions ❓"],
              [4, "Complet", "Plan + exemples"],
            ] as [PlanLevel, string, string][]).map(([lvl, label, desc]) => (
              <button key={lvl} onClick={() => generatePlan(lvl)}
                className={`p-3 rounded-xl border-2 text-left transition-all ${planLevel === lvl && plan ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-indigo-300"}`}>
                <p className="font-bold text-xs text-indigo-800">Niv.{lvl} — {label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </button>
            ))}
          </div>
          {planLoading ? (
            <div className="flex justify-center py-10"><Sparkles className="w-7 h-7 text-indigo-500 animate-spin" /></div>
          ) : plan ? (
            <div className="bg-white rounded-2xl border-2 border-indigo-200 p-5">
              <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">{plan}</pre>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 font-semibold">Choisis un niveau ci-dessus pour générer le plan</div>
          )}
        </div>
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

// ── QUIZ MODE ─────────────────────────────────────────────────────────────────
function QuizMode({ questions, chapter, eleveNom, onBack }: any) {
  const [prepared] = useState(() => prepareQuiz(questions));
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackMode, setFeedbackMode] = useState("immediate");
  const [quizDone, setQuizDone] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [started, setStarted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [loadingExplan, setLoadingExplan] = useState(false);

  const q = prepared[current];
  const chosen = answers[current];
  const isAnswered = chosen !== undefined;
  const isCorrect = chosen === q?.correctIndex;
  const score = prepared.reduce((s, _, i) => s + (answers[i] === prepared[i].correctIndex ? 1 : 0), 0);
  const pct = Math.round((score / prepared.length) * 100);

  const handleAnswer = (oi: number) => {
    if (feedbackMode === "immediate" && isAnswered) return;
    setAnswers((prev) => ({ ...prev, [current]: oi }));
    setExplanation("");
    if (feedbackMode === "immediate") setShowFeedback(true);
  };

  const handleExplain = async () => {
    setLoadingExplan(true); setExplanation("");
    try {
      const data = await callAI([{ role: "user", content:
        `Question : ${q.question}\nBonne réponse : ${q.options[q.correctIndex]}\nRéponse de l'élève : ${q.options[chosen]}\nExplique en 2-3 phrases simples pourquoi "${q.options[q.correctIndex]}" est la bonne réponse.` }], 500);
      setExplanation(getText(data));
    } catch { setExplanation("Impossible de générer une explication."); }
    setLoadingExplan(false);
  };

  const handleNext = () => { setShowFeedback(false); setExplanation(""); current < prepared.length - 1 ? setCurrent(current + 1) : setQuizDone(true); };

  const handleFinish = async () => {
    setQuizDone(true);
    if (!saved) {
      try { await dbSaveResultat({ chapter, score, total: prepared.length, pourcentage: pct, eleveNom: eleveNom || "Anonyme" }); setSaved(true); }
      catch (e) { console.error(e); }
    }
  };

  const handleRestart = () => { setAnswers({}); setCurrent(0); setShowFeedback(false); setExplanation(""); setQuizDone(false); setReviewMode(false); setSaved(false); };

  const optStyle = (oi: number) => {
    const b = "w-full text-left p-4 rounded-xl border-2 font-medium text-sm transition-all ";
    if (feedbackMode === "immediate" && isAnswered) {
      if (oi === q.correctIndex) return b + "border-green-400 bg-green-50 text-green-800";
      if (oi === chosen) return b + "border-red-400 bg-red-50 text-red-800";
      return b + "border-gray-200 bg-gray-50 text-gray-600 cursor-default";
    }
    if (reviewMode) {
      if (oi === prepared[current].correctIndex) return b + "border-green-400 bg-green-50 text-green-800";
      if (oi === answers[current]) return b + "border-red-400 bg-red-50 text-red-800";
      return b + "border-gray-200 text-gray-600";
    }
    if (chosen === oi) return b + "border-indigo-500 bg-indigo-50 text-indigo-800";
    return b + "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer text-gray-800";
  };

  if (!started) return (
    <div className="flex flex-col items-center justify-center py-10 px-4">
      <div className="bg-white rounded-3xl border-2 border-indigo-200 shadow-lg p-8 max-w-md w-full text-center">
        <Trophy className="w-14 h-14 text-indigo-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Mode Quiz</h2>
        {eleveNom && <p className="text-indigo-600 font-semibold text-sm mb-1">👤 {eleveNom}</p>}
        <p className="text-gray-700 mb-6">{prepared.length} questions</p>
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-800 mb-3">Mode de correction :</p>
          <div className="flex gap-3">
            {[["immediate", "Immédiat"], ["end", "À la fin"]].map(([m, label]) => (
              <button key={m} onClick={() => setFeedbackMode(m)}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${feedbackMode === m ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-700"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setStarted(true)}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all text-lg shadow-lg">
          <Play className="w-5 h-5" /> Commencer
        </button>
        <button onClick={onBack} className="mt-3 text-sm text-gray-600 hover:text-gray-800 font-semibold">← Retour</button>
      </div>
    </div>
  );

  if (quizDone && !reviewMode) {
    const medal = pct >= 90 ? "🥇" : pct >= 70 ? "🥈" : pct >= 50 ? "🥉" : "💪";
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4">
        <div className="bg-white rounded-3xl border-2 border-indigo-200 shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-3">{medal}</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">{score}/{prepared.length} — {pct}%</h2>
          {eleveNom && <p className="text-gray-500 text-sm mb-2">👤 {eleveNom}</p>}
          {saved && <p className="text-green-600 text-sm font-semibold mb-3">✓ Résultat sauvegardé</p>}
          <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
            <div className="h-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: pct + "%" }} />
          </div>
          <div className="flex flex-col gap-3">
            <button onClick={() => { setReviewMode(true); setCurrent(0); }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
              <Eye className="w-4 h-4" /> Revoir mes réponses
            </button>
            <button onClick={handleRestart}
              className="w-full bg-white border-2 border-gray-200 hover:border-indigo-300 text-gray-800 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" /> Recommencer
            </button>
            <button onClick={onBack} className="text-sm text-gray-600 hover:text-gray-800 font-semibold">← Retour</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      {reviewMode && (
        <button onClick={() => setReviewMode(false)} className="mb-4 text-sm text-indigo-600 font-semibold flex items-center gap-1 hover:underline">
          ← Retour aux résultats
        </button>
      )}
      {!reviewMode && (
        <div className="mb-6">
          <div className="flex justify-between text-xs font-semibold text-gray-700 mb-2">
            <span>Question {current + 1} / {prepared.length}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
              style={{ width: (Object.keys(answers).length / prepared.length) * 100 + "%" }} />
          </div>
        </div>
      )}
      <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-sm mb-4">
        <div className="flex items-start gap-3 mb-6">
          <span className="flex-shrink-0 w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-sm font-bold">{current + 1}</span>
          <p className="font-bold text-gray-800 text-lg leading-snug">{q.question}</p>
        </div>
        <div className="space-y-3">
          {q.options.map((opt: string, oi: number) => (
            <button key={oi} onClick={() => !reviewMode && handleAnswer(oi)} className={optStyle(oi)}
              disabled={reviewMode || (feedbackMode === "immediate" && isAnswered)}>
              <span className="mr-3 w-6 h-6 inline-flex items-center justify-center rounded-full border-2 border-current text-xs font-bold">
                {String.fromCharCode(65 + oi)}
              </span>
              {opt}
            </button>
          ))}
        </div>
        {feedbackMode === "immediate" && showFeedback && !reviewMode && (
          <div>
            <div className={`mt-4 p-4 rounded-xl font-semibold text-sm flex items-center gap-2 ${isCorrect ? "bg-green-50 text-green-800 border border-green-300" : "bg-red-50 text-red-800 border border-red-300"}`}>
              {isCorrect ? <Check className="w-5 h-5 text-green-600" /> : <X className="w-5 h-5 text-red-600" />}
              {isCorrect ? "Bonne réponse ! 🎉" : "Incorrect. Bonne réponse : " + q.options[q.correctIndex]}
            </div>
            <button onClick={handleExplain} disabled={loadingExplan}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 font-semibold text-sm rounded-xl transition-all">
              {loadingExplan ? <><Sparkles className="w-4 h-4 animate-spin" /> Analyse en cours…</> : <>💡 Pourquoi cette réponse ?</>}
            </button>
            {explanation && (
              <div className="mt-2 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900 leading-relaxed">
                <p className="font-bold mb-1">Explication :</p>
                <p>{explanation}</p>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={() => { setShowFeedback(false); setExplanation(""); setCurrent(Math.max(0, current - 1)); }} disabled={current === 0}
          className="bg-white border-2 border-gray-200 hover:border-indigo-300 disabled:opacity-40 text-gray-800 font-semibold py-3 px-5 rounded-xl flex items-center gap-2">
          <ChevronLeft className="w-4 h-4" /> Précédente
        </button>
        <div className="flex-1" />
        {current < prepared.length - 1 ? (
          <button onClick={handleNext} disabled={feedbackMode === "immediate" && !isAnswered && !reviewMode}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold py-3 px-5 rounded-xl flex items-center gap-2">
            Suivante <ChevronRight className="w-4 h-4" />
          </button>
        ) : !reviewMode && (
          <button onClick={handleFinish}
            className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold py-3 px-5 rounded-xl flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Terminer
          </button>
        )}
      </div>
    </div>
  );
}

// ── TABLEAU DE BORD ─────────────────────────────────────────────────────────
function Dashboard({ onBack, sharedLib }: any) {
  const [activeTab, setActiveTab] = useState<"qcm" | "notions" | "dissertations" | "revision">("qcm");
  const [resultats, setResultats] = useState<any[]>([]);
  const [dissertations, setDissertations] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodeFilter, setPeriodeFilter] = useState<"semaine" | "mois" | "tout">("tout");
  const [matiereFilter, setMatiereFilter] = useState("all");

  const PHILO = PHILO_NOTIONS_PROGRAMME;
  const HLP_CH = [
    "Éducation, transmission et émancipation",
    "Les expressions de la sensibilité","Les métamorphoses du moi",
    "Création, continuités et ruptures","Histoire et violence","L'humain et ses limites",
  ];

  useEffect(() => {
    Promise.all([dbLoadResultatsAll(), dbLoadDissertations(), dbLoadSessions()])
      .then(([r, d, s]) => { setResultats(r); setDissertations(d); setSessions(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const now = Date.now();
  const filtreTemps = (ts: number) => {
    if (periodeFilter === "semaine") return ts > now - 7 * 24 * 3600 * 1000;
    if (periodeFilter === "mois") return ts > now - 30 * 24 * 3600 * 1000;
    return true;
  };

  const rFiltered = resultats.filter(r => filtreTemps(r.created_at) && (matiereFilter === "all" || true));
  const dFiltered = dissertations.filter(d => filtreTemps(d.created_at));
  const sFiltered = sessions.filter(s => filtreTemps(s.created_at));

  // Stats globales
  const moyenneGenerale = rFiltered.length > 0
    ? Math.round(rFiltered.reduce((s, r) => s + r.pourcentage, 0) / rFiltered.length)
    : 0;

  // Stats par notion (QCM) — basées sur chapter du résultat
  const statsByNotion = (notions: string[]) => notions.map(notion => {
    const matching = rFiltered.filter(r =>
      r.chapter && (r.chapter.toLowerCase().includes(notion.toLowerCase().slice(0, 8)) ||
      notion.toLowerCase().includes((r.chapter || "").toLowerCase().slice(0, 8)))
    );
    const avg = matching.length > 0
      ? Math.round(matching.reduce((s, r) => s + r.pourcentage, 0) / matching.length)
      : null;
    return { notion, avg, count: matching.length };
  }).filter(s => s.count > 0 || true);

  // Textes les plus/moins révisés
  const textesStats = (() => {
    const map: Record<string, { titre: string; count: number; msgs: number }> = {};
    sFiltered.forEach(s => {
      if (!map[s.texte_id]) map[s.texte_id] = { titre: s.texte_titre, count: 0, msgs: 0 };
      map[s.texte_id].count++;
      map[s.texte_id].msgs += s.nb_messages || 0;
    });
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  })();

  // Progression dans le temps (QCM par semaine)
  const progressionParSemaine = (() => {
    const semaines: Record<string, number[]> = {};
    rFiltered.forEach(r => {
      const d = new Date(r.created_at);
      const key = `S${Math.ceil(d.getDate() / 7)} ${d.toLocaleString("fr-FR", { month: "short" })}`;
      if (!semaines[key]) semaines[key] = [];
      semaines[key].push(r.pourcentage);
    });
    return Object.entries(semaines).map(([sem, scores]) => ({
      sem,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      count: scores.length,
    }));
  })();

  // Comparaison élèves anonymisée
  const statsParEleve = (() => {
    const map: Record<string, number[]> = {};
    rFiltered.forEach(r => {
      const nom = r.eleve_nom || "Anonyme";
      if (!map[nom]) map[nom] = [];
      map[nom].push(r.pourcentage);
    });
    return Object.entries(map)
      .map(([nom, scores]) => ({
        nom,
        avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        count: scores.length,
      }))
      .sort((a, b) => b.avg - a.avg);
  })();

  const tabs = [
    ["qcm", "✅ QCM", rFiltered.length],
    ["notions", "🎯 Notions", null],
    ["dissertations", "✍️ Dissertations", dFiltered.length],
    ["revision", "📖 Révision", sFiltered.length],
  ] as [string, string, number | null][];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 text-gray-600 hover:text-indigo-600 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-gray-800">📊 Tableau de bord</h1>
          </div>
          {/* Filtres période */}
          <div className="flex gap-2">
            {([["semaine","7 jours"],["mois","30 jours"],["tout","Tout"]] as [string,string][]).map(([val, label]) => (
              <button key={val} onClick={() => setPeriodeFilter(val as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${periodeFilter === val ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {/* Onglets */}
        <div className="max-w-6xl mx-auto px-6 flex gap-1 pb-0">
          {tabs.map(([tab, label, count]) => (
            <button key={tab} onClick={() => setActiveTab(tab as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${activeTab === tab ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {label}
              {count !== null && count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {loading ? (
          <div className="text-center py-20 text-gray-600 font-semibold">Chargement…</div>
        ) : (
          <>
            {/* ── ONGLET QCM ── */}
            {activeTab === "qcm" && (
              <div className="space-y-6">
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    ["Quiz effectués", rFiltered.length, "text-indigo-700", "bg-indigo-50"],
                    ["Moyenne générale", moyenneGenerale + "%", moyenneGenerale >= 70 ? "text-green-700" : moyenneGenerale >= 50 ? "text-orange-600" : "text-red-600", "bg-white"],
                    ["Réussis (≥70%)", rFiltered.filter(r => r.pourcentage >= 70).length, "text-green-700", "bg-green-50"],
                    ["Élèves actifs", new Set(rFiltered.map(r => r.eleve_nom)).size, "text-purple-700", "bg-purple-50"],
                  ].map(([label, val, color, bg]) => (
                    <div key={label as string} className={`${bg} rounded-2xl border border-gray-200 p-5 text-center shadow-sm`}>
                      <div className={`text-3xl font-black ${color}`}>{val}</div>
                      <div className="text-sm font-semibold text-gray-600 mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Progression dans le temps */}
                {progressionParSemaine.length > 1 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <h3 className="font-black text-gray-800 mb-4">📈 Progression dans le temps</h3>
                    <div className="flex items-end gap-2 h-32">
                      {progressionParSemaine.map(({ sem, avg, count }) => (
                        <div key={sem} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-xs font-bold text-gray-700">{avg}%</span>
                          <div className="w-full rounded-t-lg transition-all"
                            style={{
                              height: `${(avg / 100) * 100}px`,
                              backgroundColor: avg >= 70 ? "#22c55e" : avg >= 50 ? "#f97316" : "#ef4444",
                            }} />
                          <span className="text-xs text-gray-400">{sem}</span>
                          <span className="text-xs text-gray-400">{count} quiz</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comparaison élèves */}
                {statsParEleve.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <h3 className="font-black text-gray-800 mb-4">👥 Comparaison élèves (anonymisée)</h3>
                    <div className="space-y-2">
                      {statsParEleve.map(({ nom, avg, count }, i) => (
                        <div key={nom} className="flex items-center gap-3">
                          <span className="w-6 text-xs font-black text-gray-400 text-right">{i + 1}</span>
                          <span className="w-32 text-sm font-bold text-gray-700 truncate">{nom}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-3">
                            <div className="h-3 rounded-full transition-all"
                              style={{ width: `${avg}%`, backgroundColor: avg >= 70 ? "#22c55e" : avg >= 50 ? "#f97316" : "#ef4444" }} />
                          </div>
                          <span className={`text-sm font-black w-12 text-right ${avg >= 70 ? "text-green-700" : avg >= 50 ? "text-orange-600" : "text-red-600"}`}>{avg}%</span>
                          <span className="text-xs text-gray-400 w-16">{count} quiz</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tableau détaillé */}
                {rFiltered.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>{["Date", "Élève", "Chapitre", "Score", "Résultat"].map(h => (
                          <th key={h} className="text-left px-5 py-3 font-bold text-gray-700">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rFiltered.slice(0, 50).map((r: any) => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-gray-700 text-xs">
                              {new Date(r.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="px-5 py-3"><span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{r.eleve_nom || "Anonyme"}</span></td>
                            <td className="px-5 py-3"><span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{r.chapter}</span></td>
                            <td className="px-5 py-3 font-bold text-gray-800">{r.score}/{r.total}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-2">
                                  <div className={`h-2 rounded-full ${r.pourcentage >= 70 ? "bg-green-500" : r.pourcentage >= 50 ? "bg-orange-500" : "bg-red-500"}`}
                                    style={{ width: r.pourcentage + "%" }} />
                                </div>
                                <span className={`text-sm font-bold ${r.pourcentage >= 70 ? "text-green-700" : r.pourcentage >= 50 ? "text-orange-600" : "text-red-600"}`}>{r.pourcentage}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {rFiltered.length === 0 && (
                  <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                    <div className="text-5xl mb-4">📭</div>
                    <p className="text-xl font-bold text-gray-600">Aucun quiz pour cette période</p>
                  </div>
                )}
              </div>
            )}

            {/* ── ONGLET NOTIONS ── */}
            {activeTab === "notions" && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h3 className="font-black text-gray-800 mb-2">🎯 Maîtrise par notion — Philosophie</h3>
                  <p className="text-xs text-gray-500 mb-4">Basé sur les QCM. Les cases grises = aucun QCM sur cette notion.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {statsByNotion(PHILO).map(({ notion, avg, count }) => (
                      <div key={notion} className={`p-3 rounded-xl border-2 ${
                        avg === null ? "border-gray-200 bg-gray-50" :
                        avg >= 70 ? "border-green-300 bg-green-50" :
                        avg >= 50 ? "border-orange-300 bg-orange-50" :
                        "border-red-300 bg-red-50"
                      }`}>
                        <p className="text-xs font-bold text-gray-700 mb-1 truncate">{notion}</p>
                        {avg !== null ? (
                          <>
                            <p className={`text-2xl font-black ${avg >= 70 ? "text-green-700" : avg >= 50 ? "text-orange-600" : "text-red-600"}`}>{avg}%</p>
                            <p className="text-xs text-gray-500">{count} quiz</p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-400 font-semibold">— aucun quiz</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h3 className="font-black text-gray-800 mb-2">📜 Maîtrise par chapitre — HLP</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {statsByNotion(HLP_CH).map(({ notion, avg, count }) => (
                      <div key={notion} className={`p-3 rounded-xl border-2 ${
                        avg === null ? "border-gray-200 bg-gray-50" :
                        avg >= 70 ? "border-green-300 bg-green-50" :
                        avg >= 50 ? "border-orange-300 bg-orange-50" :
                        "border-red-300 bg-red-50"
                      }`}>
                        <p className="text-xs font-bold text-gray-700 mb-1">{notion}</p>
                        {avg !== null ? (
                          <>
                            <p className={`text-2xl font-black ${avg >= 70 ? "text-green-700" : avg >= 50 ? "text-orange-600" : "text-red-600"}`}>{avg}%</p>
                            <p className="text-xs text-gray-500">{count} quiz</p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-400 font-semibold">— aucun quiz</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notions les moins bien maîtrisées */}
                {(() => {
                  const weak = statsByNotion([...PHILO, ...HLP_CH])
                    .filter(s => s.avg !== null && s.avg < 60)
                    .sort((a, b) => (a.avg || 0) - (b.avg || 0))
                    .slice(0, 5);
                  return weak.length > 0 ? (
                    <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5">
                      <h3 className="font-black text-red-800 mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Notions à renforcer en priorité
                      </h3>
                      <div className="space-y-2">
                        {weak.map(({ notion, avg, count }) => (
                          <div key={notion} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-red-200">
                            <span className="flex-1 text-sm font-bold text-gray-800">{notion}</span>
                            <span className="text-xs text-gray-500">{count} quiz</span>
                            <span className="text-lg font-black text-red-600">{avg}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            {/* ── ONGLET DISSERTATIONS ── */}
            {activeTab === "dissertations" && (
              <div className="space-y-4">
                {/* KPIs */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    ["Dissertations soumises", dFiltered.length, "text-rose-700"],
                    ["Notions travaillées", new Set(dFiltered.map(d => d.notion_principale).filter(Boolean)).size, "text-purple-700"],
                    ["Élèves actifs", new Set(dFiltered.map(d => d.eleve_nom)).size, "text-indigo-700"],
                  ].map(([label, val, color]) => (
                    <div key={label as string} className="bg-white rounded-2xl border border-gray-200 p-5 text-center shadow-sm">
                      <div className={`text-3xl font-black ${color}`}>{val}</div>
                      <div className="text-sm font-semibold text-gray-600 mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Dissertations par notion */}
                {dFiltered.length > 0 && (() => {
                  const byNotion: Record<string, number> = {};
                  dFiltered.forEach(d => {
                    const n = d.notion_principale || "Non classée";
                    byNotion[n] = (byNotion[n] || 0) + 1;
                  });
                  return (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                      <h3 className="font-black text-gray-800 mb-3">Dissertations par notion</h3>
                      <div className="space-y-2">
                        {Object.entries(byNotion).sort((a, b) => b[1] - a[1]).map(([notion, count]) => (
                          <div key={notion} className="flex items-center gap-3">
                            <span className="flex-1 text-sm font-semibold text-gray-700">{notion}</span>
                            <div className="w-32 bg-gray-100 rounded-full h-2">
                              <div className="h-2 rounded-full bg-rose-400"
                                style={{ width: `${(count / dFiltered.length) * 100}%` }} />
                            </div>
                            <span className="text-sm font-black text-rose-700 w-8 text-right">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Liste des dissertations */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h3 className="font-black text-gray-800">Copies soumises</h3>
                  </div>
                  {dFiltered.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 font-semibold">Aucune dissertation soumise pour cette période</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {dFiltered.map((d: any) => (
                        <div key={d.id} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-800 italic">"{d.sujet}"</p>
                              <div className="flex gap-2 mt-1 flex-wrap">
                                <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{d.eleve_nom || "Anonyme"}</span>
                                {d.notion_principale && <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-semibold">🎯 {d.notion_principale}</span>}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${d.matiere === "philosophie" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                                  {d.matiere === "philosophie" ? "🧠 Philo" : "📜 HLP"}
                                </span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {new Date(d.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                            </span>
                          </div>
                          {d.texte_eleve && (
                            <details className="mt-2">
                              <summary className="text-xs text-indigo-600 font-semibold cursor-pointer hover:text-indigo-800">Voir la copie ({d.texte_eleve.split(" ").length} mots)</summary>
                              <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">{d.texte_eleve}</div>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── ONGLET RÉVISION ── */}
            {activeTab === "revision" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    ["Sessions de révision", sFiltered.length, "text-green-700"],
                    ["Messages échangés", sFiltered.reduce((s, r) => s + (r.nb_messages || 0), 0), "text-teal-700"],
                    ["Textes consultés", new Set(sFiltered.map(s => s.texte_id)).size, "text-indigo-700"],
                  ].map(([label, val, color]) => (
                    <div key={label as string} className="bg-white rounded-2xl border border-gray-200 p-5 text-center shadow-sm">
                      <div className={`text-3xl font-black ${color}`}>{val}</div>
                      <div className="text-sm font-semibold text-gray-600 mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Textes les plus révisés */}
                {textesStats.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <h3 className="font-black text-gray-800 mb-3">📚 Textes les plus révisés</h3>
                    <div className="space-y-2">
                      {textesStats.slice(0, 10).map(([id, { titre, count, msgs }]) => (
                        <div key={id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-800 truncate">{titre || "Texte sans titre"}</p>
                          </div>
                          <span className="text-xs text-gray-500">{msgs} messages</span>
                          <div className="w-24 bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full bg-teal-400"
                              style={{ width: `${(count / textesStats[0][1].count) * 100}%` }} />
                          </div>
                          <span className="text-sm font-black text-teal-700 w-12 text-right">{count} sess.</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Textes jamais révisés */}
                {(() => {
                  const revisesIds = new Set(sessions.map(s => s.texte_id));
                  const nonRevises = (sharedLib || []).filter((t: any) => !revisesIds.has(t.id));
                  return nonRevises.length > 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                      <h3 className="font-black text-amber-800 mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Textes jamais révisés ({nonRevises.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {nonRevises.slice(0, 15).map((t: any) => (
                          <span key={t.id} className="text-xs bg-white border border-amber-200 text-amber-800 px-2 py-1 rounded-lg font-semibold">
                            {t.work_title || t.author || "Sans titre"}
                          </span>
                        ))}
                        {nonRevises.length > 15 && <span className="text-xs text-amber-600 font-semibold">+{nonRevises.length - 15} autres</span>}
                      </div>
                    </div>
                  ) : null;
                })()}

                {sFiltered.length === 0 && (
                  <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                    <div className="text-5xl mb-4">📭</div>
                    <p className="text-xl font-bold text-gray-600">Aucune session de révision enregistrée</p>
                    <p className="text-sm text-gray-400 mt-1">Les sessions seront enregistrées automatiquement quand les élèves utiliseront le mode révision</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function QCMApp() {
  const [role, setRole] = useState<string | null>(null);
  const [eleveNom, setEleveNom] = useState<string>(() => {
    try { return localStorage.getItem("qcm_eleve_nom") || ""; } catch { return ""; }
  });
  const [sharedLib, setSharedLib] = useState<any[]>([]);
  const [libLoaded, setLibLoaded] = useState(false);
  const [quizData, setQuizData] = useState<any | null>(null);
  const [revisionData, setRevisionData] = useState<any | null>(null);
  const [dissertationData, setDissertationData] = useState<any | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);

  const loadLib = async () => {
    try { const data = await dbLoadTextes(); setSharedLib(data); } catch (e) { console.error(e); }
    setLibLoaded(true);
  };

  useEffect(() => { loadLib(); }, []);

  // Mémoriser le nom élève dans localStorage
  const saveEleveNom = (nom: string) => {
    setEleveNom(nom);
    try { if (nom.trim()) localStorage.setItem("qcm_eleve_nom", nom.trim()); } catch {}
  };

  const matiere = role === "eleve-HLP" ? "hlp" : role === "eleve-Philosophie" ? "philosophie" : null;
  const dissertMatiere = role === "eleve-HLP-dissertation" ? "hlp" : role === "eleve-Philosophie-dissertation" ? "philosophie" : null;

  if (showDashboard) return <Dashboard onBack={() => setShowDashboard(false)} sharedLib={sharedLib} />;

  // Accès direct au mode dissertation depuis l'accueil
  if (dissertMatiere && !dissertationData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50">
        <div className="bg-white border-b-2 border-rose-200 shadow-sm sticky top-0 z-30">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PenLine className="w-6 h-6 text-rose-600" />
              <h1 className="text-xl font-bold text-gray-800">Mode <span className="text-rose-600">Dissertation</span> — {dissertMatiere === "hlp" ? "📜 HLP" : "🧠 Philosophie"}</h1>
            </div>
            <button onClick={() => setRole(null)} className="text-sm font-semibold text-gray-600 hover:text-gray-800 flex items-center gap-1">
              <X className="w-4 h-4" /> Accueil
            </button>
          </div>
        </div>
        <DissertationMode
          sharedLib={sharedLib}
          matiere={dissertMatiere}
          eleveNom={eleveNom}
          onBack={() => setRole(null)}
        />
      </div>
    );
  }

  if (quizData) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
      <div className="bg-white border-b-2 border-indigo-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-800">Mode <span className="text-indigo-500">Quiz</span></h1>
          </div>
          <button onClick={() => setQuizData(null)} className="text-sm font-semibold text-gray-600 hover:text-gray-800 flex items-center gap-1">
            <X className="w-4 h-4" /> Quitter
          </button>
        </div>
      </div>
      <div className="max-w-3xl mx-auto">
        <QuizMode questions={quizData.questions} chapter={quizData.chapter} eleveNom={eleveNom} onBack={() => setQuizData(null)} />
      </div>
    </div>
  );

  if (revisionData) return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <div className="bg-white border-b-2 border-green-200 shadow-sm flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-green-600" />
            <h1 className="text-xl font-bold text-gray-800">Mode <span className="text-green-600">Révision</span></h1>
          </div>
          <button onClick={() => setRevisionData(null)} className="text-sm font-semibold text-gray-600 hover:text-gray-800 flex items-center gap-1">
            <X className="w-4 h-4" /> Quitter
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <RevisionMode entries={revisionData.entries} chapter={revisionData.chapter} onBack={() => setRevisionData(null)} allTextes={sharedLib.filter((t: any) => t.matiere === (revisionData.entries[0]?.matiere || "hlp"))} eleveNom={eleveNom} />
      </div>
    </div>
  );

  if (dissertationData) return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50">
      <div className="bg-white border-b-2 border-rose-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PenLine className="w-6 h-6 text-rose-600" />
            <h1 className="text-xl font-bold text-gray-800">Mode <span className="text-rose-600">Dissertation</span></h1>
          </div>
          <button onClick={() => setDissertationData(null)} className="text-sm font-semibold text-gray-600 hover:text-gray-800 flex items-center gap-1">
            <X className="w-4 h-4" /> Quitter
          </button>
        </div>
      </div>
      <DissertationMode
        sharedLib={sharedLib}
        matiere={dissertationData.matiere}
        eleveNom={eleveNom}
        onBack={() => setDissertationData(null)}
      />
    </div>
  );

  if (!role) return <HomeScreen onSelect={(r: string) => setRole(r)} eleveNom={eleveNom} setEleveNom={setEleveNom} />;
  if (role === "prof") return (
    <ProfMode sharedLib={sharedLib} setSharedLib={setSharedLib} onLogout={() => setRole(null)}
      libLoaded={libLoaded} onReload={loadLib} onDashboard={() => setShowDashboard(true)} />
  );
  return (
    <EleveMode matiere={matiere!} sharedLib={sharedLib} libLoaded={libLoaded} eleveNom={eleveNom}
      onBack={() => setRole(null)} onStartQuiz={setQuizData} onStartRevision={setRevisionData}
      onStartDissertation={(data: any) => setDissertationData(data)} onRefresh={loadLib} />
  );
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function HomeScreen({ onSelect, eleveNom, setEleveNom, saveEleveNom }: any) {
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [pseudoInput, setPseudoInput] = useState(eleveNom || "");

  const verifyProfCode = async () => {
    if (!code.trim()) return;
    setChecking(true);
    setErr("");
    try {
      // Vérifier d'abord en BDD, fallback sur "prof1234" si config absente
      const storedCode = await dbGetConfig("prof_code");
      const validCode = storedCode || "prof1234";
      if (code === validCode) {
        onSelect("prof");
      } else {
        setErr("Code incorrect");
      }
    } catch {
      // En cas d'erreur Supabase, fallback local
      if (code === "prof1234") { onSelect("prof"); }
      else { setErr("Code incorrect"); }
    }
    setChecking(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-blue-50 to-purple-100 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">📚</div>
        <h1 className="text-4xl font-black text-gray-800 mb-2">QCM Entraînement</h1>
        <p className="text-gray-700 text-lg">Choisissez votre profil</p>
      </div>

      <div className="w-full max-w-2xl mb-6">
        <div className="bg-white rounded-2xl border-2 border-gray-200 px-5 py-4 flex items-center gap-3 shadow-sm">
          <User className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input value={pseudoInput} onChange={(e) => { setPseudoInput(e.target.value); setEleveNom(e.target.value); }} onBlur={(e) => saveEleveNom && saveEleveNom(e.target.value)}
            className="flex-1 text-sm font-semibold text-gray-800 bg-transparent border-none outline-none placeholder-gray-400"
            placeholder="Ton prénom ou pseudo (optionnel)" />
          {pseudoInput && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Enregistré</span>}
        </div>
      </div>

      {/* Cartes élèves HLP + Philosophie */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl mb-4">
        <button onClick={() => onSelect("eleve-HLP")}
          className="flex-1 bg-white rounded-3xl border-2 border-emerald-200 shadow-lg p-7 hover:border-emerald-400 hover:shadow-xl transition-all group text-center">
          <div className="text-5xl mb-3">📜</div>
          <h2 className="text-xl font-bold text-gray-800 mb-1 group-hover:text-emerald-700 transition-colors">Élève HLP</h2>
          <p className="text-gray-500 text-sm">Humanités, Littérature & Philosophie</p>
        </button>
        <button onClick={() => onSelect("eleve-Philosophie")}
          className="flex-1 bg-white rounded-3xl border-2 border-blue-200 shadow-lg p-7 hover:border-blue-400 hover:shadow-xl transition-all group text-center">
          <div className="text-5xl mb-3">🧠</div>
          <h2 className="text-xl font-bold text-gray-800 mb-1 group-hover:text-blue-700 transition-colors">Élève Philosophie</h2>
          <p className="text-gray-500 text-sm">Terminale générale & STMG</p>
        </button>
      </div>

      {/* Carte Dissertation */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl mb-4">
        <button onClick={() => onSelect("eleve-HLP-dissertation")}
          className="flex-1 bg-white rounded-3xl border-2 border-rose-200 shadow-lg p-6 hover:border-rose-400 hover:shadow-xl transition-all group text-center">
          <div className="text-4xl mb-2">✍️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-1 group-hover:text-rose-700 transition-colors">Dissertation HLP</h2>
          <p className="text-gray-500 text-sm">Sujets inédits croisant plusieurs notions</p>
        </button>
        <button onClick={() => onSelect("eleve-Philosophie-dissertation")}
          className="flex-1 bg-white rounded-3xl border-2 border-pink-200 shadow-lg p-6 hover:border-pink-400 hover:shadow-xl transition-all group text-center">
          <div className="text-4xl mb-2">🖊️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-1 group-hover:text-pink-700 transition-colors">Dissertation Philo</h2>
          <p className="text-gray-500 text-sm">Sujets inédits croisant plusieurs notions</p>
        </button>
      </div>

      {/* Carte Prof */}
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-lg p-6 hover:border-purple-400 transition-all text-center">
          <div className="text-4xl mb-2">👩‍🏫</div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">Professeur</h2>
          <p className="text-gray-500 text-sm mb-4">Gérer la bibliothèque de textes</p>
          {!showCode ? (
            <button onClick={() => setShowCode(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-6 rounded-xl text-sm flex items-center justify-center gap-2 transition-all mx-auto">
              <Lock className="w-4 h-4" /> Accéder
            </button>
          ) : (
            <div className="max-w-xs mx-auto">
              <input type="password" value={code} onChange={(e) => { setCode(e.target.value); setErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && verifyProfCode()}
                className="w-full p-2.5 border-2 border-purple-300 rounded-xl text-sm text-center mb-2 focus:border-purple-500 focus:outline-none text-gray-800"
                placeholder="Code professeur" autoFocus />
              {err && <p className="text-red-500 text-xs mb-2">{err}</p>}
              <button onClick={verifyProfCode} disabled={checking}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-bold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2">
                {checking ? <><Sparkles className="w-4 h-4 animate-spin" /> Vérification…</> : "Entrer"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



// ── GESTION NOTIONS PROF ──────────────────────────────────────────────────────
function GestionNotionsProf({ sharedLib, onReload }: any) {
  const [saving, setSaving] = useState<string | null>(null);
  const [filterMatiere, setFilterMatiere] = useState("all");
  const [filterNotion, setFilterNotion] = useState("all");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotionPrincipale, setEditNotionPrincipale] = useState("");
  const [editNotionsSecondaires, setEditNotionsSecondaires] = useState<string[]>([]);

  const PHILO = PHILO_NOTIONS_PROGRAMME;
  const HLP = [
    "Éducation, transmission et émancipation",
    "Les expressions de la sensibilité",
    "Les métamorphoses du moi",
    "Création, continuités et ruptures",
    "Histoire et violence",
    "L'humain et ses limites",
  ];

  const filtered = sharedLib.filter((e: any) => {
    const matchMat = filterMatiere === "all" || (e.matiere || "hlp") === filterMatiere;
    const matchNotion = filterNotion === "all"
      || e.notion_principale === filterNotion
      || (e.notions_secondaires || []).includes(filterNotion);
    const matchSearch = !search || (e.work_title || "").toLowerCase().includes(search.toLowerCase())
      || (e.author || "").toLowerCase().includes(search.toLowerCase());
    return matchMat && matchNotion && matchSearch;
  });

  const notions = filterMatiere === "philosophie" ? PHILO : filterMatiere === "hlp" ? HLP : [...PHILO, ...HLP];

  const startEdit = (entry: any) => {
    setEditingId(entry.id);
    setEditNotionPrincipale(entry.notion_principale || "");
    setEditNotionsSecondaires(entry.notions_secondaires || []);
  };

  const saveNotions = async (entry: any) => {
    setSaving(entry.id);
    try {
      await dbUpdateTexte(entry.id, {
        chapter: entry.chapter,
        author: entry.author,
        workTitle: entry.work_title,
        content: entry.content,
        type: entry.type,
        matiere: entry.matiere,
        notion_principale: editNotionPrincipale,
        notions_secondaires: editNotionsSecondaires,
      });
      await onReload();
      setEditingId(null);
    } catch (e) { console.error(e); }
    setSaving(null);
  };

  const toggleSecondaire = (n: string) => {
    setEditNotionsSecondaires(prev =>
      prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]
    );
  };

  // Compte des textes par notion
  const countByNotion = (notion: string) =>
    sharedLib.filter((e: any) =>
      e.notion_principale === notion || (e.notions_secondaires || []).includes(notion)
    ).length;

  return (
    <div className="space-y-5">
      {/* Vue d'ensemble : couverture des notions */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-black text-gray-800 mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-600" /> Couverture des notions du programme
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {PHILO.map(n => {
            const count = countByNotion(n);
            return (
              <div key={n} className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${count > 0 ? "border-indigo-200 bg-indigo-50 text-indigo-800" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                <span className="truncate">{n}</span>
                <span className={`flex-shrink-0 font-black px-1.5 py-0.5 rounded-full text-xs ${count > 0 ? "bg-indigo-200 text-indigo-800" : "bg-gray-200 text-gray-500"}`}>{count}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs font-black text-emerald-700 mb-2">Chapitres HLP</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {HLP.map(n => {
              const count = countByNotion(n);
              return (
                <div key={n} className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${count > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-gray-50 text-gray-400"}`}>
                  <span className="truncate">{n}</span>
                  <span className={`flex-shrink-0 font-black px-1.5 py-0.5 rounded-full text-xs ${count > 0 ? "bg-emerald-200 text-emerald-800" : "bg-gray-200 text-gray-500"}`}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none text-gray-800"
            placeholder="Rechercher un texte…" />
        </div>
        <select value={filterMatiere} onChange={e => { setFilterMatiere(e.target.value); setFilterNotion("all"); }}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none">
          <option value="all">Toutes matières</option>
          <option value="philosophie">🧠 Philosophie</option>
          <option value="hlp">📜 HLP</option>
        </select>
        <select value={filterNotion} onChange={e => setFilterNotion(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none">
          <option value="all">Toutes notions</option>
          <optgroup label="Sans notion assignée">
            <option value="__aucune__">⚠️ Sans notion principale</option>
          </optgroup>
          <optgroup label="Notions">
            {notions.map(n => <option key={n} value={n}>{n}</option>)}
          </optgroup>
        </select>
      </div>

      {/* Alerte textes sans notion */}
      {(() => {
        const sansNotion = sharedLib.filter((e: any) => !e.notion_principale).length;
        return sansNotion > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-800 font-semibold">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {sansNotion} texte{sansNotion > 1 ? "s" : ""} sans notion principale — ils ne seront pas trouvés par les élèves en mode "Par notions"
            <button onClick={() => setFilterNotion("__aucune__")} className="ml-auto text-xs underline hover:no-underline">Voir</button>
          </div>
        ) : null;
      })()}

      {/* Liste des textes */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-bold text-gray-700">{filtered.length} texte{filtered.length > 1 ? "s" : ""}</span>
          <span className="text-xs text-gray-400">Clique sur un texte pour assigner ses notions</span>
        </div>
        <div className="divide-y divide-gray-50">
          {filtered
            .filter((e: any) => filterNotion !== "__aucune__" || !e.notion_principale)
            .map((entry: any) => (
            <div key={entry.id} className="p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${(entry.matiere || "hlp") === "hlp" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                      {(entry.matiere || "hlp") === "hlp" ? "📜 HLP" : "🧠 Philo"}
                    </span>
                    <span className="text-xs text-gray-500 font-semibold">{entry.chapter || "Sans chapitre"}</span>
                  </div>
                  <p className="text-sm font-bold text-gray-800">{entry.work_title || entry.author || "Sans titre"}</p>
                  {entry.author && <p className="text-xs text-gray-500">{entry.author}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {entry.notion_principale && (
                    <span className="text-xs bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-bold">🎯 {entry.notion_principale}</span>
                  )}
                  {!entry.notion_principale && (
                    <span className="text-xs bg-amber-100 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">⚠️ Non assigné</span>
                  )}
                  <button onClick={() => editingId === entry.id ? setEditingId(null) : startEdit(entry)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${editingId === entry.id ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"}`}>
                    {editingId === entry.id ? "✕ Fermer" : "✏️ Assigner"}
                  </button>
                </div>
              </div>

              {/* Panel d'édition inline */}
              {editingId === entry.id && (
                <div className="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Notion principale */}
                    <div>
                      <label className="text-xs font-black text-rose-700 uppercase mb-2 block">🎯 Notion principale</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {((entry.matiere || "hlp") === "philosophie" ? PHILO : HLP).map(n => (
                          <button key={n} onClick={() => setEditNotionPrincipale(editNotionPrincipale === n ? "" : n)}
                            className={`text-left text-xs px-2.5 py-2 rounded-lg border-2 font-semibold transition-all ${editNotionPrincipale === n ? "border-rose-500 bg-rose-50 text-rose-700" : "border-gray-200 bg-white text-gray-600 hover:border-rose-300"}`}>
                            {editNotionPrincipale === n && "✓ "}{n}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Notions secondaires */}
                    <div>
                      <label className="text-xs font-black text-gray-600 uppercase mb-2 block">Notions secondaires</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {((entry.matiere || "hlp") === "philosophie" ? PHILO : HLP)
                          .filter(n => n !== editNotionPrincipale)
                          .map(n => {
                            const isSel = editNotionsSecondaires.includes(n);
                            return (
                              <button key={n} onClick={() => toggleSecondaire(n)}
                                className={`text-left text-xs px-2.5 py-2 rounded-lg border-2 font-semibold transition-all ${isSel ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-500 hover:border-indigo-300"}`}>
                                {isSel && "✓ "}{n}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                  {/* Récap + bouton sauvegarder */}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {editNotionPrincipale && (
                        <span className="text-xs bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-bold">🎯 {editNotionPrincipale}</span>
                      )}
                      {editNotionsSecondaires.map(n => (
                        <span key={n} className="text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">{n}</span>
                      ))}
                    </div>
                    <button onClick={() => saveNotions(entry)}
                      disabled={saving === entry.id}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all">
                      {saving === entry.id ? <><Sparkles className="w-3 h-3 animate-spin" /> Enregistrement…</> : <><Check className="w-3 h-3" /> Sauvegarder</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Affichage notions secondaires existantes */}
              {editingId !== entry.id && (entry.notions_secondaires || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {(entry.notions_secondaires || []).map((n: string) => (
                    <span key={n} className="text-xs bg-indigo-100 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full">{n}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── BANQUE SUJETS PROF ────────────────────────────────────────────────────────
function BanqueSujetsProf() {
  const [sujets, setSujets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [filterMatiere, setFilterMatiere] = useState("all");
  const [filterNotion, setFilterNotion] = useState("all");
  const [importText, setImportText] = useState("");
  const [importMatiere, setImportMatiere] = useState("philosophie");
  const [importNotion, setImportNotion] = useState("");
  const [importSource, setImportSource] = useState("Bac");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pendingImport, setPendingImport] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const PHILO_NOTIONS_LIST = [
    "L'art","Le bonheur","La conscience","Le devoir","L'État",
    "L'inconscient","La justice","Le langage","La liberté","La nature",
    "La raison","La religion","La science","La technique","Le temps",
    "Le travail","La vérité",
  ];
  const HLP_CHAPITRES_LIST = [
    "Éducation, transmission et émancipation",
    "Les expressions de la sensibilité",
    "Les métamorphoses du moi",
    "Création, continuités et ruptures",
    "Histoire et violence",
    "L'humain et ses limites",
  ];

  const load = async () => {
    setLoading(true);
    try {
      const data = await dbLoadSujetsBac(filterMatiere === "all" ? undefined : filterMatiere);
      setSujets(data);
      const t = await dbCountSujetsBac();
      setTotal(t);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterMatiere]);

  const notions = filterMatiere === "philosophie" ? PHILO_NOTIONS_LIST : filterMatiere === "hlp" ? HLP_CHAPITRES_LIST : [...PHILO_NOTIONS_LIST, ...HLP_CHAPITRES_LIST];

  const filtered = sujets.filter(s => {
    const matchNotion = filterNotion === "all" || (s.notion_principale || "") === filterNotion;
    const matchSearch = !searchTerm || s.sujet.toLowerCase().includes(searchTerm.toLowerCase());
    return matchNotion && matchSearch;
  });

  // Analyse IA des sujets collés
  const analyzeAndImport = async () => {
    const lines = importText.split("\n").map(l => l.trim()).filter(l => l.length > 5 && l.includes("?"));
    if (!lines.length) return;
    setIsAnalyzing(true);
    try {
      const notionsList = importMatiere === "philosophie" ? PHILO_NOTIONS_LIST.join(", ") : HLP_CHAPITRES_LIST.join(", ");
      const data = await callAI([{ role: "user", content:
        `Tu es un expert en ${importMatiere === "philosophie" ? "Philosophie" : "HLP"} au bac.
Voici une liste de sujets de dissertation. Pour chacun, identifie la ou les notions principales parmi : ${notionsList}

Sujets :
${lines.map((l, i) => `${i+1}. ${l}`).join("\n")}

Réponds UNIQUEMENT en JSON (tableau) :
[{"sujet":"...","notions":["notion1","notion2"],"notion_principale":"notion principale"}]
Un objet par sujet, dans le même ordre.` }], 2000);
      const parsed = parseJSON(getText(data));
      const prepared = parsed.map((item: any, i: number) => ({
        id: `import-${Date.now()}-${i}`,
        sujet: item.sujet || lines[i],
        matiere: importMatiere,
        notions: item.notions || [],
        notion_principale: item.notion_principale || importNotion || "",
        source: importSource || "Import prof",
      }));
      setPendingImport(prepared);
    } catch (e) { console.error(e); }
    setIsAnalyzing(false);
  };

  const saveImport = async () => {
    setIsSaving(true);
    let ok = 0;
    for (const s of pendingImport) {
      try { await dbInsertSujetBac({ ...s, id: uid() }); ok++; } catch {}
    }
    setPendingImport([]);
    setImportText("");
    await load();
    setIsSaving(false);
    alert(`${ok} sujet${ok > 1 ? "s" : ""} importé${ok > 1 ? "s" : ""} avec succès !`);
  };

  const deleteSujet = async (id: string) => {
    if (!confirm("Supprimer ce sujet ?")) return;
    try { await dbDeleteSujetBac(id); setSujets(prev => prev.filter(s => s.id !== id)); } catch {}
  };

  const updatePending = (i: number, field: string, val: any) => {
    setPendingImport(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  };

  return (
    <div className="space-y-6">
      {/* Statistiques */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Total sujets", total, "text-rose-700"],
          ["Philosophie", sujets.filter(s => s.matiere === "philosophie").length, "text-blue-700"],
          ["HLP", sujets.filter(s => s.matiere === "hlp").length, "text-emerald-700"],
        ].map(([label, val, color]) => (
          <div key={label as string} className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
            <div className={`text-2xl font-black ${color}`}>{val}</div>
            <div className="text-xs font-semibold text-gray-600 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Zone d'import */}
      <div className="bg-white rounded-2xl border-2 border-rose-100 shadow-sm p-5">
        <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-rose-600" /> Importer des sujets en masse
        </h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase mb-1 block">Matière</label>
            <div className="flex gap-2">
              {[["philosophie","🧠 Philo","border-blue-400 bg-blue-50 text-blue-700"],
                ["hlp","📜 HLP","border-emerald-400 bg-emerald-50 text-emerald-700"]].map(([val,label,ac]) => (
                <button key={val} onClick={() => { setImportMatiere(val); setImportNotion(""); }}
                  className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold transition-all ${importMatiere === val ? ac : "border-gray-200 text-gray-500"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase mb-1 block">Notion / Chapitre par défaut</label>
            <select value={importNotion} onChange={e => setImportNotion(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-xs focus:border-rose-400 focus:outline-none text-gray-800">
              <option value="">— L'IA détectera —</option>
              {(importMatiere === "philosophie" ? PHILO_NOTIONS_LIST : HLP_CHAPITRES_LIST).map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase mb-1 block">Source</label>
            <input value={importSource} onChange={e => setImportSource(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-xs focus:border-rose-400 focus:outline-none text-gray-800"
              placeholder="Ex: Bac 2023 Métropole" />
          </div>
        </div>
        <textarea value={importText} onChange={e => setImportText(e.target.value)}
          className="w-full h-32 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm resize-none focus:border-rose-400 focus:outline-none text-gray-800 mb-3"
          placeholder={"Collez vos sujets ici, un par ligne :\nLa conscience fait-elle obstacle au bonheur ?\nPeut-on être esclave de soi-même ?\nFaut-il préférer la vérité au bonheur ?"} />
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {importText.split("\n").filter(l => l.trim().includes("?")).length} sujets détectés
          </p>
          <button onClick={analyzeAndImport}
            disabled={!importText.trim() || isAnalyzing}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${importText.trim() && !isAnalyzing ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
            {isAnalyzing ? <><Sparkles className="w-4 h-4 animate-spin" /> Analyse IA…</> : <><Sparkles className="w-4 h-4" /> Analyser et préparer l'import</>}
          </button>
        </div>
      </div>

      {/* Prévisualisation avant import */}
      {pendingImport.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-amber-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> {pendingImport.length} sujet{pendingImport.length > 1 ? "s" : ""} prêt{pendingImport.length > 1 ? "s" : ""} à importer
            </h3>
            <div className="flex gap-2">
              <button onClick={() => setPendingImport([])}
                className="px-3 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">
                Annuler
              </button>
              <button onClick={saveImport} disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold">
                {isSaving ? <><Sparkles className="w-3 h-3 animate-spin" /> Enregistrement…</> : <><Check className="w-3 h-3" /> Confirmer l'import</>}
              </button>
            </div>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {pendingImport.map((s, i) => (
              <div key={i} className="bg-white rounded-xl border border-amber-200 p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 mb-1.5">{s.sujet}</p>
                  <div className="flex gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.matiere === "hlp" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                      {s.matiere === "hlp" ? "📜 HLP" : "🧠 Philo"}
                    </span>
                    <select value={s.notion_principale}
                      onChange={e => updatePending(i, "notion_principale", e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-0.5 text-gray-700 focus:outline-none">
                      <option value="">— Notion —</option>
                      {(s.matiere === "philosophie" ? PHILO_NOTIONS_LIST : HLP_CHAPITRES_LIST).map((n: string) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    {(s.notions || []).map((n: string, ni: number) => (
                      <span key={ni} className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">{n}</span>
                    ))}
                  </div>
                </div>
                <button onClick={() => setPendingImport(prev => prev.filter((_, idx) => idx !== i))}
                  className="text-gray-400 hover:text-red-500 flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste des sujets existants */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-rose-400 focus:outline-none text-gray-800"
              placeholder="Rechercher un sujet…" />
          </div>
          <select value={filterMatiere} onChange={e => { setFilterMatiere(e.target.value); setFilterNotion("all"); }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none">
            <option value="all">Toutes matières</option>
            <option value="philosophie">🧠 Philosophie</option>
            <option value="hlp">📜 HLP</option>
          </select>
          <select value={filterNotion} onChange={e => setFilterNotion(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none">
            <option value="all">Toutes notions</option>
            {notions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {loading ? (
          <div className="text-center py-10 text-gray-500 font-semibold">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400 font-semibold">Aucun sujet trouvé</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{s.sujet}</p>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.matiere === "hlp" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                      {s.matiere === "hlp" ? "📜 HLP" : "🧠 Philo"}
                    </span>
                    {s.notion_principale && (
                      <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-semibold">{s.notion_principale}</span>
                    )}
                    <span className="text-xs text-gray-400">{s.source}</span>
                  </div>
                </div>
                <button onClick={() => deleteSujet(s.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400 text-center">
          {filtered.length} sujet{filtered.length > 1 ? "s" : ""} affichés sur {total} au total
        </div>
      </div>
    </div>
  );
}


// ── CHANGER CODE PROF ─────────────────────────────────────────────────────────
function ChangerCodeProf() {
  const [open, setOpen] = useState(false);
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{type: "ok"|"err"; text: string} | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setMsg(null);
    if (!ancien || !nouveau || !confirm) { setMsg({ type: "err", text: "Tous les champs sont requis" }); return; }
    if (nouveau.length < 6) { setMsg({ type: "err", text: "Le nouveau code doit faire au moins 6 caractères" }); return; }
    if (nouveau !== confirm) { setMsg({ type: "err", text: "Les deux nouveaux codes ne correspondent pas" }); return; }
    setSaving(true);
    try {
      const storedCode = await dbGetConfig("prof_code");
      const validCode = storedCode || "prof1234";
      if (ancien !== validCode) { setMsg({ type: "err", text: "Ancien code incorrect" }); setSaving(false); return; }
      await dbSetConfig("prof_code", nouveau);
      setMsg({ type: "ok", text: "Code modifié avec succès !" });
      setAncien(""); setNouveau(""); setConfirm("");
      setTimeout(() => { setOpen(false); setMsg(null); }, 2000);
    } catch { setMsg({ type: "err", text: "Erreur lors de la sauvegarde" }); }
    setSaving(false);
  };

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-purple-700 px-3 py-2 rounded-xl border border-gray-200 hover:border-purple-300 transition-all">
        <Lock className="w-3.5 h-3.5" /> Code
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-gray-800 flex items-center gap-2"><Lock className="w-4 h-4 text-purple-600" /> Changer le code prof</h3>
              <button onClick={() => { setOpen(false); setMsg(null); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              {[
                ["Ancien code", ancien, setAncien, "Ton code actuel"],
                ["Nouveau code (min. 6 car.)", nouveau, setNouveau, "Au moins 6 caractères"],
                ["Confirmer le nouveau code", confirm, setConfirm, "Répète le nouveau code"],
              ].map(([label, val, setter, ph]) => (
                <div key={label as string}>
                  <label className="text-xs font-bold text-gray-600 uppercase mb-1 block">{label}</label>
                  <input type="password" value={val as string} onChange={e => (setter as any)(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none text-gray-800"
                    placeholder={ph as string} />
                </div>
              ))}
            </div>
            {msg && (
              <div className={`mt-3 p-3 rounded-xl text-sm font-semibold text-center ${msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                {msg.type === "ok" ? "✅ " : "❌ "}{msg.text}
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => { setOpen(false); setMsg(null); }}
                className="flex-1 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Annuler</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                {saving ? <><Sparkles className="w-4 h-4 animate-spin" /> Sauvegarde…</> : "Changer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── PROF MODE ─────────────────────────────────────────────────────────────────
function ProfMode({ sharedLib, setSharedLib, onLogout, libLoaded, onReload, onDashboard }: any) {
  const [profTab, setProfTab] = useState<"textes" | "sujets" | "notions">("textes");
  const [search, setSearch] = useState("");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [matiereFilter, setMatiereFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<any>({});
  const [newChapter, setNewChapter] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newWorkTitle, setNewWorkTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState("les deux");
  const [newMatiere, setNewMatiere] = useState("hlp");
  const [inputTab, setInputTab] = useState("paste");
  const [dragging, setDragging] = useState(false);
  const [importError, setImportError] = useState("");
  const [pendingEntries, setPendingEntries] = useState<any[] | null>(null);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingChapters = useMemo(
    () => [...new Set(sharedLib.map((e: any) => entryChapter(e)))].sort() as string[],
    [sharedLib]
  );

  const handleMatiereChange = (m: string) => { setNewMatiere(m); setNewChapter(""); };

  const addEntry = async () => {
    if (!newContent.trim()) return;
    if (newMatiere === "hlp" && !newChapter) return;
    if (newType === "cours" && !newChapter) return;
    setSaving(true);
    const entry = {
      id: uid(), chapter: newChapter || "Non classé",
      author: newType === "cours" ? "" : newAuthor || "",
      workTitle: newType === "cours" ? newChapter || "Cours" : newWorkTitle || "Sans titre",
      notions: [], content: newContent, createdAt: Date.now(), wordCount: wc(newContent),
      type: newType, matiere: newMatiere,
    };
    try {
      await dbAddTexte(entry); await onReload();
      setNewChapter(""); setNewAuthor(""); setNewWorkTitle(""); setNewContent("");
      setNewType("les deux"); setNewMatiere("hlp");
    } catch (e: any) { alert("Erreur : " + e.message); }
    setSaving(false);
  };

  const processFiles = async (files: File[]) => {
    setImportError(""); setIsProcessingFiles(true);
    const entries: any[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessingStatus(`Fichier ${i + 1}/${files.length} : extraction…`);
      try {
        const content = await extractFile(file);
        if (!content.trim()) continue;
        setProcessingStatus(`Fichier ${i + 1}/${files.length} : analyse IA…`);
        let meta = { author: "", workTitle: file.name.replace(/\.[^.]+$/, ""), chapter: newChapter || "Non classé", notions: [] as string[] };
        let status = "done";
        try {
          const aiMeta = await extractMetadataWithAI(content, file.name, newChapter);
          meta = { author: aiMeta.author || "", workTitle: aiMeta.workTitle || file.name.replace(/\.[^.]+$/, ""), chapter: newChapter || aiMeta.chapter || "Non classé", notions: Array.isArray(aiMeta.notions) ? aiMeta.notions : [] };
        } catch { status = "error"; }
        entries.push({ id: uid(), filename: file.name, content, wordCount: wc(content), ...meta, type: "les deux", matiere: newMatiere, status });
      } catch {
        entries.push({ id: uid(), filename: file.name, content: "", wordCount: 0, author: "", workTitle: file.name, chapter: "Non classé", notions: [], type: "les deux", matiere: newMatiere, status: "error" });
      }
    }
    setIsProcessingFiles(false); setProcessingStatus("");
    if (entries.length) setPendingEntries(entries);
    else setImportError("Aucun contenu extractible.");
  };

  const handleValidation = async (confirmed: any[]) => {
    setSaving(true);
    for (const e of confirmed) { try { await dbAddTexte(e); } catch (err) { console.error(err); } }
    await onReload(); setPendingEntries(null); setSaving(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => /\.(txt|docx?)$/i.test(f.name));
    if (files.length) processFiles(files);
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) processFiles(files);
    e.target.value = "";
  };

  const saveEdit = async () => {
    setSaving(true);
    try { await dbUpdateTexte(editingId!, editFields); await onReload(); setEditingId(null); }
    catch (e: any) { alert("Erreur : " + e.message); }
    setSaving(false);
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Supprimer ce texte ?")) return;
    try { await dbDeleteTexte(id); setSharedLib(sharedLib.filter((e: any) => e.id !== id)); }
    catch (e: any) { alert("Erreur : " + e.message); }
  };

  const filtered = sharedLib.filter((e: any) => {
    const matchChapter = chapterFilter === "all" || entryChapter(e) === chapterFilter;
    const matchMat = matiereFilter === "all" || (e.matiere || "hlp") === matiereFilter;
    const matchType = typeFilter === "all"
      || (typeFilter === "cours" && (e.type === "cours"))
      || (typeFilter === "texte" && (e.type === "qcm" || e.type === "les deux" || !e.type));
    const term = search.toLowerCase();
    return matchChapter && matchMat && matchType && (!term || entryName(e).toLowerCase().includes(term) || e.content.toLowerCase().includes(term));
  });

  const canAdd = newContent.trim() && !saving &&
    !(newType === "cours" && !newChapter) &&
    !(newMatiere === "hlp" && !newChapter);

  return (
    <div className="min-h-screen bg-gray-50">
      {isProcessingFiles && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <Sparkles className="w-10 h-10 text-purple-600 animate-pulse mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-800 mb-2">Analyse en cours…</h3>
            <p className="text-sm text-gray-700">{processingStatus}</p>
          </div>
        </div>
      )}
      {pendingEntries && (
        <ValidationModal pending={pendingEntries} existingChapters={existingChapters}
          defaultMatiere={newMatiere} onConfirm={handleValidation} onCancel={() => setPendingEntries(null)} />
      )}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">👩‍🏫</span>
            <h1 className="text-lg font-bold text-gray-800">Espace Professeur</h1>
            <span className="text-xs bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">
              {sharedLib.length} texte{sharedLib.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-2">
              <button onClick={() => setProfTab("textes")}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${profTab === "textes" ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-700 border-gray-200 hover:border-purple-300"}`}>
                📚 Textes
              </button>
              <button onClick={() => setProfTab("sujets")}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${profTab === "sujets" ? "bg-rose-600 text-white border-rose-600" : "bg-white text-gray-700 border-gray-200 hover:border-rose-300"}`}>
                ✍️ Banque de sujets
              </button>
              <button onClick={() => setProfTab("notions")}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${profTab === "notions" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"}`}>
                🎯 Notions des textes
              </button>
            </div>
            <button onClick={onDashboard} className="flex items-center gap-1.5 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-2 rounded-xl border border-indigo-200">
              📊 Tableau de bord
            </button>
            <button onClick={onReload} className="p-2 text-gray-600 hover:text-indigo-600 rounded-lg"><RefreshCw className="w-4 h-4" /></button>
            <ChangerCodeProf />
            <button onClick={onLogout} className="text-sm text-gray-600 hover:text-red-600 font-semibold flex items-center gap-1.5">
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          </div>
        </div>
      </div>
      {profTab === "sujets" ? (
        <div className="max-w-5xl mx-auto px-6 py-6">
          <BanqueSujetsProf />
        </div>
      ) : profTab === "notions" ? (
        <div className="max-w-5xl mx-auto px-6 py-6">
          <GestionNotionsProf sharedLib={sharedLib} onReload={onReload} />
        </div>
      ) : (
      <div className="max-w-6xl mx-auto px-6 py-6 flex gap-6">
        <div className="w-80 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-200">
              {[["paste", "Coller"], ["file", "Importer"]].map(([t, label]) => (
                <button key={t} onClick={() => setInputTab(t)}
                  className={`flex-1 py-3 text-xs font-bold transition-all ${inputTab === t ? "bg-purple-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Matière</label>
                <div className="flex gap-2">
                  {[
                    ["hlp", "📜 HLP", "border-emerald-400 bg-emerald-50 text-emerald-700"],
                    ["philosophie", "🧠 Philosophie", "border-blue-400 bg-blue-50 text-blue-700"],
                  ].map(([val, label, activeClass]) => (
                    <button key={val} onClick={() => handleMatiereChange(val)}
                      className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold transition-all ${newMatiere === val ? activeClass : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {inputTab === "paste" ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Nature du document</label>
                    <div className="flex gap-2">
                      {[
                        ["cours", "📖 Cours du prof", "border-amber-400 bg-amber-50 text-amber-700"],
                        ["les deux", "📝 Texte d'auteur", "border-indigo-400 bg-indigo-50 text-indigo-700"],
                      ].map(([val, label, activeClass]) => (
                        <button key={val} onClick={() => { setNewType(val); setNewChapter(""); }}
                          className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${newType === val || (val === "les deux" && newType === "qcm") ? activeClass : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {newType === "cours" && <p className="text-xs text-amber-600 mt-1.5 font-semibold">📌 Visible en révision uniquement</p>}
                    {(newType === "les deux" || newType === "qcm") && (
                      <div className="mt-2 flex gap-2">
                        {[["les deux", "Révision + Quiz"], ["qcm", "Quiz uniquement"]].map(([val, label]) => (
                          <button key={val} onClick={() => setNewType(val)}
                            className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${newType === val ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Chapitre / Thème</label>
                    <ChapterSelect matiere={newMatiere} value={newChapter} onChange={setNewChapter}
                      existingChapters={existingChapters} forceType={newType} />
                  </div>
                  {newType !== "cours" && (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Auteur</label>
                        <input value={newAuthor} onChange={(e) => setNewAuthor(e.target.value)}
                          className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none text-gray-800"
                          placeholder="Ex: Victor Hugo" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Titre de l'œuvre</label>
                        <input value={newWorkTitle} onChange={(e) => setNewWorkTitle(e.target.value)}
                          className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none text-gray-800"
                          placeholder="Ex: Les Misérables" />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Texte</label>
                    <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)}
                      className="w-full h-36 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm resize-none focus:border-purple-400 focus:outline-none text-gray-800"
                      placeholder="Collez le texte ici…" />
                    {newContent && <p className="text-right text-xs text-gray-400 mt-1">{wc(newContent)} mots</p>}
                  </div>
                  <button onClick={addEntry} disabled={!canAdd}
                    className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${canAdd ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-gray-100 text-gray-500 cursor-not-allowed"}`}>
                    <Plus className="w-4 h-4" /> {saving ? "Enregistrement…" : "Ajouter"}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">Chapitre (optionnel)</label>
                    <ChapterSelect matiere={newMatiere} value={newChapter} onChange={setNewChapter} existingChapters={existingChapters} />
                  </div>
                  <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${dragging ? "border-purple-400 bg-purple-50" : "border-gray-300 hover:border-purple-300"}`}>
                    <input ref={fileInputRef} type="file" multiple accept=".txt,.docx" onChange={handleFileInput} className="hidden" />
                    <FileUp className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                    <p className="text-sm font-bold text-gray-800">Glissez vos fichiers</p>
                    <p className="text-xs text-gray-600 mt-1">.txt · .docx</p>
                  </div>
                  {importError && <p className="text-xs text-red-600 font-semibold">{importError}</p>}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none text-gray-800"
                placeholder="Rechercher…" />
            </div>
            <select value={matiereFilter} onChange={(e) => setMatiereFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none">
              <option value="all">Toutes matières</option>
              <option value="hlp">📜 HLP</option>
              <option value="philosophie">🧠 Philosophie</option>
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none">
              <option value="all">Cours & Textes</option>
              <option value="cours">📖 Cours uniquement</option>
              <option value="texte">📝 Textes uniquement</option>
            </select>
            <select value={chapterFilter} onChange={(e) => setChapterFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none">
              <option value="all">Tous les chapitres</option>
              {existingChapters.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </div>
          {!libLoaded ? (
            <div className="text-center py-20 text-gray-700 font-semibold">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-72 bg-white rounded-2xl border-2 border-dashed border-gray-200 text-center p-8">
              <FolderOpen className="w-14 h-14 text-gray-300 mb-4" />
              <p className="text-lg font-bold text-gray-600">{sharedLib.length === 0 ? "Bibliothèque vide" : "Aucun résultat"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((entry: any) => (
                <div key={entry.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:border-purple-200 transition-all overflow-hidden">
                  {editingId === entry.id ? (
                    <div className="p-5 space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1.5">Matière</label>
                        <div className="flex gap-2">
                          {[["hlp", "📜 HLP", "border-emerald-400 bg-emerald-50 text-emerald-700"], ["philosophie", "🧠 Philosophie", "border-blue-400 bg-blue-50 text-blue-700"]].map(([val, label, ac]) => (
                            <button key={val} onClick={() => setEditFields((f: any) => ({ ...f, matiere: val, chapter: "" }))}
                              className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold transition-all ${(editFields.matiere || "hlp") === val ? ac : "border-gray-200 text-gray-500"}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-purple-700 uppercase mb-1.5">
                          📂 Chapitre / Sujet
                          {editFields.chapter === "" && <span className="ml-2 text-orange-500 font-bold">← à reclasser !</span>}
                        </label>
                        <ChapterSelect matiere={editFields.matiere || "hlp"} value={editFields.chapter || ""}
                          onChange={(v) => setEditFields((f: any) => ({ ...f, chapter: v }))} existingChapters={existingChapters} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-600 mb-1">Auteur</label>
                          <input value={editFields.author || ""} onChange={(e) => setEditFields((f: any) => ({ ...f, author: e.target.value }))}
                            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-purple-400 focus:outline-none text-gray-800" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-600 mb-1">Titre</label>
                          <input value={editFields.workTitle || ""} onChange={(e) => setEditFields((f: any) => ({ ...f, workTitle: e.target.value }))}
                            className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-purple-400 focus:outline-none text-gray-800" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">Nature du document</label>
                        <div className="flex gap-2">
                          {[
                            ["cours", "📖 Cours du prof", "border-amber-400 bg-amber-50 text-amber-700"],
                            ["texte", "📝 Texte d'auteur", "border-indigo-400 bg-indigo-50 text-indigo-700"],
                          ].map(([val, label, ac]) => {
                            const isTexte = val === "texte" && (editFields.type === "les deux" || editFields.type === "qcm" || !editFields.type);
                            const isCours = val === "cours" && editFields.type === "cours";
                            return (
                              <button key={val} onClick={() => setEditFields((f: any) => ({ ...f, type: val === "cours" ? "cours" : "les deux" }))}
                                className={`flex-1 py-2 rounded-xl border-2 text-xs font-bold transition-all ${isCours || isTexte ? ac : "border-gray-200 text-gray-500"}`}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        {(editFields.type === "les deux" || editFields.type === "qcm") && (
                          <div className="mt-2 flex gap-2">
                            {[["les deux", "Révision + Quiz"], ["qcm", "Quiz uniquement"]].map(([val, label]) => (
                              <button key={val} onClick={() => setEditFields((f: any) => ({ ...f, type: val }))}
                                className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${editFields.type === val ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-500"}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Notions principale et secondaires */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-rose-700 uppercase mb-1">🎯 Notion principale</label>
                          <select value={editFields.notion_principale || ""} onChange={(e) => setEditFields((f: any) => ({ ...f, notion_principale: e.target.value }))}
                            className="w-full px-3 py-2 border-2 border-rose-200 rounded-lg text-xs focus:border-rose-400 focus:outline-none text-gray-800">
                            <option value="">— Aucune —</option>
                            {((editFields.matiere || "hlp") === "philosophie" ? PHILO_NOTIONS_PROGRAMME : [
                              "Éducation, transmission et émancipation","Les expressions de la sensibilité","Les métamorphoses du moi",
                              "Création, continuités et ruptures","Histoire et violence","L'humain et ses limites",
                            ]).map((n: string) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Notions secondaires</label>
                          <div className="flex flex-wrap gap-1 min-h-8 p-1.5 border-2 border-gray-200 rounded-lg bg-white">
                            {((editFields.matiere || "hlp") === "philosophie" ? PHILO_NOTIONS_PROGRAMME : [
                              "Éducation, transmission et émancipation","Les expressions de la sensibilité","Les métamorphoses du moi",
                              "Création, continuités et ruptures","Histoire et violence","L'humain et ses limites",
                            ]).map((n: string) => {
                              const isSel = (editFields.notions_secondaires || []).includes(n);
                              return (
                                <button key={n} type="button" onClick={() => setEditFields((f: any) => ({
                                  ...f,
                                  notions_secondaires: isSel
                                    ? (f.notions_secondaires || []).filter((x: string) => x !== n)
                                    : [...(f.notions_secondaires || []), n]
                                }))}
                                  className={`text-xs px-1.5 py-0.5 rounded-full border transition-all ${isSel ? "bg-gray-600 text-white border-gray-600" : "bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-400"}`}>
                                  {n}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <textarea value={editFields.content || ""} onChange={(e) => setEditFields((f: any) => ({ ...f, content: e.target.value }))}
                        className="w-full h-32 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm resize-none focus:outline-none text-gray-800" />
                      <div className="flex gap-2">
                        <button onClick={saveEdit} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg text-sm flex items-center gap-1.5">
                          <Check className="w-4 h-4" /> {saving ? "…" : "Sauvegarder"}
                        </button>
                        <button onClick={() => setEditingId(null)} className="bg-gray-100 text-gray-800 font-semibold py-2 px-4 rounded-lg text-sm">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4 p-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${matiereColor(entry.matiere || "hlp")}`}>{matiereLabel(entry.matiere || "hlp")}</span>
                          <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{entryChapter(entry)}</span>
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">
                            {entry.type === "cours" ? "📖 Cours" : entry.type === "qcm" ? "✅ QCM" : "📖✅ Les deux"}
                          </span>
                          {entry.notion_principale && (
                            <span className="text-xs bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-bold">🎯 {entry.notion_principale}</span>
                          )}
                          {(entry.notions_secondaires || []).slice(0, 2).map((n: string, i: number) => (
                            <span key={i} className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">{n}</span>
                          ))}
                          {(entry.notions || []).slice(0, 2).map((n: string, i: number) => (
                            <span key={i} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">{n}</span>
                          ))}
                        </div>
                        <h3 className="font-bold text-gray-800 text-sm mt-1">{entryName(entry)}</h3>
                        <p className="text-xs text-gray-600 mb-1">{entry.word_count} mots · {fmtDate(entry.created_at)}</p>
                        <p className="text-xs text-gray-700 line-clamp-2">{entry.content.slice(0, 160)}…</p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => {
                          setEditingId(entry.id);
                          setEditFields({ chapter: entryChapter(entry) === "Non classé" ? "" : entryChapter(entry), author: entry.author || "", workTitle: entry.work_title || "", content: entry.content, type: entry.type || "les deux", matiere: entry.matiere || "hlp", notion_principale: entry.notion_principale || "", notions_secondaires: entry.notions_secondaires || [] });
                        }} className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => deleteEntry(entry.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// ── ÉLÈVE MODE ────────────────────────────────────────────────────────────────
function EleveMode({ matiere, sharedLib, libLoaded, onBack, onStartQuiz, onStartRevision, onStartDissertation, onRefresh, eleveNom }: any) {
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [numQ, setNumQ] = useState(10);
  const [difficulty, setDifficulty] = useState("mixte");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"revision" | "quiz" | "dissertation">("revision");
  const [revisionSubTab, setRevisionSubTab] = useState<"cours" | "textes">("cours");

  const isHLP = matiere === "hlp";
  const headerBorder = isHLP ? "border-emerald-200" : "border-blue-200";
  const matiereDisplay = isHLP ? "📜 HLP" : "🧠 Philosophie";

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
        const data = await callAI([{ role: "user", content:
          `Génère EXACTEMENT ${batchSize} questions QCM sur le texte littéraire ci-dessous.
Règle de format : la bonne réponse est TOUJOURS en position 0, suivie de 3 mauvaises réponses. 4 choix au total.
${diffHint}${already}
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
              <h1 className={`text-lg font-bold leading-tight ${isHLP ? "text-emerald-700" : "text-blue-700"}`}>{matiereDisplay}</h1>
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
        {!libLoaded ? (
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
                    const notions = [...new Set(
                      filteredLib.filter((e: any) => entryChapter(e) === ch)
                        .flatMap((e: any) => e.notions || [])
                        .filter(Boolean)
                    )].slice(0, 4);
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
            <div className="flex gap-3 mb-6">
              <button onClick={() => setActiveTab("revision")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-bold text-sm transition-all ${activeTab === "revision" ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-700 hover:border-green-300"}`}>
                <BookOpen className="w-4 h-4" /> 📖 Réviser le cours
              </button>
              <button onClick={() => setActiveTab("quiz")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-bold text-sm transition-all ${activeTab === "quiz" ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300"}`}>
                <Trophy className="w-4 h-4" /> ✅ Faire un quiz
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
          </>
        )}
      </div>
    </div>
  );
}
