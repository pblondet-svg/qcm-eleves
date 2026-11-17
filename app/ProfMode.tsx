"use client";
// app/ProfMode.tsx — Mode Prof : textes, notions, banque de sujets, fonctionnalités, fiches méthode, FAQ, code prof.
// (extrait de page.tsx)

import { useState, useMemo, useRef, useEffect } from "react";
import { Plus, Trash2, Sparkles, FileUp, Search, X, Edit2, Check, FolderOpen, Lock, LogOut, RefreshCw, CheckCircle2, AlertTriangle, Layers } from "lucide-react";
import { ProfFaqManager, usePendingFaqCount } from "./FaqComponents";
import LimitesIA from "./LimitesIA";
import { ProfCoursRevision } from "./CoursPremiere";
import { DEFAULT_FEATURES, DEFAULT_METHODE_CONTENT, FeaturesConfig, MethodeContent, PHILO_NOTIONS_PROGRAMME, callAI, dbAddTexte, dbCountSujetsBac, dbDeleteSujetBac, dbDeleteTexte, dbGetConfig, dbInsertSujetBac, dbLoadSujetsBac, dbSetConfig, dbUpdateTexte, entryChapter, entryName, extractFile, extractMetadataWithAI, fmtDate, getText, matiereColor, matiereLabel, parseJSON, saveFeaturesConfig, saveMethodeContent, uid, wc } from "./shared";
import { ChapterSelect, ValidationModal } from "./ComposantsCommuns";

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
Un objet par sujet, dans le même ordre.` }], 2000, false, "qcm");
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
      await dbSetConfig("prof_code", nouveau); try { sessionStorage.setItem("prof_code_session", nouveau); } catch {}
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
              {([
                ["Ancien code", ancien, setAncien, "Ton code actuel"],
                ["Nouveau code (min. 6 car.)", nouveau, setNouveau, "Au moins 6 caractères"],
                ["Confirmer le nouveau code", confirm, setConfirm, "Répète le nouveau code"],
              ] as [string, string, (v: string) => void, string][]).map(([label, val, setter, ph]) => (
                <div key={label}>
                  <label className="text-xs font-bold text-gray-600 uppercase mb-1 block">{label}</label>
                  <input type="password" value={val} onChange={e => setter(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-purple-400 focus:outline-none text-gray-800"
                    placeholder={ph} />
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

// ── FEATURES PANEL ────────────────────────────────────────────────────────────
function FeaturesPanel({ featuresConfig, setFeaturesConfig }: { featuresConfig: FeaturesConfig; setFeaturesConfig: (c: FeaturesConfig) => void }) {
  const [saved, setSaved] = useState(false);

  const toggle = (key: keyof FeaturesConfig) => {
    setFeaturesConfig({ ...featuresConfig, [key]: !featuresConfig[key] });
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      await saveFeaturesConfig(featuresConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { alert("Erreur lors de la sauvegarde."); }
  };

  const resetAll = () => {
    setFeaturesConfig({ ...DEFAULT_FEATURES });
    setSaved(false);
  };

  type ToggleItem = { key: keyof FeaturesConfig; label: string; desc: string };
  type Section = { title: string; color: string; bg: string; border: string; items: ToggleItem[] };

  const sections: Section[] = [
    {
      title: "Onglets Mode Élève",
      color: "text-emerald-800",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      items: [
        { key: "tab_revision", label: "📖 Réviser", desc: "Accès au mode révision avec l'IA" },
        { key: "tab_quiz", label: "✅ Quiz", desc: "Génération de QCM sur les textes" },
        { key: "tab_dissertation", label: "✍️ Dissertation", desc: "Mode dissertation (plan, brainstorming…)" },
        { key: "tab_carte", label: "🗺️ Carte mentale", desc: "Visualisation SVG des notions" },
        { key: "tab_colle", label: "🎓 Colle", desc: "Simulation d'interrogation orale" },
      ],
    },
    {
      title: "Modes Dissertation",
      color: "text-rose-800",
      bg: "bg-rose-50",
      border: "border-rose-200",
      items: [
        { key: "diss_plan", label: "📋 Construction guidée", desc: "L'élève construit son introduction et son plan étape par étape, avec indices" },
        { key: "diss_brainstorm", label: "💬 Brainstorming", desc: "Dialogue socratique avec l'IA" },
        { key: "diss_corrige", label: "✏️ Corrigé différé", desc: "Rédaction puis correction par l'IA" },
        { key: "diss_combined", label: "🔀 Vue combinée", desc: "Accès aux 3 modes en simultané" },
      ],
    },
    {
      title: "Onglets Révision",
      color: "text-indigo-800",
      bg: "bg-indigo-50",
      border: "border-indigo-200",
      items: [
        { key: "rev_chat", label: "💬 Chat IA", desc: "Questions libres sur le texte" },
        { key: "rev_interrogation", label: "🎓 Interrogation", desc: "L'IA pose des questions à l'élève" },
        { key: "rev_fiche", label: "📋 Fiche de lecture", desc: "Résumé structuré auto-généré" },
        { key: "rev_flashcards", label: "🃏 Flashcards", desc: "Cartes de mémorisation sur le texte" },
      ],
    },
    {
      title: "Général",
      color: "text-gray-800",
      bg: "bg-gray-50",
      border: "border-gray-200",
      items: [
        { key: "show_dashboard", label: "📊 Tableau de bord", desc: "Statistiques et suivi des élèves" }, { key: "home_cours", label: "📖 Cours (page d'accueil)", desc: "Cartes Cours sur l'accueil élèves : décocher pour les masquer" }, { key: "home_dissertation", label: "✍️ Dissertation (page d'accueil)", desc: "Cartes Dissertation HLP et Philo sur l'accueil élèves : décocher pour les masquer" }, { key: "home_hlp1", label: "📘 Révision du cours HLP Première (page d'accueil)", desc: "Carte « Révision du cours — Spécialité HLP Première » sur l'accueil élèves" }, { key: "home_tle", label: "📗 Révision du cours Philo Terminale (page d'accueil)", desc: "Carte « Révision du cours — Philosophie Terminale (tronc commun) » sur l'accueil élèves" },
      ],
    },
  ];

  const totalEnabled = Object.values(featuresConfig).filter(Boolean).length;
  const total = Object.keys(DEFAULT_FEATURES).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-800">⚙️ Gestion des fonctionnalités</h2>
          <p className="text-sm text-gray-500 mt-1">Activez ou désactivez les fonctions visibles par les élèves. Les modifications sont sauvegardées en base de données.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">{totalEnabled}/{total} activées</span>
          <button onClick={resetAll} className="text-xs font-bold text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
            Tout réactiver
          </button>
          <button onClick={handleSave}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-sm ${saved ? "bg-green-600 text-white" : "bg-orange-600 text-white hover:bg-orange-700"}`}>
            {saved ? "✓ Sauvegardé !" : "💾 Sauvegarder"}
          </button>
        </div>
      </div>

      {/* Sections */}
      <LimitesIA />

      {sections.map(section => (
        <div key={section.title} className={`rounded-2xl border-2 ${section.border} overflow-hidden`}>
          <div className={`${section.bg} px-5 py-3 border-b ${section.border}`}>
            <h3 className={`font-black text-sm ${section.color}`}>{section.title}</h3>
          </div>
          <div className="bg-white divide-y divide-gray-100">
            {section.items.map(({ key, label, desc }) => {
              const enabled = featuresConfig[key] !== false;
              return (
                <div key={key} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${enabled ? "bg-green-500" : "bg-gray-300"}`} />
                    <div>
                      <p className={`text-sm font-bold ${enabled ? "text-gray-800" : "text-gray-400"}`}>{label}</p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                  </div>
                  {/* Toggle switch */}
                  <button
                    onClick={() => toggle(key)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${enabled ? "bg-green-500" : "bg-gray-300"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Footer note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs text-amber-800 font-semibold">⚠️ N'oubliez pas de cliquer sur <strong>Sauvegarder</strong> après chaque modification. Les changements sont appliqués immédiatement aux élèves connectés.</p>
      </div>
    </div>
  );
}

// ── PROF METHODE PANEL ────────────────────────────────────────────────────────
function ProfMethodePanel({ methodeContent, setMethodeContent }: { methodeContent: MethodeContent; setMethodeContent: (mc: MethodeContent) => void }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeKey, setActiveKey] = useState<keyof MethodeContent>("intro_dissertation");

  const fiches: { key: keyof MethodeContent; label: string; icon: string; desc: string; groupe: "philo" | "hlp" }[] = [
    { key: "intro_dissertation", label: "Introduction — Dissertation", icon: "📝", desc: "Opinion commune, définitions, paradoxe, problématique, annonce de plan", groupe: "philo" },
    { key: "plan_tas", label: "Plan dialectique", icon: "🔺", desc: "Thèse / antithèse / synthèse : principe, construction, astuce, exemples, sujets du cours", groupe: "philo" },
    { key: "plan_notionnel", label: "Plan notionnel", icon: "🔎", desc: "Distinction des sens : principe, construction, astuce, exemples, sujets du cours", groupe: "philo" },
    { key: "plan_critique", label: "Plan critique", icon: "🧭", desc: "Examen des présupposés : principe, construction, astuce, exemples, sujets du cours", groupe: "philo" },
    { key: "paragraphe", label: "Rédiger un paragraphe", icon: "✍️", desc: "Les 5 éléments obligatoires + éléments optionnels", groupe: "philo" },
    { key: "expl_generale", label: "Explication de texte — Série Générale", icon: "📖", desc: "Commentaire linéaire : introduction, développement, conclusion", groupe: "philo" },
    { key: "expl_techno", label: "Explication de texte — Série Techno", icon: "🔧", desc: "Option 1 (A/B/C) et Option 2 (commentaire libre)", groupe: "philo" },
    { key: "hlp_interpretation", label: "Question d'interprétation philosophique", icon: "🔍", desc: "Méthode HLP — vue uniquement par les élèves de HLP", groupe: "hlp" },
    { key: "hlp_essai", label: "Essai — question de réflexion philosophique", icon: "🖋️", desc: "Méthode HLP — vue uniquement par les élèves de HLP", groupe: "hlp" },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveMethodeContent(methodeContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { alert("Erreur lors de la sauvegarde."); }
    setSaving(false);
  };

  const resetFiche = (key: keyof MethodeContent) => {
    if (!confirm("Remettre cette fiche à son contenu d'origine ?")) return;
    setMethodeContent({ ...methodeContent, [key]: DEFAULT_METHODE_CONTENT[key] });
    setSaved(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-800">📐 Fiches Méthode</h2>
          <p className="text-sm text-gray-500 mt-1">Modifiez le contenu de chaque fiche. Le chatbot méthode des élèves s'appuiera exactement sur ces textes.</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all shadow-sm ${saved ? "bg-green-600" : saving ? "bg-gray-400" : "bg-amber-600 hover:bg-amber-700"}`}>
          {saved ? "✓ Sauvegardé !" : saving ? "Sauvegarde…" : "💾 Sauvegarder"}
        </button>
      </div>

      <div className="flex gap-4">
        {/* Sidebar fiches */}
        <div className="w-56 flex-shrink-0 space-y-1">
          {(["philo", "hlp"] as const).map(g => (
            <div key={g} className={g === "hlp" ? "pt-4" : ""}>
              <p className={`text-[10px] font-black uppercase tracking-widest px-1 pb-1.5 ${g === "hlp" ? "text-emerald-700" : "text-blue-700"}`}>
                {g === "philo" ? "🧠 Philosophie (tronc commun)" : "📜 HLP"}
              </p>
              <div className="space-y-1">
                {fiches.filter(f => f.groupe === g).map(f => (
                  <button key={f.key} onClick={() => setActiveKey(f.key)}
                    className={`w-full text-left px-3 py-3 rounded-xl border-2 transition-all ${activeKey === f.key ? (g === "hlp" ? "bg-emerald-600 text-white border-emerald-600" : "bg-amber-600 text-white border-amber-600") : "border-gray-200 bg-white text-gray-700 hover:border-amber-300"}`}>
                    <p className="text-xs font-black">{f.icon} {f.label}{g === "hlp" && !(methodeContent[f.key] || "").trim() && <span className="ml-1 font-semibold opacity-70">(vide)</span>}</p>
                    <p className={`text-xs mt-0.5 ${activeKey === f.key ? "text-white/80" : "text-gray-400"}`}>{f.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Éditeur */}
        <div className="flex-1 bg-white rounded-2xl border-2 border-gray-200 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
            <p className="font-black text-gray-800 text-sm">
              {fiches.find(f => f.key === activeKey)?.icon} {fiches.find(f => f.key === activeKey)?.label}
            </p>
            <button onClick={() => resetFiche(activeKey)}
              className="text-xs text-gray-500 hover:text-red-600 font-semibold transition-colors">
              ↺ Remettre par défaut
            </button>
          </div>
          <textarea
            value={methodeContent[activeKey] || ""}
            onChange={e => { setMethodeContent({ ...methodeContent, [activeKey]: e.target.value }); setSaved(false); }}
            className="flex-1 p-4 text-sm text-gray-800 font-mono leading-relaxed resize-none focus:outline-none min-h-96"
            placeholder={activeKey.startsWith("hlp_") ? "Écrivez ici votre méthode HLP. Tant que cette fiche est vide, les élèves de HLP verront « fiche bientôt disponible »." : "Contenu de la fiche méthode…"}
            spellCheck={false}
          />
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 flex justify-between">
            <span>{(methodeContent[activeKey] || "").split("\n").length} lignes · {(methodeContent[activeKey] || "").length} caractères</span>
            <span>Format libre — le chatbot lira ce texte tel quel</span>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-xs text-amber-800">⚠️ N'oubliez pas de cliquer sur <strong>Sauvegarder</strong>. Le chatbot méthode des élèves utilisera exactement ce contenu pour répondre à leurs questions.</p>
      </div>
    </div>
  );
}

// ── PROF MODE ─────────────────────────────────────────────────────────────────
export function ProfMode({ sharedLib, setSharedLib, onLogout, libLoaded, onReload, onDashboard, featuresConfig, setFeaturesConfig, methodeContent, setMethodeContent, faqMethode, setFaqMethode, onFaqUpdated }: any) {
  const [profTab, setProfTab] = useState<"textes" | "sujets" | "notions" | "features" | "methode" | "faq" | "hlp1">("textes");
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
  const fileInputRef = useRef<HTMLInputElement>(null); const pendingFaq = usePendingFaqCount();

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
              📊 Stats
            </button>
            <button onClick={onReload} className="p-2 text-gray-600 hover:text-indigo-600 rounded-lg"><RefreshCw className="w-4 h-4" /></button>
            <ChangerCodeProf />
            <button onClick={onLogout} className="text-sm text-gray-600 hover:text-red-600 font-semibold flex items-center gap-1.5">
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          </div>
        </div>
        {/* Ligne onglets */}
        <div className="max-w-6xl mx-auto px-6 pb-3 flex flex-wrap gap-2">
          {([
            ["textes",   "📚 Textes",          "bg-purple-600 border-purple-600", "hover:border-purple-300"],
            ["sujets",   "✍️ Sujets",          "bg-rose-600 border-rose-600",    "hover:border-rose-300"],
            ["notions",  "🎯 Notions",         "bg-indigo-600 border-indigo-600", "hover:border-indigo-300"],
            ["features", "⚙️ Fonctionnalités", "bg-orange-600 border-orange-600", "hover:border-orange-300"],
            ["methode",  "📐 Fiches Méthode",  "bg-amber-600 border-amber-600",   "hover:border-amber-300"],
            ["faq",      `❓ FAQ Méthode${pendingFaq > 0 ? ` (${pendingFaq})` : ""}`,      "bg-violet-600 border-violet-600", "hover:border-violet-300"],
            ["hlp1",     "📘 Cours (révision)", "bg-emerald-600 border-emerald-600", "hover:border-emerald-300"],
          ] as [string, string, string, string][]).map(([tab, label, activeClass, hoverClass]) => (
            <button key={tab} onClick={() => setProfTab(tab as any)}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${
                profTab === tab
                  ? activeClass + " text-white"
                  : "bg-white text-gray-700 border-gray-200 " + hoverClass
              }`}>
              {label}
            </button>
          ))}
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
      ) : profTab === "features" ? (
        <div className="max-w-3xl mx-auto px-6 py-8">
          <FeaturesPanel featuresConfig={featuresConfig} setFeaturesConfig={setFeaturesConfig} />
        </div>
      ) : profTab === "methode" ? (
        <div className="max-w-4xl mx-auto px-6 py-8">
          <ProfMethodePanel methodeContent={methodeContent} setMethodeContent={setMethodeContent} />
        </div>
      ) : profTab === "hlp1" ? (
        <div className="max-w-5xl mx-auto px-6 py-8">
          <ProfCoursRevision extractFile={extractFile} />
        </div>
      ) : profTab === "faq" ? (
        <div className="max-w-3xl mx-auto px-6 py-8">
          <ProfFaqManager faqMethode={faqMethode} setFaqMethode={setFaqMethode} onFaqUpdated={onFaqUpdated} />
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
                    <input ref={fileInputRef} type="file" multiple accept=".txt,.docx,.pdf" onChange={handleFileInput} className="hidden" />
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
