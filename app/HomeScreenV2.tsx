"use client";
// app/HomeScreenV2.tsx
// Remplace HomeScreen : les cartes « Cours » se masquent depuis
// Mode Prof → Fonctionnalités → « Cours (page d'accueil) ».

import { useState } from "react";
import { Lock, Sparkles, User } from "lucide-react";
import { supabase } from "@/lib/supabase";

const getProfCodeFromDb = async (): Promise<string | null> => {
  const { data, error } = await supabase.from("config").select("value").eq("key", "prof_code").single();
  if (error) return null;
  return data?.value || null;
};

const TRACKS = [
  {
    title: "🧠 Philosophie — Série Générale",
    titleCls: "text-blue-600",
    card: "border-blue-200 hover:border-blue-400",
    hover: "group-hover:text-blue-700",
    cours: "eleve-Philosophie-generale",
    methode: "eleve-Philosophie-generale-methode",
  },
  {
    title: "🔧 Philosophie — Série Techno",
    titleCls: "text-orange-600",
    card: "border-orange-200 hover:border-orange-400",
    hover: "group-hover:text-orange-700",
    cours: "eleve-Philosophie-techno",
    methode: "eleve-Philosophie-techno-methode",
  },
  {
    title: "📜 HLP — Humanités, Littérature & Philosophie",
    titleCls: "text-emerald-600",
    card: "border-emerald-200 hover:border-emerald-400",
    hover: "group-hover:text-emerald-700",
    cours: "eleve-HLP",
    methode: "eleve-HLP-methode",
  },
];

export default function HomeScreenV2({ onSelect, eleveNom, setEleveNom, saveEleveNom, featuresConfig }: any) {
  const showCours = featuresConfig?.home_cours !== false;
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [pseudoInput, setPseudoInput] = useState(eleveNom || "");

  // Garde le code le temps de la session : la FAQ prof en a besoin pour parler au serveur
  const grantProf = (c: string) => {
    try { sessionStorage.setItem("prof_code_session", c); } catch { /* ignore */ }
    onSelect("prof");
  };

  const verifyProfCode = async () => {
    if (!code.trim()) return;
    setChecking(true);
    setErr("");
    try {
      const validCode = (await getProfCodeFromDb()) || "prof1234";
      if (code === validCode) grantProf(code);
      else setErr("Code incorrect");
    } catch {
      if (code === "prof1234") grantProf(code);
      else setErr("Code incorrect");
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
          <input
            value={pseudoInput}
            onChange={(e) => { setPseudoInput(e.target.value); setEleveNom(e.target.value); }}
            onBlur={(e) => saveEleveNom && saveEleveNom(e.target.value)}
            className="flex-1 text-sm font-semibold text-gray-800 bg-transparent border-none outline-none placeholder-gray-400"
            placeholder="Ton prénom ou pseudo (optionnel)"
          />
          {pseudoInput && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">✓ Enregistré</span>}
        </div>
      </div>

      {/* Une ligne par parcours : Cours (masquable) + Méthode & FAQ */}
      {TRACKS.map((t) => (
        <div key={t.title} className="w-full max-w-2xl mb-3">
          <p className={`text-xs font-black uppercase tracking-widest mb-2 px-1 ${t.titleCls}`}>{t.title}</p>
          <div className={`grid gap-3 ${showCours ? "grid-cols-2" : "grid-cols-1"}`}>
            {showCours && (
              <button
                onClick={() => onSelect(t.cours)}
                className={`bg-white rounded-2xl border-2 shadow-sm p-5 hover:shadow-md transition-all group text-center ${t.card}`}>
                <div className="text-3xl mb-2">📖</div>
                <h2 className={`text-sm font-black text-gray-800 transition-colors ${t.hover}`}>Cours</h2>
                <p className="text-gray-400 text-xs mt-0.5">Réviser avec l'IA</p>
              </button>
            )}
            <button
              onClick={() => onSelect(t.methode)}
              className={`bg-white rounded-2xl border-2 shadow-sm p-5 hover:shadow-md transition-all group text-center ${t.card}`}>
              <div className="text-3xl mb-2">📐</div>
              <h2 className={`text-sm font-black text-gray-800 transition-colors ${t.hover}`}>Méthode et FAQ</h2>
              <p className="text-gray-400 text-xs mt-0.5">Fiches, assistant, questions au professeur</p>
            </button>
          </div>
        </div>
      ))}

      {/* Dissertation */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl mb-4 mt-3">
        <button
          onClick={() => onSelect("eleve-HLP-dissertation")}
          className="flex-1 bg-white rounded-3xl border-2 border-rose-200 shadow-lg p-6 hover:border-rose-400 hover:shadow-xl transition-all group text-center">
          <div className="text-4xl mb-2">✍️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-1 group-hover:text-rose-700 transition-colors">Dissertation HLP</h2>
          <p className="text-gray-500 text-sm">Sujets inédits croisant plusieurs notions</p>
        </button>
        <button
          onClick={() => onSelect("eleve-Philosophie-dissertation")}
          className="flex-1 bg-white rounded-3xl border-2 border-pink-200 shadow-lg p-6 hover:border-pink-400 hover:shadow-xl transition-all group text-center">
          <div className="text-4xl mb-2">🖊️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-1 group-hover:text-pink-700 transition-colors">Dissertation Philo</h2>
          <p className="text-gray-500 text-sm">Sujets inédits croisant plusieurs notions</p>
        </button>
      </div>

      {/* Professeur */}
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-lg p-6 hover:border-purple-400 transition-all text-center">
          <div className="text-4xl mb-2">👩‍🏫</div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">Professeur</h2>
          <p className="text-gray-500 text-sm mb-4">Gérer la bibliothèque de textes</p>
          {!showCode ? (
            <button
              onClick={() => setShowCode(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-6 rounded-xl text-sm flex items-center justify-center gap-2 transition-all mx-auto">
              <Lock className="w-4 h-4" /> Accéder
            </button>
          ) : (
            <div className="max-w-xs mx-auto">
              <input
                type="password"
                value={code}
                onChange={(e) => { setCode(e.target.value); setErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && verifyProfCode()}
                className="w-full p-2.5 border-2 border-purple-300 rounded-xl text-sm text-center mb-2 focus:border-purple-500 focus:outline-none text-gray-800"
                placeholder="Code professeur"
                autoFocus
              />
              {err && <p className="text-red-500 text-xs mb-2">{err}</p>}
              <button
                onClick={verifyProfCode}
                disabled={checking}
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
