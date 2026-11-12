"use client";
// app/ParagrapheTrainer.tsx
// Entraînement au paragraphe argumenté, en deux exercices :
// 1. « Repère les étapes » : un paragraphe rédigé par le professeur (tiré de ses cours, blocs [Thèse], [Arguments],
//    [Exemple], [Citation], [Conclusion]) est présenté dans le désordre, sans les étiquettes ; l'élève retrouve
//    chaque étape. Correction immédiate, sans IA.
// 2. « Rédige ton paragraphe » : sur un vrai sujet de la banque, l'élève rédige son paragraphe ; l'IA le corrige
//    avec la grille du professeur (5 étapes notées de 1 à 4, note sur 20).

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Lightbulb, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { loadSeances, type Niveau } from "./CoursPremiere";

type AskAI = (messages: { role: string; content: string }[], maxTokens?: number, light?: boolean) => Promise<string>;
type Sujet = { sujet: string; notion_principale?: string; source?: string };

type Etape = "these" | "arguments" | "exemple" | "citation" | "conclusion";
const ETAPES: { key: Etape; label: string; aide: string; cls: string }[] = [
  { key: "these", label: "Thèse", aide: "L'idée que l'on affirme : une seule idée, formulée clairement, qui répond au sujet.", cls: "bg-blue-50 border-blue-300 text-blue-800" },
  { key: "arguments", label: "Arguments", aide: "Les raisons qui justifient la thèse : définitions, distinctions, raisonnement (« car », « en effet », « premièrement »).", cls: "bg-indigo-50 border-indigo-300 text-indigo-800" },
  { key: "exemple", label: "Exemple", aide: "Une situation concrète qui illustre l'argument : on reconnaît un cas particulier, une scène, un fait.", cls: "bg-green-50 border-green-300 text-green-800" },
  { key: "citation", label: "Citation", aide: "Les mots exacts d'un auteur, entre guillemets, suivis de leur explication.", cls: "bg-amber-50 border-amber-300 text-amber-800" },
  { key: "conclusion", label: "Conclusion", aide: "Le bilan de l'argumentation : elle répond au sujet et reprend l'idée en la précisant (« donc », « ainsi »).", cls: "bg-rose-50 border-rose-300 text-rose-800" },
];
const ETAPE = Object.fromEntries(ETAPES.map((e) => [e.key, e])) as Record<Etape, (typeof ETAPES)[number]>;

// ─── Découpage des paragraphes du professeur ────────────────────────────────
type Segment = { id: string; etape: Etape | null; label: string; texte: string };
type ParaProf = { id: string; titre: string; segments: Segment[] };

const sansAccents = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
// Étiquette reconnue → étape obligatoire, ou null pour une étape facultative (constat, objection…).
// undefined : ce n'est pas une étiquette (ex. « [...] » ou « [la volonté] » dans une citation).
const classer = (raw: string): Etape | null | undefined => {
  const l = sansAccents(raw);
  if (/^(objection|contre|conclusion de l.objection)/.test(l)) return null;
  if (/^(la )?these/.test(l)) return "these";
  if (/^argument/.test(l)) return "arguments";
  if (/^exemple/.test(l)) return "exemple";
  if (/^citation/.test(l)) return "citation";
  if (/^conclusion/.test(l)) return "conclusion";
  if (/^(constat|probleme|transition)/.test(l)) return null;
  return undefined;
};
// Retire les intertitres du cours (« II – … », « a) Aristote… », « TRANSITION »)
const nettoyer = (t: string) =>
  t.split("\n")
    .filter((ln) => { const s = ln.trim(); return s && !/^[IVX]+\s*[–-]\s/.test(s) && !/^[a-e]\)\s/.test(s) && !(s === s.toUpperCase() && /[A-Z]/.test(s) && s.length < 40); })
    .join(" ").replace(/\s+/g, " ").trim();

