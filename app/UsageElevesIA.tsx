"use client";
// app/UsageElevesIA.tsx
// Mode Prof → Stats → Usage IA : nombre de réponses IA utilisées aujourd'hui par chaque élève,
// pour repérer ceux qui approchent de la limite (réglée dans Fonctionnalités → Limites d'utilisation de l'IA).
// Le prénom vient de la colonne usage_stats.eleve_nom (voir usage_eleve_nom.sql) ; sans elle, l'élève
// est affiché par un identifiant anonyme.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Ligne = { visitor_id: string | null; ip: string | null; action: string; eleve_nom?: string | null; created_at: string };
type Eleve = { id: string; nom: string; utilise: number; bloque: number; derniere: string };

const debutJourParis = () => {
  const now = new Date();
  const paris = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const ecart = paris.getTime() - now.getTime();
  const minuit = new Date(paris); minuit.setHours(0, 0, 0, 0);
  return new Date(minuit.getTime() - ecart).toISOString();
};
const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function UsageElevesIA() {
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [avecNoms, setAvecNoms] = useState(true);
  const [limite, setLimite] = useState(40);
  const [limiteConnexion, setLimiteConnexion] = useState(150);
  const [tous, setTous] = useState(false);
  const [loading, setLoading] = useState(false);

  const charger = async () => {
    setLoading(true);
    const since = debutJourParis();
    let r: { data: unknown; error: unknown } = await supabase.from("usage_stats").select("visitor_id, ip, action, eleve_nom, created_at")
      .gte("created_at", since).neq("action", "call").order("created_at", { ascending: false }).limit(10000);
    if (r.error) {
      // Colonne eleve_nom pas encore créée
      setAvecNoms(false);
      r = await supabase.from("usage_stats").select("visitor_id, ip, action, created_at")
        .gte("created_at", since).neq("action", "call").order("created_at", { ascending: false }).limit(10000);
    } else setAvecNoms(true);
    setLignes((r.data as Ligne[]) || []);
    const cfg = await supabase.from("config").select("value").eq("key", "ai_limites_eleves").maybeSingle();
    try { const v = cfg.data?.value ? JSON.parse(cfg.data.value) : {}; setLimite(v.par_eleve ?? 40); setLimiteConnexion(v.par_connexion ?? 150); } catch { /* défaut */ }
    setLoading(false);
  };
  useEffect(() => { charger(); }, []);

  const { eleves, connexions } = useMemo(() => {
    const m: Record<string, Eleve> = {};
    const c: Record<string, number> = {};
    (lignes || []).forEach((l) => {
      if (l.action !== "limite" && l.ip) c[l.ip] = (c[l.ip] || 0) + 1;
      if (!l.visitor_id || l.visitor_id === "unknown") return;
      const e = (m[l.visitor_id] ||= { id: l.visitor_id, nom: "", utilise: 0, bloque: 0, derniere: l.created_at });
      if (l.action === "limite") e.bloque++; else e.utilise++;
      if (!e.nom && l.eleve_nom) e.nom = l.eleve_nom;
      if (l.created_at > e.derniere) e.derniere = l.created_at;
    });
    return {
      eleves: Object.values(m).sort((a, b) => b.bloque - a.bloque || b.utilise - a.utilise),
      connexions: Object.entries(c).sort((a, b) => b[1] - a[1]),
    };
  }, [lignes]);

  const seuil = Math.ceil(limite * 0.75);
  const proches = eleves.filter((e) => limite > 0 && (e.utilise >= seuil || e.bloque > 0));
  const affiches = tous ? eleves : proches;
  const connexionsChargees = connexions.filter(([, n]) => limiteConnexion > 0 && n >= limiteConnexion * 0.75);
  const nomAnonyme = (id: string) => "Élève anonyme · " + id.slice(-4).toUpperCase();

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-gray-800">Élèves et limite d'usage de l'IA (aujourd'hui)</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Limite : {limite > 0 ? `${limite} réponses par élève` : "aucune"} · {limiteConnexion > 0 ? `${limiteConnexion} par connexion internet` : "pas de limite par connexion"}. Le compteur repart à zéro à minuit.
          </p>
        </div>
        <button onClick={charger} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex-shrink-0">{loading ? "…" : "Actualiser"}</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["Élèves actifs", eleves.length, "text-indigo-700"],
          ["Proches de la limite", eleves.filter((e) => limite > 0 && e.utilise >= seuil && e.utilise < limite && !e.bloque).length, "text-amber-600"],
          ["Limite atteinte", eleves.filter((e) => e.bloque > 0 || (limite > 0 && e.utilise >= limite)).length, "text-rose-600"],
        ].map(([l, v, cls]) => (
          <div key={l as string} className="rounded-xl border-2 border-gray-100 p-3 text-center">
            <p className={`text-2xl font-black ${cls}`}>{lignes ? v : "…"}</p>
            <p className="text-[11px] font-bold text-gray-500">{l}</p>
          </div>
        ))}
      </div>

      {!avecNoms && (
        <p className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3 py-2">
          Pour voir le prénom des élèves au lieu d'un identifiant anonyme, exécute une fois le fichier <strong>usage_eleve_nom.sql</strong> dans Supabase (SQL Editor).
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-widest text-gray-400">{tous ? "Tous les élèves actifs" : `Élèves à ${seuil} réponses ou plus`}</p>
        <button onClick={() => setTous(!tous)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">{tous ? "Seulement les élèves proches de la limite" : "Voir tous les élèves"}</button>
      </div>

      {lignes && affiches.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">{tous ? "Aucun élève n'a utilisé l'IA aujourd'hui." : "Aucun élève n'approche de la limite pour l'instant."}</p>
      ) : (
        <div className="divide-y divide-gray-100 border-2 border-gray-100 rounded-xl max-h-96 overflow-y-auto">
          {affiches.map((e) => {
            const pct = limite > 0 ? Math.min(100, Math.round((e.utilise / limite) * 100)) : 0;
            const atteint = e.bloque > 0 || (limite > 0 && e.utilise >= limite);
            const couleur = atteint ? "bg-rose-500" : e.utilise >= seuil ? "bg-amber-500" : "bg-emerald-500";
            return (
              <div key={e.id} className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-800 truncate">{e.nom || nomAnonyme(e.id)}</p>
                  <p className={`text-sm font-black flex-shrink-0 ${atteint ? "text-rose-600" : e.utilise >= seuil ? "text-amber-600" : "text-gray-700"}`}>
                    {e.utilise}{limite > 0 ? ` / ${limite}` : ""}
                  </p>
                </div>
                {limite > 0 && <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1"><div className={`h-full ${couleur}`} style={{ width: `${Math.max(pct, 2)}%` }} /></div>}
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Dernière réponse à {heure(e.derniere)}{e.bloque > 0 ? ` · bloqué ${e.bloque} fois par la limite` : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {connexionsChargees.length > 0 && (
        <p className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3 py-2">
          Attention : {connexionsChargees.length === 1 ? "une connexion internet partagée approche" : `${connexionsChargees.length} connexions internet partagées approchent`} de la limite par connexion
          ({connexionsChargees.map(([, n]) => `${n} / ${limiteConnexion}`).join(", ")}). Au lycée, toute une classe peut être bloquée en même temps.
        </p>
      )}
    </div>
  );
}
