"use client";
// app/ComposantsCommuns.tsx — Composants partagés : sélecteur de chapitres, validation des métadonnées extraites, rendu des fiches méthode.
// (extrait de page.tsx)

import { useState } from "react";
import { Plus, Trash2, X, Check, CheckCircle2, AlertTriangle } from "lucide-react";
import { HLP_CHAPITRES, PHILO_CHAPITRES, wc } from "./shared";

// ── Sélecteur de chapitre ────────────────────────────────────────────────────
export function ChapterSelect({ matiere, value, onChange, existingChapters, forceType }: {
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
export function ValidationModal({ pending, existingChapters, defaultMatiere, onConfirm, onCancel }: any) {
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

// ── Composant fiche générique (contenu texte brut) ────────────────────────────
export function FicheMarkdown({ title, content }: { title: string; content: string }) {
  return (
    <div className="p-6">
      <h2 className="text-lg font-black text-gray-800 border-b-2 border-amber-200 pb-3 mb-5">{title}</h2>
      <div className="space-y-2">
        {content.split("\n").map((line, i) => {
          if (!line.trim()) return <div key={i} className="h-2" />;
          if (line.startsWith("===") || line.startsWith("---")) return <hr key={i} className="border-gray-200 my-3" />;
          // Titres (ligne en majuscules ou commençant par un chiffre + point)
          if (line.match(/^[A-ZÉÈÊÀÙÎÏ\s]{5,}$/) || line.match(/^[A-ZÀ-Ý0-9' ]{4,} — /) || line.match(/^[A-Z]\./) || (!/[a-zà-öø-ÿ]/.test(line) && /[A-ZÀ-Ý]{4}/.test(line))) {
            return <p key={i} className="font-black text-gray-800 text-sm mt-4 mb-1">{line}</p>;
          }
          // Items numérotés
          if (line.match(/^\d+\./) || line.match(/^[A-C]\./)) {
            return (
              <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="font-black text-amber-600 flex-shrink-0 w-5">{line.split(".")[0]}.</span>
                <span>{line.split(".").slice(1).join(".").trim()}</span>
              </div>
            );
          }
          // Tirets / bullets
          if (line.startsWith("- ") || line.startsWith("• ")) {
            return (
              <div key={i} className="flex items-start gap-2 text-sm text-gray-700 ml-2">
                <span className="text-amber-500 flex-shrink-0 mt-0.5">→</span>
                <span>{line.replace(/^[-•]\s/, "")}</span>
              </div>
            );
          }
          return <p key={i} className="text-sm text-gray-700 leading-relaxed">{line}</p>;
        })}
      </div>
    </div>
  );
}
