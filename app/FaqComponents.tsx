"use client";
// app/FaqComponents.tsx
// - FaqEleve             : FAQ côté élève (recherche, catégories, « À lire en priorité », questions dépliables,
//                          poser une question, « Mes questions » avec signalement des nouvelles réponses)
// - ProfFaqManager       : gestion prof (questions reçues + FAQ publiée)
// - usePendingFaqCount   : nombre de questions en attente (badge Mode Prof)
// - useNouvellesReponses : nombre de réponses du prof pas encore lues par l'élève (pastille du bouton FAQ)

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, ArrowUp, ArrowDown } from "lucide-react";

export type FaqItem = {
  id: string;
  question: string;
  reponse: string;
  serie: "toutes" | "generale" | "techno" | "hlp";
  createdAt: number;
  categorie?: string;
  epingle?: boolean;
  questionId?: string; // question d'élève d'où vient cette réponse (évite les doublons à la republication)
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const getVisitorId = (creer = true): string => {
  try {
    let id = localStorage.getItem("qcm_visitor_id");
    if (!id && creer) {
      id = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      localStorage.setItem("qcm_visitor_id", id);
    }
    return id || "";
  } catch {
    return creer ? "t_" + Math.random().toString(36).slice(2, 10) : ""; // stockage bloqué : id temporaire
  }
};

// Code prof gardé le temps de la session (posé à la connexion Mode Prof)
const getProfCode = () => {
  try { return sessionStorage.getItem("prof_code_session") || ""; } catch { return ""; }
};

// ── Recherche tolérante ──────────────────────────────────────────────────────
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ");

const STOP = new Set([
  "les", "des", "une", "est", "que", "qui", "pas", "son", "ses", "mes", "tes", "aux", "par", "sur", "mon", "ton",
  "comment", "quelle", "quel", "quels", "quelles", "dans", "pour", "avec", "faire", "cette", "ces", "cet",
  "sont", "fait", "dois", "doit", "peut", "peux", "plus", "mais", "donc", "alors", "aussi", "quand", "faut",
  "etre", "avoir", "vous", "nous", "elle", "ils", "elles", "quoi", "bien", "tout", "tous", "toute", "entre",
]);

const mots = (s: string): string[] =>
  Array.from(new Set(norm(s).split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w))));

// Deux mots « se ressemblent » s'ils ont la même racine : intro ~ introduction, citations ~ citation
const memeRacine = (a: string, b: string) => {
  const n = Math.min(6, a.length, b.length);
  return n >= 3 && a.slice(0, n) === b.slice(0, n);
};

// Questions qui correspondent à une recherche, les plus pertinentes d'abord
function chercher(items: FaqItem[], requete: string, dansReponse = true): FaqItem[] {
  const q = mots(requete);
  if (q.length === 0) {
    const s = norm(requete).trim();
    return s ? items.filter((i) => norm(i.question + " " + i.reponse).includes(s)) : items;
  }
  const besoin = q.length <= 2 ? q.length : q.length - 1; // au-delà de deux mots, on tolère un mot absent
  return items
    .map((i) => {
      const mq = mots(i.question);
      const mt = dansReponse ? mots(i.question + " " + i.reponse + " " + catOf(i)) : mq;
      const trouves = q.filter((w) => mt.some((x) => memeRacine(w, x))).length;
      const dansQuestion = q.filter((w) => mq.some((x) => memeRacine(w, x))).length;
      return { i, trouves, dansQuestion };
    })
    .filter((x) => x.trouves >= besoin)
    .sort((a, b) => b.trouves - a.trouves || b.dansQuestion - a.dansQuestion)
    .map((x) => x.i);
}

// ── Catégories : liste fixe, dans l'ordre de la méthode ──────────────────────
export const CATEGORIES = [
  "Introduction", "Paragraphe", "Plan", "Conclusion", "Citations et exemples",
  "Explication de texte", "HLP", "Bac", "Fonctionnement du site", "Autres questions",
] as const;

