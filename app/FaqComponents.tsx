"use client";
// app/FaqComponents.tsx
// - FaqEleve         : FAQ côté élève (fil élève ↔ prof, question du jour, plus consultées,
//                      « Teste-toi » vrai/faux, poser une question, "Mes questions")
// - ProfFaqManager   : gestion prof (questions reçues + FAQ publiée)
// - usePendingFaqCount : nombre de questions en attente (badge Mode Prof)

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export type FaqItem = {
  id: string;
  question: string;
  reponse: string;
  serie: "toutes" | "generale" | "techno" | "hlp";
  createdAt: number;
  categorie?: string;
  epingle?: boolean;
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const getVisitorId = (): string => {
  try {
    let id = localStorage.getItem("qcm_visitor_id");
    if (!id) {
      id = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      localStorage.setItem("qcm_visitor_id", id);
    }
    return id;
  } catch {
    return "t_" + Math.random().toString(36).slice(2, 10); // stockage bloqué : id temporaire
  }
};

// Code prof gardé le temps de la session (posé à la connexion Mode Prof)
const getProfCode = () => {
  try { return sessionStorage.getItem("prof_code_session") || ""; } catch { return ""; }
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ");

const STOP = new Set([
  "comment", "quelle", "quel", "quels", "quelles", "dans", "pour", "avec", "faire", "cette",
  "sont", "fait", "dois", "peut", "peux", "plus", "mais", "donc", "alors", "aussi", "quand",
  "etre", "avoir", "est-ce", "vous", "nous",
]);

// Mots-clés d'une phrase, réduits à leurs 6 premières lettres ("paraphrase" ~ "paraphraser")
const tokens = (s: string): string[] =>
  Array.from(
    new Set(
      norm(s)
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOP.has(w))
        .map((w) => w.slice(0, 6))
    )
  );

const catOf = (i: FaqItem) => i.categorie?.trim() || "Général";

const SERIE_LABELS: Record<FaqItem["serie"], string> = {
  toutes: "Toutes les séries",
  generale: "Série Générale",
  techno: "Série Techno",
  hlp: "HLP",
};
const SERIE_COLORS: Record<FaqItem["serie"], string> = {
  toutes: "bg-gray-100 text-gray-700",
  generale: "bg-blue-100 text-blue-700",
  techno: "bg-orange-100 text-orange-700",
  hlp: "bg-emerald-100 text-emerald-700",
};
const PRESET_CATS = [
  "Introduction", "Plan", "Paragraphe", "Explication de texte",
  "Citations et exemples", "Examen / bac", "Fonctionnement du site",
];

// ── Badge Mode Prof ──────────────────────────────────────────────────────────
export function usePendingFaqCount(intervalMs = 45000) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const r = await fetch("/api/faq?scope=count", {
          headers: { "x-prof-code": getProfCode() },
          cache: "no-store",
        });
        if (!r.ok) return;
        const d = await r.json();
        if (alive) setN(d.pending || 0);
      } catch { /* silencieux */ }
    };
    run();
    const t = setInterval(run, intervalMs);
    window.addEventListener("faq-changed", run);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("faq-changed", run);
    };
  }, [intervalMs]);
  return n;
}

// ══════════════════════════════════════════════════════════════════════════════
// CÔTÉ ÉLÈVE
// ══════════════════════════════════════════════════════════════════════════════
type MyQuestion = {
  id: string;
  question: string;
  statut: string;
  reponse: string | null;
  created_at: string;
};

const STATUT_UI: Record<string, { label: string; cls: string }> = {
  en_attente: { label: "⏳ En attente de réponse", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  publiee: { label: "✅ Répondue et publiée dans la FAQ", cls: "bg-green-50 text-green-700 border-green-200" },
  repondue: { label: "✅ Réponse du professeur", cls: "bg-green-50 text-green-700 border-green-200" },
  rejetee: { label: "Non retenue pour la FAQ", cls: "bg-gray-50 text-gray-500 border-gray-200" },
};

// Questions déjà ouvertes par cet élève (pour ne compter qu'une vue par élève)
const SEEN_KEY = "faq_vues_locales";
const getSeen = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); }
};
const markSeen = (id: string) => {
  const s = getSeen();
  if (s.has(id)) return false;
  s.add(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(s).slice(-300))); } catch { /* ignore */ }
  return true;
};

const parseJSONLoose = (txt: string) => {
  const c = txt.replace(/```json/g, "").replace(/```/g, "").trim();
  const m = c.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : c);
};

