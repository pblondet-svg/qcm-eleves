"use client";
// app/MethodeChatHome.tsx
// Assistant Méthode affiché directement sur la page d'accueil élève.
// - L'élève choisit sa série (Générale / Techno / HLP), puis discute.
// - Le prompt s'appuie sur les fiches méthode et la FAQ du professeur
//   (même contexte que l'onglet « Assistant méthode » de la page Méthode).

import { Fragment, useEffect, useRef, useState } from "react";
import { BookOpen, HelpCircle, RotateCcw, Send, Sparkles, Target } from "lucide-react";
import type { FaqItem } from "./FaqComponents";

export type SerieKey = "generale" | "techno" | "hlp";
type Msg = { role: "user" | "assistant"; content: string };
type MethodeFiches = Record<string, string>;

const SERIES: { key: SerieKey; label: string; short: string; icon: string; role: string }[] = [
  { key: "generale", label: "Série Générale", short: "Générale", icon: "🧠", role: "eleve-Philosophie-generale-methode" },
  { key: "techno", label: "Série Technologique", short: "Techno", icon: "🔧", role: "eleve-Philosophie-techno-methode" },
  { key: "hlp", label: "HLP", short: "HLP", icon: "📜", role: "eleve-HLP-methode" },
];

const STARTERS: Record<SerieKey, string[]> = {
  generale: [
    "Comment rédiger une bonne introduction ?",
    "Comment trouver le paradoxe d'un sujet ?",
    "Comment faire un commentaire linéaire ?",
    "Comment construire la synthèse ?",
  ],
  techno: [
    "Comment rédiger une bonne introduction ?",
    "Comment répondre aux questions de l'explication de texte ?",
    "C'est quoi un paragraphe argumenté ?",
    "Comment utiliser un exemple ?",
  ],
  hlp: [
    "Comment répondre à une question d'interprétation ?",
    "Comment rédiger une bonne introduction ?",
    "Comment articuler littérature et philosophie ?",
    "Comment rédiger un paragraphe argumenté ?",
  ],
};

// Règle de longueur commune aux assistants méthode (accueil et page Méthode)
export const REGLE_LONGUEUR = `RÈGLE DE LONGUEUR (impérative) :
- Par défaut, réponds COURT : 4 à 6 lignes au maximum (environ 80 mots). Va à l'essentiel : l'idée clé et, si besoin, 2 ou 3 étapes très brèves. Pas de longue liste, pas de titres, pas d'introduction.
- Ne développe (étapes détaillées, exemples, cas particuliers) QUE si l'élève le demande explicitement (« développe », « explique plus », « donne un exemple », « je n'ai pas compris »…). Dans ce cas seulement, tu peux aller jusqu'à 20 lignes.
- Ne propose pas toi-même de développer : un bouton le permet déjà à l'élève.`;

// Messages envoyés par les boutons rapides sous la dernière réponse
export const DEMANDES_RAPIDES = [
  { label: "➕ Développe", texte: "Développe ta réponse, s'il te plaît." },
  { label: "💡 Un exemple", texte: "Donne-moi un exemple concret, s'il te plaît." },
  { label: "🤔 Je n'ai pas compris", texte: "Je n'ai pas compris, peux-tu l'expliquer autrement ?" },
];

// Contexte envoyé à l'IA : fiches + FAQ du professeur pour la série choisie
export function buildMethodeContext(serie: SerieKey, mc: MethodeFiches, faq: FaqItem[]) {
  const isTechno = serie === "techno";
  const isHLP = serie === "hlp";
  const fichesDissertation = [mc.intro_dissertation, mc.plan_tas, mc.paragraphe].filter(Boolean).join("\n\n---\n\n");
  const ficheExpl = (isTechno ? mc.expl_techno : mc.expl_generale) || "";
  const faqRel = faq.filter((f) => f.serie === "toutes" || f.serie === serie);
  const faqContext = faqRel.length
    ? "\n\n=== FAQ ET CONSEILS DU PROFESSEUR ===\n" + faqRel.map((f) => `Q: ${f.question}\nR: ${f.reponse}`).join("\n\n")
    : "";
  const serieInstruction = isTechno
    ? "Adapte tes explications au niveau Série Technologique : langage clair, exemples concrets du quotidien, encourageant. Pas de références trop académiques."
    : isHLP
    ? "Adapte tes conseils aux spécificités littéraires et philosophiques de HLP."
    : "Sois précis, pédagogique et encourage la rigueur philosophique. Niveau Série Générale.";

  return `Tu es un assistant pédagogique spécialisé en méthodologie de philosophie${isTechno ? " (Série Technologique)" : isHLP ? " (HLP)" : " (Série Générale)"} en Terminale.
Tu dois répondre en te basant sur les fiches méthode et la FAQ rédigées par le professeur. C'est la référence absolue.

=== FICHES DISSERTATION ===
${fichesDissertation}

=== FICHE EXPLICATION DE TEXTE ===
${ficheExpl}${faqContext}

${serieInstruction}
${REGLE_LONGUEUR}
Ne rédige jamais le devoir à la place de l'élève : guide-le.
Si l'élève pose une question hors méthode (contenu philosophique pur, auteurs…), tu peux répondre brièvement mais ramène toujours à la méthode.`;
}