// Anciennes catégories tapées à la main (« Intro », « Examen / bac »…) ramenées à la liste fixe
function catOf(i: FaqItem): string {
  const brut = i.categorie?.trim() || "";
  if ((CATEGORIES as readonly string[]).includes(brut)) return brut;
  const c = norm(brut);
  if (!c.trim()) return "Autres questions";
  if (/intro|problemat|accroche|opinion commune/.test(c)) return "Introduction";
  if (/paragraph|argument|developpement/.test(c)) return "Paragraphe";
  if (/plan|synthese|dialecti|these/.test(c)) return "Plan";
  if (/conclu/.test(c)) return "Conclusion";
  if (/citation|exemple|reference|auteur/.test(c)) return "Citations et exemples";
  if (/explication|texte|commentaire|analyse/.test(c)) return "Explication de texte";
  if (/hlp|interpretation|essai/.test(c)) return "HLP";
  if (/bac|examen|epreuve|grand oral/.test(c)) return "Bac";
  if (/site|fonctionnement|technique|application/.test(c)) return "Fonctionnement du site";
  return "Autres questions";
}
const rangCat = (c: string) => (CATEGORIES as readonly string[]).indexOf(c);

const SERIE_LABELS: Record<FaqItem["serie"], string> = {
  toutes: "Philo — tronc commun (Générale + Techno)",
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

// ── Réponses du prof pas encore lues par l'élève ─────────────────────────────
type MyQuestion = {
  id: string;
  question: string;
  statut: string;
  reponse: string | null;
  created_at: string;
};

const LUES_KEY = "faq_reponses_lues";
const getLues = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(LUES_KEY) || "[]")); } catch { return new Set(); }
};
const marquerLues = (ids: string[]) => {
  const s = getLues();
  ids.forEach((id) => s.add(id));
  try { localStorage.setItem(LUES_KEY, JSON.stringify(Array.from(s).slice(-200))); } catch { /* ignore */ }
  window.dispatchEvent(new Event("faq-reponses-lues"));
};

async function chargerMesQuestions(vid: string): Promise<MyQuestion[]> {
  if (!vid) return [];
  try {
    const r = await fetch("/api/faq?visitor_id=" + encodeURIComponent(vid), { cache: "no-store" });
    return r.ok ? (await r.json()).questions || [] : [];
  } catch { return []; }
}

export function useNouvellesReponses() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const vid = getVisitorId(false);
      if (!vid) return;
      const qs = await chargerMesQuestions(vid);
      const lues = getLues();
      if (alive) setN(qs.filter((q) => q.reponse && !lues.has(q.id)).length);
    };
    run();
    window.addEventListener("faq-reponses-lues", run);
    return () => { alive = false; window.removeEventListener("faq-reponses-lues", run); };
  }, []);
  return n;
}

