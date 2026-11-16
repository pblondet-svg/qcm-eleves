"use client";
// app/VisiteursUniques.tsx
// Mode Prof → Stats → Usage IA : visiteurs uniques (un identifiant par navigateur), avec des indices pour
// reconnaître ses propres appareils : date de première visite (contenue dans l'identifiant), prénom saisi,
// connexion internet partagée avec un appareil déjà déclaré. Bouton « C'est moi » pour déclarer l'appareil.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { chargerAppareilsProf, type AppareilProf } from "./AppareilsProf";

type Ligne = { visitor_id?: string | null; ip?: string | null; eleve_nom?: string | null; created_at: string; action?: string };

// L'identifiant « v_<date en base 36>_<aléa> » contient la date de première visite depuis ce navigateur
const premiereVisite = (id: string) => {
  const m = id.match(/^v_([0-9a-z]+)_/);
  const t = m ? parseInt(m[1], 36) : NaN;
  return Number.isFinite(t) && t > 1.6e12 && t < 2.2e12 ? new Date(t) : null;
};
const fmt = (d: Date) => d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function VisiteursUniques({ usageStats, prof, onAppareilsChange }: { usageStats: Ligne[]; prof: boolean; onAppareilsChange?: () => void }) {
  const [appareils, setAppareils] = useState<AppareilProf[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => { if (prof) chargerAppareilsProf().then(setAppareils).catch(() => {}); }, [prof]);

  const { lignes, connexionLettre } = useMemo(() => {
    const v: Record<string, { n: number; ips: Set<string>; nom: string; derniere: string }> = {};
    usageStats.forEach((u) => {
      if (u.action === "call") return;
      const id = u.visitor_id || "unknown";
      const x = (v[id] ||= { n: 0, ips: new Set(), nom: "", derniere: u.created_at });
      x.n++;
      if (u.ip) x.ips.add(u.ip);
      if (!x.nom && u.eleve_nom) x.nom = u.eleve_nom;
      if (u.created_at > x.derniere) x.derniere = u.created_at;
    });
    // Connexions internet désignées par une lettre (l'adresse IP n'est pas affichée)
    const lettres: Record<string, string> = {};
    let k = 0;
    Object.values(v).forEach((x) => x.ips.forEach((ip) => { if (!lettres[ip]) lettres[ip] = String.fromCharCode(65 + (k++ % 26)) + (k > 26 ? Math.floor(k / 26) : ""); }));
    return { lignes: Object.entries(v).sort((a, b) => b[1].n - a[1].n), connexionLettre: lettres };
  }, [usageStats]);

  const idsProf = new Set(appareils.map((a) => a.id));
  const ipsProf = new Set(lignes.filter(([id]) => idsProf.has(id)).flatMap(([, x]) => [...x.ips]));
  const nomAppareil = (id: string) => appareils.find((a) => a.id === id)?.nom;

  const cEstMoi = async (id: string) => {
    const nom = window.prompt("Nom de cet appareil (ex. PC maison, PC salle 204) :", "Mon appareil");
    if (nom === null) return;
    const v = [...appareils.filter((a) => a.id !== id), { id, nom: nom.trim() || "Mon appareil", ajoute: new Date().toISOString() }];
    const { error } = await supabase.from("config").upsert({ key: "appareils_prof", value: JSON.stringify(v) }, { onConflict: "key" });
    if (error) { setMsg("L'enregistrement a échoué."); return; }
    setAppareils(v); setMsg("Appareil ajouté à vos appareils."); onAppareilsChange?.();
  };

  if (!lignes.length) return null;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <h3 className="font-black text-gray-800">👤 Visiteurs uniques ({lignes.length})</h3>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">
        Un identifiant par navigateur, sur les 500 derniers appels. La date indique la première visite depuis ce navigateur
        {prof ? " ; « même connexion » signale un navigateur utilisé sur la même connexion internet qu'un de vos appareils (chez vous ou au lycée)." : "."}
      </p>
      {msg && <p className="text-xs text-green-700 mb-2">{msg}</p>}
      <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
        {lignes.map(([id, x], i) => {
          const d = premiereVisite(id);
          const estProf = idsProf.has(id);
          const memeConnexion = !estProf && [...x.ips].some((ip) => ipsProf.has(ip));
          return (
            <div key={id} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-mono text-gray-600">
                  #{i + 1} — {id === "unknown" ? "sans identifiant" : id.slice(0, 16)}
                  {estProf && <span className="ml-2 font-sans font-bold text-indigo-700">👩‍🏫 Vous · {nomAppareil(id)}</span>}
                  {x.nom && !estProf && <span className="ml-2 font-sans font-bold text-gray-800">{x.nom}</span>}
                </p>
                <p className="text-[11px] text-gray-400">
                  {id === "unknown" ? "Appels faits avant l'attribution d'un identifiant au navigateur (anciennes versions du site)"
                    : <>{d ? `1re visite le ${fmt(d)}` : ""}{x.ips.size ? ` · connexion ${[...x.ips].map((ip) => connexionLettre[ip]).join(", ")}` : ""}</>}
                  {memeConnexion && <span className="ml-1 font-bold text-amber-700">· même connexion qu'un de vos appareils</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-black text-indigo-700">{x.n} appel{x.n > 1 ? "s" : ""}</span>
                {prof && !estProf && id !== "unknown" && (
                  <button onClick={() => cEstMoi(id)} className="text-[11px] font-bold text-gray-500 hover:text-indigo-700 border border-gray-200 hover:border-indigo-300 rounded-lg px-2 py-0.5">C'est moi</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
