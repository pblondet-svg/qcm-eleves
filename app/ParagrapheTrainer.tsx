"use client";
// app/ParagrapheTrainer.tsx
// Entraînement au paragraphe argumenté : à partir d'un texte de la bibliothèque du professeur (par défaut)
// ou d'un vrai sujet de la banque, l'élève rédige son paragraphe
// ([Thèse], [Arguments], [Exemple], [Citation], [Conclusion]) ; l'IA le corrige avec la grille du professeur
// (5 étapes notées de 1 à 4, note sur 20).

import { useEffect, useMemo, useState } from "react";
import { Lightbulb, RefreshCw, Sparkles } from "lucide-react";

import { nouvelleSeance, sauverProduction, type AskAIAvecSeance } from "./productions";
type AskAI = AskAIAvecSeance;
type Sujet = { sujet: string; notion_principale?: string; source?: string; texte?: string; notions?: string[]; origine?: "bac" | "prof" };
import { notionsDe, type TexteEntrainement } from "./EntrainementChat";

type Etape = "these" | "arguments" | "exemple" | "citation" | "conclusion";
const ETAPES: { key: Etape; label: string; aide: string; cls: string }[] = [
  { key: "these", label: "Thèse", aide: "Une seule idée, qui répond au sujet.", cls: "bg-blue-50 border-blue-300 text-blue-800" },
  { key: "arguments", label: "Arguments", aide: "Pourquoi ta thèse est vraie : raisonnement. Astuce : pour argumenter, tu peux définir les mots importants.", cls: "bg-indigo-50 border-indigo-300 text-indigo-800" },
  { key: "exemple", label: "Exemple", aide: "Une situation concrète de la vie réelle.", cls: "bg-green-50 border-green-300 text-green-800" },
  { key: "citation", label: "Citation", aide: "Les mots d'un auteur, entre guillemets, puis ton explication.", cls: "bg-amber-50 border-amber-300 text-amber-800" },
  { key: "conclusion", label: "Conclusion", aide: "Le bilan : réponds clairement au sujet.", cls: "bg-rose-50 border-rose-300 text-rose-800" },
];
// Consignes propres au paragraphe « à partir d'un texte »
const AIDE_TEXTE: Partial<Record<Etape, string>> = {
  these: "Ce que l'auteur affirme, dit avec tes mots.",
  arguments: "Reconstitue le raisonnement du texte. Astuce : pour argumenter, tu peux définir les mots importants.",
  exemple: "Une situation concrète de la vie réelle, trouvée par toi (pas l'exemple du texte).",
  citation: "Un passage exact du texte, entre guillemets, puis ton explication.",
  conclusion: "Le bilan : réponds clairement à la question que pose le texte.",
};
const ETAPE = Object.fromEntries(ETAPES.map((e) => [e.key, e])) as Record<Etape, (typeof ETAPES)[number]>;

const sansAccents = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const parseJSONLoose = (txt: string) => {
  const c = txt.replace(/```json/g, "").replace(/```/g, "").trim();
  const m = c.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : c);
};
async function askJSON(askAI: AskAI, prompt: string, maxTokens: number, valid: (x: any) => boolean, session?: string) {
  for (const light of [false, true]) {
    try {
      const x = parseJSONLoose(await askAI([{ role: "user", content: prompt }], maxTokens, light, session));
      if (valid(x)) return x;
    } catch { /* on tente l'autre chaîne de modèles */ }
  }
  throw new Error("json");
}

