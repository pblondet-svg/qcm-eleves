"use client";
import { useState, useMemo, useCallback, useRef } from "react";
import mammoth from "mammoth";
import {
  Plus, Trash2, Sparkles, Save, FileUp, Search, X, Edit2,
  Check, FolderOpen, Play, RotateCcw, Trophy, ChevronRight, ChevronLeft,
  Lock, LogOut, Eye, RefreshCw, Upload, Type, AlertCircle, ArrowLeft,
  Tag, BookOpen, User, CheckCircle2, AlertTriangle,
} from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────
const callAI = async (messages: {role: string, content: string}[], max_tokens = 4000) => {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, max_tokens }),
  });
  if (!res.ok) throw new Error("Erreur API " + res.status);
  return res.json();
};

const getText = (d: any) => (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");

const parseJSON = (txt: string) => {
  const c = txt.replace(/```json/g, "").replace(/```/g, "").trim();
  const m = c.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : c);
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const wc = (c: string) => c.trim().split(/\s+/).filter(Boolean).length;

const entryName = (e: any) =>
  e.author && e.workTitle ? `${e.author} — ${e.workTitle}` :
  e.workTitle ? e.workTitle : e.title || "Sans titre";
const entryChapter = (e: any) => e.chapter?.trim() || "Non classé";

const PROF_CODE = "prof1234";
const STORAGE_KEY = "qcm-library-v1";

const loadLibrary = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};

const saveLibrary = (lib: any[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lib)); } catch (e) { console.error(e); }
};

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
  const data = await callAI([{
    role: "user",
    content: `Analyse ce texte et extrais ses métadonnées. Réponds UNIQUEMENT en JSON valide.${hint}
Format: {"author":"Prénom Nom","workTitle":"Titre de l'œuvre","chapter":"Mouvement littéraire","notions":["notion1","notion2","notion3"]}
Fichier: ${filename}
Texte: ${snippet}`,
  }], 600);
  return parseJSON(getText(data));
}

const shuffle = (arr: any[]) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const prepareQuiz = (questions: any[]) => questions.map(q => {
  const correctText = q.options[q.correctAnswer];
  const shuffled = shuffle(q.options);
  return { question: q.question, options: shuffled, correctIndex: shuffled.indexOf(correctText) };
});