// Mise en forme légère des réponses : **gras**, listes à puces, titres « ### »
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <Fragment key={i}>{part}</Fragment>
  );
}
export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
        if (bullet) return (
          <div key={i} className="flex gap-2"><span className="text-indigo-400">•</span><span>{inline(bullet[1])}</span></div>
        );
        const num = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (num) return (
          <div key={i} className="flex gap-2"><span className="font-bold text-indigo-500">{num[1]}.</span><span>{inline(num[2])}</span></div>
        );
        const title = line.match(/^#{1,4}\s+(.*)$/);
        if (title) return <p key={i} className="font-black text-gray-900 pt-1">{inline(title[1])}</p>;
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

export default function MethodeChatHome({
  askAI, methodeContent, faqMethode, onOpenMethode, eleveNom,
}: {
  askAI: (messages: { role: string; content: string }[]) => Promise<string>;
  methodeContent: MethodeFiches;
  faqMethode: FaqItem[];
  onOpenMethode: (role: string, view: "fiche" | "faq" | "plan") => void;
  eleveNom?: string;
}) {
  const [serie, setSerie] = useState<SerieKey | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("methode_serie") as SerieKey | null;
      if (s && SERIES.some((x) => x.key === s)) setSerie(s);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const current = SERIES.find((s) => s.key === serie) || null;
  const prenom = (eleveNom || "").trim().split(/\s+/)[0];
  const faqCount = serie ? faqMethode.filter((f) => f.serie === "toutes" || f.serie === serie).length : 0;

  const chooseSerie = (s: SerieKey) => {
    if (s === serie) return;
    setSerie(s);
    setMessages([]);
    try { localStorage.setItem("methode_serie", s); } catch { /* ignore */ }
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading || !serie) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const reply = await askAI([
        { role: "user", content: buildMethodeContext(serie, methodeContent, faqMethode) },
        { role: "assistant", content: `Bonjour ! Je suis ton assistant méthode (${current?.label}). Pose-moi tes questions sur la dissertation, l'explication de texte ou le paragraphe argumenté.` },
        ...next,
      ]);
      setMessages([...next, { role: "assistant", content: reply || "Je n'ai pas réussi à répondre. Reformule ta question ?" }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Désolé, une erreur s'est produite. Réessaie dans un instant." }]);
    }
    setLoading(false);
  };

  return (
    <section className="w-full max-w-2xl mb-6">
      <div className="bg-white rounded-3xl border-2 border-indigo-200 shadow-xl overflow-hidden">
        {/* En-tête : on voit tout de suite que c'est pour réviser la méthode */}
        <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center text-2xl flex-shrink-0">📐</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black leading-tight">Assistant Méthode</h2>
                <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">Révision de la méthode</span>
              </div>
              <p className="text-xs text-indigo-100 mt-0.5">Dissertation · explication de texte · paragraphe argumenté</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                title="Nouvelle conversation"
                className="p-2 rounded-xl hover:bg-white/15 transition-colors flex-shrink-0">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Choix de la série */}
          <div className="flex gap-2 mt-4">
            {SERIES.map((s) => (
              <button
                key={s.key}
                onClick={() => chooseSerie(s.key)}
                className={`flex-1 text-xs font-bold py-2 rounded-xl transition-all ${serie === s.key ? "bg-white text-indigo-700 shadow" : "bg-white/15 text-white hover:bg-white/25"}`}>
                {s.icon} {s.short}
              </button>
            ))}
          </div>
        </div>

        {/* Fil de discussion */}
        <div ref={scrollRef} className="h-[22rem] sm:h-[24rem] overflow-y-auto px-4 py-4 space-y-3 bg-gradient-to-b from-indigo-50/60 to-white">
          {!serie ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <div className="text-4xl mb-3">👆</div>
              <p className="font-black text-gray-800">Choisis ta série pour commencer</p>
              <p className="text-sm text-gray-500 mt-1 max-w-sm">
                L'assistant te répond à partir des fiches méthode et de la FAQ de ton professeur.
              </p>
            </div>
          ) : (
            <>
              {/* Message d'accueil de l'assistant */}
              <div className="flex gap-2 items-end">
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm flex-shrink-0">📐</div>
                <div className="max-w-[85%] bg-white border border-indigo-100 shadow-sm rounded-2xl rounded-bl-md px-4 py-3 text-sm text-gray-800 leading-relaxed">
                  <p>
                    Bonjour{prenom ? ` ${prenom}` : ""} ! On révise la <strong>méthode</strong> ensemble ({current?.label}).
                    Pose ta question, ou choisis-en une ci-dessous.
                  </p>
                </div>
              </div>

              {messages.length === 0 && (
                <div className="flex flex-wrap gap-2 pl-10">
                  {STARTERS[serie].map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="text-xs font-semibold text-indigo-700 bg-white border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 rounded-full px-3 py-1.5 transition-all text-left">
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-2 items-end">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm flex-shrink-0">📐</div>
                    <div className="max-w-[85%] bg-white border border-indigo-100 shadow-sm rounded-2xl rounded-bl-md px-4 py-3 text-sm text-gray-800 leading-relaxed">
                      <RichText text={m.content} />
                    </div>
                  </div>
                )
              )}

              {!loading && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
                <div className="flex flex-wrap gap-2 pl-10">
                  {DEMANDES_RAPIDES.map((d) => (
                    <button
                      key={d.label}
                      onClick={() => send(d.texte)}
                      className="text-xs font-semibold text-indigo-700 bg-white border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 rounded-full px-3 py-1.5 transition-all">
                      {d.label}
                    </button>
                  ))}
                </div>
              )}

              {loading && (
                <div className="flex gap-2 items-end">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm flex-shrink-0">📐</div>
                  <div className="bg-white border border-indigo-100 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Saisie */}
        <div className="border-t border-indigo-100 p-3 flex gap-2 items-end bg-white">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            disabled={!serie || loading}
            className="flex-1 resize-none px-4 py-2.5 border-2 border-gray-200 rounded-2xl text-sm focus:border-indigo-400 focus:outline-none text-gray-800 disabled:bg-gray-50 max-h-32"
            placeholder={serie ? "Ta question sur la méthode…" : "Choisis d'abord ta série"}
          />
          <button
            onClick={() => send()}
            disabled={!serie || !input.trim() || loading}
            aria-label="Envoyer"
            className={`p-3 rounded-2xl text-white transition-all ${!serie || !input.trim() || loading ? "bg-gray-300" : "bg-indigo-600 hover:bg-indigo-700"}`}>
            {loading ? <Sparkles className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        {/* Accès aux fiches et à la FAQ */}
        <div className="grid grid-cols-3 border-t border-gray-100">
          <button
            onClick={() => current && onOpenMethode(current.role, "fiche")}
            disabled={!current}
            className="flex items-center justify-center gap-2 py-3 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors border-r border-gray-100">
            <BookOpen className="w-4 h-4" /> Fiches méthode
          </button>
          <button
            onClick={() => current && onOpenMethode(current.role, "plan")}
            disabled={!current}
            className="flex items-center justify-center gap-2 py-3 text-xs font-bold text-violet-700 hover:bg-violet-50 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors border-r border-gray-100">
            <Target className="w-4 h-4" /> S'entraîner
          </button>
          <button
            onClick={() => current && onOpenMethode(current.role, "faq")}
            disabled={!current}
            className="flex items-center justify-center gap-2 py-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors">
            <HelpCircle className="w-4 h-4" /> FAQ{faqCount > 0 && <span className="bg-indigo-100 text-indigo-700 rounded-full px-1.5">{faqCount}</span>}
          </button>
        </div>
      </div>
    </section>
  );
}