// ─── Composant principal ────────────────────────────────────────────────────
export default function ParagrapheTrainer({ askAI, fiche, matiere, serie, loadSujets, loadTextes }: {
  askAI: AskAI; fiche: string; matiere: string; serie: "generale" | "techno" | null; loadSujets: () => Promise<Sujet[]>;
  loadTextes?: () => Promise<TexteEntrainement[]>;
}) {
  return (
    <div className="flex-1 overflow-y-auto space-y-4">
      <div className="bg-gradient-to-r from-rose-600 to-orange-500 text-white rounded-2xl p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-rose-100">✍️ S'entraîner au paragraphe</p>
        <h3 className="text-lg font-black mt-1">Rédige un paragraphe argumenté</h3>
        <p className="text-sm text-rose-50 mt-1 leading-relaxed">
          Thèse, Arguments, Exemple, Citation expliquée, Conclusion : rédige ton paragraphe à partir d'un texte ou d'un vrai sujet, puis fais-le corriger.
        </p>
      </div>
      <RedactionExercice askAI={askAI} fiche={fiche} matiere={matiere} serie={serie} loadSujets={loadSujets} loadTextes={loadTextes} />
    </div>
  );
}

// ─── Exercice 2 : rédiger et faire corriger ─────────────────────────────────
const NIVEAUX_NOTE = ["", "Non acquis", "En cours d'acquisition", "Acquis", "Très bonne maîtrise"];
const MOTS_MIN = 150; // en dessous, le paragraphe est nettement plus court que les 15 à 20 lignes demandées : −1 point
type Critere = { etape: Etape; note: number; commentaire: string };
type Correction = { criteres: Critere[]; appreciation: string; conseil: string; piste: string; piste_etape: Etape | "" };
const nbMots = (t: string) => (t.trim().match(/[\p{L}\p{N}’'-]+/gu) || []).length;

function RedactionExercice({ askAI, fiche, matiere, serie, loadSujets, loadTextes }: {
  askAI: AskAI; fiche: string; matiere: string; serie: "generale" | "techno" | null; loadSujets: () => Promise<Sujet[]>;
  loadTextes?: () => Promise<TexteEntrainement[]>;
}) {
  const isTechno = serie === "techno";
  const isHLP = matiere === "hlp";
  const niveau = isHLP ? "spécialité HLP" : isTechno ? "Terminale technologique" : "Terminale générale";

  const [bank, setBank] = useState<Sujet[] | null>(null);
  const [bankErr, setBankErr] = useState(false);
  const [notion, setNotion] = useState("all");
  const [appui, setAppui] = useState<"texte" | "sujet">(loadTextes ? "texte" : "sujet");
  const [textes, setTextes] = useState<Sujet[] | null>(null);
  const avecTexte = appui === "texte";
  const [sujet, setSujet] = useState<Sujet | null>(null);
  const [seance, setSeance] = useState("");
  const [bloc, setBloc] = useState(false);
  const [parts, setParts] = useState<Record<Etape, string>>({ these: "", arguments: "", exemple: "", citation: "", conclusion: "" });
  const [texteBloc, setTexteBloc] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    loadSujets()
      .then((all) => setBank((all || []).filter((x) => x?.sujet && x.sujet.trim().endsWith("?"))))
      .catch(() => setBankErr(true));
    loadTextes?.()
      .then((l) => setTextes(l.map((t) => ({ sujet: t.titre, notion_principale: t.chapitre, texte: t.contenu, notions: t.notions, origine: t.origine }))))
      .catch(() => setTextes([]));
  }, []);

  const source = avecTexte ? textes : bank;
  const notions = useMemo(() => {
    const m: Record<string, number> = {};
    (source || []).forEach((x) => notionsDe(x).forEach((n) => { m[n] = (m[n] || 0) + 1; }));
    const cle = (n: string) => n.replace(/^(l[’']|le |la |les )/i, "");
    return Object.entries(m).sort((a, b) => cle(a[0]).localeCompare(cle(b[0]), "fr"));
  }, [source]);

  const tirerSujet = () => {
    setErr("");
    const pool = (source || []).filter((x) => notion === "all" || notionsDe(x).includes(notion));
    if (!pool.length) { setErr(avecTexte ? "Aucun texte disponible pour l'instant." : "Aucun sujet disponible pour cette notion."); return; }
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && sujet && pick.sujet === sujet.sujet) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    setSujet({ ...pick, sujet: pick.sujet.trim() });
    const id = nouvelleSeance(); setSeance(id);
    sauverProduction({ id, exercice: "paragraphe", format: "cadres", sujet: (pick.texte ? "Texte : " : "") + pick.sujet.trim(), contenu: "" });
    setParts({ these: "", arguments: "", exemple: "", citation: "", conclusion: "" }); setTexteBloc(""); setCorrection(null); setShowHint(false);
  };

  const texteComplet = bloc ? texteBloc : ETAPES.map((e) => parts[e.key].trim()).filter(Boolean).join(" ");
  const mots = nbMots(texteComplet);
  const trop_court = mots < MOTS_MIN;
  const canSubmit = !!sujet && !correcting && (bloc ? mots >= 60 : ETAPES.filter((e) => parts[e.key].trim().length >= 10).length >= 3);

  const corriger = async () => {
    if (!canSubmit || !sujet) return;
    setCorrecting(true); setErr(""); setCorrection(null);
    const copie = bloc
      ? `L'élève a rédigé son paragraphe d'un seul bloc ; c'est à toi de repérer chaque étape (une étape introuvable est notée 1) :\n${texteBloc.trim()}`
      : ETAPES.map((e) => `[${e.label}] ${parts[e.key].trim() || "(vide)"}`).join("\n");
    try {
      const c = await askJSON(askAI, `Tu es professeur de philosophie et tu corriges le paragraphe argumenté d'un élève (${niveau}).

=== MÉTHODE DU PROFESSEUR (référence absolue) ===
${fiche}
Les cinq étapes de la méthode : [Thèse], [Arguments], [Exemple], [Citation], [Conclusion].

${sujet.texte ? `=== TEXTE ÉTUDIÉ (${sujet.sujet}) ===
"""
${sujet.texte.slice(0, 4500)}
"""
Consigne donnée à l'élève : rédiger un paragraphe argumenté qui reconstitue et explique la thèse de l'auteur. La thèse est celle de l'auteur ; les arguments reconstituent le raisonnement du texte ; la citation doit être un passage exact DU TEXTE (vérifie-le) ; l'exemple doit être personnel : reprendre celui du texte ne montre pas que l'élève a compris. Signale tout contresens sur le texte.` : `=== SUJET ===
« ${sujet.sujet} »`}

=== COPIE DE L'ÉLÈVE (${mots} mots) ===
${copie}

=== GRILLE DU PROFESSEUR ===
Chaque étape est notée de 1 à 4 : 1 = Non acquis, 2 = En cours d'acquisition, 3 = Acquis, 4 = Très bonne maîtrise. Notes exigeantes et discriminantes : 4 seulement si l'étape est vraiment maîtrisée. Une étape vide ou absente vaut 1.
- Thèse : une seule idée, claire, qui répond au sujet posé.
- Arguments : de vraies raisons qui reconstituent un raisonnement, et non la répétition de la thèse ; les concepts importants sont définis (le professeur conseille de définir les mots importants pour argumenter ; valorise-le quand l'élève le fait).
- Exemple : une situation concrète de la vie réelle, de préférence trouvée par l'élève lui-même, qui illustre bien l'argument (et non une autre idée). Une référence à un auteur ou à une personne qui fait autorité n'est pas un exemple concret ; une référence culturelle montre une bonne culture générale, mais ne remplace pas l'exemple.
- Citation : entre guillemets, d'un auteur identifié, reliée à l'idée, et toujours expliquée par l'élève : c'est à l'élève de faire le commentaire de la citation, pas au correcteur. Une citation posée sans explication ne dépasse pas 2. Si la citation te semble inexacte ou mal attribuée, signale-le avec prudence.
- Conclusion : fait le bilan de l'argumentation et répond explicitement au sujet, sans simplement répéter la thèse.
- Signale tout contresens sur un auteur.

=== STYLE DE L'APPRÉCIATION (court et direct) ===
3 lignes maximum. Chaque commentaire de critère tient en UNE phrase courte. Le conseil tient en UNE phrase. Tutoie l'élève. Commence de façon adoucie (« plutôt bien structuré », « assez juste dans l'essentiel »), cite une force concrète, puis « Il y a cependant des fragilités » et la principale. Ne parle de relecture que s'il y a de vraies fautes, en précisant si elles sont orthographiques ou typographiques. Pas de formule d'encouragement à la fin.
${isTechno ? "Langage clair et accessible, sans perdre en précision." : ""}

Dans "piste", ne réécris rien : pour l'étape la plus faible, donne un indice (2 phrases au plus, terminé par une question) qui aide l'élève à l'améliorer lui-même.
Ne réécris aucun passage de la copie dans tes commentaires.
Réponds uniquement en JSON :
{"criteres":[{"etape":"these","note":3,"commentaire":"une phrase de justification"},{"etape":"arguments","note":2,"commentaire":"..."},{"etape":"exemple","note":3,"commentaire":"..."},{"etape":"citation","note":2,"commentaire":"..."},{"etape":"conclusion","note":3,"commentaire":"..."}],"appreciation":"...","conseil":"le conseil le plus utile pour progresser","piste_etape":"exemple","piste":"..."}`,
        2200, (x) => Array.isArray(x?.criteres) && x.criteres.length >= 5, seance);
      const criteres = ETAPES.map((e, i) => {
        const x = c.criteres.find((k: any) => sansAccents(String(k?.etape || "")).startsWith(e.key.slice(0, 5))) || c.criteres[i] || {};
        return Math.min(4, Math.max(1, Math.round(Number(x.note) || 1)));
      });
      const totalNote = Math.max(0, criteres.reduce((a: number, b: number) => a + b, 0) - (trop_court ? 1 : 0));
      sauverProduction({ id: seance, exercice: "paragraphe", format: "cadres", sujet: (sujet.texte ? "Texte : " : "") + sujet.sujet,
        contenu: copie + "\n\n— Correction —\n" + ETAPES.map((e, i) => `${e.label} : ${criteres[i]}/4`).join(" · ") + "\n" + String(c.appreciation || ""),
        note: `${totalNote}/20` });
      setCorrection({
        criteres: ETAPES.map((e, i) => {
          const x = c.criteres.find((k: any) => sansAccents(String(k?.etape || "")).startsWith(e.key.slice(0, 5))) || c.criteres[i] || {};
          return { etape: e.key, note: Math.min(4, Math.max(1, Math.round(Number(x.note) || 1))), commentaire: String(x.commentaire || "") };
        }),
        appreciation: String(c.appreciation || ""),
        conseil: String(c.conseil || ""),
        piste: String(c.piste || ""),
        piste_etape: (ETAPES.find((e) => sansAccents(String(c.piste_etape || "")).startsWith(e.key.slice(0, 5)))?.key) || "",
      });
    } catch {
      setErr("La correction n'a pas pu être faite. Réessaie dans un instant.");
    }
    setCorrecting(false);
  };

  const total = correction ? Math.max(0, correction.criteres.reduce((s, c) => s + c.note, 0) - (trop_court ? 1 : 0)) : 0;

  return (
    <div className="space-y-3">
      {/* Choix du texte ou du sujet */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 space-y-3">
        {loadTextes && (
          <div className="flex gap-1.5 items-center">
            <span className="text-[11px] font-bold text-gray-400 mr-1">À partir :</span>
            {([["texte", "📜 d'un texte"], ["sujet", "❓ d'un sujet seul"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => { setAppui(k); setSujet(null); setCorrection(null); setNotion("all"); }}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all ${appui === k ? "bg-gray-800 border-gray-800 text-white" : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"}`}>
                {l}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={tirerSujet} disabled={!source}
            className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all">
            <RefreshCw className="w-4 h-4" /> {avecTexte ? (sujet ? "Autre texte au hasard" : "Un texte au hasard") : (sujet ? "Autre sujet au hasard" : "Un sujet au hasard")}
          </button>
          <select value={notion} onChange={(e) => setNotion(e.target.value)} disabled={!source || notions.length === 0}
            className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-rose-400 focus:outline-none text-gray-800 bg-white">
            <option value="all">Toutes les notions</option>
            {notions.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
          </select>
        </div>
        <p className="text-[11px] text-gray-400">
          {avecTexte
            ? (!textes ? "Chargement des textes…" : textes.length ? `${textes.length} textes disponibles${textes.some((t) => t.origine === "bac") ? " (sujets d'explication de texte du bac 1996-2024 et textes du professeur)" : ""}.` : "Aucun texte n'est encore disponible : choisis « d'un sujet seul ».")
            : bankErr ? "La banque de sujets n'a pas pu être chargée." : !bank ? "Chargement de la banque de sujets…" : `${bank.length} vrais sujets disponibles.`}
        </p>
      </div>

      {err && <p className="text-sm font-semibold rounded-xl px-3 py-2 border bg-red-50 text-red-700 border-red-200">{err}</p>}

      {sujet && (
        <div className="bg-white border-2 border-rose-200 rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{sujet.texte ? "Texte" : "Sujet"}</p>
            <p className="font-black text-gray-800">{sujet.texte ? sujet.sujet : `« ${sujet.sujet} »`}</p>
            {sujet.texte && (
              <div className="mt-2 max-h-72 overflow-y-auto bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-serif">{sujet.texte}</div>
            )}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {notionsDe(sujet).map((n) => <span key={n} className="text-[11px] font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">{n}</span>)}
              {sujet.source && <span className="text-[11px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">📌 {sujet.source}</span>}
            </div>
            <p className="text-xs text-gray-500 mt-2">{sujet.texte
              ? "Rédige un paragraphe argumenté (15 à 20 lignes) qui reconstitue et explique la thèse de l'auteur. Ta citation doit venir du texte, et ton exemple doit être personnel."
              : "Rédige un paragraphe argumenté (15 à 20 lignes) qui répond à ce sujet."}</p>
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-gray-600 cursor-pointer w-fit">
            <input type="checkbox" checked={bloc} onChange={(e) => {
              const v = e.target.checked;
              if (v && !texteBloc.trim()) setTexteBloc(ETAPES.map((x) => parts[x.key].trim()).filter(Boolean).join(" "));
              setBloc(v);
            }} className="accent-rose-600" />
            Je rédige d'un seul bloc, sans les étapes guidées (plus difficile)
          </label>

          {bloc ? (
            <textarea value={texteBloc} onChange={(e) => setTexteBloc(e.target.value)} rows={12}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-rose-400 focus:outline-none resize-y text-gray-800 leading-relaxed"
              placeholder="Ton paragraphe complet : thèse, arguments, exemple, citation expliquée, conclusion." />
          ) : (
            ETAPES.map((e) => (
              <div key={e.key}>
                <label className="text-sm font-black text-gray-800">[{e.label}]</label>
                <p className="text-xs text-gray-500 mb-1.5">{(sujet.texte && AIDE_TEXTE[e.key]) || e.aide}</p>
                <textarea value={parts[e.key]} onChange={(ev) => setParts({ ...parts, [e.key]: ev.target.value })}
                  rows={e.key === "arguments" ? 5 : e.key === "these" ? 2 : 3}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-rose-400 focus:outline-none resize-y text-gray-800" />
              </div>
            ))
          )}

          <p className={`text-xs font-bold ${trop_court ? "text-amber-700" : "text-green-700"}`}>
            {mots} mots {trop_court ? `· encore un peu court (visé : au moins ${MOTS_MIN} mots, soit une quinzaine de lignes)` : "· longueur correcte"}
          </p>

          <button onClick={() => setShowHint(!showHint)} className="flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-900">
            <Lightbulb className="w-4 h-4" /> {showHint ? "Masquer les rappels" : "Les rappels du prof"}
          </button>
          {showHint && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed space-y-1">
              <p><strong>Thèse :</strong> une seule idée, qui répond au sujet.</p>
              <p><strong>Arguments :</strong> ne répète pas la thèse, explique pourquoi elle est vraie. Pour argumenter, tu peux définir les mots importants, comme le font les philosophes eux-mêmes.</p>
              <p><strong>Exemple :</strong> une situation de la vie réelle, que tu trouves toi-même. Citer un auteur ou une célébrité n'est pas un exemple{sujet?.texte ? ", et reprendre l'exemple du texte ne montre pas que tu as compris" : ""}.</p>
              <p><strong>Citation :</strong> {sujet?.texte ? "un passage exact du texte, entre guillemets, " : ""}toujours expliquée. C'est à toi de faire le commentaire de la citation, pas au correcteur.</p>
              <p><strong>Conclusion :</strong> fais le bilan et réponds clairement au sujet.</p>
            </div>
          )}

          <button onClick={corriger} disabled={!canSubmit}
            className={`w-full py-3 rounded-xl font-black text-sm text-white transition-all flex items-center justify-center gap-2 ${canSubmit ? "bg-rose-600 hover:bg-rose-700" : "bg-gray-300"}`}>
            {correcting ? <><Sparkles className="w-4 h-4 animate-spin" /> Correction en cours…</> : "Faire corriger mon paragraphe"}
          </button>
        </div>
      )}

      {correction && (
        <div className="space-y-3">
          <div className={`rounded-2xl border-2 p-4 ${total >= 15 ? "bg-green-50 border-green-300 text-green-900" : total >= 10 ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-rose-50 border-rose-300 text-rose-900"}`}>
            <p className="font-black text-2xl">{total} / 20</p>
            {trop_court && <p className="text-xs font-bold mt-0.5">−1 point : paragraphe nettement plus court que les 15 à 20 lignes demandées.</p>}
            {correction.appreciation && <p className="text-sm mt-2 leading-relaxed">{correction.appreciation}</p>}
          </div>

          <div className="bg-white border-2 border-gray-200 rounded-2xl divide-y divide-gray-100">
            {correction.criteres.map((c) => (
              <div key={c.etape} className="px-4 py-3 flex gap-3">
                <span className={`flex-shrink-0 w-10 h-10 rounded-xl border-2 flex items-center justify-center font-black text-sm ${ETAPE[c.etape].cls}`}>{c.note}/4</span>
                <div>
                  <p className="text-sm font-bold text-gray-800">{ETAPE[c.etape].label} <span className="text-xs font-semibold text-gray-400">· {NIVEAUX_NOTE[c.note]}</span></p>
                  {c.commentaire && <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{c.commentaire}</p>}
                </div>
              </div>
            ))}
          </div>

          {correction.conseil && (
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4">
              <p className="text-xs font-black uppercase tracking-widest text-indigo-700">Pour progresser</p>
              <p className="text-sm text-indigo-900 mt-1 leading-relaxed">{correction.conseil}</p>
            </div>
          )}

          {correction.piste && (
            <details className="bg-white border-2 border-rose-200 rounded-2xl overflow-hidden">
              <summary className="px-4 py-3 cursor-pointer text-sm font-bold text-rose-700 hover:bg-rose-50 list-none">
                💡 Voir un indice pour améliorer{correction.piste_etape ? ` l'étape « ${ETAPE[correction.piste_etape].label} »` : " ton paragraphe"}
              </summary>
              <p className="px-4 pb-4 pt-1 text-sm text-gray-700 leading-relaxed">{correction.piste}</p>
            </details>
          )}

          <div className="flex gap-2">
            <button onClick={() => setCorrection(null)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-rose-200 text-rose-700 hover:bg-rose-50">
              Retravailler mon paragraphe
            </button>
            <button onClick={tirerSujet} className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-rose-600 hover:bg-rose-700 text-white">
              Nouveau sujet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
