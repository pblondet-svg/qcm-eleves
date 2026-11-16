"use client";
// app/Dashboard.tsx — Tableau de bord (Stats) : QCM, notions, dissertations, révision, usage de l'IA, productions.
// (extrait de page.tsx)

import { useState, useEffect } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import AiQuotaGauge from "./AiQuotaGauge";
import UsageElevesIA from "./UsageElevesIA";
import AppareilsProf from "./AppareilsProf";
import ProductionsEleves from "./ProductionsEleves";
import { PHILO_NOTIONS_PROGRAMME, dbLoadDissertations, dbLoadResultatsAll, dbLoadSessions, dbLoadUsageStats } from "./shared";
import TestIA from "./TestIA";
import VisiteursUniques from "./VisiteursUniques";

// ── TABLEAU DE BORD ─────────────────────────────────────────────────────────
export function Dashboard({ onBack, sharedLib, prof = false }: any) {
  const [versionAppareils, setVersionAppareils] = useState(0);
  const [activeTab, setActiveTab] = useState<"qcm" | "notions" | "dissertations" | "revision" | "usage" | "productions">("qcm");
  const [resultats, setResultats] = useState<any[]>([]);
  const [dissertations, setDissertations] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [usageStats, setUsageStats] = useState<any[]>([]);
  const [periodeFilter, setPeriodeFilter] = useState<"semaine" | "mois" | "tout">("tout");
  const [matiereFilter] = useState("all");

  const PHILO = PHILO_NOTIONS_PROGRAMME;
  const HLP_CH = [
    "Éducation, transmission et émancipation",
    "Les expressions de la sensibilité","Les métamorphoses du moi",
    "Création, continuités et ruptures","Histoire et violence","L'humain et ses limites",
  ];

  useEffect(() => {
    Promise.allSettled([dbLoadResultatsAll(), dbLoadDissertations(), dbLoadSessions(), dbLoadUsageStats()])
      .then(([r, d, s, u]) => {
        if (r.status === "fulfilled") setResultats(r.value);
        if (d.status === "fulfilled") setDissertations(d.value);
        if (s.status === "fulfilled") setSessions(s.value);
        if (u.status === "fulfilled") setUsageStats(u.value as any[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const now = Date.now();
  const filtreTemps = (ts: number) => {
    if (periodeFilter === "semaine") return ts > now - 7 * 24 * 3600 * 1000;
    if (periodeFilter === "mois") return ts > now - 30 * 24 * 3600 * 1000;
    return true;
  };

  const rFiltered = resultats.filter(r => filtreTemps(r.created_at) && (matiereFilter === "all" || true));
  const dFiltered = dissertations.filter(d => filtreTemps(d.created_at));
  const sFiltered = sessions.filter(s => filtreTemps(s.created_at));

  // Stats globales
  const moyenneGenerale = rFiltered.length > 0
    ? Math.round(rFiltered.reduce((s, r) => s + r.pourcentage, 0) / rFiltered.length)
    : 0;

  // Stats par notion (QCM) — basées sur chapter du résultat
  const statsByNotion = (notions: string[]) => notions.map(notion => {
    const matching = rFiltered.filter(r =>
      r.chapter && (r.chapter.toLowerCase().includes(notion.toLowerCase().slice(0, 8)) ||
      notion.toLowerCase().includes((r.chapter || "").toLowerCase().slice(0, 8)))
    );
    const avg = matching.length > 0
      ? Math.round(matching.reduce((s, r) => s + r.pourcentage, 0) / matching.length)
      : null;
    return { notion, avg, count: matching.length };
  }).filter(s => s.count > 0 || true);

  // Textes les plus/moins révisés
  const textesStats = (() => {
    const map: Record<string, { titre: string; count: number; msgs: number }> = {};
    sFiltered.forEach(s => {
      if (!map[s.texte_id]) map[s.texte_id] = { titre: s.texte_titre, count: 0, msgs: 0 };
      map[s.texte_id].count++;
      map[s.texte_id].msgs += s.nb_messages || 0;
    });
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  })();

  // Progression dans le temps (QCM par semaine)
  const progressionParSemaine = (() => {
    const semaines: Record<string, number[]> = {};
    rFiltered.forEach(r => {
      const d = new Date(r.created_at);
      const key = `S${Math.ceil(d.getDate() / 7)} ${d.toLocaleString("fr-FR", { month: "short" })}`;
      if (!semaines[key]) semaines[key] = [];
      semaines[key].push(r.pourcentage);
    });
    return Object.entries(semaines).map(([sem, scores]) => ({
      sem,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      count: scores.length,
    }));
  })();

  // Comparaison élèves anonymisée
  const statsParEleve = (() => {
    const map: Record<string, number[]> = {};
    rFiltered.forEach(r => {
      const nom = r.eleve_nom || "Anonyme";
      if (!map[nom]) map[nom] = [];
      map[nom].push(r.pourcentage);
    });
    return Object.entries(map)
      .map(([nom, scores]) => ({
        nom,
        avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        count: scores.length,
      }))
      .sort((a, b) => b.avg - a.avg);
  })();

  const tabs = [
    ["qcm", "✅ QCM", rFiltered.length],
    ["notions", "🎯 Notions", null],
    ["dissertations", "✍️ Dissertations", dFiltered.length],
    ["revision", "📖 Révision", sFiltered.length],
    ["usage", "📡 Usage IA", usageStats.length],
    ...(prof ? [["productions", "✍️ Productions", null]] : []),
  ] as [string, string, number | null][];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 text-gray-600 hover:text-indigo-600 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-gray-800">📊 Tableau de bord</h1>
          </div>
          {/* Filtres période */}
          <div className="flex gap-2">
            {([["semaine","7 jours"],["mois","30 jours"],["tout","Tout"]] as [string,string][]).map(([val, label]) => (
              <button key={val} onClick={() => setPeriodeFilter(val as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${periodeFilter === val ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {/* Onglets */}
        <div className="max-w-6xl mx-auto px-6 flex gap-1 pb-0">
          {tabs.map(([tab, label, count]) => (
            <button key={tab} onClick={() => setActiveTab(tab as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${activeTab === tab ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {label}
              {count !== null && count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {loading ? (
          <div className="text-center py-20 text-gray-600 font-semibold">Chargement…</div>
        ) : (
          <>
            {/* ── ONGLET QCM ── */}
            {activeTab === "qcm" && (
              <div className="space-y-6">
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    ["Quiz effectués", rFiltered.length, "text-indigo-700", "bg-indigo-50"],
                    ["Moyenne générale", moyenneGenerale + "%", moyenneGenerale >= 70 ? "text-green-700" : moyenneGenerale >= 50 ? "text-orange-600" : "text-red-600", "bg-white"],
                    ["Réussis (≥70%)", rFiltered.filter(r => r.pourcentage >= 70).length, "text-green-700", "bg-green-50"],
                    ["Élèves actifs", new Set(rFiltered.map(r => r.eleve_nom)).size, "text-purple-700", "bg-purple-50"],
                  ].map(([label, val, color, bg]) => (
                    <div key={label as string} className={`${bg} rounded-2xl border border-gray-200 p-5 text-center shadow-sm`}>
                      <div className={`text-3xl font-black ${color}`}>{val}</div>
                      <div className="text-sm font-semibold text-gray-600 mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Progression dans le temps */}
                {progressionParSemaine.length > 1 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <h3 className="font-black text-gray-800 mb-4">📈 Progression dans le temps</h3>
                    <div className="flex items-end gap-2 h-32">
                      {progressionParSemaine.map(({ sem, avg, count }) => (
                        <div key={sem} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-xs font-bold text-gray-700">{avg}%</span>
                          <div className="w-full rounded-t-lg transition-all"
                            style={{
                              height: `${(avg / 100) * 100}px`,
                              backgroundColor: avg >= 70 ? "#22c55e" : avg >= 50 ? "#f97316" : "#ef4444",
                            }} />
                          <span className="text-xs text-gray-400">{sem}</span>
                          <span className="text-xs text-gray-400">{count} quiz</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Comparaison élèves */}
                {statsParEleve.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <h3 className="font-black text-gray-800 mb-4">👥 Comparaison élèves (anonymisée)</h3>
                    <div className="space-y-2">
                      {statsParEleve.map(({ nom, avg, count }, i) => (
                        <div key={nom} className="flex items-center gap-3">
                          <span className="w-6 text-xs font-black text-gray-400 text-right">{i + 1}</span>
                          <span className="w-32 text-sm font-bold text-gray-700 truncate">{nom}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-3">
                            <div className="h-3 rounded-full transition-all"
                              style={{ width: `${avg}%`, backgroundColor: avg >= 70 ? "#22c55e" : avg >= 50 ? "#f97316" : "#ef4444" }} />
                          </div>
                          <span className={`text-sm font-black w-12 text-right ${avg >= 70 ? "text-green-700" : avg >= 50 ? "text-orange-600" : "text-red-600"}`}>{avg}%</span>
                          <span className="text-xs text-gray-400 w-16">{count} quiz</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tableau détaillé */}
                {rFiltered.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>{["Date", "Élève", "Chapitre", "Score", "Résultat"].map(h => (
                          <th key={h} className="text-left px-5 py-3 font-bold text-gray-700">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rFiltered.slice(0, 50).map((r: any) => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-gray-700 text-xs">
                              {new Date(r.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="px-5 py-3"><span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{r.eleve_nom || "Anonyme"}</span></td>
                            <td className="px-5 py-3"><span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{r.chapter}</span></td>
                            <td className="px-5 py-3 font-bold text-gray-800">{r.score}/{r.total}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-20 bg-gray-200 rounded-full h-2">
                                  <div className={`h-2 rounded-full ${r.pourcentage >= 70 ? "bg-green-500" : r.pourcentage >= 50 ? "bg-orange-500" : "bg-red-500"}`}
                                    style={{ width: r.pourcentage + "%" }} />
                                </div>
                                <span className={`text-sm font-bold ${r.pourcentage >= 70 ? "text-green-700" : r.pourcentage >= 50 ? "text-orange-600" : "text-red-600"}`}>{r.pourcentage}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {rFiltered.length === 0 && (
                  <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                    <div className="text-5xl mb-4">📭</div>
                    <p className="text-xl font-bold text-gray-600">Aucun quiz pour cette période</p>
                  </div>
                )}
              </div>
            )}

            {/* ── ONGLET NOTIONS ── */}
            {activeTab === "notions" && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h3 className="font-black text-gray-800 mb-2">🎯 Maîtrise par notion — Philosophie</h3>
                  <p className="text-xs text-gray-500 mb-4">Basé sur les QCM. Les cases grises = aucun QCM sur cette notion.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {statsByNotion(PHILO).map(({ notion, avg, count }) => (
                      <div key={notion} className={`p-3 rounded-xl border-2 ${
                        avg === null ? "border-gray-200 bg-gray-50" :
                        avg >= 70 ? "border-green-300 bg-green-50" :
                        avg >= 50 ? "border-orange-300 bg-orange-50" :
                        "border-red-300 bg-red-50"
                      }`}>
                        <p className="text-xs font-bold text-gray-700 mb-1 truncate">{notion}</p>
                        {avg !== null ? (
                          <>
                            <p className={`text-2xl font-black ${avg >= 70 ? "text-green-700" : avg >= 50 ? "text-orange-600" : "text-red-600"}`}>{avg}%</p>
                            <p className="text-xs text-gray-500">{count} quiz</p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-400 font-semibold">— aucun quiz</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h3 className="font-black text-gray-800 mb-2">📜 Maîtrise par chapitre — HLP</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {statsByNotion(HLP_CH).map(({ notion, avg, count }) => (
                      <div key={notion} className={`p-3 rounded-xl border-2 ${
                        avg === null ? "border-gray-200 bg-gray-50" :
                        avg >= 70 ? "border-green-300 bg-green-50" :
                        avg >= 50 ? "border-orange-300 bg-orange-50" :
                        "border-red-300 bg-red-50"
                      }`}>
                        <p className="text-xs font-bold text-gray-700 mb-1">{notion}</p>
                        {avg !== null ? (
                          <>
                            <p className={`text-2xl font-black ${avg >= 70 ? "text-green-700" : avg >= 50 ? "text-orange-600" : "text-red-600"}`}>{avg}%</p>
                            <p className="text-xs text-gray-500">{count} quiz</p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-400 font-semibold">— aucun quiz</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notions les moins bien maîtrisées */}
                {(() => {
                  const weak = statsByNotion([...PHILO, ...HLP_CH])
                    .filter(s => s.avg !== null && s.avg < 60)
                    .sort((a, b) => (a.avg || 0) - (b.avg || 0))
                    .slice(0, 5);
                  return weak.length > 0 ? (
                    <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5">
                      <h3 className="font-black text-red-800 mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Notions à renforcer en priorité
                      </h3>
                      <div className="space-y-2">
                        {weak.map(({ notion, avg, count }) => (
                          <div key={notion} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-red-200">
                            <span className="flex-1 text-sm font-bold text-gray-800">{notion}</span>
                            <span className="text-xs text-gray-500">{count} quiz</span>
                            <span className="text-lg font-black text-red-600">{avg}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            {/* ── ONGLET DISSERTATIONS ── */}
            {activeTab === "dissertations" && (
              <div className="space-y-4">
                {/* KPIs */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    ["Dissertations soumises", dFiltered.length, "text-rose-700"],
                    ["Notions travaillées", new Set(dFiltered.map(d => d.notion_principale).filter(Boolean)).size, "text-purple-700"],
                    ["Élèves actifs", new Set(dFiltered.map(d => d.eleve_nom)).size, "text-indigo-700"],
                  ].map(([label, val, color]) => (
                    <div key={label as string} className="bg-white rounded-2xl border border-gray-200 p-5 text-center shadow-sm">
                      <div className={`text-3xl font-black ${color}`}>{val}</div>
                      <div className="text-sm font-semibold text-gray-600 mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Dissertations par notion */}
                {dFiltered.length > 0 && (() => {
                  const byNotion: Record<string, number> = {};
                  dFiltered.forEach(d => {
                    const n = d.notion_principale || "Non classée";
                    byNotion[n] = (byNotion[n] || 0) + 1;
                  });
                  return (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                      <h3 className="font-black text-gray-800 mb-3">Dissertations par notion</h3>
                      <div className="space-y-2">
                        {Object.entries(byNotion).sort((a, b) => b[1] - a[1]).map(([notion, count]) => (
                          <div key={notion} className="flex items-center gap-3">
                            <span className="flex-1 text-sm font-semibold text-gray-700">{notion}</span>
                            <div className="w-32 bg-gray-100 rounded-full h-2">
                              <div className="h-2 rounded-full bg-rose-400"
                                style={{ width: `${(count / dFiltered.length) * 100}%` }} />
                            </div>
                            <span className="text-sm font-black text-rose-700 w-8 text-right">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Liste des dissertations */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h3 className="font-black text-gray-800">Copies soumises</h3>
                  </div>
                  {dFiltered.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 font-semibold">Aucune dissertation soumise pour cette période</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {dFiltered.map((d: any) => (
                        <div key={d.id} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-gray-800 italic">"{d.sujet}"</p>
                              <div className="flex gap-2 mt-1 flex-wrap">
                                <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{d.eleve_nom || "Anonyme"}</span>
                                {d.notion_principale && <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-semibold">🎯 {d.notion_principale}</span>}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${d.matiere === "philosophie" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                                  {d.matiere === "philosophie" ? "🧠 Philo" : "📜 HLP"}
                                </span>
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {new Date(d.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                            </span>
                          </div>
                          {d.texte_eleve && (
                            <details className="mt-2">
                              <summary className="text-xs text-indigo-600 font-semibold cursor-pointer hover:text-indigo-800">Voir la copie ({d.texte_eleve.split(" ").length} mots)</summary>
                              <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">{d.texte_eleve}</div>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── ONGLET RÉVISION ── */}
            {activeTab === "revision" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    ["Sessions de révision", sFiltered.length, "text-green-700"],
                    ["Messages échangés", sFiltered.reduce((s, r) => s + (r.nb_messages || 0), 0), "text-teal-700"],
                    ["Textes consultés", new Set(sFiltered.map(s => s.texte_id)).size, "text-indigo-700"],
                  ].map(([label, val, color]) => (
                    <div key={label as string} className="bg-white rounded-2xl border border-gray-200 p-5 text-center shadow-sm">
                      <div className={`text-3xl font-black ${color}`}>{val}</div>
                      <div className="text-sm font-semibold text-gray-600 mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Textes les plus révisés */}
                {textesStats.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <h3 className="font-black text-gray-800 mb-3">📚 Textes les plus révisés</h3>
                    <div className="space-y-2">
                      {textesStats.slice(0, 10).map(([id, { titre, count, msgs }]) => (
                        <div key={id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-800 truncate">{titre || "Texte sans titre"}</p>
                          </div>
                          <span className="text-xs text-gray-500">{msgs} messages</span>
                          <div className="w-24 bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full bg-teal-400"
                              style={{ width: `${(count / textesStats[0][1].count) * 100}%` }} />
                          </div>
                          <span className="text-sm font-black text-teal-700 w-12 text-right">{count} sess.</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Textes jamais révisés */}
                {(() => {
                  const revisesIds = new Set(sessions.map(s => s.texte_id));
                  const nonRevises = (sharedLib || []).filter((t: any) => !revisesIds.has(t.id));
                  return nonRevises.length > 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                      <h3 className="font-black text-amber-800 mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Textes jamais révisés ({nonRevises.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {nonRevises.slice(0, 15).map((t: any) => (
                          <span key={t.id} className="text-xs bg-white border border-amber-200 text-amber-800 px-2 py-1 rounded-lg font-semibold">
                            {t.work_title || t.author || "Sans titre"}
                          </span>
                        ))}
                        {nonRevises.length > 15 && <span className="text-xs text-amber-600 font-semibold">+{nonRevises.length - 15} autres</span>}
                      </div>
                    </div>
                  ) : null;
                })()}

                {sFiltered.length === 0 && (
                  <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                    <div className="text-5xl mb-4">📭</div>
                    <p className="text-xl font-bold text-gray-600">Aucune session de révision enregistrée</p>
                    <p className="text-sm text-gray-400 mt-1">Les sessions seront enregistrées automatiquement quand les élèves utiliseront le mode révision</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "productions" && prof && <ProductionsEleves />}

            {activeTab === "usage" && (
              <div className="space-y-4">
                {/* Appareils du professeur + élèves proches de la limite */}
                {prof && <AppareilsProf key={versionAppareils} onChange={() => setVersionAppareils((v) => v + 1)} />}
                {prof && <UsageElevesIA version={versionAppareils} />}
                {prof && <TestIA />}
                {/* Jauge de consommation */}
                <AiQuotaGauge />
                {/* KPIs */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    ["Appels IA total", usageStats.length, "text-indigo-700"],
                    ["Modules distincts", new Set(usageStats.map((u: any) => u.module)).size, "text-purple-700"],
                    ["Aujourd'hui", usageStats.filter((u: any) => new Date(u.created_at).toDateString() === new Date().toDateString()).length, "text-green-700"],
                  ].map(([label, val, color]) => (
                    <div key={label as string} className="bg-white rounded-2xl border border-gray-200 p-5 text-center shadow-sm">
                      <div className={`text-3xl font-black ${color}`}>{val}</div>
                      <div className="text-sm font-semibold text-gray-600 mt-1">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Usage par module */}
                {usageStats.length > 0 && (() => {
                  const moduleLabels: Record<string, string> = {
                    qcm: "✅ Quiz / QCM",
                    flashcards: "🃏 Flashcards",
                    dissertation: "✍️ Dissertation",
                    plan_guide: "📋 Plan guidé", dissertation_guidee: "📋 Construction guidée", entrainement_intro: "📝 Entraînement introduction", entrainement_chat_intro: "💬 Chatbot introduction", entrainement_chat_paragraphe: "💬 Chatbot paragraphe", entrainement_chat_plan: "💬 Chatbot plan dialectique", entrainement_paragraphe: "✍️ Entraînement paragraphe",
                    brainstorming: "💡 Brainstorming",
                    correction: "🔍 Correction",
                    corrige: "📝 Corrigé",
                    revision: "📖 Révision (chat)",
                    interrogation: "🎓 Interrogation",
                    sujets: "📚 Sujets bac",
                    import: "📥 Import texte",
                    general: "🔧 Général",
                  };
                  const byModule: Record<string, number> = {};
                  usageStats.forEach((u: any) => {
                    const m = u.module || "general";
                    byModule[m] = (byModule[m] || 0) + 1;
                  });
                  const sorted = Object.entries(byModule).sort((a, b) => b[1] - a[1]);
                  const max = sorted[0]?.[1] || 1;
                  return (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                      <h3 className="font-black text-gray-800 mb-4">📊 Utilisation par module</h3>
                      <div className="space-y-3">
                        {sorted.map(([module, count]) => (
                          <div key={module} className="flex items-center gap-3">
                            <div className="w-36 text-sm font-semibold text-gray-700 truncate">
                              {moduleLabels[module] || module}
                            </div>
                            <div className="flex-1 bg-gray-100 rounded-full h-3">
                              <div className="h-3 rounded-full bg-indigo-500"
                                style={{ width: `${(count / max) * 100}%` }} />
                            </div>
                            <div className="w-12 text-sm font-black text-indigo-700 text-right">{count}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Activité par heure */}
                {usageStats.length > 0 && (() => {
                  const byHour: Record<number, number> = {};
                  for (let i = 0; i < 24; i++) byHour[i] = 0;
                  usageStats.forEach((u: any) => {
                    const h = new Date(u.created_at).getHours();
                    byHour[h] = (byHour[h] || 0) + 1;
                  });
                  const max = Math.max(...Object.values(byHour), 1);
                  return (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                      <h3 className="font-black text-gray-800 mb-4">🕐 Activité par heure</h3>
                      <div className="flex items-end gap-1 h-20">
                        {Array.from({length: 24}, (_, h) => (
                          <div key={h} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full bg-indigo-400 rounded-t"
                              style={{ height: `${(byHour[h] / max) * 64}px`, minHeight: byHour[h] > 0 ? "4px" : "0" }} />
                            {h % 6 === 0 && <span className="text-xs text-gray-400">{h}h</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Visiteurs uniques (avec indices pour reconnaître ses appareils) */}
                <VisiteursUniques usageStats={usageStats} prof={prof} onAppareilsChange={() => setVersionAppareils((v) => v + 1)} />

                {/* Derniers appels */}
                {usageStats.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <h3 className="font-black text-gray-800 mb-4">🕐 Derniers appels IA</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {usageStats.slice(0, 50).map((u: any, i: number) => (
                        <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                          <span className="text-sm font-semibold text-gray-700">{u.module || "général"}</span>
                          <span className="text-xs text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{u.visitor_id ? u.visitor_id.slice(0, 12) : "—"}</span>
                          <span className="text-xs text-gray-400">{new Date(u.created_at).toLocaleString("fr-FR")}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${u.action === "leger" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                            {u.action === "leger" ? "Groq" : "Google"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {usageStats.length === 0 && (
                  <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-gray-200">
                    <div className="text-5xl mb-4">📭</div>
                    <p className="text-xl font-bold text-gray-600">Aucun appel IA enregistré</p>
                    <p className="text-sm text-gray-400 mt-1">Les statistiques apparaîtront dès que les élèves utiliseront l'application</p>
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
