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

const PROF_CODE = "prof1234";

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
${dbNotions.length > 0 ? `Notions déjà identifiées : ${dbNotions.join(", ")}. Crée une flashcard pour chacune, puis ajoute d'autres notions importantes du texte.` : "Identifie les notions clés du texte et crée une flashcard pour chacune."}
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
function RevisionMode({ entries, chapter, onBack }: any) {
  const [selectedEntry, setSelectedEntry] = useState<any>(entries.length === 1 ? entries[0] : null);
  const [activeTab, setActiveTab] = useState<"chat" | "fiche" | "flashcards">("chat");
  const [messages, setMessages] = useState<{ role: string; content: string; source?: "texte" | "synthese" | "hors_texte" }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fiche, setFiche] = useState<string | null>(null);
  const [ficheLoading, setFicheLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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

  const handleTabChange = (tab: "chat" | "fiche" | "flashcards") => {
    setActiveTab(tab);
    if (tab === "fiche") loadFiche();
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !selectedEntry) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const systemPrompt = `Tu es un assistant pédagogique bienveillant. Tu aides un élève à réviser un texte de cours.
Tu dois TOUJOURS répondre en JSON valide, rien d'autre. Format strict :
{"source": "texte" | "synthese" | "hors_texte", "contenu": "ta réponse ici"}
Règles pour choisir la source :
- "texte" : la réponse s'appuie DIRECTEMENT sur un passage du texte fourni
- "synthese" : la réponse interprète ou explique le texte fourni sans citation directe
- "hors_texte" : l'information demandée ne figure PAS dans le texte (commence par "⚠️ Cette information ne figure pas dans le texte fourni.")
TEXTE DU COURS :
${selectedEntry.content}`;
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
            ["fiche", "📋 Fiche", "border-amber-500 bg-amber-50 text-amber-700"],
            ["flashcards", "🃏 Flashcards", "border-purple-500 bg-purple-50 text-purple-700"],
          ] as [string, string, string][]).map(([tab, label, activeClass]) => (
            <button key={tab} onClick={() => handleTabChange(tab as any)}
              className={`flex-1 py-2.5 rounded-xl border-2 font-bold text-xs transition-all ${activeTab === tab ? activeClass : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
              {label}
            </button>
          ))}
        </div>
        {activeTab === "fiche" && (
          <div className="flex-1 bg-white rounded-2xl border-2 border-amber-200 shadow-sm overflow-y-auto p-5">
            {ficheLoading ? (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <Sparkles className="w-8 h-8 text-amber-500 animate-spin mb-3" />
                <p className="text-gray-600 font-semibold text-sm">Génération de la fiche…</p>
              </div>
            ) : fiche ? (
              <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">{fiche}</pre>
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
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [sujet, setSujet] = useState("");
  const [sujetAlt, setSujetAlt] = useState(""); // sujet contre-intuitif
  const [activeSujet, setActiveSujet] = useState<"main" | "alt">("main");
  const [isGeneratingSujet, setIsGeneratingSujet] = useState(false);
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

  // Notions extraites des textes sélectionnés
  const notionsFromSelected = useMemo(() => {
    const notions = new Set<string>();
    filteredLib
      .filter((e: any) => selectedChapters.includes(entryChapter(e)))
      .forEach((e: any) => (e.notions || []).forEach((n: string) => notions.add(n)));
    return Array.from(notions);
  }, [filteredLib, selectedChapters]);

  // Textes sélectionnés (pour contexte IA)
  const selectedTextes = useMemo(
    () => filteredLib.filter((e: any) => selectedChapters.includes(entryChapter(e))),
    [filteredLib, selectedChapters]
  );

  const contextForAI = selectedTextes
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
      const chapitresStr = selectedChapters.join(", ");
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

  // Générer le plan selon le niveau
  const generatePlan = async (level: PlanLevel) => {
    setPlanLevel(level);
    setPlan("");
    setPlanLoading(true);
    const currentSujet = activeSujet === "main" ? sujet : sujetAlt;
    const levelDesc = {
      1: "un plan dialectique I/II/III avec sous-parties A, B, C seulement (titres courts, pas de contenu rédigé)",
      2: "un plan dialectique I/II/III avec sous-parties A, B, C ET une amorce de rédaction d'une phrase pour chaque sous-partie",
      3: "un plan dialectique I/II/III avec sous-parties A, B, C ET pour chaque sous-partie, une question socratique qui guide la réflexion",
      4: "un plan dialectique I/II/III complet avec sous-parties A, B, C, une amorce rédigée ET des exemples tirés des textes étudiés"
    }[level];
    try {
      const data = await callAI([{ role: "user", content:
        `Tu es professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en terminale.
Sujet de dissertation : "${currentSujet}"
Chapitres mobilisés : ${selectedChapters.join(", ")}
${contextForAI ? `\nExtraits des textes étudiés :\n${contextForAI}` : ""}

Génère ${levelDesc}.
Format lisible avec des emojis pour les parties (I → 🔹, II → 🔸, III → 🔺).
Sois précis et adapté au niveau terminale.` }], 1500);
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
${contextForAI ? `\nContexte des textes étudiés :\n${contextForAI.slice(0, 2000)}` : ""}

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
${contextForAI ? `Contexte textes : ${contextForAI.slice(0, 1500)}` : ""}
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
${contextForAI ? `\nExtraits des textes étudiés :\n${contextForAI.slice(0, 2000)}` : ""}

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
      setCorrige(getText(data));
      setCorrigeSubmitted(true);
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

        {/* Étape 1 : choix des chapitres */}
        <div className="bg-white rounded-2xl border-2 border-rose-100 shadow-sm p-6 mb-5">
          <h2 className="text-base font-black text-gray-800 mb-1 flex items-center gap-2">
            <span className="w-6 h-6 bg-rose-600 text-white rounded-full text-xs flex items-center justify-center font-black">1</span>
            Choisis les notions à croiser
          </h2>
          <p className="text-xs text-gray-500 mb-4">Sélectionne 2 à 3 chapitres pour un sujet transversal inédit</p>

          {allChapters.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <p className="text-gray-500 font-semibold text-sm">Aucun chapitre disponible</p>
              <p className="text-gray-400 text-xs mt-1">Le professeur doit d'abord ajouter des textes.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {allChapters.map((ch) => {
                const isSel = selectedChapters.includes(ch);
                const count = filteredLib.filter((e: any) => entryChapter(e) === ch).length;
                return (
                  <button key={ch} onClick={() => toggleChapter(ch)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${isSel ? "border-rose-500 bg-rose-50 ring-2 ring-rose-100" : "border-gray-200 hover:border-rose-300 bg-white"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <div className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center ${isSel ? "bg-rose-500 border-rose-500" : "border-gray-300"}`}>
                          {isSel && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className={`text-sm font-bold leading-snug ${isSel ? "text-rose-700" : "text-gray-700"}`}>{ch}</span>
                      </div>
                      <span className="flex-shrink-0 text-xs text-gray-400 font-semibold">{count}t</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedChapters.length > 0 && (
            <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-rose-700">
              <Check className="w-3.5 h-3.5" />
              {selectedChapters.length} chapitre{selectedChapters.length > 1 ? "s" : ""} sélectionné{selectedChapters.length > 1 ? "s" : ""}
              {notionsFromSelected.length > 0 && ` · ${notionsFromSelected.length} notions disponibles`}
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

          <button
            onClick={generateSujets}
            disabled={selectedChapters.length === 0 || isGeneratingSujet}
            className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              selectedChapters.length === 0 ? "bg-gray-100 text-gray-400 cursor-not-allowed" :
              "bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white shadow-md"
            }`}>
            {isGeneratingSujet ? (
              <><Sparkles className="w-4 h-4 animate-spin" /> Génération du sujet…</>
            ) : (
              <><Zap className="w-4 h-4" /> {sujet ? "Regénérer un sujet" : "Génère un sujet inédit"}</>
            )}
          </button>

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
                      <span className="text-xs font-black text-rose-600 uppercase tracking-wide">Sujet classique</span>
                      <p className="text-sm font-bold text-gray-800 mt-1 leading-snug">{sujet}</p>
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
            <p className="text-xs text-gray-500 mb-4">Sujet retenu : <span className="font-bold text-gray-700 italic">"{currentSujetText}"</span></p>

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
                [1, "Niveau 1 — Squelette", "Plan I/II/III + sous-parties uniquement"],
                [2, "Niveau 2 — Amorces", "Plan + amorce rédigée pour chaque sous-partie"],
                [3, "Niveau 3 — Socratique", "Plan + questions pour guider ta réflexion"],
                [4, "Niveau 4 — Complet", "Plan + amorces + exemples tirés de tes textes"],
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

          {plan && !planLoading && (
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

  const generatePlan = async (level: PlanLevel) => {
    setPlanLevel(level); setPlan(""); setPlanLoading(true);
    const levelDesc = {
      1: "un plan dialectique I/II/III avec sous-parties A, B, C seulement",
      2: "un plan dialectique I/II/III avec sous-parties et une amorce rédigée pour chacune",
      3: "un plan dialectique I/II/III avec sous-parties et une question socratique pour chacune",
      4: "un plan dialectique I/II/III complet avec sous-parties, amorces ET exemples des textes étudiés"
    }[level];
    try {
      const data = await callAI([{ role: "user", content:
        `Tu es professeur de ${matiere === "philosophie" ? "Philosophie" : "HLP"} en terminale.
Sujet : "${sujet}" — Chapitres : ${selectedChapters.join(", ")}
${contextForAI ? `\nExtraits textes :\n${contextForAI}` : ""}
Génère ${levelDesc}. Format lisible avec emojis (I → 🔹, II → 🔸, III → 🔺).` }], 1500);
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
              [1, "Squelette", "Plan seul"],
              [2, "Amorces", "Plan + intro"],
              [3, "Socratique", "Plan + questions"],
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

// ── TABLEAU DE BORD ───────────────────────────────────────────────────────────
function Dashboard({ onBack }: any) {
  const [resultats, setResultats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    dbLoadResultats().then((data) => { setResultats(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const chapters = [...new Set(resultats.map((r) => r.chapter))].sort();
  const filtered = filter === "all" ? resultats : resultats.filter((r) => r.chapter === filter);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 text-gray-600 hover:text-indigo-600 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>
            <h1 className="text-lg font-bold text-gray-800">📊 Tableau de bord</h1>
            <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
              {resultats.length} résultat{resultats.length > 1 ? "s" : ""}
            </span>
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none">
            <option value="all">Tous les chapitres</option>
            {chapters.map((ch) => <option key={ch as string} value={ch as string}>{ch as string}</option>)}
          </select>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-6 py-6">
        {loading ? (
          <div className="text-center py-20 text-gray-600 font-semibold">Chargement…</div>
        ) : resultats.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-xl font-bold text-gray-600">Aucun résultat pour l'instant</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                ["Quiz effectués", filtered.length, "text-indigo-700"],
                ["Réussis (≥70%)", filtered.filter((r) => r.pourcentage >= 70).length, "text-green-700"],
                ["Moyenne générale", filtered.length > 0 ? Math.round(filtered.reduce((s, r) => s + r.pourcentage, 0) / filtered.length) + "%" : "0%", "text-purple-700"],
              ].map(([label, val, color]) => (
                <div key={label as string} className="bg-white rounded-2xl border border-gray-200 p-5 text-center shadow-sm">
                  <div className={`text-3xl font-black ${color}`}>{val}</div>
                  <div className="text-sm font-semibold text-gray-700 mt-1">{label}</div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>{["Date", "Élève", "Chapitre", "Score", "Résultat"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 font-bold text-gray-700">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r: any) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-700">{new Date(r.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
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
          </>
        )}
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function QCMApp() {
  const [role, setRole] = useState<string | null>(null);
  const [eleveNom, setEleveNom] = useState<string>("");
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

  const matiere = role === "eleve-HLP" ? "hlp" : role === "eleve-Philosophie" ? "philosophie" : null;
  const dissertMatiere = role === "eleve-HLP-dissertation" ? "hlp" : role === "eleve-Philosophie-dissertation" ? "philosophie" : null;

  if (showDashboard) return <Dashboard onBack={() => setShowDashboard(false)} />;

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
        <RevisionMode entries={revisionData.entries} chapter={revisionData.chapter} onBack={() => setRevisionData(null)} />
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
function HomeScreen({ onSelect, eleveNom, setEleveNom }: any) {
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [pseudoInput, setPseudoInput] = useState(eleveNom || "");

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
          <input value={pseudoInput} onChange={(e) => { setPseudoInput(e.target.value); setEleveNom(e.target.value); }}
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
                onKeyDown={(e) => e.key === "Enter" && (code === PROF_CODE ? onSelect("prof") : setErr("Code incorrect"))}
                className="w-full p-2.5 border-2 border-purple-300 rounded-xl text-sm text-center mb-2 focus:border-purple-500 focus:outline-none text-gray-800"
                placeholder="Code professeur" autoFocus />
              {err && <p className="text-red-500 text-xs mb-2">{err}</p>}
              <button onClick={() => (code === PROF_CODE ? onSelect("prof") : setErr("Code incorrect"))}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl text-sm transition-all">
                Entrer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PROF MODE ─────────────────────────────────────────────────────────────────
function ProfMode({ sharedLib, setSharedLib, onLogout, libLoaded, onReload, onDashboard }: any) {
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
            <button onClick={onDashboard} className="flex items-center gap-1.5 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-2 rounded-xl border border-indigo-200">
              📊 Tableau de bord
            </button>
            <button onClick={onReload} className="p-2 text-gray-600 hover:text-indigo-600 rounded-lg"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={onLogout} className="text-sm text-gray-600 hover:text-red-600 font-semibold flex items-center gap-1.5">
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          </div>
        </div>
      </div>
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
                          setEditFields({ chapter: entryChapter(entry) === "Non classé" ? "" : entryChapter(entry), author: entry.author || "", workTitle: entry.work_title || "", content: entry.content, type: entry.type || "les deux", matiere: entry.matiere || "hlp" });
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
                  <p className="text-sm text-gray-600">{count} texte{count > 1 ? "s" : ""}</p>
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
