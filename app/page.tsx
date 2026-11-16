"use client";
import { useState, useEffect } from "react";
import { X, Trophy, BookOpen, PenLine } from "lucide-react";
import HomeScreenV2 from "./HomeScreenV2";
import CompteurIA from "./CompteurIA";
import { CoursRevisionEleve } from "./CoursPremiere";
import { DEFAULT_FEATURES, DEFAULT_METHODE_CONTENT, EleveQuestion, FaqItem, FeaturesConfig, MethodeContent, MethodeView, callAI, dbLoadTextes, getOrCreateVisitorId, getText, loadEleveQuestions, loadFaqMethode, loadFeaturesConfig, loadMethodeContent, saveEleveQuestions, saveFaqMethode, saveFeaturesConfig, saveMethodeContent, setIsProf } from "./shared";
import { Dashboard } from "./Dashboard";
import { DissertationMode } from "./DissertationMode";
import { QuizMode } from "./QuizMode";
import { RevisionMode } from "./RevisionMode";
import { ProfMode } from "./ProfMode";
import { EleveMode } from "./EleveMode";

// Application + compteur de réponses IA restantes (masqué en Mode Prof et sur le tableau de bord)
export default function QCMApp() {
  const [compteurVisible, setCompteurVisible] = useState(true);
  return (
    <>
      <QCMAppMain onCompteurVisible={setCompteurVisible} />
      {compteurVisible && <CompteurIA visitorId={() => getOrCreateVisitorId()} />}
    </>
  );
}