// Petite mise en forme : **gras** et listes
function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        const b = line.match(/^\s*[-*•]\s+(.*)$/);
        const parts = (b ? b[1] : line).split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>);
        return b
          ? <div key={i} className="flex gap-2"><span className="opacity-60">•</span><span>{parts}</span></div>
          : <p key={i}>{parts}</p>;
      })}
    </div>
  );
}

const Avatar = ({ kind }: { kind: "prof" | "eleve" }) => (
  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${kind === "prof" ? "bg-indigo-600 text-white" : "bg-amber-100"}`}>
    {kind === "prof" ? "👩‍🏫" : "🙋"}
  </div>
);

type QuizItem = { affirmation: string; vrai: boolean; explication: string; faq_id?: string };

export function FaqEleve({
  items, serie, matiere, eleveNom, askAI,
}: {
  items: FaqItem[]; serie: string | null; matiere: string; eleveNom?: string;
  askAI?: (messages: { role: string; content: string }[]) => Promise<string>;
}) {
  const serieKey = matiere === "hlp" ? "hlp" : serie === "techno" ? "techno" : "generale";

  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<Record<string, "typing" | "shown">>({});
  const [vues, setVues] = useState<Record<string, number>>({});
  const [question, setQuestion] = useState("");
  const [website, setWebsite] = useState(""); // champ piège anti-spam (invisible)
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [mine, setMine] = useState<MyQuestion[]>([]);
  // Teste-toi
  const [quiz, setQuiz] = useState<QuizItem[] | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizErr, setQuizErr] = useState("");
  const [qi, setQi] = useState(0);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const vid = useRef("");
  const listRef = useRef<HTMLDivElement>(null);

  const loadMine = async () => {
    if (!vid.current) return;
    try {
      const r = await fetch("/api/faq?visitor_id=" + encodeURIComponent(vid.current), { cache: "no-store" });
      if (r.ok) setMine((await r.json()).questions || []);
    } catch { /* silencieux */ }
  };

  useEffect(() => {
    vid.current = getVisitorId();
    loadMine();
    fetch("/api/faq?scope=popular", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.vues && setVues(d.vues))
      .catch(() => { /* silencieux */ });
  }, []);

  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);

  // Ouvre une réponse : petite animation « le prof écrit… » puis la réponse
  const reveal = (id: string, scroll = false) => {
    if (open[id]) {
      if (!scroll) { setOpen((o) => { const n = { ...o }; delete n[id]; return n; }); return; }
    } else {
      setOpen((o) => ({ ...o, [id]: "typing" }));
      setTimeout(() => setOpen((o) => (o[id] ? { ...o, [id]: "shown" } : o)), 650);
      if (markSeen(id)) {
        setVues((v) => ({ ...v, [id]: (v[id] || 0) + 1 }));
        fetch("/api/faq", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "view", id, visitor_id: vid.current }),
        }).catch(() => { /* silencieux */ });
      }
    }
    if (scroll) {
      setSearch(""); setCat("all");
      setTimeout(() => document.getElementById("faq-" + id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    }
  };

  const cats = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach((i) => { m[catOf(i)] = (m[catOf(i)] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const visible = useMemo(() => {
    const s = norm(search).trim();
    return items
      .filter((i) => (cat === "all" || catOf(i) === cat) && (!s || norm(i.question + " " + i.reponse).includes(s)))
      .sort((a, b) => Number(!!b.epingle) - Number(!!a.epingle) || b.createdAt - a.createdAt);
  }, [items, search, cat]);

  // Question du jour : change chaque jour, la même pour tous les élèves
  const duJour = useMemo(() => {
    if (items.length === 0) return null;
    const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
    const day = Math.floor(Date.now() / 86400000);
    return sorted[day % sorted.length];
  }, [items]);

  const populaires = useMemo(
    () => items
      .filter((i) => (vues[i.id] || 0) > 0)
      .sort((a, b) => (vues[b.id] || 0) - (vues[a.id] || 0))
      .slice(0, 3),
    [items, vues]
  );

  // Questions déjà présentes dans la FAQ qui ressemblent à ce que tape l'élève
  const similar = useMemo(() => {
    const q = tokens(question);
    if (q.length === 0 || question.trim().length < 8) return [];
    const qs = new Set(q);
    return items
      .map((i) => ({ i, score: tokens(i.question).filter((t) => qs.has(t)).length }))
      .filter((x) => x.score >= Math.min(2, q.length))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.i);
  }, [question, items]);

  // ── Teste-toi : 5 affirmations vrai/faux tirées de la FAQ ─────────────────
  const startQuiz = async () => {
    if (!askAI || items.length === 0 || quizLoading) return;
    setQuizLoading(true); setQuizErr(""); setQuiz(null); setQi(0); setAnswer(null); setScore(0);
    const pool = [...items].sort(() => Math.random() - 0.5).slice(0, 10);
    const corpus = pool.map((f) => `[id:${f.id}]\nQ: ${f.question}\nR: ${f.reponse.slice(0, 450)}`).join("\n\n");
    try {
      const txt = await askAI([{
        role: "user",
        content: `Voici des questions-réponses rédigées par un professeur de philosophie sur la méthode (dissertation, explication de texte…).

${corpus}

Écris 5 affirmations courtes (une phrase chacune) pour vérifier qu'un élève de Terminale a compris ces réponses. Environ la moitié doivent être vraies, les autres fausses mais plausibles (une erreur de méthode fréquente). Chaque affirmation doit s'appuyer UNIQUEMENT sur les réponses ci-dessus.
Réponds uniquement en JSON : [{"affirmation":"...","vrai":true,"explication":"une ou deux phrases qui corrigent ou confirment","faq_id":"l'id de la question utilisée"}]`,
      }]);
      const arr = parseJSONLoose(txt);
      const clean: QuizItem[] = (Array.isArray(arr) ? arr : [])
        .filter((x: any) => x && typeof x.affirmation === "string" && typeof x.vrai === "boolean")
        .slice(0, 5);
      if (clean.length === 0) throw new Error("vide");
      setQuiz(clean);
    } catch {
      setQuizErr("Impossible de préparer le test pour l'instant. Réessaie dans un instant.");
    }
    setQuizLoading(false);
  };

  const pick = (v: boolean) => {
    if (!quiz || answer !== null) return;
    setAnswer(v);
    if (v === quiz[qi].vrai) setScore((s) => s + 1);
  };
  const nextQ = () => { setAnswer(null); setQi((i) => i + 1); };

  const send = async () => {
    const text = question.trim();
    if (text.length < 5 || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ask",
          question: text,
          visitor_id: vid.current,
          eleve_nom: eleveNom || "Anonyme",
          serie: serieKey,
          website,
        }),
      });
      if (r.status === 429) {
        setFeedback({ type: "err", text: "Tu as déjà envoyé plusieurs questions à la suite. Réessaie dans une heure." });
      } else if (!r.ok) {
        setFeedback({ type: "err", text: "L'envoi a échoué. Vérifie ta connexion et réessaie." });
      } else {
        setQuestion("");
        setFeedback({ type: "ok", text: "Question envoyée au professeur. Tu la retrouveras dans « Mes questions » avec sa réponse." });
        loadMine();
      }
    } catch {
      setFeedback({ type: "err", text: "Connexion impossible. Réessaie dans un instant." });
    }
    setSending(false);
  };

  const current = quiz && qi < quiz.length ? quiz[qi] : null;

  return (
    <div className="space-y-5">
      {/* ── En haut : question du jour + teste-toi ─────────────────────────── */}
      {items.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {duJour && (
            <button
              onClick={() => reveal(duJour.id, true)}
              className="text-left bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 hover:border-amber-400 rounded-2xl p-4 transition-all">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">☀️ Question du jour</p>
              <p className="font-bold text-gray-800 text-sm mt-1.5 leading-snug">{duJour.question}</p>
              <p className="text-xs font-bold text-amber-700 mt-2">Voir la réponse du prof →</p>
            </button>
          )}
          {askAI && (
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border-2 border-violet-200 rounded-2xl p-4 flex flex-col">
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-700">🎯 Teste-toi</p>
              <p className="font-bold text-gray-800 text-sm mt-1.5 leading-snug">Vrai ou faux ? 5 affirmations tirées des réponses du prof.</p>
              <button
                onClick={startQuiz}
                disabled={quizLoading}
                className="mt-auto pt-2 text-left text-xs font-bold text-violet-700 hover:text-violet-900 disabled:text-violet-300">
                {quizLoading ? "Préparation du test…" : quiz ? "Recommencer un test →" : "Lancer le test →"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Teste-toi : le jeu ─────────────────────────────────────────────── */}
      {quizErr && <p className="text-sm font-semibold rounded-xl px-3 py-2 border bg-red-50 text-red-700 border-red-200">{quizErr}</p>}
      {quiz && (
        <div className="bg-white border-2 border-violet-200 rounded-2xl p-5">
          {current ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-black text-violet-700">Affirmation {qi + 1} / {quiz.length}</p>
                <div className="flex gap-1">
                  {quiz.map((_, i) => (
                    <span key={i} className={`w-6 h-1.5 rounded-full ${i < qi ? "bg-violet-500" : i === qi ? "bg-violet-300" : "bg-gray-200"}`} />
                  ))}
                </div>
              </div>
              <p className="font-bold text-gray-800 text-base leading-snug">« {current.affirmation} »</p>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {[true, false].map((v) => {
                  const chosen = answer === v;
                  const right = answer !== null && v === current.vrai;
                  return (
                    <button
                      key={String(v)}
                      onClick={() => pick(v)}
                      disabled={answer !== null}
                      className={`py-3 rounded-xl font-black text-sm border-2 transition-all ${
                        answer === null
                          ? "border-gray-200 hover:border-violet-400 hover:bg-violet-50 text-gray-700"
                          : right
                          ? "border-green-400 bg-green-50 text-green-700"
                          : chosen
                          ? "border-red-300 bg-red-50 text-red-600"
                          : "border-gray-100 text-gray-300"
                      }`}>
                      {v ? "✅ Vrai" : "❌ Faux"}
                    </button>
                  );
                })}
              </div>
              {answer !== null && (
                <div className={`mt-4 rounded-xl p-3 text-sm leading-relaxed border ${answer === current.vrai ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
                  <p className="font-black mb-1">{answer === current.vrai ? "Bien vu !" : "Pas tout à fait."}</p>
                  <p>{current.explication}</p>
                  <div className="flex items-center justify-between mt-3 gap-2">
                    {current.faq_id && byId[current.faq_id] ? (
                      <button onClick={() => reveal(current.faq_id!, true)} className="text-xs font-bold underline">
                        Relire la réponse du prof
                      </button>
                    ) : <span />}
                    <button onClick={nextQ} className="text-xs font-black bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl">
                      {qi + 1 < quiz.length ? "Suivante →" : "Voir mon score"}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-2">
              <p className="text-3xl mb-1">{score === quiz.length ? "🏆" : score >= quiz.length / 2 ? "👍" : "📚"}</p>
              <p className="font-black text-gray-800">{score} / {quiz.length} bonnes réponses</p>
              <p className="text-xs text-gray-500 mt-1">
                {score === quiz.length ? "Parfait, la méthode est bien en place." : "Relis les réponses du prof ci-dessous, puis retente ta chance."}
              </p>
              <div className="flex justify-center gap-2 mt-3">
                <button onClick={startQuiz} className="text-xs font-black bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl">Nouveau test</button>
                <button onClick={() => setQuiz(null)} className="text-xs font-bold text-gray-500 px-3 py-2">Fermer</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Les plus consultées ─────────────────────────────────────────────── */}
      {populaires.length > 0 && (
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-gray-500 px-1 mb-2">🔥 Les plus consultées</p>
          <div className="flex flex-col sm:flex-row gap-2">
            {populaires.map((p, i) => (
              <button
                key={p.id}
                onClick={() => reveal(p.id, true)}
                className="flex-1 text-left bg-white border-2 border-rose-100 hover:border-rose-300 rounded-2xl px-4 py-3 transition-all">
                <span className="text-xs font-black text-rose-500">#{i + 1}</span>
                <p className="text-xs font-bold text-gray-800 mt-0.5 leading-snug line-clamp-2">{p.question}</p>
                <p className="text-[11px] text-gray-400 mt-1">{vues[p.id]} élève{vues[p.id] > 1 ? "s l'ont lue" : " l'a lue"}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Recherche + catégories ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border-2 border-indigo-100 p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none text-gray-800"
            placeholder="Cherche un mot : introduction, citation, synthèse…"
          />
        </div>
        {cats.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCat("all")}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${cat === "all" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}>
              Toutes ({items.length})
            </button>
            {cats.map(([c, n]) => (
              <button
                key={c}
                onClick={() => setCat(cat === c ? "all" : c)}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${cat === c ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}>
                {c} ({n})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Fil de conversation élève ↔ prof ────────────────────────────────── */}
      <div ref={listRef} className="space-y-4">
        {items.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            <div className="text-3xl mb-2">💬</div>
            <p className="font-bold text-gray-600 text-sm">Pas encore de questions dans la FAQ</p>
            <p className="text-xs text-gray-400 mt-1">Pose la première question au professeur ci-dessous.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            <p className="font-bold text-gray-600 text-sm">Aucune réponse ne correspond à ta recherche</p>
            <p className="text-xs text-gray-400 mt-1">Pose ta question au professeur juste en dessous.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 px-1">
              {visible.length} échange{visible.length > 1 ? "s" : ""} · touche une question pour voir la réponse du prof
            </p>
            {visible.map((item) => {
              const st = open[item.id];
              const n = vues[item.id] || 0;
              return (
                <div key={item.id} id={"faq-" + item.id} className="space-y-2">
                  {/* Bulle élève */}
                  <button onClick={() => reveal(item.id)} className="w-full flex justify-end items-end gap-2 group text-left">
                    <div className={`max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 border-2 transition-all ${st ? "bg-amber-50 border-amber-300" : "bg-white border-amber-100 group-hover:border-amber-300"}`}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {item.epingle && <span className="text-[10px] font-black bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full">⭐ À lire</span>}
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{catOf(item)}</span>
                        {n > 0 && <span className="text-[10px] text-gray-400">· 👀 {n}</span>}
                      </div>
                      <p className="font-bold text-gray-800 text-sm leading-snug">{item.question}</p>
                      {!st && <p className="text-[11px] font-bold text-indigo-500 mt-1.5">Voir la réponse du prof ↓</p>}
                    </div>
                    <Avatar kind="eleve" />
                  </button>

                  {/* Bulle prof */}
                  {st && (
                    <div className="flex items-end gap-2">
                      <Avatar kind="prof" />
                      {st === "typing" ? (
                        <div className="bg-indigo-600 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                          <span className="w-2 h-2 bg-white/70 rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-2 h-2 bg-white/70 rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-2 h-2 bg-white/70 rounded-full animate-bounce" />
                        </div>
                      ) : (
                        <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed shadow-sm">
                          <p className="text-[10px] font-black uppercase tracking-wider text-indigo-200 mb-1">Le professeur</p>
                          <Rich text={item.reponse} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ── Écrire au professeur ────────────────────────────────────────────── */}
      <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Avatar kind="prof" />
          <div>
            <p className="font-black text-indigo-800 text-sm">Tu ne trouves pas ta réponse ?</p>
            <p className="text-xs text-indigo-600">Écris au professeur. Sa réponse arrivera dans « Mes questions ».</p>
          </div>
        </div>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          maxLength={1000}
          className="w-full px-4 py-3 border-2 border-indigo-200 rounded-2xl text-sm focus:border-indigo-400 focus:outline-none bg-white resize-none text-gray-800"
          placeholder="Écris ta question en une ou deux phrases…"
        />
        {/* champ piège : invisible pour les élèves, rempli par les robots */}
        <input
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="hidden"
          aria-hidden="true"
        />
        {similar.length > 0 && (
          <div className="bg-white border border-amber-200 rounded-xl p-3">
            <p className="text-xs font-bold text-amber-800 mb-2">Le prof a peut-être déjà répondu :</p>
            <div className="space-y-1.5">
              {similar.map((s) => (
                <button
                  key={s.id}
                  onClick={() => reveal(s.id, true)}
                  className="block w-full text-left text-xs font-semibold text-indigo-700 hover:text-indigo-900 hover:underline">
                  {s.question}
                </button>
              ))}
            </div>
          </div>
        )}
        {feedback && (
          <p className={`text-sm font-semibold rounded-xl px-3 py-2 border ${feedback.type === "ok" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
            {feedback.text}
          </p>
        )}
        <button
          onClick={send}
          disabled={question.trim().length < 5 || sending}
          className={`w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all ${question.trim().length >= 5 && !sending ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-300"}`}>
          {sending ? "Envoi en cours…" : "Envoyer ma question au professeur"}
        </button>
      </div>

      {/* ── Mes questions ───────────────────────────────────────────────────── */}
      {mine.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-black text-gray-800 text-sm px-1">Mes questions</h3>
          {mine.map((q) => {
            const ui = STATUT_UI[q.statut] || STATUT_UI.en_attente;
            return (
              <div key={q.id} className="space-y-2">
                <div className="flex justify-end items-end gap-2">
                  <div className="max-w-[85%] bg-white border-2 border-amber-100 rounded-2xl rounded-br-md px-4 py-3">
                    <p className="text-sm font-bold text-gray-800">{q.question}</p>
                    <span className={`inline-block mt-2 text-[11px] font-bold px-2 py-0.5 rounded-full border ${ui.cls}`}>{ui.label}</span>
                  </div>
                  <Avatar kind="eleve" />
                </div>
                {q.reponse && (
                  <div className="flex items-end gap-2">
                    <Avatar kind="prof" />
                    <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed">
                      <Rich text={q.reponse} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CÔTÉ PROF
// ══════════════════════════════════════════════════════════════════════════════
type ProfQuestion = {
  id: string;
  question: string;
  statut: string;
  reponse: string | null;
  serie: string | null;
  eleve_nom: string | null;
  created_at: string;
};

export function ProfFaqManager({
  faqMethode, setFaqMethode,
}: { faqMethode: FaqItem[]; setFaqMethode: (f: FaqItem[]) => void }) {
  const [tab, setTab] = useState<"questions" | "faq">("questions");

  // Questions reçues
  const [qs, setQs] = useState<ProfQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rep, setRep] = useState("");
  const [repCat, setRepCat] = useState("");
  const [repSerie, setRepSerie] = useState<FaqItem["serie"]>("toutes");
  const [busy, setBusy] = useState(false);

  // FAQ publiée
  const [nq, setNq] = useState("");
  const [nr, setNr] = useState("");
  const [ns, setNs] = useState<FaqItem["serie"]>("toutes");
  const [nc, setNc] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [eq, setEq] = useState("");
  const [er, setEr] = useState("");
  const [es, setEs] = useState<FaqItem["serie"]>("toutes");
  const [ec, setEc] = useState("");

  const load = async () => {
    try {
      const r = await fetch("/api/faq?scope=all", { headers: { "x-prof-code": getProfCode() }, cache: "no-store" });
      if (r.status === 401) setErr("Accès refusé. Quitte le Mode Prof puis reconnecte-toi avec ton code.");
      else if (!r.ok) setErr("Impossible de charger les questions.");
      else { setQs((await r.json()).questions || []); setErr(""); }
    } catch {
      setErr("Connexion impossible.");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
  }, []);

  const call = async (payload: Record<string, unknown>) => {
    const r = await fetch("/api/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-prof-code": getProfCode() },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(String(r.status));
    window.dispatchEvent(new Event("faq-changed"));
  };

  const answer = async (q: ProfQuestion, publier: boolean) => {
    if (!rep.trim() || busy) return;
    setBusy(true);
    try {
      await call({ action: "answer", id: q.id, reponse: rep.trim(), publier });
      if (publier) {
        setFaqMethode([
          { id: uid(), question: q.question, reponse: rep.trim(), serie: repSerie, categorie: repCat.trim() || undefined, createdAt: Date.now() },
          ...faqMethode,
        ]);
      }
      setOpenId(null); setRep(""); setRepCat("");
      await load();
    } catch {
      alert("L'enregistrement a échoué. Réessaie.");
    }
    setBusy(false);
  };

  const reject = async (q: ProfQuestion) => {
    if (!confirm("Ne pas retenir cette question ? L'élève verra « Non retenue pour la FAQ ».")) return;
    try { await call({ action: "reject", id: q.id }); await load(); } catch { alert("Échec de l'action."); }
  };

  const remove = async (q: ProfQuestion) => {
    if (!confirm("Supprimer définitivement cette question ?")) return;
    try { await call({ action: "delete", id: q.id }); await load(); } catch { alert("Échec de la suppression."); }
  };

  const openAnswer = (q: ProfQuestion) => {
    setOpenId(q.id);
    setRep(q.reponse || "");
    setRepCat("");
    setRepSerie((["generale", "techno", "hlp"].includes(q.serie || "") ? q.serie : "toutes") as FaqItem["serie"]);
  };

  const pending = qs.filter((q) => q.statut === "en_attente").length;
  const shown = showAll ? qs : qs.filter((q) => q.statut === "en_attente");
  const categories = useMemo(
    () => Array.from(new Set([...PRESET_CATS, ...faqMethode.map((f) => f.categorie || "").filter(Boolean)])),
    [faqMethode]
  );

  // Actions sur la FAQ publiée
  const addItem = () => {
    if (!nq.trim() || !nr.trim()) return;
    setFaqMethode([{ id: uid(), question: nq.trim(), reponse: nr.trim(), serie: ns, categorie: nc.trim() || undefined, createdAt: Date.now() }, ...faqMethode]);
    setNq(""); setNr(""); setNs("toutes"); setNc("");
  };
  const saveEdit = () => {
    if (!eq.trim() || !er.trim()) return;
    setFaqMethode(faqMethode.map((f) => f.id === editId ? { ...f, question: eq.trim(), reponse: er.trim(), serie: es, categorie: ec.trim() || undefined } : f));
    setEditId(null);
  };
  const deleteItem = (id: string) => {
    if (confirm("Retirer cette réponse de la FAQ ?")) setFaqMethode(faqMethode.filter((f) => f.id !== id));
  };
  const togglePin = (id: string) =>
    setFaqMethode(faqMethode.map((f) => f.id === id ? { ...f, epingle: !f.epingle } : f));

  const serieSelect = (value: FaqItem["serie"], onChange: (v: FaqItem["serie"]) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value as FaqItem["serie"])}
      className="px-3 py-2 border-2 border-gray-200 rounded-xl text-xs font-bold bg-white focus:outline-none text-gray-800">
      {(Object.entries(SERIE_LABELS) as [FaqItem["serie"], string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <div className="space-y-6">
      <datalist id="faq-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-800">❓ FAQ</h2>
          <p className="text-sm text-gray-500 mt-1">Réponds aux questions des élèves et publie les réponses utiles à tous.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab("questions")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${tab === "questions" ? "bg-rose-600 text-white border-rose-600" : "bg-white text-gray-700 border-gray-200 hover:border-rose-300"}`}>
            📬 Questions reçues
            {pending > 0 && <span className={`px-1.5 py-0.5 rounded-full font-black ${tab === "questions" ? "bg-white/30" : "bg-rose-100 text-rose-700"}`}>{pending}</span>}
          </button>
          <button onClick={() => setTab("faq")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${tab === "faq" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300"}`}>
            ❓ FAQ publiée
            <span className={`px-1.5 py-0.5 rounded-full font-black ${tab === "faq" ? "bg-white/30" : "bg-indigo-100 text-indigo-700"}`}>{faqMethode.length}</span>
          </button>
        </div>
      </div>

      {/* ── Questions reçues ── */}
      {tab === "questions" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Afficher aussi les questions déjà traitées
            </label>
            <button onClick={load} className="text-xs font-bold text-gray-500 hover:text-indigo-600">↻ Actualiser</button>
          </div>

          {err && <p className="text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{err}</p>}

          {loading ? (
            <p className="text-center py-10 text-gray-500 font-semibold">Chargement…</p>
          ) : shown.length === 0 && !err ? (
            <div className="text-center py-12 bg-white rounded-2xl border-2 border-dashed border-gray-200">
              <div className="text-4xl mb-3">📭</div>
              <p className="font-bold text-gray-600">Aucune question en attente</p>
              <p className="text-sm text-gray-400 mt-1">Tu recevras un e-mail à chaque nouvelle question.</p>
            </div>
          ) : (
            shown.map((q) => {
              const ui = STATUT_UI[q.statut] || STATUT_UI.en_attente;
              const open = openId === q.id;
              return (
                <div key={q.id} className={`bg-white rounded-2xl border-2 overflow-hidden ${q.statut === "en_attente" ? "border-rose-200" : "border-gray-200"}`}>
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-black text-gray-800 text-sm">{q.question}</p>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {q.eleve_nom || "Anonyme"} · {new Date(q.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {q.serie && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">{SERIE_LABELS[q.serie as FaqItem["serie"]] || q.serie}</span>}
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ui.cls}`}>{ui.label}</span>
                    </div>
                    {q.reponse && !open && (
                      <p className="mt-3 text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-xl p-3 border border-gray-100">{q.reponse}</p>
                    )}

                    {open ? (
                      <div className="mt-3 space-y-2">
                        <textarea value={rep} onChange={(e) => setRep(e.target.value)} rows={4} autoFocus
                          className="w-full px-3 py-2 border-2 border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 resize-none text-gray-800"
                          placeholder="Ta réponse…" />
                        <div className="flex flex-wrap items-center gap-2">
                          {serieSelect(repSerie, setRepSerie)}
                          <input list="faq-cats" value={repCat} onChange={(e) => setRepCat(e.target.value)}
                            className="px-3 py-2 border-2 border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-800"
                            placeholder="Catégorie (FAQ)" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => answer(q, true)} disabled={!rep.trim() || busy}
                            className={`px-4 py-2 text-xs font-black rounded-xl text-white ${rep.trim() && !busy ? "bg-green-600 hover:bg-green-700" : "bg-gray-300"}`}>
                            Publier dans la FAQ
                          </button>
                          <button onClick={() => answer(q, false)} disabled={!rep.trim() || busy}
                            className={`px-4 py-2 text-xs font-black rounded-xl text-white ${rep.trim() && !busy ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-300"}`}>
                            Répondre à cet élève seulement
                          </button>
                          <button onClick={() => setOpenId(null)} className="px-3 py-2 text-xs font-bold rounded-xl border border-gray-200 text-gray-600">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => openAnswer(q)}
                          className="text-xs font-bold px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200">
                          {q.statut === "en_attente" ? "Répondre" : "Modifier la réponse"}
                        </button>
                        {q.statut === "en_attente" && (
                          <button onClick={() => reject(q)}
                            className="text-xs font-bold px-3 py-1.5 text-gray-500 hover:text-gray-800 rounded-lg border border-gray-200">Ne pas retenir</button>
                        )}
                        <button onClick={() => remove(q)}
                          className="text-xs font-bold px-3 py-1.5 text-gray-500 hover:text-red-600 rounded-lg border border-gray-200">Supprimer</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── FAQ publiée ── */}
      {tab === "faq" && (
        <div className="space-y-5">
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-5 space-y-3">
            <h3 className="font-black text-indigo-800 text-sm">Ajouter une question-réponse</h3>
            <input value={nq} onChange={(e) => setNq(e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-indigo-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none bg-white text-gray-800"
              placeholder="La question (ex : Comment éviter la paraphrase ?)" />
            <textarea value={nr} onChange={(e) => setNr(e.target.value)} rows={4}
              className="w-full px-4 py-2.5 border-2 border-indigo-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none bg-white resize-none text-gray-800"
              placeholder="La réponse, le conseil, l'astuce…" />
            <div className="flex flex-wrap items-center gap-2">
              {serieSelect(ns, setNs)}
              <input list="faq-cats" value={nc} onChange={(e) => setNc(e.target.value)}
                className="px-3 py-2 border-2 border-gray-200 rounded-xl text-xs font-bold focus:outline-none bg-white text-gray-800"
                placeholder="Catégorie" />
              <button onClick={addItem} disabled={!nq.trim() || !nr.trim()}
                className={`flex-1 py-2.5 rounded-xl font-black text-sm text-white ${nq.trim() && nr.trim() ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-300"}`}>
                Ajouter à la FAQ
              </button>
            </div>
          </div>

          {faqMethode.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border-2 border-dashed border-gray-200">
              <p className="text-gray-500 font-semibold">La FAQ est vide. Ajoute une réponse ci-dessus ou publie la réponse à une question d'élève.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {faqMethode.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden">
                  {editId === item.id ? (
                    <div className="p-4 space-y-3">
                      <input value={eq} onChange={(e) => setEq(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 text-gray-800" />
                      <textarea value={er} onChange={(e) => setEr(e.target.value)} rows={4}
                        className="w-full px-3 py-2 border-2 border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 resize-none text-gray-800" />
                      <div className="flex flex-wrap items-center gap-2">
                        {serieSelect(es, setEs)}
                        <input list="faq-cats" value={ec} onChange={(e) => setEc(e.target.value)}
                          className="px-3 py-2 border-2 border-gray-200 rounded-xl text-xs font-bold focus:outline-none text-gray-800" placeholder="Catégorie" />
                        <button onClick={saveEdit} className="flex-1 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl">Enregistrer</button>
                        <button onClick={() => setEditId(null)} className="px-3 py-2 border border-gray-200 text-xs font-bold rounded-xl text-gray-600">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-gray-800 text-sm">{item.epingle && "⭐ "}{item.question}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${SERIE_COLORS[item.serie]}`}>{SERIE_LABELS[item.serie]}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">{catOf(item)}</span>
                        </div>
                        <div className="flex gap-2 flex-shrink-0 text-xs font-semibold">
                          <button onClick={() => togglePin(item.id)} className="text-gray-500 hover:text-amber-600">{item.epingle ? "Désépingler" : "Épingler"}</button>
                          <button onClick={() => { setEditId(item.id); setEq(item.question); setEr(item.reponse); setEs(item.serie); setEc(item.categorie || ""); }}
                            className="text-gray-500 hover:text-indigo-600">Modifier</button>
                          <button onClick={() => deleteItem(item.id)} className="text-gray-500 hover:text-red-600">Retirer</button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{item.reponse}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
