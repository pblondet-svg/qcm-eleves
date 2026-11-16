"use client";
// app/AppareilsProf.tsx
// Mode Prof → Stats → Usage IA : le professeur déclare ses appareils (« Cet appareil est le mien »).
// Sur ces appareils, son utilisation de l'IA est reconnue même hors Mode Prof : non limitée,
// affichée « Vous (professeur) » et retirée des statistiques des élèves.
// Stockage : config.appareils_prof = [{ id: visitor_id, nom, ajoute }]

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type AppareilProf = { id: string; nom: string; ajoute: string };

export async function chargerAppareilsProf(): Promise<AppareilProf[]> {
  const { data } = await supabase.from("config").select("value").eq("key", "appareils_prof").maybeSingle();
  try { const v = data?.value ? JSON.parse(data.value) : []; return Array.isArray(v) ? v : []; } catch { return []; }
}

const idAppareil = () => { try { return localStorage.getItem("qcm_visitor_id") || ""; } catch { return ""; } };

export default function AppareilsProf({ onChange }: { onChange?: () => void }) {
  const [liste, setListe] = useState<AppareilProf[] | null>(null);
  const [nom, setNom] = useState("");
  const [msg, setMsg] = useState("");
  const monId = idAppareil();

  useEffect(() => { chargerAppareilsProf().then(setListe); }, []);

  const enregistrer = async (v: AppareilProf[]) => {
    const { error } = await supabase.from("config").upsert({ key: "appareils_prof", value: JSON.stringify(v) }, { onConflict: "key" });
    if (error) { setMsg("L'enregistrement a échoué. Réessaie."); return; }
    setListe(v); onChange?.();
  };

  const ajouter = async () => {
    if (!monId || !liste) return;
    const n = nom.trim() || `Appareil ${liste.length + 1}`;
    await enregistrer([...liste.filter((a) => a.id !== monId), { id: monId, nom: n, ajoute: new Date().toISOString() }]);
    setNom(""); setMsg("Cet appareil est maintenant reconnu comme le vôtre (effectif d'ici une minute).");
  };

  const retirer = (id: string) => liste && enregistrer(liste.filter((a) => a.id !== id));
  const reconnu = !!liste?.some((a) => a.id === monId);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
      <div>
        <h3 className="font-black text-gray-800">Mes appareils</h3>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
          Sur un appareil déclaré ici, votre utilisation de l'IA est reconnue même sans passer par le Mode Prof : elle n'est pas limitée,
          apparaît comme « Vous (professeur) » et n'est pas comptée dans les statistiques des élèves.
          Déclarez chaque ordinateur ou téléphone que vous utilisez, en ouvrant le Mode Prof une fois dessus.
        </p>
      </div>

      {!monId ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Cet appareil n'a pas encore d'identifiant : revenez une fois sur l'accueil élève, puis réessayez.</p>
      ) : reconnu ? (
        <p className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">✓ Cet appareil est reconnu comme le vôtre ({liste!.find((a) => a.id === monId)?.nom}).</p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de l'appareil (ex. PC maison, PC salle 204)"
            className="flex-1 px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-indigo-400 focus:outline-none text-gray-800" />
          <button onClick={ajouter} disabled={!liste}
            className="px-4 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white">
            Cet appareil est le mien
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-gray-600">{msg}</p>}

      {liste && liste.length > 0 && (
        <div className="divide-y divide-gray-100 border-2 border-gray-100 rounded-xl">
          {liste.map((a) => (
            <div key={a.id} className="px-3 py-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-gray-800">{a.nom}{a.id === monId ? <span className="text-xs font-semibold text-green-600"> · cet appareil</span> : null}</p>
                <p className="text-[11px] text-gray-400">ajouté le {new Date(a.ajoute).toLocaleDateString("fr-FR")}</p>
              </div>
              <button onClick={() => retirer(a.id)} className="text-xs font-bold text-rose-600 hover:text-rose-800">Retirer</button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-400">Si vous videz l'historique du navigateur ou changez de navigateur, il faudra déclarer l'appareil à nouveau.</p>
    </div>
  );
}