// ══════════════════════════════════════════════════════════════════════════════
// CÔTÉ ÉLÈVE
// ══════════════════════════════════════════════════════════════════════════════
const STATUT_UI: Record<string, { label: string; cls: string }> = {
  en_attente: { label: "⏳ En attente de réponse", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  publiee: { label: "✅ Répondue (et ajoutée à la FAQ)", cls: "bg-green-50 text-green-700 border-green-200" },
  repondue: { label: "✅ Réponse du professeur", cls: "bg-green-50 text-green-700 border-green-200" },
  rejetee: { label: "Non retenue pour la FAQ", cls: "bg-gray-50 text-gray-500 border-gray-200" },
};

// Questions déjà ouvertes par cet élève (pour ne compter qu'une lecture par élève)
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

// Une question-réponse dépliable
function Ligne({ item, ouverte, onToggle }: { item: FaqItem; ouverte: boolean; onToggle: () => void }) {
  return (
    <div id={"faq-" + item.id} className={`bg-white rounded-xl border-2 transition-all ${ouverte ? "border-indigo-300" : "border-gray-100 hover:border-indigo-200"}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className="flex-1 font-bold text-gray-800 text-sm leading-snug">{item.question}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${ouverte ? "rotate-180" : ""}`} />
      </button>
      {ouverte && (
        <div className="px-4 pb-4 pt-1 border-t border-indigo-50 text-sm text-gray-700 leading-relaxed">
          <Rich text={item.reponse} />
        </div>
      )}
    </div>
  );
}

export function FaqEleve({
  items, serie, matiere, eleveNom,
}: {
  items: FaqItem[]; serie: string | null; matiere: string; eleveNom?: string;
}) {
  const serieKey = matiere === "hlp" ? "hlp" : serie === "techno" ? "techno" : "generale";

  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [question, setQuestion] = useState("");
  const [website, setWebsite] = useState(""); // champ piège anti-spam (invisible)
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [mine, setMine] = useState<MyQuestion[]>([]);
  const [nouvelles, setNouvelles] = useState<Set<string>>(new Set());
  const vid = useRef("");

  const loadMine = async () => {
    const qs = await chargerMesQuestions(vid.current);
    setMine(qs);
    const lues = getLues();
    const nv = qs.filter((q) => q.reponse && !lues.has(q.id)).map((q) => q.id);
    if (nv.length) {
      setNouvelles((s) => new Set([...Array.from(s), ...nv]));
      marquerLues(nv); // affichées « Nouveau » cette fois-ci, puis considérées comme lues
    }
  };

  useEffect(() => {
    vid.current = getVisitorId();
    loadMine();
  }, []);

  const toggle = (id: string, aller = false) => {
    const ouvrir = aller || !open[id];
    setOpen((o) => ({ ...o, [id]: ouvrir }));
    if (ouvrir && markSeen(id)) {
      fetch("/api/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "view", id, visitor_id: vid.current }),
      }).catch(() => { /* silencieux */ });
    }
    if (aller) {
      setSearch(""); setCat("all");
      setTimeout(() => document.getElementById("faq-" + id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    }
  };

  // Ordre choisi par le professeur (Mode Prof → FAQ publiée), regroupé par catégorie
  const cats = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach((i) => { m[catOf(i)] = (m[catOf(i)] || 0) + 1; });
    return Object.entries(m).sort((a, b) => rangCat(a[0]) - rangCat(b[0]));
  }, [items]);

  const enRecherche = search.trim().length > 0;
  const resultats = useMemo(() => (enRecherche ? chercher(items, search) : []), [items, search, enRecherche]);
  const prioritaires = items.filter((i) => i.epingle);
  const groupes = useMemo(() => {
    const source = cat === "all" ? items.filter((i) => !i.epingle) : items.filter((i) => catOf(i) === cat);
    const g: Record<string, FaqItem[]> = {};
    source.forEach((i) => { (g[catOf(i)] ||= []).push(i); });
    Object.values(g).forEach((l) => l.sort((a, b) => Number(!!b.epingle) - Number(!!a.epingle)));
    return Object.entries(g).sort((a, b) => rangCat(a[0]) - rangCat(b[0]));
  }, [items, cat]);

  // Questions déjà présentes dans la FAQ qui ressemblent à ce que tape l'élève
  const similar = useMemo(
    () => (question.trim().length < 8 ? [] : chercher(items, question, false).slice(0, 3)),
    [question, items]
  );

  const send = async () => {
    const text = question.trim();
    if (text.length < 5 || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      const r = await fetch("/api/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ask", question: text, visitor_id: vid.current, eleve_nom: eleveNom || "Anonyme", serie: serieKey, website }),
      });
      if (r.status === 429) {
        setFeedback({ type: "err", text: "Tu as déjà envoyé plusieurs questions à la suite. Réessaie dans une heure." });
      } else if (!r.ok) {
        setFeedback({ type: "err", text: "L'envoi a échoué. Vérifie ta connexion et réessaie." });
      } else {
        setQuestion("");
        setFeedback({ type: "ok", text: "Question envoyée au professeur. Sa réponse apparaîtra dans « Mes questions », et une pastille sur le bouton FAQ te préviendra." });
        loadMine();
      }
    } catch {
      setFeedback({ type: "err", text: "Connexion impossible. Réessaie dans un instant." });
    }
    setSending(false);
  };

  const mesQuestions = mine.length > 0 && (
    <div className="space-y-2">
      <h3 className="font-black text-gray-800 text-sm px-1">
        Mes questions
        {nouvelles.size > 0 && <span className="ml-2 text-[11px] font-black bg-rose-500 text-white rounded-full px-2 py-0.5">{nouvelles.size} nouvelle{nouvelles.size > 1 ? "s" : ""} réponse{nouvelles.size > 1 ? "s" : ""}</span>}
      </h3>
      {mine.map((q) => {
        const ui = STATUT_UI[q.statut] || STATUT_UI.en_attente;
        const nouveau = nouvelles.has(q.id);
        return (
          <div key={q.id} className={`bg-white rounded-xl border-2 px-4 py-3 ${nouveau ? "border-rose-300" : "border-gray-100"}`}>
            <div className="flex items-start gap-2">
              <p className="flex-1 text-sm font-bold text-gray-800">{q.question}</p>
              {nouveau && <span className="text-[10px] font-black bg-rose-100 text-rose-700 rounded-full px-2 py-0.5 flex-shrink-0">Nouveau</span>}
            </div>
            <span className={`inline-block mt-2 text-[11px] font-bold px-2 py-0.5 rounded-full border ${ui.cls}`}>{ui.label}</span>
            {q.reponse && (
              <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5 text-sm text-gray-800 leading-relaxed">
                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-1">Réponse du professeur</p>
                <Rich text={q.reponse} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Nouvelle réponse du prof : en haut de la page */}
      {nouvelles.size > 0 && mesQuestions}

      {/* ── Recherche + catégories ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border-2 border-indigo-100 p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none text-gray-800"
            placeholder="Ta question en quelques mots : faire une intro, citer un auteur…"
          />
        </div>
        {!enRecherche && cats.length > 1 && (
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

      {/* ── Questions-réponses ──────────────────────────────────────────────── */}
      {items.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-2xl border-2 border-dashed border-gray-200">
          <div className="text-3xl mb-2">💬</div>
          <p className="font-bold text-gray-600 text-sm">Pas encore de questions dans la FAQ</p>
          <p className="text-xs text-gray-400 mt-1">Pose la première question au professeur, juste en dessous.</p>
        </div>
      ) : enRecherche ? (
        resultats.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-2xl border-2 border-dashed border-gray-200">
            <p className="font-bold text-gray-600 text-sm">Aucune réponse ne correspond à ta recherche</p>
            <p className="text-xs text-gray-400 mt-1">Essaie d'autres mots, ou pose ta question au professeur juste en dessous.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 px-1">{resultats.length} réponse{resultats.length > 1 ? "s" : ""} trouvée{resultats.length > 1 ? "s" : ""}</p>
            {resultats.map((i) => <Ligne key={i.id} item={i} ouverte={!!open[i.id]} onToggle={() => toggle(i.id)} />)}
          </div>
        )
      ) : (
        <div className="space-y-5">
          {cat === "all" && prioritaires.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-amber-700 px-1">⭐ À lire en priorité</p>
              {prioritaires.map((i) => <Ligne key={i.id} item={i} ouverte={!!open[i.id]} onToggle={() => toggle(i.id)} />)}
            </div>
          )}
          {groupes.map(([c, liste]) => (
            <div key={c} className="space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500 px-1">{c}</p>
              {liste.map((i) => <Ligne key={i.id} item={i} ouverte={!!open[i.id]} onToggle={() => toggle(i.id)} />)}
            </div>
          ))}
        </div>
      )}

      {/* ── Poser une question au professeur ────────────────────────────────── */}
      <div id="faq-poser" className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4 space-y-3">
        <div>
          <p className="font-black text-indigo-800 text-sm">Tu n'as pas trouvé ? Pose ta question au professeur</p>
          <p className="text-xs text-indigo-600 mt-0.5">Sa réponse arrivera dans « Mes questions ».</p>
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
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden="true" />
        {similar.length > 0 && (
          <div className="bg-white border border-amber-200 rounded-xl p-3">
            <p className="text-xs font-bold text-amber-800 mb-2">Le prof a peut-être déjà répondu :</p>
            <div className="space-y-1.5">
              {similar.map((s) => (
                <button key={s.id} onClick={() => toggle(s.id, true)}
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

      {/* Mes questions (déjà lues) : en bas */}
      {nouvelles.size === 0 && mesQuestions}
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

type FaqOp =
  | { op: "upsert"; item: FaqItem }
  | { op: "delete"; item_id: string }
  | { op: "move"; item_id: string; target_id: string };

export function ProfFaqManager({
  faqMethode, setFaqMethode, onFaqUpdated,
}: {
  faqMethode: FaqItem[];
  setFaqMethode: (f: FaqItem[]) => void; // ancienne sauvegarde (toute la FAQ d'un bloc) : secours
  onFaqUpdated?: (f: FaqItem[]) => void; // met à jour l'affichage avec la FAQ renvoyée par le serveur
}) {
  const [tab, setTab] = useState<"questions" | "faq">("questions");

  // Questions reçues
  const [qs, setQs] = useState<ProfQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [repQ, setRepQ] = useState("");
  const [rep, setRep] = useState("");
  const [repCat, setRepCat] = useState("");
  const [repSerie, setRepSerie] = useState<FaqItem["serie"]>("toutes");
  const [lieA, setLieA] = useState<string | null>(null); // réponse existante reprise (pas de doublon)
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
  const [fSearch, setFSearch] = useState("");
  const [fSerie, setFSerie] = useState<"all" | FaqItem["serie"]>("all");
  const [fCat, setFCat] = useState("all");

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
    return r.json().catch(() => ({}));
  };

  // Modification de la FAQ publiée : faite sur le serveur, question par question, à partir de la FAQ
  // enregistrée (deux onglets ou deux appareils ouverts n'effacent plus les modifications l'un de l'autre).
  const appliquer = async (op: FaqOp, secours: () => FaqItem[]) => {
    try {
      const d = await call({ action: "faq_op", ...op });
      if (!Array.isArray(d.items)) throw new Error("réponse");
      (onFaqUpdated || setFaqMethode)(d.items);
    } catch {
      setFaqMethode(secours()); // ancien mode d'enregistrement si le serveur n'a pas pu le faire
    }
  };

  // Réponse déjà publiée pour cette question d'élève (lien direct, sinon même intitulé)
  const dejaPubliee = (q: ProfQuestion) =>
    faqMethode.find((f) => f.questionId === q.id) ||
    faqMethode.find((f) => norm(f.question).trim() === norm(q.question).trim());

  const answer = async (q: ProfQuestion, publier: boolean) => {
    if (!rep.trim() || busy) return;
    setBusy(true);
    try {
      await call({ action: "answer", id: q.id, reponse: rep.trim(), publier });
      if (publier) {
        const existant = (lieA && faqMethode.find((f) => f.id === lieA)) || dejaPubliee(q);
        const item: FaqItem = existant
          ? { ...existant, question: lieA ? existant.question : (repQ.trim() || existant.question), reponse: rep.trim(), serie: repSerie, categorie: repCat || existant.categorie, questionId: existant.questionId || q.id }
          : { id: uid(), question: repQ.trim() || q.question, reponse: rep.trim(), serie: repSerie, categorie: repCat || undefined, createdAt: Date.now(), questionId: q.id };
        await appliquer({ op: "upsert", item }, () => existant ? faqMethode.map((f) => (f.id === item.id ? item : f)) : [item, ...faqMethode]);
      }
      setOpenId(null); setRep(""); setRepCat(""); setRepQ(""); setLieA(null);
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
    const existant = dejaPubliee(q);
    setOpenId(q.id);
    setRep(q.reponse || "");
    setRepQ(existant?.question || q.question);
    setRepCat(existant ? catOf(existant) : "");
    setLieA(null);
    setRepSerie(existant?.serie || ((["generale", "techno", "hlp"].includes(q.serie || "") ? q.serie : "toutes") as FaqItem["serie"]));
  };

  const pending = qs.filter((q) => q.statut === "en_attente").length;
  const shown = showAll ? qs : qs.filter((q) => q.statut === "en_attente");

  // Actions sur la FAQ publiée
  const addItem = () => {
    if (!nq.trim() || !nr.trim()) return;
    const item: FaqItem = { id: uid(), question: nq.trim(), reponse: nr.trim(), serie: ns, categorie: nc || undefined, createdAt: Date.now() };
    appliquer({ op: "upsert", item }, () => [item, ...faqMethode]);
    setNq(""); setNr(""); setNs("toutes"); setNc("");
  };
  const saveEdit = () => {
    const ancien = faqMethode.find((f) => f.id === editId);
    if (!ancien || !eq.trim() || !er.trim()) return;
    const item: FaqItem = { ...ancien, question: eq.trim(), reponse: er.trim(), serie: es, categorie: ec || undefined };
    appliquer({ op: "upsert", item }, () => faqMethode.map((f) => (f.id === item.id ? item : f)));
    setEditId(null);
  };
  const deleteItem = (id: string) => {
    if (confirm("Retirer cette réponse de la FAQ ?")) appliquer({ op: "delete", item_id: id }, () => faqMethode.filter((f) => f.id !== id));
  };
  const togglePin = (f: FaqItem) => {
    const item = { ...f, epingle: !f.epingle };
    appliquer({ op: "upsert", item }, () => faqMethode.map((x) => (x.id === f.id ? item : x)));
  };

  // Liste filtrée (recherche, série, catégorie)
  const filtree = useMemo(() => {
    let l = faqMethode;
    if (fSerie !== "all") l = l.filter((f) => f.serie === fSerie);
    if (fCat !== "all") l = l.filter((f) => catOf(f) === fCat);
    if (fSearch.trim()) { const r = chercher(l, fSearch); const ids = new Set(r.map((x) => x.id)); l = l.filter((f) => ids.has(f.id)); }
    return l;
  }, [faqMethode, fSerie, fCat, fSearch]);

  // Monter / descendre : échange avec la question voisine dans la liste affichée
  const deplacer = (id: string, sens: -1 | 1) => {
    const idx = filtree.findIndex((f) => f.id === id);
    const voisin = filtree[idx + sens];
    if (!voisin) return;
    appliquer({ op: "move", item_id: id, target_id: voisin.id }, () => {
      const l = [...faqMethode];
      const a = l.findIndex((f) => f.id === id), b = l.findIndex((f) => f.id === voisin.id);
      [l[a], l[b]] = [l[b], l[a]];
      return l;
    });
  };

  const serieSelect = (value: FaqItem["serie"], onChange: (v: FaqItem["serie"]) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value as FaqItem["serie"])}
      className="px-3 py-2 border-2 border-gray-200 rounded-xl text-xs font-bold bg-white focus:outline-none text-gray-800">
      {(Object.entries(SERIE_LABELS) as [FaqItem["serie"], string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const catSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 border-2 border-gray-200 rounded-xl text-xs font-bold bg-white focus:outline-none text-gray-800">
      <option value="">Catégorie…</option>
      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );

  return (
    <div className="space-y-6">
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
              const existant = dejaPubliee(q);
              const proches = open && !existant ? chercher(faqMethode, q.question).slice(0, 3) : [];
              const lie = lieA ? faqMethode.find((f) => f.id === lieA) : null;
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
                        {proches.length > 0 && !lie && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                            <p className="text-xs font-bold text-amber-800">Des réponses proches sont déjà dans la FAQ :</p>
                            {proches.map((p) => (
                              <div key={p.id} className="flex items-start justify-between gap-2">
                                <p className="text-xs text-gray-700 font-semibold">{p.question}</p>
                                <button onClick={() => { setLieA(p.id); setRep(p.reponse); setRepSerie(p.serie); setRepCat(catOf(p)); }}
                                  className="text-[11px] font-bold text-amber-800 underline flex-shrink-0">Reprendre cette réponse</button>
                              </div>
                            ))}
                          </div>
                        )}
                        {lie ? (
                          <p className="text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-900">
                            Réponse reprise de « <strong>{lie.question}</strong> ». Si tu publies, c'est cette question de la FAQ qui sera mise à jour : pas de doublon.{" "}
                            <button onClick={() => { setLieA(null); setRep(""); }} className="underline font-bold">Annuler</button>
                          </p>
                        ) : (
                          <label className="block text-[11px] font-bold text-gray-500">
                            Question telle qu'elle apparaîtra dans la FAQ (tu peux la reformuler)
                            <input value={repQ} onChange={(e) => setRepQ(e.target.value)}
                              className="mt-1 w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-400 text-gray-800" />
                          </label>
                        )}
                        <textarea value={rep} onChange={(e) => setRep(e.target.value)} rows={4} autoFocus
                          className="w-full px-3 py-2 border-2 border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 resize-none text-gray-800"
                          placeholder="Ta réponse…" />
                        <div className="flex flex-wrap items-center gap-2">
                          {serieSelect(repSerie, setRepSerie)}
                          {catSelect(repCat, setRepCat)}
                        </div>
                        {existant && !lie && <p className="text-[11px] text-gray-500">Déjà dans la FAQ : publier mettra à jour la réponse existante, sans doublon.</p>}
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => answer(q, true)} disabled={!rep.trim() || busy}
                            className={`px-4 py-2 text-xs font-black rounded-xl text-white ${rep.trim() && !busy ? "bg-green-600 hover:bg-green-700" : "bg-gray-300"}`}>
                            {existant || lie ? "Répondre et mettre à jour la FAQ" : "Publier dans la FAQ"}
                          </button>
                          <button onClick={() => answer(q, false)} disabled={!rep.trim() || busy}
                            className={`px-4 py-2 text-xs font-black rounded-xl text-white ${rep.trim() && !busy ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-300"}`}>
                            Répondre à cet élève seulement
                          </button>
                          <button onClick={() => { setOpenId(null); setLieA(null); }} className="px-3 py-2 text-xs font-bold rounded-xl border border-gray-200 text-gray-600">Annuler</button>
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
              {catSelect(nc, setNc)}
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
              {/* Recherche et filtres */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input value={fSearch} onChange={(e) => setFSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none text-gray-800"
                    placeholder="Chercher dans la FAQ…" />
                </div>
                <select value={fSerie} onChange={(e) => setFSerie(e.target.value as any)}
                  className="px-3 py-2 border-2 border-gray-200 rounded-xl text-xs font-bold bg-white focus:outline-none text-gray-800">
                  <option value="all">Toutes les séries</option>
                  {(Object.entries(SERIE_LABELS) as [FaqItem["serie"], string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select value={fCat} onChange={(e) => setFCat(e.target.value)}
                  className="px-3 py-2 border-2 border-gray-200 rounded-xl text-xs font-bold bg-white focus:outline-none text-gray-800">
                  <option value="all">Toutes les catégories</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <p className="text-[11px] text-gray-400 px-1">
                {filtree.length} question{filtree.length > 1 ? "s" : ""} · les flèches règlent l'ordre d'affichage chez les élèves (à l'intérieur de chaque catégorie) ; les questions épinglées apparaissent en tête, dans « À lire en priorité ».
              </p>

              {filtree.map((item, idx) => (
                <div key={item.id} className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden">
                  {editId === item.id ? (
                    <div className="p-4 space-y-3">
                      <input value={eq} onChange={(e) => setEq(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 text-gray-800" />
                      <textarea value={er} onChange={(e) => setEr(e.target.value)} rows={4}
                        className="w-full px-3 py-2 border-2 border-indigo-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400 resize-none text-gray-800" />
                      <div className="flex flex-wrap items-center gap-2">
                        {serieSelect(es, setEs)}
                        {catSelect(ec, setEc)}
                        <button onClick={saveEdit} className="flex-1 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl">Enregistrer</button>
                        <button onClick={() => setEditId(null)} className="px-3 py-2 border border-gray-200 text-xs font-bold rounded-xl text-gray-600">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 flex gap-3">
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button onClick={() => deplacer(item.id, -1)} disabled={idx === 0} title="Monter"
                          className="p-1 rounded-lg border border-gray-200 text-gray-500 hover:text-indigo-600 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deplacer(item.id, 1)} disabled={idx === filtree.length - 1} title="Descendre"
                          className="p-1 rounded-lg border border-gray-200 text-gray-500 hover:text-indigo-600 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-gray-800 text-sm">{item.epingle && "⭐ "}{item.question}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${SERIE_COLORS[item.serie]}`}>{SERIE_LABELS[item.serie]}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">{catOf(item)}</span>
                          </div>
                          <div className="flex gap-2 flex-shrink-0 text-xs font-semibold">
                            <button onClick={() => togglePin(item)} className="text-gray-500 hover:text-amber-600">{item.epingle ? "Désépingler" : "Épingler"}</button>
                            <button onClick={() => { setEditId(item.id); setEq(item.question); setEr(item.reponse); setEs(item.serie); setEc(catOf(item)); }}
                              className="text-gray-500 hover:text-indigo-600">Modifier</button>
                            <button onClick={() => deleteItem(item.id)} className="text-gray-500 hover:text-red-600">Retirer</button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{item.reponse}</p>
                      </div>
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