// ── VALIDATION MODAL ──────────────────────────────────────────────────────────
function ValidationModal({ pending, existingChapters, onConfirm, onCancel }: any) {
  const [entries, setEntries] = useState(pending);

  const update = (id: string, field: string, val: string) =>
    setEntries((prev: any[]) => prev.map((e: any) => e.id === id ? { ...e, [field]: val } : e));
  const updateNotion = (id: string, i: number, val: string) =>
    setEntries((prev: any[]) => prev.map((e: any) => e.id === id
      ? { ...e, notions: e.notions.map((n: string, ni: number) => ni === i ? val : n) } : e));
  const addNotion = (id: string) =>
    setEntries((prev: any[]) => prev.map((e: any) => e.id === id ? { ...e, notions: [...e.notions, ""] } : e));
  const removeNotion = (id: string, i: number) =>
    setEntries((prev: any[]) => prev.map((e: any) => e.id === id
      ? { ...e, notions: e.notions.filter((_: any, ni: number) => ni !== i) } : e));
  const removeEntry = (id: string) => setEntries((prev: any[]) => prev.filter((e: any) => e.id !== id));

  const handleConfirm = () => {
    const cleaned = entries.filter((e: any) => e.content).map((e: any) => ({
      ...e, chapter: e.chapter || "Non classé",
      notions: e.notions.filter((n: string) => n.trim()),
      wordCount: wc(e.content), createdAt: Date.now(),
    }));
    onConfirm(cleaned);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-black text-gray-800">Validation des métadonnées</h2>
          <button onClick={onCancel} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Auteur</label>
                    <input value={entry.author || ""} onChange={e => update(entry.id, "author", e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Titre</label>
                    <input value={entry.workTitle || ""} onChange={e => update(entry.id, "workTitle", e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Chapitre</label>
                  <input value={entry.chapter || ""} onChange={e => update(entry.id, "chapter", e.target.value)}
                    list="val-chapters" className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none" />
                  <datalist id="val-chapters">{existingChapters.map((ch: string) => <option key={ch} value={ch} />)}</datalist>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Notions</label>
                  <div className="flex flex-wrap gap-2">
                    {(entry.notions || []).map((n: string, i: number) => (
                      <div key={i} className="flex items-center gap-1 bg-purple-50 border border-purple-200 rounded-lg px-2 py-1">
                        <input value={n} onChange={e => updateNotion(entry.id, i, e.target.value)}
                          className="text-xs font-semibold text-purple-700 bg-transparent border-none outline-none min-w-12 max-w-32" />
                        <button onClick={() => removeNotion(entry.id, i)} className="text-purple-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                    <button onClick={() => addNotion(entry.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-purple-600 border border-dashed border-gray-300 rounded-lg px-2 py-1">
                      <Plus className="w-3 h-3" /> Ajouter
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl text-sm">Annuler</button>
          <button onClick={handleConfirm} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2">
            <Check className="w-4 h-4" /> Confirmer {entries.length} texte{entries.length > 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── QUIZ MODE ─────────────────────────────────────────────────────────────────
function QuizMode({ questions, onBack }: any) {
  const [prepared] = useState(() => prepareQuiz(questions));
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number,number>>({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackMode, setFeedbackMode] = useState("immediate");
  const [quizDone, setQuizDone] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [started, setStarted] = useState(false);

  const q = prepared[current];
  const chosen = answers[current];
  const isAnswered = chosen !== undefined;
  const isCorrect = chosen === q?.correctIndex;
  const score = prepared.reduce((s, _, i) => s + (answers[i] === prepared[i].correctIndex ? 1 : 0), 0);
  const pct = Math.round((score / prepared.length) * 100);

  const handleAnswer = (oi: number) => {
    if (feedbackMode === "immediate" && isAnswered) return;
    setAnswers(prev => ({ ...prev, [current]: oi }));
    if (feedbackMode === "immediate") setShowFeedback(true);
  };
  const handleNext = () => { setShowFeedback(false); current < prepared.length - 1 ? setCurrent(current + 1) : setQuizDone(true); };
  const handleRestart = () => { setAnswers({}); setCurrent(0); setShowFeedback(false); setQuizDone(false); setReviewMode(false); };

  const optStyle = (oi: number) => {
    const b = "w-full text-left p-4 rounded-xl border-2 font-medium text-sm transition-all ";
    if (feedbackMode === "immediate" && isAnswered) {
      if (oi === q.correctIndex) return b + "border-green-400 bg-green-50 text-green-800";
      if (oi === chosen) return b + "border-red-400 bg-red-50 text-red-800";
      return b + "border-gray-200 bg-gray-50 text-gray-400 cursor-default";
    }
    if (reviewMode) {
      if (oi === prepared[current].correctIndex) return b + "border-green-400 bg-green-50 text-green-800";
      if (oi === answers[current]) return b + "border-red-400 bg-red-50 text-red-800";
      return b + "border-gray-200 text-gray-500";
    }
    if (chosen === oi) return b + "border-indigo-500 bg-indigo-50 text-indigo-800";
    return b + "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer";
  };

  if (!started) return (
    <div className="flex flex-col items-center justify-center py-10 px-4">
      <div className="bg-white rounded-3xl border-2 border-indigo-200 shadow-lg p-8 max-w-md w-full text-center">
        <Trophy className="w-14 h-14 text-indigo-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Mode Entraînement</h2>
        <p className="text-gray-400 mb-6">{prepared.length} questions</p>
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-3">Mode de correction :</p>
          <div className="flex gap-3">
            {[["immediate","Immédiat"],["end","À la fin"]].map(([m,label]) => (
              <button key={m} onClick={() => setFeedbackMode(m)}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${feedbackMode === m ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setStarted(true)}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all text-lg shadow-lg">
          <Play className="w-5 h-5" /> Commencer
        </button>
        <button onClick={onBack} className="mt-3 text-sm text-gray-400 hover:text-gray-600 font-semibold">← Retour</button>
      </div>
    </div>
  );

  if (quizDone && !reviewMode) {
    const medal = pct >= 90 ? "🥇" : pct >= 70 ? "🥈" : pct >= 50 ? "🥉" : "💪";
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4">
        <div className="bg-white rounded-3xl border-2 border-indigo-200 shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-3">{medal}</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-5">{score}/{prepared.length} — {pct}%</h2>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
            <div className="h-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: pct + "%" }} />
          </div>
          <div className="flex flex-col gap-3">
            <button onClick={() => { setReviewMode(true); setCurrent(0); }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
              <Eye className="w-4 h-4" /> Revoir mes réponses
            </button>
            <button onClick={handleRestart}
              className="w-full bg-white border-2 border-gray-200 hover:border-indigo-300 text-gray-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
              <RotateCcw className="w-4 h-4" /> Recommencer
            </button>
            <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-600 font-semibold">← Retour</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      {reviewMode && (
        <button onClick={() => setReviewMode(false)} className="mb-4 text-sm text-indigo-600 font-semibold flex items-center gap-1 hover:underline">← Retour aux résultats</button>
      )}
      {!reviewMode && (
        <div className="mb-6">
          <div className="flex justify-between text-xs font-semibold text-gray-500 mb-2">
            <span>Question {current + 1} / {prepared.length}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
              style={{ width: ((Object.keys(answers).length / prepared.length) * 100) + "%" }} />
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
          <div className={`mt-4 p-4 rounded-xl font-semibold text-sm flex items-center gap-2 ${isCorrect ? "bg-green-50 text-green-800 border border-green-300" : "bg-red-50 text-red-800 border border-red-300"}`}>
            {isCorrect ? <Check className="w-5 h-5 text-green-600" /> : <X className="w-5 h-5 text-red-600" />}
            {isCorrect ? "Bonne réponse ! 🎉" : "Incorrect. Bonne réponse : " + q.options[q.correctIndex]}
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={() => { setShowFeedback(false); setCurrent(Math.max(0, current - 1)); }} disabled={current === 0}
          className="bg-white border-2 border-gray-200 hover:border-indigo-300 disabled:opacity-40 text-gray-700 font-semibold py-3 px-5 rounded-xl flex items-center gap-2">
          <ChevronLeft className="w-4 h-4" /> Précédente
        </button>
        <div className="flex-1" />
        {current < prepared.length - 1 ? (
          <button onClick={handleNext} disabled={feedbackMode === "immediate" && !isAnswered && !reviewMode}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold py-3 px-5 rounded-xl flex items-center gap-2">
            Suivante <ChevronRight className="w-4 h-4" />
          </button>
        ) : !reviewMode && (
          <button onClick={() => setQuizDone(true)}
            className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold py-3 px-5 rounded-xl flex items-center gap-2">
            <Trophy className="w-4 h-4" /> Terminer
          </button>
        )}
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function QCMApp() {
  const [role, setRole] = useState<string | null>(null);
  const [sharedLib, setSharedLib] = useState<any[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<any[] | null>(null);

  const updateLib = (lib: any[]) => { setSharedLib(lib); saveLibrary(lib); };

  if (quizQuestions) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
      <div className="bg-white border-b-2 border-indigo-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Play className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-800">Mode <span className="text-indigo-500">Entraînement</span></h1>
          </div>
          <button onClick={() => setQuizQuestions(null)} className="text-sm font-semibold text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <X className="w-4 h-4" /> Quitter
          </button>
        </div>
      </div>
      <div className="max-w-3xl mx-auto">
        <QuizMode questions={quizQuestions} onBack={() => setQuizQuestions(null)} />
      </div>
    </div>
  );

  if (!role) return <HomeScreen onSelect={(r: string) => { setSharedLib(loadLibrary()); setRole(r); }} />;
  if (role === "prof") return <ProfMode sharedLib={sharedLib} setSharedLib={updateLib} onLogout={() => setRole(null)} />;
  return <EleveMode sharedLib={sharedLib} onBack={() => setRole(null)} onStartQuiz={setQuizQuestions} onRefresh={() => setSharedLib(loadLibrary())} />;
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function HomeScreen({ onSelect }: any) {
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-blue-50 to-purple-100 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-10">
        <div className="text-5xl mb-4">📚</div>
        <h1 className="text-4xl font-black text-gray-800 mb-2">QCM Entraînement</h1>
        <p className="text-gray-500 text-lg">Choisissez votre profil</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-6 w-full max-w-xl">
        <button onClick={() => onSelect("eleve")}
          className="flex-1 bg-white rounded-3xl border-2 border-indigo-200 shadow-lg p-8 hover:border-indigo-400 hover:shadow-xl transition-all group text-center">
          <div className="text-5xl mb-4">🎓</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2 group-hover:text-indigo-700">Élève</h2>
          <p className="text-gray-400 text-sm">Choisir un chapitre et s'entraîner</p>
        </button>
        <div className="flex-1 bg-white rounded-3xl border-2 border-purple-200 shadow-lg p-8 hover:border-purple-400 transition-all text-center">
          <div className="text-5xl mb-4">👩‍🏫</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Professeur</h2>
          <p className="text-gray-400 text-sm mb-4">Gérer la bibliothèque de textes</p>
          {!showCode ? (
            <button onClick={() => setShowCode(true)} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2">
              <Lock className="w-4 h-4" /> Accéder
            </button>
          ) : (
            <div>
              <input type="password" value={code} onChange={e => { setCode(e.target.value); setErr(""); }}
                onKeyDown={e => e.key === "Enter" && (code === PROF_CODE ? onSelect("prof") : setErr("Code incorrect"))}
                className="w-full p-2.5 border-2 border-purple-300 rounded-xl text-sm text-center mb-2 focus:border-purple-500 focus:outline-none"
                placeholder="Code professeur" autoFocus />
              {err && <p className="text-red-500 text-xs mb-2">{err}</p>}
              <button onClick={() => code === PROF_CODE ? onSelect("prof") : setErr("Code incorrect")}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl text-sm">Entrer</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PROF MODE ─────────────────────────────────────────────────────────────────
function ProfMode({ sharedLib, setSharedLib, onLogout }: any) {
  const [search, setSearch] = useState("");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<any>({});
  const [newChapter, setNewChapter] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newWorkTitle, setNewWorkTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [inputTab, setInputTab] = useState("paste");
  const [dragging, setDragging] = useState(false);
  const [importError, setImportError] = useState("");
  const [pendingEntries, setPendingEntries] = useState<any[] | null>(null);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingChapters = useMemo(() => [...new Set(sharedLib.map((e: any) => entryChapter(e)))].sort() as string[], [sharedLib]);

  const addEntry = () => {
    if (!newContent.trim()) return;
    setSharedLib([...sharedLib, {
      id: uid(), chapter: newChapter || "Non classé",
      author: newAuthor || "", workTitle: newWorkTitle || "Sans titre",
      notions: [], content: newContent, createdAt: Date.now(), wordCount: wc(newContent),
    }]);
    setNewChapter(""); setNewAuthor(""); setNewWorkTitle(""); setNewContent("");
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
        entries.push({ id: uid(), filename: file.name, content, wordCount: wc(content), ...meta, status });
      } catch { entries.push({ id: uid(), filename: file.name, content: "", wordCount: 0, author: "", workTitle: file.name, chapter: "Non classé", notions: [], status: "error" }); }
    }
    setIsProcessingFiles(false); setProcessingStatus("");
    if (entries.length) setPendingEntries(entries);
    else setImportError("Aucun contenu extractible.");
  };

  const handleValidation = (confirmed: any[]) => {
    setSharedLib([...sharedLib, ...confirmed]);
    setPendingEntries(null);
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); const files = Array.from(e.dataTransfer.files).filter(f => /\.(txt|docx?)$/i.test(f.name)); if (files.length) processFiles(files); };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => { const files = Array.from(e.target.files || []); if (files.length) processFiles(files); e.target.value = ""; };

  const saveEdit = () => {
    setSharedLib(sharedLib.map((e: any) => e.id === editingId ? { ...e, ...editFields, wordCount: wc(editFields.content || e.content) } : e));
    setEditingId(null);
  };
  const deleteEntry = (id: string) => { if (confirm("Supprimer ce texte ?")) setSharedLib(sharedLib.filter((e: any) => e.id !== id)); };

  const filtered = sharedLib.filter((e: any) => {
    const matchChapter = chapterFilter === "all" || entryChapter(e) === chapterFilter;
    const term = search.toLowerCase();
    return matchChapter && (!term || entryName(e).toLowerCase().includes(term) || e.content.toLowerCase().includes(term));
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {isProcessingFiles && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <Sparkles className="w-10 h-10 text-purple-600 animate-pulse mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-800 mb-2">Analyse en cours…</h3>
            <p className="text-sm text-gray-500">{processingStatus}</p>
          </div>
        </div>
      )}
      {pendingEntries && <ValidationModal pending={pendingEntries} existingChapters={existingChapters} onConfirm={handleValidation} onCancel={() => setPendingEntries(null)} />}

      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">👩‍🏫</span>
            <h1 className="text-lg font-bold text-gray-800">Espace Professeur</h1>
            <span className="text-xs bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">{sharedLib.length} texte{sharedLib.length !== 1 ? "s" : ""}</span>
          </div>
          <button onClick={onLogout} className="text-sm text-gray-500 hover:text-red-600 font-semibold flex items-center gap-1.5">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 flex gap-6">
        <div className="w-80 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-200">
              {[["paste","Coller"],["file","Importer"]].map(([t,label]) => (
                <button key={t} onClick={() => setInputTab(t)}
                  className={`flex-1 py-3 text-xs font-bold transition-all ${inputTab === t ? "bg-purple-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="p-5 space-y-3">
              {inputTab === "paste" ? (
                <>
                  {([["Chapitre / Thème", newChapter, setNewChapter, "Ex: Le Romantisme", "chapters-list"],
                    ["Auteur", newAuthor, setNewAuthor, "Ex: Victor Hugo", null],
                    ["Titre de l'œuvre", newWorkTitle, setNewWorkTitle, "Ex: Les Misérables", null]] as any[]).map(([label, val, setter, ph, listId]) => (
                    <div key={label}>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
                      <input value={val} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setter(e.target.value)} list={listId || undefined}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none" placeholder={ph} />
                      {listId && <datalist id={listId}>{existingChapters.map(ch => <option key={ch} value={ch} />)}</datalist>}
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Texte</label>
                    <textarea value={newContent} onChange={e => setNewContent(e.target.value)}
                      className="w-full h-36 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm resize-none focus:border-purple-400 focus:outline-none"
                      placeholder="Collez le texte ici…" />
                  </div>
                  <button onClick={addEntry} disabled={!newContent.trim()}
                    className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${newContent.trim() ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
                    <Plus className="w-4 h-4" /> Ajouter
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Chapitre (optionnel)</label>
                    <input value={newChapter} onChange={e => setNewChapter(e.target.value)} list="chapters-list2"
                      className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none" placeholder="Détecté automatiquement" />
                    <datalist id="chapters-list2">{existingChapters.map(ch => <option key={ch} value={ch} />)}</datalist>
                  </div>
                  <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${dragging ? "border-purple-400 bg-purple-50" : "border-gray-300 hover:border-purple-300"}`}>
                    <input ref={fileInputRef} type="file" multiple accept=".txt,.docx" onChange={handleFileInput} className="hidden" />
                    <FileUp className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm font-bold text-gray-700">Glissez vos fichiers</p>
                    <p className="text-xs text-gray-400 mt-1">.txt · .docx</p>
                  </div>
                  {importError && <p className="text-xs text-red-600 font-semibold">{importError}</p>}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none"
                placeholder="Rechercher…" />
            </div>
            <select value={chapterFilter} onChange={e => setChapterFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-700 focus:outline-none">
              <option value="all">Tous les chapitres</option>
              {existingChapters.map(ch => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-72 bg-white rounded-2xl border-2 border-dashed border-gray-200 text-center p-8">
              <FolderOpen className="w-14 h-14 text-gray-200 mb-4" />
              <p className="text-lg font-bold text-gray-400">{sharedLib.length === 0 ? "Bibliothèque vide" : "Aucun résultat"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((entry: any) => (
                <div key={entry.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:border-purple-200 transition-all overflow-hidden">
                  {editingId === entry.id ? (
                    <div className="p-5 space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        {([["Chapitre","chapter"],["Auteur","author"],["Titre","workTitle"]] as [string,string][]).map(([label, field]) => (
                          <div key={field}>
                            <label className="block text-xs font-bold text-gray-400 mb-1">{label}</label>
                            <input value={editFields[field] || ""} onChange={e => setEditFields((f: any) => ({ ...f, [field]: e.target.value }))}
                              className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-purple-400 focus:outline-none" />
                          </div>
                        ))}
                      </div>
                      <textarea value={editFields.content || ""} onChange={e => setEditFields((f: any) => ({ ...f, content: e.target.value }))}
                        className="w-full h-32 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm resize-none focus:outline-none" />
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg text-sm flex items-center gap-1.5">
                          <Check className="w-4 h-4" /> Sauvegarder
                        </button>
                        <button onClick={() => setEditingId(null)} className="bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg text-sm">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4 p-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{entryChapter(entry)}</span>
                          {(entry.notions || []).slice(0, 3).map((n: string, i: number) => (
                            <span key={i} className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full">{n}</span>
                          ))}
                        </div>
                        <h3 className="font-bold text-gray-800 text-sm mt-1">{entryName(entry)}</h3>
                        <p className="text-xs text-gray-400 mb-1">{entry.wordCount} mots · {fmtDate(entry.createdAt)}</p>
                        <p className="text-xs text-gray-500 line-clamp-2">{entry.content.slice(0, 160)}…</p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => { setEditingId(entry.id); setEditFields({ chapter: entryChapter(entry), author: entry.author || "", workTitle: entry.workTitle || "", content: entry.content }); }}
                          className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => deleteEntry(entry.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
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
function EleveMode({ sharedLib, onBack, onStartQuiz, onRefresh }: any) {
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<string,boolean>>({});
  const [numQ, setNumQ] = useState(10);
  const [difficulty, setDifficulty] = useState("mixte");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const chapters = useMemo(() => {
    const map: Record<string,number> = {};
    sharedLib.forEach((e: any) => { const ch = entryChapter(e); map[ch] = (map[ch] || 0) + 1; });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sharedLib]);

  const textsInChapter = useMemo(() => selectedChapter ? sharedLib.filter((e: any) => entryChapter(e) === selectedChapter) : [], [sharedLib, selectedChapter]);
  const selectChapter = (ch: string) => { setSelectedChapter(ch); const ids: Record<string,boolean> = {}; sharedLib.filter((e: any) => entryChapter(e) === ch).forEach((e: any) => ids[e.id] = true); setSelectedIds(ids); };
  const toggleId = (id: string) => setSelectedIds(prev => { const n = { ...prev }; if (n[id]) delete n[id]; else n[id] = true; return n; });
  const selectedEntries = textsInChapter.filter((e: any) => selectedIds[e.id]);
  const allSelected = textsInChapter.length > 0 && textsInChapter.every((e: any) => selectedIds[e.id]);
  const toggleAll = () => { if (allSelected) setSelectedIds({}); else { const ids: Record<string,boolean> = {}; textsInChapter.forEach((e: any) => ids[e.id] = true); setSelectedIds(ids); } };

  const generateAndStart = async () => {
    if (!selectedEntries.length) { setError("Sélectionne au moins un texte."); return; }
    setIsGenerating(true); setError("");
    const allContent = selectedEntries.map((e: any) => `=== ${entryName(e)} ===\n${e.content}`).join("\n\n");
    const diffHint = difficulty !== "mixte" ? `\nNiveau : ${difficulty}` : "\nMélange facile/moyen/difficile";
    try {
      let allQs: any[] = [], rem = numQ;
      while (rem > 0) {
        const batchSize = Math.min(20, rem); rem -= batchSize;
        const already = allQs.length ? "\n\nNe pas répéter:\n" + allQs.map((q, i) => `${i+1}. ${q.question}`).join("\n") : "";
        setProgress(`Génération : ${allQs.length}/${numQ}…`);
        const data = await callAI([{ role: "user", content:
          `Génère EXACTEMENT ${batchSize} QCM variées. Règle: bonne réponse en position 0, 4 choix.${diffHint}${already}\nFormat JSON: [{"q":"?","r":["Bonne","Fausse1","Fausse2","Fausse3"]}]\n\nTexte:\n${allContent}`
        }]);
        const parsed = parseJSON(getText(data));
        allQs = allQs.concat(parsed.map((item: any) => ({ question: item.q, options: item.r, correctAnswer: 0 })));
      }
      onStartQuiz(allQs);
    } catch (e: any) { setError("Erreur : " + e.message); }
    finally { setIsGenerating(false); setProgress(""); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="bg-white border-b-2 border-indigo-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedChapter && <button onClick={() => { setSelectedChapter(null); setSelectedIds({}); }} className="p-2 text-gray-500 hover:text-indigo-600 rounded-lg"><ArrowLeft className="w-5 h-5" /></button>}
            <span className="text-2xl">🎓</span>
            <h1 className="text-lg font-bold text-gray-800">{selectedChapter || "Espace Élève"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onRefresh} className="p-2 text-gray-400 hover:text-indigo-600 rounded-lg"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={onBack} className="text-sm font-semibold text-gray-500 hover:text-gray-700 flex items-center gap-1"><LogOut className="w-4 h-4" /> Accueil</button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {sharedLib.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-xl font-bold text-gray-400">Aucun chapitre disponible</p>
          </div>
        ) : !selectedChapter ? (
          <>
            <h2 className="text-2xl font-black text-gray-800 mb-2 text-center">Quel chapitre veux-tu réviser ?</h2>
            <p className="text-gray-500 text-center mb-8">Clique sur un chapitre pour voir les textes</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {chapters.map(([ch, count]) => (
                <button key={ch} onClick={() => selectChapter(ch)}
                  className="bg-white rounded-2xl border-2 border-gray-200 shadow-sm p-6 text-left hover:border-indigo-400 hover:shadow-lg transition-all group">
                  <div className="text-3xl mb-3">📖</div>
                  <h3 className="font-bold text-gray-800 text-lg mb-1 group-hover:text-indigo-700">{ch}</h3>
                  <p className="text-sm text-gray-400">{count} texte{count > 1 ? "s" : ""}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-black text-gray-800">Choisis tes textes</h2>
              <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl">
                {allSelected ? <><X className="w-4 h-4" /> Tout désélectionner</> : <><Check className="w-4 h-4" /> Tout sélectionner</>}
              </button>
            </div>
            <div className="space-y-3 mb-6">
              {textsInChapter.map((entry: any) => {
                const isSel = !!selectedIds[entry.id];
                return (
                  <button key={entry.id} onClick={() => toggleId(entry.id)}
                    className={`w-full text-left bg-white rounded-2xl border-2 shadow-sm p-5 transition-all ${isSel ? "border-indigo-500 ring-2 ring-indigo-100" : "border-gray-200 hover:border-indigo-300"}`}>
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center mt-0.5 ${isSel ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                        {isSel && <Check className="w-4 h-4 text-white" />}
                      </div>
                      <div>
                        <h3 className={`font-bold text-base ${isSel ? "text-indigo-700" : "text-gray-800"}`}>{entryName(entry)}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">{entry.wordCount} mots · {fmtDate(entry.createdAt)}</p>
                        {(entry.notions || []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {entry.notions.slice(0, 4).map((n: string, i: number) => (
                              <span key={i} className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full">{n}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedEntries.length > 0 && (
              <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-lg p-6">
                <div className="flex flex-wrap items-end gap-4 mb-4">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-700">{selectedEntries.length} texte{selectedEntries.length > 1 ? "s" : ""} sélectionné{selectedEntries.length > 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase mb-1.5">Questions</p>
                      <input type="number" min="5" max="50" value={numQ} onChange={e => setNumQ(Math.max(5, Math.min(50, parseInt(e.target.value) || 5)))}
                        className="w-16 p-2 border-2 border-indigo-300 rounded-xl text-center font-bold focus:outline-none" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase mb-1.5">Difficulté</p>
                      <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
                        className="p-2 border-2 border-indigo-300 rounded-xl text-sm font-semibold focus:outline-none bg-white">
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
                  className={`w-full font-bold py-4 rounded-2xl flex items-center justify-center gap-3 text-white text-lg shadow-lg ${isGenerating ? "bg-gray-300" : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"}`}>
                  {isGenerating ? <><Sparkles className="w-6 h-6 animate-spin" /> Génération…</> : <><Play className="w-6 h-6" /> Lancer le quiz — {numQ} questions</>}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}