export function decouperParagraphe(contenu: string): Segment[] | null {
  const re = /\[([^\[\]\n]{3,60})\]/g;
  const marques: { idx: number; fin: number; label: string; etape: Etape | null }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(contenu))) {
    const e = classer(m[1]);
    if (e !== undefined) marques.push({ idx: m.index, fin: m.index + m[0].length, label: m[1].trim(), etape: e });
  }
  const segs: Segment[] = marques.map((mk, i) => ({
    id: String(i), etape: mk.etape, label: mk.label,
    texte: nettoyer(contenu.slice(mk.fin, i + 1 < marques.length ? marques[i + 1].idx : contenu.length)),
  })).filter((s) => s.texte.length > 15);
  // Utilisable seulement si les 5 étapes obligatoires y figurent, chacune une seule fois
  const ok = ETAPES.every((e) => segs.filter((s) => s.etape === e.key).length === 1);
  return ok ? segs : null;
}

const melanger = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const parseJSONLoose = (txt: string) => {
  const c = txt.replace(/```json/g, "").replace(/```/g, "").trim();
  const m = c.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : c);
};
async function askJSON(askAI: AskAI, prompt: string, maxTokens: number, valid: (x: any) => boolean) {
  for (const light of [false, true]) {
    try {
      const x = parseJSONLoose(await askAI([{ role: "user", content: prompt }], maxTokens, light));
      if (valid(x)) return x;
    } catch { /* on tente l'autre chaîne de modèles */ }
  }
  throw new Error("json");
}

// ─── Composant principal ────────────────────────────────────────────────────
export default function ParagrapheTrainer({ askAI, fiche, matiere, serie, loadSujets }: {
  askAI: AskAI; fiche: string; matiere: string; serie: "generale" | "techno" | null; loadSujets: () => Promise<Sujet[]>;
}) {
  const [exo, setExo] = useState<"reperer" | "rediger">("reperer");
  return (
    <div className="flex-1 overflow-y-auto space-y-4">
      <div className="bg-gradient-to-r from-rose-600 to-orange-500 text-white rounded-2xl p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-rose-100">✍️ S'entraîner au paragraphe</p>
        <h3 className="text-lg font-black mt-1">Le paragraphe argumenté</h3>
        <p className="text-sm text-rose-50 mt-1 leading-relaxed">
          Cinq étapes : <strong>Thèse</strong>, <strong>Arguments</strong>, <strong>Exemple</strong>, <strong>Citation</strong> (expliquée), <strong>Conclusion</strong>.
          Commence par les repérer dans un paragraphe du cours, puis rédige le tien.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([["reperer", "1. Repère les étapes", "Dans un paragraphe du cours"], ["rediger", "2. Rédige ton paragraphe", "Sur un vrai sujet, corrigé"]] as const).map(([k, t, d]) => (
          <button key={k} onClick={() => setExo(k)}
            className={`text-left rounded-2xl border-2 px-4 py-3 transition-all ${exo === k ? "border-rose-500 bg-rose-50" : "border-gray-200 bg-white hover:border-rose-300"}`}>
            <p className={`text-sm font-black ${exo === k ? "text-rose-700" : "text-gray-800"}`}>{t}</p>
            <p className="text-xs text-gray-500">{d}</p>
          </button>
        ))}
      </div>
      {exo === "reperer"
        ? <ReperageExercice matiere={matiere} onRediger={() => setExo("rediger")} />
        : <RedactionExercice askAI={askAI} fiche={fiche} matiere={matiere} serie={serie} loadSujets={loadSujets} />}
    </div>
  );
}

