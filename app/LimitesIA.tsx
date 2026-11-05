"use client";
// app/LimitesIA.tsx
// Réglage des plafonds de réponses IA (Mode Prof → Fonctionnalités).
// Stocké dans config.ai_limites_eleves ; lu par /api/ai à chaque appel (cache d'une minute).
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export const LIMITES_DEFAUT = { par_eleve: 40, par_connexion: 150 };

export default function LimitesIA() {
  const [v, setV] = useState(LIMITES_DEFAUT);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("config").select("value").eq("key", "ai_limites_eleves").maybeSingle()
      .then(({ data }) => { try { if (data?.value) setV({ ...LIMITES_DEFAUT, ...JSON.parse(data.value) }); } catch { /* défaut */ } });
  }, []);

  const save = async () => {
    setSaving(true); setMsg("");
    const { error } = await supabase.from("config").upsert({ key: "ai_limites_eleves", value: JSON.stringify(v) }, { onConflict: "key" });
    setMsg(error ? "L'enregistrement a échoué." : "Enregistré : appliqué d'ici une minute.");
    setSaving(false);
  };

  const field = (k: keyof typeof v, label: string, desc: string) => (
    <label className="block">
      <span className="text-sm font-bold text-gray-800">{label}</span>
      <span className="block text-xs text-gray-500 mb-1">{desc}</span>
      <input type="number" min={0} value={v[k]}
        onChange={(e) => setV({ ...v, [k]: Math.max(0, parseInt(e.target.value || "0", 10)) })}
        className="w-32 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm font-bold focus:border-orange-400 focus:outline-none" />
    </label>
  );

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-200 overflow-hidden">
      <div className="px-5 py-3 bg-amber-50 border-b border-amber-200">
        <h3 className="font-black text-amber-900">Limites d'utilisation de l'IA</h3>
        <p className="text-xs text-amber-800 mt-0.5">Nombre maximum de réponses IA par jour. Le compteur repart à zéro à minuit. Mettre 0 pour ne fixer aucune limite.</p>
      </div>
      <div className="p-5 grid sm:grid-cols-2 gap-4">
        {field("par_eleve", "Par élève", "Compté par navigateur (identifiant anonyme), même sans prénom")}
        {field("par_connexion", "Par connexion internet", "Plus large : au lycée, une classe partage souvent la même connexion")}
      </div>
      <div className="px-5 pb-4 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl">
          {saving ? "Enregistrement…" : "Enregistrer les limites"}
        </button>
        {msg && <span className="text-xs font-semibold text-gray-600">{msg}</span>}
      </div>
    </div>
  );
}