function QCMAppMain({ onCompteurVisible }: { onCompteurVisible: (v: boolean) => void }) {
  const [role, setRole] = useState<string | null>(null);
  const [eleveNom, setEleveNom] = useState<string>(() => {
    try { return localStorage.getItem("qcm_eleve_nom") || ""; } catch { return ""; }
  });
  // Crée l'identifiant anonyme du navigateur dès la première visite
  useState<string>(() => getOrCreateVisitorId());
  const [sharedLib, setSharedLib] = useState<any[]>([]);
  const [libLoaded, setLibLoaded] = useState(false);
  const [quizData, setQuizData] = useState<any | null>(null);
  const [revisionData, setRevisionData] = useState<any | null>(null);
  const [dissertationData, setDissertationData] = useState<any | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [featuresConfig, setFeaturesConfig] = useState<FeaturesConfig>(DEFAULT_FEATURES);
  const [methodeContent, setMethodeContent] = useState<MethodeContent>(DEFAULT_METHODE_CONTENT);
  const [faqMethode, setFaqMethode] = useState<FaqItem[]>([]);
  const [methodeView, setMethodeView] = useState<MethodeView>("faq");
  const [eleveQuestions, setEleveQuestions] = useState<EleveQuestion[]>([]);

  const loadLib = async () => {
    try { const data = await dbLoadTextes(); setSharedLib(data); } catch (e) { console.error(e); }
    setLibLoaded(true);
  };

  useEffect(() => {
    loadLib();
    loadFeaturesConfig().then(setFeaturesConfig);
    loadMethodeContent().then(setMethodeContent);
    loadFaqMethode().then(setFaqMethode);
    loadEleveQuestions().then(setEleveQuestions);
  }, []);

  // Mémoriser le nom élève dans localStorage
  const saveEleveNom = (nom: string) => {
    setEleveNom(nom);
    try { if (nom.trim()) localStorage.setItem("qcm_eleve_nom", nom.trim()); } catch {}
  };

  const matiere = role === "eleve-HLP" || role === "eleve-HLP-methode" ? "hlp"
    : (role === "eleve-Philosophie" || role === "eleve-Philosophie-generale" || role === "eleve-Philosophie-techno"
       || role === "eleve-Philosophie-generale-methode" || role === "eleve-Philosophie-techno-methode") ? "philosophie"
    : null;
  const serie: "generale" | "techno" | null =
    (role === "eleve-Philosophie-techno" || role === "eleve-Philosophie-techno-methode") ? "techno"
    : (role === "eleve-Philosophie" || role === "eleve-Philosophie-generale" || role === "eleve-Philosophie-generale-methode") ? "generale"
    : null;
  const initialTab: string | null =
    (role === "eleve-Philosophie-generale-methode" || role === "eleve-Philosophie-techno-methode" || role === "eleve-HLP-methode") ? "methode"
    : null;
  const dissertMatiere = role === "eleve-HLP-dissertation" ? "hlp" : role === "eleve-Philosophie-dissertation" ? "philosophie" : null;

  setIsProf(role === "prof");
  useEffect(() => { onCompteurVisible(role !== "prof" && !showDashboard); }, [role, showDashboard]);
  if (showDashboard) return <Dashboard onBack={() => setShowDashboard(false)} sharedLib={sharedLib} prof={role === "prof"} />;

  // Accès direct au mode dissertation depuis l'accueil
  if (dissertMatiere && !dissertationData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50">
        <div className="bg-white border-b-2 border-rose-200 shadow-sm sticky top-0 z-30">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PenLine className="w-6 h-6 text-rose-600" />
              <h1 className="text-xl font-bold text-gray-800">Mode <span className="text-rose-600">Dissertation</span> — {dissertMatiere === "hlp" ? "📜 HLP" : "🧠 Philosophie"}</h1>
            </div>
            <button onClick={() => setRole(null)} className="text-sm font-semibold text-gray-600 hover:text-gray-800 flex items-center gap-1">
              <X className="w-4 h-4" /> Accueil
            </button>
          </div>
        </div>
        <DissertationMode
          sharedLib={sharedLib}
          matiere={dissertMatiere}
          eleveNom={eleveNom}
          onBack={() => setRole(null)}
          featuresConfig={featuresConfig}
        />
      </div>
    );
  }

  if (quizData) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
      <div className="bg-white border-b-2 border-indigo-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-800">Mode <span className="text-indigo-500">Quiz</span></h1>
          </div>
          <button onClick={() => setQuizData(null)} className="text-sm font-semibold text-gray-600 hover:text-gray-800 flex items-center gap-1">
            <X className="w-4 h-4" /> Quitter
          </button>
        </div>
      </div>
      <div className="max-w-3xl mx-auto">
        <QuizMode questions={quizData.questions} chapter={quizData.chapter} eleveNom={eleveNom} onBack={() => setQuizData(null)} />
      </div>
    </div>
  );

  if (revisionData) return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      <div className="bg-white border-b-2 border-green-200 shadow-sm flex-shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-green-600" />
            <h1 className="text-xl font-bold text-gray-800">Mode <span className="text-green-600">Révision</span></h1>
          </div>
          <button onClick={() => setRevisionData(null)} className="text-sm font-semibold text-gray-600 hover:text-gray-800 flex items-center gap-1">
            <X className="w-4 h-4" /> Quitter
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <RevisionMode entries={revisionData.entries} chapter={revisionData.chapter} onBack={() => setRevisionData(null)} allTextes={sharedLib.filter((t: any) => t.matiere === (revisionData.entries[0]?.matiere || "hlp"))} eleveNom={eleveNom} featuresConfig={featuresConfig} serie={serie} />
      </div>
    </div>
  );

  if (dissertationData) return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-pink-50">
      <div className="bg-white border-b-2 border-rose-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PenLine className="w-6 h-6 text-rose-600" />
            <h1 className="text-xl font-bold text-gray-800">Mode <span className="text-rose-600">Dissertation</span></h1>
          </div>
          <button onClick={() => setDissertationData(null)} className="text-sm font-semibold text-gray-600 hover:text-gray-800 flex items-center gap-1">
            <X className="w-4 h-4" /> Quitter
          </button>
        </div>
      </div>
      <DissertationMode
        sharedLib={sharedLib}
        matiere={dissertationData.matiere}
        eleveNom={eleveNom}
        onBack={() => setDissertationData(null)}
        featuresConfig={featuresConfig}
      />
    </div>
  );

  if (!role) return <HomeScreenV2 onSelect={(r: string) => { setMethodeView("faq"); setRole(r); }} eleveNom={eleveNom} setEleveNom={setEleveNom} saveEleveNom={saveEleveNom} featuresConfig={featuresConfig}
    methodeContent={methodeContent} faqMethode={faqMethode}
    askAI={async (m: { role: string; content: string }[]) => getText(await callAI(m, 800, false, "methode_accueil"))}
    onOpenMethode={(r: string, v: MethodeView) => { setMethodeView(v); setRole(r); }} />;
  if (role === "eleve-HLP1-cours" || role === "eleve-cours-tle") return (
    <CoursRevisionEleve niveau={role === "eleve-cours-tle" ? "tle" : "hlp1"} onBack={() => setRole(null)} eleveNom={eleveNom}
      askAI={async (m: { role: string; content: string }[], maxTokens = 1500, light = false) => getText(await callAI(m, maxTokens, light, role === "eleve-cours-tle" ? "cours_tle" : "cours_hlp1"))} />
  );
  if (role === "prof") return (
    <ProfMode sharedLib={sharedLib} setSharedLib={setSharedLib} onLogout={() => setRole(null)}
      libLoaded={libLoaded} onReload={loadLib} onDashboard={() => setShowDashboard(true)}
      featuresConfig={featuresConfig} setFeaturesConfig={(cfg: FeaturesConfig) => { setFeaturesConfig(cfg); saveFeaturesConfig(cfg); }} methodeContent={methodeContent} setMethodeContent={(mc: MethodeContent) => { setMethodeContent(mc); saveMethodeContent(mc); }} faqMethode={faqMethode} setFaqMethode={(faq: FaqItem[]) => { setFaqMethode(faq); saveFaqMethode(faq); }} eleveQuestions={eleveQuestions} setEleveQuestions={(q: EleveQuestion[]) => { setEleveQuestions(q); saveEleveQuestions(q); }} />
  );
  return (
    <EleveMode matiere={matiere!} sharedLib={sharedLib} libLoaded={libLoaded} eleveNom={eleveNom}
      onBack={() => setRole(null)} onStartQuiz={setQuizData} onStartRevision={setRevisionData}
      onStartDissertation={(data: any) => setDissertationData(data)} onRefresh={loadLib}
      featuresConfig={featuresConfig} serie={serie} initialTab={initialTab} methodeView={methodeView} methodeContent={methodeContent} faqMethode={faqMethode} eleveQuestions={eleveQuestions} onEleveQuestion={(q: EleveQuestion) => { const updated = [q, ...eleveQuestions]; setEleveQuestions(updated); saveEleveQuestions(updated); }} onDashboard={featuresConfig.show_dashboard ? () => setShowDashboard(true) : undefined} />
  );
}