// ─── Exercice 1 : repérer les étapes ────────────────────────────────────────
function ReperageExercice({ matiere, onRediger }: { matiere: string; onRediger: () => void }) {
  const [paras, setParas] = useState<ParaProf[] | null>(null);
  const [cur, setCur] = useState<ParaProf | null>(null);
  const [ordre, setOrdre] = useState<Segment[]>([]);
  const [rep, setRep] = useState<Record<string, Etape>>({});
  const [verifie, setVerifie] = useState(false);
  const [voirOrdre, setVoirOrdre] = useState(false);
  const [vus, setVus] = useState<string[]>([]);

  useEffect(() => {
    const niveaux: Niveau[] = matiere === "hlp" ? ["hlp1", "tle"] : ["tle", "hlp1"];
    Promise.all(niveaux.map((n) => loadSeances(n).catch(() => [])))
      .then((lists) => {
        const out: ParaProf[] = [];
        lists.flat().forEach((s) => s.docs.forEach((d) => {
          const segs = decouperParagraphe(d.contenu || "");
          if (segs) out.push({ id: s.id + "/" + d.id, titre: d.titre.replace(/\s*\((cours|textes)\)\s*$/i, ""), segments: segs });
        }));
        setParas(out);
        if (out.length) choisir(out, []);
      });
  }, []);

  const choisir = (liste: ParaProf[], dejaVus: string[]) => {
    let pool = liste.filter((p) => !dejaVus.includes(p.id));
    if (!pool.length) { pool = liste; dejaVus = []; }
    const p = pool[Math.floor(Math.random() * pool.length)];
    setCur(p); setVus([...dejaVus, p.id]);
    setOrdre(melanger(p.segments)); setRep({}); setVerifie(false); setVoirOrdre(false);
  };

  if (!paras) return <p className="text-sm text-gray-500 flex items-center gap-2"><Sparkles className="w-4 h-4 animate-spin text-rose-500" /> Chargement des paragraphes du cours…</p>;
  if (!paras.length || !cur) return <p className="text-sm text-gray-500 bg-white border-2 border-gray-200 rounded-2xl p-4">Aucun paragraphe du cours n'est encore disponible pour cet exercice.</p>;

  const aRepondre = ordre.filter((s) => s.etape);
  const complet = aRepondre.every((s) => rep[s.id]);
  const score = aRepondre.filter((s) => rep[s.id] === s.etape).length;

  return (
    <div className="space-y-3">
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Paragraphe du cours</p>
        <p className="font-black text-gray-800 text-sm">{cur.titre}</p>
        <p className="text-xs text-gray-500 mt-1">Les morceaux de ce paragraphe ont été mélangés. Pour chacun, indique l'étape dont il s'agit. Chaque étape apparaît une seule fois.</p>
      </div>

      {(voirOrdre ? cur.segments : ordre).map((s, i) => {
        const choix = rep[s.id];
        const juste = verifie && s.etape && choix === s.etape;
        const faux = verifie && s.etape && choix !== s.etape;
        return (
          <div key={s.id} className={`bg-white rounded-2xl border-2 p-4 space-y-3 ${juste ? "border-green-300" : faux ? "border-rose-300" : "border-gray-200"}`}>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black text-gray-400">{voirOrdre ? `Étape ${i + 1}` : `Morceau ${String.fromCharCode(65 + i)}`}</span>
              {!s.etape && <span className="text-[11px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Étape facultative : {s.label}</span>}
              {voirOrdre && s.etape && <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border ${ETAPE[s.etape].cls}`}>{ETAPE[s.etape].label}</span>}
              {juste && <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto" />}
              {faux && <XCircle className="w-4 h-4 text-rose-600 ml-auto" />}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{s.texte}</p>
            {s.etape && !voirOrdre && (
              <div className="flex flex-wrap gap-1.5">
                {ETAPES.map((e) => {
                  const sel = choix === e.key;
                  const bon = verifie && e.key === s.etape;
                  return (
                    <button key={e.key} disabled={verifie} onClick={() => setRep({ ...rep, [s.id]: e.key })}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${bon ? "bg-green-600 border-green-600 text-white" : sel ? (verifie ? "bg-rose-500 border-rose-500 text-white" : "bg-gray-800 border-gray-800 text-white") : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"}`}>
                      {e.label}
                    </button>
                  );
                })}
              </div>
            )}
            {faux && s.etape && (
              <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                Il s'agit de l'étape « {ETAPE[s.etape].label} ». {ETAPE[s.etape].aide}
              </p>
            )}
          </div>
        );
      })}

      {!verifie ? (
        <button onClick={() => setVerifie(true)} disabled={!complet}
          className={`w-full py-3 rounded-xl font-black text-sm text-white transition-all ${complet ? "bg-rose-600 hover:bg-rose-700" : "bg-gray-300"}`}>
          {complet ? "Vérifier mes réponses" : `Encore ${aRepondre.filter((s) => !rep[s.id]).length} morceau(x) à identifier`}
        </button>
      ) : (
        <div className="space-y-3">
          <div className={`rounded-2xl border-2 p-4 ${score === 5 ? "bg-green-50 border-green-300 text-green-800" : score >= 3 ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-rose-50 border-rose-300 text-rose-800"}`}>
            <p className="font-black text-base">{score === 5 ? "🏆" : score >= 3 ? "👍" : "🔁"} {score} / 5 étapes bien repérées</p>
            <p className="text-sm mt-1">
              {score === 5 ? "Tu reconnais toutes les étapes. Passe à la rédaction de ton propre paragraphe."
                : "Relis les explications sous les morceaux mal identifiés, puis regarde le paragraphe dans l'ordre du professeur."}
            </p>
            <p className="text-xs mt-2 opacity-80">Remarque : l'ordre des étapes peut varier d'un paragraphe à l'autre, mais les cinq doivent toujours y être.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => setVoirOrdre(!voirOrdre)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 border-rose-200 text-rose-700 hover:bg-rose-50">
              {voirOrdre ? "Revenir à mes réponses" : "Voir le paragraphe dans l'ordre du professeur"}
            </button>
            <button onClick={() => choisir(paras, vus)} className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" /> Autre paragraphe
            </button>
            {score === 5 && (
              <button onClick={onRediger} className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-gray-800 hover:bg-gray-900 text-white">
                Rédiger mon paragraphe →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Exercice 2 : rédiger et faire corriger ─────────────────────────────────
const NIVEAUX_NOTE = ["", "Non acquis", "En cours d'acquisition", "Acquis", "Très bonne maîtrise"];
const MOTS_MIN = 150; // en dessous, le paragraphe est nettement plus court que les 15 à 20 lignes demandées : −1 point
type Critere = { etape: Etape; note: number; commentaire: string };
type Correction = { criteres: Critere[]; appreciation: string; conseil: string; piste: string; piste_etape: Etape | "" };
const nbMots = (t: string) => (t.trim().match(/[\p{L}\p{N}’'-]+/gu) || []).length;

function RedactionExercice({ askAI, fiche, matiere, serie, loadSujets }: {
  askAI: AskAI; fiche: string; matiere: string; serie: "generale" | "techno" | null; loadSujets: () => Promise<Sujet[]>;
}) {
  const isTechno = serie === "techno";
  const isHLP = matiere === "hlp";
  const niveau = isHLP ? "spécialité HLP" : isTechno ? "Terminale technologique" : "Terminale générale";

  const [bank, setBank] = useState<Sujet[] | null>(null);
  const [bankErr, setBankErr] = useState(false);
  const [notion, setNotion] = useState("all");
  const [sujet, setSujet] = useState<Sujet | null>(null);
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
  }, []);

  const notions = useMemo(() => {
    const m: Record<string, number> = {};
    (bank || []).forEach((x) => { const n = (x.notion_principale || "").trim(); if (n) m[n] = (m[n] || 0) + 1; });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [bank]);

  const tirerSujet = () => {
    setErr("");
    const pool = (bank || []).filter((x) => notion === "all" || (x.notion_principale || "").trim() === notion);
    if (!pool.length) { setErr("Aucun sujet disponible pour cette notion."); return; }
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && sujet && pick.sujet === sujet.sujet) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    setSujet({ ...pick, sujet: pick.sujet.trim() });
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

=== SUJET ===
« ${sujet.sujet} »

=== COPIE DE L'ÉLÈVE (${mots} mots) ===
${copie}

=== GRILLE DU PROFESSEUR ===
Chaque étape est notée de 1 à 4 : 1 = Non acquis, 2 = En cours d'acquisition, 3 = Acquis, 4 = Très bonne maîtrise. Notes exigeantes et discriminantes : 4 seulement si l'étape est vraiment maîtrisée. Une étape vide ou absente vaut 1.
- Thèse : une seule idée, claire, qui répond au sujet posé.
- Arguments : de vraies raisons qui reconstituent un raisonnement, et non la répétition de la thèse ; les concepts importants sont définis.
- Exemple : une situation concrète de la vie réelle, de préférence trouvée par l'élève lui-même, qui illustre bien l'argument (et non une autre idée). Une référence à un auteur ou à une personne qui fait autorité n'est pas un exemple concret ; une référence culturelle montre une bonne culture générale, mais ne remplace pas l'exemple.
- Citation : entre guillemets, d'un auteur identifié, reliée à l'idée, et toujours expliquée par l'élève : c'est à l'élève de faire le commentaire de la citation, pas au correcteur. Une citation posée sans explication ne dépasse pas 2. Si la citation te semble inexacte ou mal attribuée, signale-le avec prudence.
- Conclusion : fait le bilan de l'argumentation et répond explicitement au sujet, sans simplement répéter la thèse.
- Signale tout contresens sur un auteur.

=== STYLE DE L'APPRÉCIATION ===
5 à 7 lignes maximum. Tutoie l'élève. Commence de façon adoucie (« plutôt bien structuré », « assez juste dans l'essentiel »), cite des forces concrètes de la copie, puis « Il y a cependant des fragilités » ou « Les faiblesses touchent à… ». Rappelle le principe de la méthode et explique pourquoi c'est important. Ne parle de relecture que s'il y a de vraies fautes, en précisant si elles sont orthographiques ou typographiques. Pas de formule d'encouragement à la fin.
${isTechno ? "Langage clair et accessible, sans perdre en précision." : ""}

Dans "piste", réécris uniquement l'étape la plus faible (3 à 5 phrases), comme exemple d'amélioration à partir des idées de l'élève, sans inventer de citation.
Réponds uniquement en JSON :
{"criteres":[{"etape":"these","note":3,"commentaire":"une phrase de justification"},{"etape":"arguments","note":2,"commentaire":"..."},{"etape":"exemple","note":3,"commentaire":"..."},{"etape":"citation","note":2,"commentaire":"..."},{"etape":"conclusion","note":3,"commentaire":"..."}],"appreciation":"...","conseil":"le conseil le plus utile pour progresser","piste_etape":"exemple","piste":"..."}`,
        2200, (x) => Array.isArray(x?.criteres) && x.criteres.length >= 5);
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
      {/* Choix du sujet */}
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={tirerSujet} disabled={!bank}
            className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all">
            <RefreshCw className="w-4 h-4" /> {sujet ? "Autre sujet au hasard" : "Un sujet au hasard"}
          </button>
          <select value={notion} onChange={(e) => setNotion(e.target.value)} disabled={!bank || notions.length === 0}
            className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-rose-400 focus:outline-none text-gray-800 bg-white">
            <option value="all">Toutes les notions</option>
            {notions.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
          </select>
        </div>
        <p className="text-[11px] text-gray-400">
          {bankErr ? "La banque de sujets n'a pas pu être chargée." : !bank ? "Chargement de la banque de sujets…" : `${bank.length} vrais sujets disponibles.`}
        </p>
      </div>

      {err && <p className="text-sm font-semibold rounded-xl px-3 py-2 border bg-red-50 text-red-700 border-red-200">{err}</p>}

      {sujet && (
        <div className="bg-white border-2 border-rose-200 rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sujet</p>
            <p className="font-black text-gray-800">« {sujet.sujet} »</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {sujet.notion_principale && <span className="text-[11px] font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full">{sujet.notion_principale}</span>}
              {sujet.source && <span className="text-[11px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">📌 {sujet.source}</span>}
            </div>
            <p className="text-xs text-gray-500 mt-2">Rédige <strong>un</strong> paragraphe argumenté (environ 15 à 20 lignes) qui défend une réponse à ce sujet.</p>
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
                <p className="text-xs text-gray-500 mb-1.5">{e.aide}</p>
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
              <p><strong>Arguments :</strong> ne répète pas la thèse, explique pourquoi elle est vraie ; définis les mots importants.</p>
              <p><strong>Exemple :</strong> une situation de la vie réelle, que tu trouves toi-même. Citer un auteur ou une célébrité n'est pas un exemple.</p>
              <p><strong>Citation :</strong> toujours expliquée. C'est à toi de faire le commentaire de la citation, pas au correcteur.</p>
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
                💡 Voir une amélioration possible{correction.piste_etape ? ` de l'étape « ${ETAPE[correction.piste_etape].label} »` : ""}
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
