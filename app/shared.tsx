"use client";
// app/shared.tsx — Données et fonctions communes : appels à l'IA, accès Supabase, types,
// réglages par défaut (fonctionnalités, fiches méthode, FAQ), utilitaires. (extrait de page.tsx)

import mammoth from "mammoth";
import { supabase } from "@/lib/supabase";
import { signalerQuota } from "./CompteurIA";

// ── helpers ───────────────────────────────────────────────────────────────────
export let _visitorId = "unknown";

try { _visitorId = localStorage.getItem("qcm_visitor_id") || "unknown"; } catch {}

const dbLogUsage = async (module: string, action: string) => {
  try {
    await supabase.from("usage_stats").insert([{ id: uid(), module, action }]);
  } catch { /* silencieux */ }
};

// Vrai quand le Mode Prof est ouvert : le professeur n'est pas soumis aux limites d'usage de l'IA
export let _isProf = false;
// Les autres fichiers ne peuvent pas réassigner une variable importée : ils passent par cette fonction
export const setIsProf = (v: boolean) => { _isProf = v; };

// session_id : identifiant de l'exercice d'entraînement en cours (un exercice complet compte pour une seule « question »)
export const callAI = async (messages: { role: string; content: string }[], max_tokens = 2000, prefer_groq = false, module = "general", deep = false, session_id?: string) => {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, max_tokens, prefer_groq, module, visitor_id: _visitorId, deep, prof: _isProf, session_id, eleve_nom: (() => { try { return localStorage.getItem("qcm_eleve_nom") || ""; } catch { return ""; } })() }),
  });
  // Limite du jour atteinte : on renvoie le message prévu, que les chats affichent tel quel
  if (res.status === 429) { const d = await res.json().catch(() => null); if (d?.quota) signalerQuota(d.quota); if (d?.content) return d; }
  if (!res.ok) throw new Error("Erreur API " + res.status);
  dbLogUsage(module, "call");
  const d = await res.json();
  if (d?.quota) signalerQuota(d.quota);
  return d;
};

export const getText = (d: any) =>
  (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");

export const parseJSON = (txt: string) => {
  const c = txt.replace(/```json/g, "").replace(/```/g, "").trim();
  const m = c.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : c);
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export const wc = (c: string) => c.trim().split(/\s+/).filter(Boolean).length;

export const entryName = (e: any) =>
  e.author && e.work_title ? `${e.author} — ${e.work_title}` : e.work_title || "Sans titre";

export const entryChapter = (e: any) => e.chapter?.trim() || "Non classé";

// Code prof chargé dynamiquement depuis Supabase (voir vérification dans ProfMode)

// ── Programme HLP ─────────────────────────────────────────────────────────────
export const HLP_CHAPITRES = [
  {
    semestre: "Semestre 1 — La recherche de soi",
    subtitle: "Du romantisme au XXe siècle",
    items: [
      "Éducation, transmission et émancipation",
      "Les expressions de la sensibilité",
      "Les métamorphoses du moi",
    ],
  },
  {
    semestre: "Semestre 2 — L'Humanité en question",
    subtitle: "Période contemporaine (XXe-XXIe siècles)",
    items: [
      "Création, continuités et ruptures",
      "Histoire et violence",
      "L'humain et ses limites",
    ],
  },
];

// ── Notions officielles du programme de Philosophie ──────────────────────────
export const PHILO_NOTIONS_PROGRAMME = [
  "L'art", "Le bonheur", "La conscience", "Le devoir", "L'État",
  "L'inconscient", "La justice", "Le langage", "La liberté", "La nature",
  "La raison", "La religion", "La science", "La technique", "Le temps",
  "Le travail", "La vérité",
];

// ── Programme Philosophie ─────────────────────────────────────────────────────
export const PHILO_CHAPITRES = [
  "Sujet 1 - Peut-on être esclave de soi-même ?",
  "Sujet 2 - Pour être juste, suffit-il d'être juste ?",
  "Sujet 3 - La technique nous permet-elle de ne plus avoir peur de la nature ?",
  "Sujet 4 - L'artiste travaille-t-il ?",
  "Sujet 5 - Est-ce un devoir d'être heureux ?",
];

export const matchesMatiere = (entry: any, matiere: string) => {
  const m = (entry.matiere || "").toLowerCase().trim();
  if (matiere === "philosophie") return m === "philosophie";
  return m === "hlp" || m === "";
};

export const matiereLabel = (m: string) =>
  m === "hlp" ? "📜 HLP" : "🧠 Philosophie";

export const matiereColor = (m: string) =>
  m === "hlp" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700";

// ── Supabase DB ───────────────────────────────────────────────────────────────
export const dbLoadTextes = async () => {
  const { data, error } = await supabase
    .from("textes").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const dbAddTexte = async (entry: any) => {
  const { error } = await supabase.from("textes").insert([{
    id: entry.id,
    chapter: entry.chapter,
    author: entry.author,
    work_title: entry.workTitle || entry.work_title,
    notions: entry.notions,
    content: entry.content,
    word_count: entry.wordCount || entry.word_count,
    created_at: entry.createdAt || entry.created_at || Date.now(),
    type: entry.type || "les deux",
    matiere: entry.matiere || "hlp",
    notion_principale: entry.notion_principale || "",
    notions_secondaires: entry.notions_secondaires || [],
  }]);
  if (error) throw error;
};

export const dbDeleteTexte = async (id: string) => {
  const { error } = await supabase.from("textes").delete().eq("id", id);
  if (error) throw error;
};

export const dbUpdateTexte = async (id: string, fields: any) => {
  const { error } = await supabase.from("textes").update({
    chapter: fields.chapter,
    author: fields.author,
    work_title: fields.workTitle || fields.work_title,
    content: fields.content,
    word_count: wc(fields.content || ""),
    type: fields.type || "les deux",
    matiere: fields.matiere || "hlp",
    notion_principale: fields.notion_principale || "",
    notions_secondaires: fields.notions_secondaires || [],
  }).eq("id", id);
  if (error) throw error;
};

export const dbSaveResultat = async (resultat: any) => {
  const { error } = await supabase.from("resultats").insert([{
    id: uid(),
    eleve_nom: resultat.eleveNom || "Anonyme",
    chapter: resultat.chapter,
    score: resultat.score,
    total: resultat.total,
    pourcentage: resultat.pourcentage,
  }]);
  if (error) throw error;
};

// ── Sujets Bac DB ─────────────────────────────────────────────────────────────
export const dbLoadSujetsBac = async (matiere?: string) => {
  let query = supabase.from("sujets_bac").select("*").order("notion_principale");
  if (matiere) query = query.eq("matiere", matiere);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const dbInsertSujetBac = async (s: any) => {
  const { error } = await supabase.from("sujets_bac").insert([{
    id: s.id || uid(),
    sujet: s.sujet,
    matiere: s.matiere,
    notions: s.notions || [],
    notion_principale: s.notion_principale || "",
    source: s.source || "Import prof",
  }]);
  if (error) throw error;
};

export const dbDeleteSujetBac = async (id: string) => {
  const { error } = await supabase.from("sujets_bac").delete().eq("id", id);
  if (error) throw error;
};

export const dbCountSujetsBac = async () => {
  const { count, error } = await supabase.from("sujets_bac").select("*", { count: "exact", head: true });
  if (error) return 0;
  return count || 0;
};

// ── Config DB (code prof) ─────────────────────────────────────────────────────
export const dbGetConfig = async (key: string) => {
  const { data, error } = await supabase.from("config").select("value").eq("key", key).single();
  if (error) return null;
  return data?.value || null;
};

export const dbSetConfig = async (key: string, value: string) => {
  const { error } = await supabase.from("config").upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
};

// ── Features Config ────────────────────────────────────────────────────────────
export type FeaturesConfig = {
  // Onglets Mode Élève
  tab_revision: boolean;
  tab_quiz: boolean;
  tab_dissertation: boolean;
  tab_carte: boolean;
  tab_colle: boolean;
  // Modes Dissertation
  diss_plan: boolean;
  diss_brainstorm: boolean;
  diss_corrige: boolean;
  diss_combined: boolean;
  // Onglets Révision
  rev_chat: boolean;
  rev_fiche: boolean;
  rev_flashcards: boolean;
  rev_interrogation: boolean;
  // Général
show_dashboard: boolean; home_cours: boolean; home_dissertation: boolean; home_hlp1: boolean; home_tle: boolean;};

export const DEFAULT_FEATURES: FeaturesConfig = {
  tab_revision: true,
  tab_quiz: true,
  tab_dissertation: true,
  tab_carte: true,
  tab_colle: true,
  diss_plan: true,
  diss_brainstorm: true,
  diss_corrige: true,
  diss_combined: true,
  rev_chat: true,
  rev_fiche: true,
  rev_flashcards: true,
  rev_interrogation: true,
show_dashboard: true, home_cours: true, home_dissertation: true, home_hlp1: false, home_tle: true,};

export const loadFeaturesConfig = async (): Promise<FeaturesConfig> => {
  try {
    const val = await dbGetConfig("features_config");
    if (!val) return DEFAULT_FEATURES;
    const parsed = JSON.parse(val);
    return { ...DEFAULT_FEATURES, ...parsed };
  } catch { return DEFAULT_FEATURES; }
};

export const saveFeaturesConfig = async (cfg: FeaturesConfig) => {
  await dbSetConfig("features_config", JSON.stringify(cfg));
};

// ── Contenu des fiches méthode (éditable par le prof) ─────────────────────────
export type MethodeView = "chat" | "fiche" | "faq" | "plan" | "intro" | "paragraphe";

export type MethodeContent = {
  intro_dissertation: string;
  plan_tas: string;
  plan_notionnel: string;
  plan_critique: string;
  paragraphe: string;
  expl_generale: string;
  expl_techno: string;
  // Fiches propres à la HLP (vides tant que le professeur ne les a pas rédigées)
  hlp_interpretation: string;
  hlp_essai: string;
};

export const DEFAULT_METHODE_CONTENT: MethodeContent = {
  hlp_interpretation: `L'exercice ressemble un peu à un mini commentaire de texte. Il faut se baser beaucoup sur le texte, et ne pas hésiter à le citer et à l'expliquer en mettant en avant les passages importants par rapport à la question posée. Il n'est pas obligatoire de faire un commentaire linéaire.

I – UNE MINI INTRODUCTION
1. Présentation de l'œuvre (nom de l'auteur, titre de l'ouvrage, date de parution)
2. Thème auquel le texte fait référence (par exemple : les métamorphoses du moi, les expressions de la sensibilité, etc.)
3. Thèse de l'auteur
4. Définitions des termes du sujet
5. Paradoxe (s'il existe)
6. Problématique du sujet

II – UN MINI COMMENTAIRE
1 paragraphe commenté :
1. Thèse du texte
2. Arguments du texte
3. Citation du texte
4. Exemple provenant de votre réflexion personnelle

CE QU'ATTEND LE JURY
- L'exercice n'impose ni un nombre de « parties », ni une forme prédéfinie : ce n'est pas une explication de texte exhaustive, mais une lecture centrée sur certains éléments parmi les plus significatifs.
- L'interprétation, guidée par la question, demande une attention à la lettre et à la langue du texte, et tout particulièrement au questionnement qu'il développe.
- On attend une attention soutenue, et si possible une claire compréhension, des idées principales du texte.
- Une expression claire, dense et correcte ; des analyses au service de l'interprétation défendue, quelle qu'elle soit parmi les possibles, sans faire parler une partie du texte pour le tout, et étayées par des exemples probants.
- Un candidat capable de soutenir l'une des thèses possibles, en renvoyant au texte sans erreur majeure de compréhension, a montré qu'il sait saisir la portée d'une question et défendre une lecture du texte.
- Sont valorisées : la capacité à approfondir, à nuancer, à interpréter les termes du sujet.
- La qualité de l'expression compte (orthographe, syntaxe, précision, justesse de la rédaction).`,
  hlp_essai: `Attention : ce n'est pas la dissertation du tronc commun de philosophie. L'essai est un exercice d'argumentation ordonnée, plus bref et plus libre que la dissertation.

CONSIGNES OFFICIELLES
- Pour la « question de réflexion » ou « essai », littéraire comme philosophique, on évalue la compréhension du sens de la question posée et de ce qui la justifie, ainsi que la rigueur de la réponse apportée.
- On valorise l'attention portée à la question posée, son élucidation, l'organisation d'une réponse qui peut être concise, mais qui doit être précise, ordonnée, argumentée, et faire appel de manière pertinente aux éléments les plus déterminants du texte et aux connaissances acquises pendant l'année.
- La mobilisation des savoirs ne doit pas être artificielle : l'exercice n'est pas un prétexte à la simple restitution de connaissances.
- L'essai doit rendre compte d'une pensée personnelle, progressive et ordonnée, appuyée sur des références et des exemples précis. Cette pensée en première personne s'adosse à ce que disent les œuvres et les textes et à ce qu'ils permettent de comprendre des réalités du monde. Le propos progresse librement, mais avec ordre.

I – UNE MINI INTRODUCTION (À PEU PRÈS 20 LIGNES)
1. Opinion commune (en grec doxa)
2. Définitions
3. Paradoxe (en grec para = contre)
4. Une problématique (possibilité de recopier le sujet)
5. (Facultatif) Annonce de plan

II – DÉVELOPPEMENT
Au minimum 1 paragraphe argumenté, mais il est conseillé d'en faire 2. Si 2 paragraphes thèse / antithèse : appliquer la même méthode pour les deux.
1. Thèse
2. Arguments de la thèse
3. Exemple
4. Citation : vous pouvez prendre une citation qui provient du texte, mais servez-vous aussi de votre cours. Vous expliquez la citation avec vos mots.
5. Mini conclusion de l'argumentation (pour chaque paragraphe)
- (Facultatif) Conclusion globale du développement

PRINCIPAUX ÉLÉMENTS ÉVALUÉS
- Le candidat a vu que le sujet soulevait un problème, il l'a formulé et a tenté de le résoudre.
- La solution proposée repose sur une argumentation qui la justifie, et non sur de simples affirmations.
- L'argumentation est construite et ne se réduit pas à une simple juxtaposition d'exemples ou de remarques.
- Le candidat témoigne d'un minimum de connaissance sur le problème traité (cours du professeur, expériences ou lectures personnelles).
- Cette connaissance est bien assimilée : elle est l'occasion d'une réflexion personnelle et non de la réplication d'un cours.
- Le candidat analyse correctement les notions et maîtrise le vocabulaire qu'il emploie.
- L'expression, destinée à convaincre, est aussi simple, claire et distincte que possible.`,
  intro_dissertation: `INTRODUCTION DE LA DISSERTATION
1. Opinion commune (la doxa) : Exprimer clairement ce que les gens pensent habituellement sur le sujet. Tout le développement va souvent consister à montrer en quoi cette opinion courante est fausse ou insuffisante.
2. Définitions des termes du sujet : Définir chaque terme important. S'appuyer sur le dictionnaire, le cours, la culture générale et l'expérience personnelle.
3. Paradoxe du sujet : Montrer le caractère quasi-illogique ou surprenant du sujet. Tout sujet est paradoxal — il invite à critiquer un préjugé. Il peut sembler absurde, contradictoire, ou mettre en rapport des concepts opposés.
4. Problématique / Reformulation : Reformuler le sujet en soulignant ses paradoxes internes. Montrer pourquoi cette question est utile à poser. On peut utiliser des synonymes, antonymes, ou ajouter des adverbes (« vraiment », « nécessairement »…).
5. Annonce de plan : Annoncer clairement le cheminement : « Nous verrons dans un premier temps… puis… enfin… ».`,

  plan_tas: `LE PRINCIPE
On examine une première réponse à la question (thèse), puis ses limites, qui conduisent à une réponse opposée (antithèse). La troisième partie (synthèse) dépasse l'opposition en introduisant une distinction ou un concept nouveau, qui fait avancer la question.
À retenir : la synthèse n'est ni un compromis, ni un mélange, ni un résumé du I et du II. Elle pose le problème autrement.

QUAND L'UTILISER ?
- Quand le sujet est une question fermée : « Faut-il… ? », « Est-ce… ? »
- Quand on trouve facilement de bons arguments pour les deux réponses.
- Quand l'opposition oui / non peut être dépassée par une distinction (deux sens d'un mot, deux points de vue, des conditions).

COMMENT LE CONSTRUIRE ?
- I. Thèse : la réponse la plus immédiate, argumentée sérieusement.
- II. Antithèse : les limites de la thèse, qui conduisent à la réponse opposée. Le II doit naître des limites du I, pas seulement le contredire.
- III. Synthèse : une distinction ou un concept nouveau qui permet de sortir de l'alternative et de répondre mieux à la question.

ASTUCE
En conclusion, on termine souvent par une question d'ouverture qui élargit le sujet. Ne la gardez pas pour la fin : faites-en le point de départ de votre III. Elle contient souvent le nouveau point de vue qui permet de dépasser l'opposition entre le I et le II. Pour la trouver, demandez-vous quelle autre notion du programme éclaire le sujet autrement.

FORMULATIONS UTILES
- « Cette première réponse se heurte pourtant à une difficulté… »
- « Faut-il pour autant en conclure que… ? »
- « L'opposition entre ces deux réponses n'est peut-être qu'apparente si l'on distingue… »

EXEMPLE 1 — L'homme s'accomplit-il dans le travail ?
- I. Oui : le travail permet de subvenir à ses besoins, de trouver sa place dans la société et de développer ses capacités.
- II. Non : le travail peut être une contrainte qui épuise et aliène (travail à la chaîne, chômage, souffrance au travail).
- III. Le travail n'est pas le seul lieu où l'homme s'accomplit (l'art, la religion, la vie politique). Mais ces autres lieux montrent à quelle condition le travail accomplit l'homme : quand il y met du sens et s'y reconnaît, comme l'artiste dans son œuvre.

EXEMPLE 2 — Faut-il toujours dire la vérité ?
- I. Oui : mentir, c'est trahir la confiance des autres et rendre la vie en société impossible.
- II. Non : certaines vérités blessent ou mettent en danger ; le mensonge peut protéger quelqu'un.
- III. Distinguer ne pas mentir et tout dire : on doit être sincère, mais on peut se taire, choisir le moment et la manière de dire la vérité.

PIÈGE À ÉVITER
Une synthèse « juste milieu » (« ni oui, ni non, un peu des deux »). Test : ma partie III utilise-t-elle une idée qui n'apparaissait ni dans le I, ni dans le II ? Si non, la synthèse n'en est pas une.

SUJETS DU COURS QUI SE PRÊTENT À CE PLAN
- Sommes-nous faits pour vivre ensemble ?
- Sommes-nous libres de nos actions ?
- Peut-on douter de toute science ?
- La pitié est-elle un sentiment naturel ? (HLP)
- L'homme s'accomplit-il dans le travail ?
- Faut-il toujours dire la vérité ?`,

  plan_notionnel: `LE PRINCIPE
Chaque partie explore un sens différent du concept clé du sujet, du sens le plus immédiat (le sens commun) au sens le plus exigeant (le sens philosophique). C'est l'insuffisance d'un sens qui oblige à passer au suivant.
À retenir : dans un plan dialectique, on oppose des réponses. Dans un plan notionnel, on approfondit un concept : la réponse change parce que le sens du mot change.

QUAND L'UTILISER ?
- Quand le sujet repose sur une notion ambiguë (liberté, bonheur, vérité, nature, travail…).
- Pour les sujets du type « Qu'est-ce que… ? ».
- Quand on sent que la réponse dépend de ce qu'on entend par le mot.

COMMENT LE CONSTRUIRE ?
1. Repérer le concept clé du sujet et faire l'inventaire de ses sens.
2. Garder trois sens et les classer du plus immédiat au plus exigeant.
3. Vérifier que chaque sens répond à la question, et montrer dans les transitions ce que chaque sens laisse de côté.

ASTUCE
Pour trouver les différents sens d'un mot, partez des expressions de la langue courante qui l'utilisent : « être libre de ses mouvements », « avoir l'esprit libre », « se libérer d'une habitude »… Chaque expression cache un sens différent du mot : il ne reste plus qu'à les classer du plus simple au plus exigeant.

FORMULATIONS UTILES
- « Mais ce premier sens laisse de côté… »
- « Si l'on s'en tient à cette définition, on ne peut expliquer… »
- « Il faut donc chercher un sens plus exigeant du mot… »

EXEMPLE 1 — Être libre, est-ce faire ce que l'on veut ?
- I. Liberté = absence de contrainte : oui, être libre, c'est faire ce que l'on veut.
- II. Liberté = autonomie (Rousseau) : non, suivre ses envies, c'est être esclave de ses désirs.
- III. Liberté = compréhension de ce qui nous détermine (Spinoza) : être libre, c'est savoir pourquoi on veut.

EXEMPLE 2 — Faut-il être optimiste ?
- I. Optimisme = croyance que le monde est bon (Leibniz) : non, elle nie le mal réel (Voltaire).
- II. Optimisme = humeur : la question n'a pas de sens, une humeur ne se commande pas.
- III. Optimisme = volonté (Alain) : oui, car c'est une condition de l'action.

PIÈGE À ÉVITER
Le plan thématique ou « catalogue » (I. aspect économique, II. aspect social, III. aspect moral), qui juxtapose des domaines sans répondre à la question. Test : pourrais-je inverser l'ordre de mes parties sans rien changer ? Si oui, le plan ne progresse pas.

SUJETS DU COURS QUI SE PRÊTENT À CE PLAN
- La liberté consiste-t-elle à faire tout ce qu'on veut ?
- Être libre, est-ce faire ce que l'on veut ?
- La parole est-elle un art ? (HLP)
- Peut-on parler pour ne rien dire ?
- Art et religion sont-ils des vecteurs de vérité ?
- Faut-il être optimiste ?`,

  plan_critique: `LE PRINCIPE
Toute question tient pour acquises des idées sans le dire : ce sont ses présupposés. On prend d'abord la question au sérieux, puis on examine ce qu'elle suppose, enfin on repose le problème sur de nouvelles bases. « Critique » vient du grec krinein : examiner, juger.
À retenir : dans un plan dialectique, le II contredit le I. Dans un plan critique, le II creuse sous le I : il interroge ce que le I tenait pour évident.

QUAND L'UTILISER ?
- Quand le sujet contient une affirmation cachée.
- Quand le sujet contient des mots qui généralisent : tout, toujours, seulement, jamais.
- Quand on a l'impression que la question est mal posée.

COMMENT LE CONSTRUIRE ?
- I. Prendre le sujet au sérieux : répondre à la question telle qu'elle est posée.
- II. Examiner le présupposé : montrer que la réponse du I reposait sur une idée qui ne va pas de soi.
- III. Reposer le problème : reformuler la question sur de nouvelles bases et y répondre.

ASTUCE
Pour trouver le présupposé, complétez la phrase « Pour que cette question ait un sens, il faut que… ». Regardez surtout les petits mots qui semblent aller de soi (tout, toujours, vraiment, soi-même…) : c'est presque toujours là que le présupposé se cache.

FORMULATIONS UTILES
- « Mais cette réponse suppose que… Or rien ne garantit que… »
- « Il faut donc remonter plus haut et se demander si… »
- « La question change alors de sens : il ne s'agit plus de savoir si…, mais si… »

EXEMPLE 1 — Peut-on être esclave de soi-même ?
- Présupposé : il existe un « soi » libre, maître de ses actes.
- I. Oui : nous consentons à notre propre servitude par habitude ou passion (La Boétie, Épictète).
- II. Mais nos actes viennent-ils vraiment de notre volonté ? (Aristote, Gide, Descartes)
- III. Si tout est déterminé (Spinoza), à quelles conditions devenir l'auteur de ses actes ? (Kant, Sartre)

EXEMPLE 2 — La science peut-elle tout expliquer ?
- Présupposé : tout est objet d'explication, et la science donne des explications définitives.
- I. Oui : en droit, rien n'échappe à la science (Laplace).
- II. Mais toute théorie reste provisoire et réfutable (Popper).
- III. Expliquer n'est pas comprendre : la science dit comment les choses se produisent, pas quel sens elles ont pour nous.

PIÈGE À ÉVITER
Refuser le sujet dès l'introduction ou bâcler le I. Test : mon II examine-t-il un présupposé, ou dit-il simplement « non » ? Dans le second cas, c'est un plan dialectique déguisé.

SUJETS DU COURS QUI SE PRÊTENT À CE PLAN
- Peut-on être esclave de soi-même ?
- Suis-je ce que j'ai conscience d'être ?
- Peut-on douter de tout ?
- Est-ce un devoir d'être heureux ?
- La science peut-elle tout expliquer ?`,

  paragraphe: `RÉDIGER UN PARAGRAPHE ARGUMENTÉ (~20 lignes)
Les 5 éléments obligatoires (ordre conseillé mais non obligatoire) :
1. Une thèse : l'idée principale défendue dans ce paragraphe.
2. Une argumentation : les raisons qui justifient la thèse.
3. Un exemple : un cas concret qui illustre l'argument.
4. Une citation : un passage d'un auteur étudié qui appuie le propos.
5. Une conclusion : bilan de l'argumentation, transition vers l'idée suivante.
Éléments optionnels pour enrichir : un constat, une objection, un contre-exemple.
Conseil : faites varier l'ordre. Les philosophes eux-mêmes jouent avec la structure.`,

  expl_generale: `EXPLICATION DE TEXTE — SÉRIE GÉNÉRALE (commentaire linéaire)
Introduction :
- Présentation rapide du texte (auteur, titre, date)
- Le thème du texte (quelle notion du programme ?)
- La thèse du texte (qu'est-ce qu'affirme l'auteur ?)
- Définitions de quelques termes importants
- Le paradoxe (quelle contradiction la thèse tente-t-elle de régler ?)
- Une problématique en rapport avec le thème et le paradoxe
- Le plan du texte sous forme de questions
Développement (commentaire linéaire, dans l'ordre du texte) :
- Citer un court passage du texte
- Reformuler seulement si le sens littéral n'est pas clair (pas de paraphrase !)
- Définir et expliquer les notions importantes du passage
- Expliquer l'idée et sa fonction dans l'argumentation
- Transition vers le passage suivant (sous forme de question)
- Faire appel au cours et aux autres auteurs pour confirmer ou contredire la thèse
Conclusion : répondre point par point à l'introduction. Ne pas ouvrir sur une question sans réponse.`,

  expl_techno: `EXPLICATION DE TEXTE — SÉRIE TECHNOLOGIQUE
Deux options au choix (indiquer sur la copie) :
Option 1 : répondre aux questions guidées
Option 2 : commentaire libre (comme en Français)

OPTION 1 — QUESTIONS GUIDÉES :
A. Éléments d'analyse :
- Expliquer les concepts clés dans le contexte précis du texte (pas de définition générale hors contexte)
- Analyser l'argumentation : étapes du raisonnement, distinctions, exemples de l'auteur
- Ne pas paraphraser : reformuler pour expliquer, sans simplement répéter
- Illustrer si possible avec un exemple concret

B. Éléments de synthèse :
- Identifier la question principale du texte (ce à quoi l'auteur tente de répondre)
- Repérer les moments de l'argumentation (= le plan du texte)
- Dégager l'idée principale en 1-2 phrases

C. Commentaire (mini-dissertations sans introduction) :
- Préciser le sens et l'intérêt de l'idée centrale
- Discuter le texte : implications, limites, conséquences
- Appuyer avec des références à d'autres auteurs ou exemples
- Possible : partie thèse (d'accord) + partie antithèse (en désaccord)`,
};

// Ancien contenu par défaut de la fiche dialectique (avant novembre 2026)
const OLD_DEFAULT_PLAN_TAS = "PLAN THÈSE / ANTITHÈSE / SYNTHÈSE (plan dialectique)\nStructure générale :\n- Introduction : position du problème\n- Partie I — Thèse : répond OUI à la question posée. Défend l'affirmation principale.\n- Partie II — Antithèse : répond NON. Objections et limites de la thèse.\n- Partie III — Synthèse : NI compromis NI résumé du I et II. Introduit un concept NOUVEAU et imprévu pour dépasser le oui/non. Reformule le problème autrement.\n- Conclusion : récapitulation de la progression.\nAstuce : recycler l'ouverture de la conclusion pour en faire la question traitée au III.\nExemple — Sujet « Faut-il être optimiste ? » : I. Oui, le bonheur sur terre est accessible. II. Non, le bonheur est impossible. III. Ni optimiste ni pessimiste : être RÉALISTE — faire coïncider ses désirs au monde réel.";

export const loadMethodeContent = async (): Promise<MethodeContent> => {
  try {
    const val = await dbGetConfig("methode_content");
    if (!val) return DEFAULT_METHODE_CONTENT;
    const saved = JSON.parse(val) || {};
    // Une fiche enregistrée vide ne remplace pas la fiche par défaut
    Object.keys(saved).forEach(k => { if (typeof saved[k] === "string" && !saved[k].trim()) delete saved[k]; });
    // L'ancienne fiche « plan dialectique » par défaut (jamais modifiée par le prof) laisse place à la nouvelle
    if (typeof saved.plan_tas === "string" && saved.plan_tas.trim() === OLD_DEFAULT_PLAN_TAS.trim()) delete saved.plan_tas;
    return { ...DEFAULT_METHODE_CONTENT, ...saved };
  } catch { return DEFAULT_METHODE_CONTENT; }
};

export const saveMethodeContent = async (mc: MethodeContent) => {
  await dbSetConfig("methode_content", JSON.stringify(mc));
};

// ── FAQ Méthode (conseils et astuces du prof) ─────────────────────────────────
export type FaqItem = {
  id: string;
  question: string;
  reponse: string;
  serie: "toutes" | "generale" | "techno" | "hlp";
  createdAt: number;
};

export const loadFaqMethode = async (): Promise<FaqItem[]> => {
  try {
    const val = await dbGetConfig("faq_methode");
    if (!val) return [];
    return JSON.parse(val);
  } catch { return []; }
};

export const saveFaqMethode = async (items: FaqItem[]) => {
  await dbSetConfig("faq_methode", JSON.stringify(items));
};

// ── Questions des élèves (en attente de réponse du prof) ──────────────────────
export type EleveQuestion = {
  id: string;
  question: string;
  serie: "generale" | "techno" | "hlp" | null;
  eleveNom: string;
  createdAt: number;
};

export const loadEleveQuestions = async (): Promise<EleveQuestion[]> => {
  try {
    const val = await dbGetConfig("eleve_questions");
    if (!val) return [];
    return JSON.parse(val);
  } catch { return []; }
};

export const saveEleveQuestions = async (items: EleveQuestion[]) => {
  await dbSetConfig("eleve_questions", JSON.stringify(items));
};

// ── Dissertations DB ──────────────────────────────────────────────────────────
export const dbSaveDissertation = async (d: any) => {
  const { error } = await supabase.from("dissertations").insert([{
    id: uid(),
    eleve_nom: d.eleveNom || "Anonyme",
    sujet: d.sujet,
    matiere: d.matiere || "philosophie",
    notions: d.notions || [],
    notion_principale: d.notion_principale || "",
    texte_eleve: d.texte_eleve || "",
    corrige_ia: d.corrige_ia || "",
    mode_travail: d.mode_travail || "corrige",
    created_at: Date.now(),
  }]);
  if (error) throw error;
};

export const dbLoadDissertations = async () => {
  const { data, error } = await supabase
    .from("dissertations").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

// ── Sessions révision DB ──────────────────────────────────────────────────────
export const dbSaveSession = async (s: any) => {
  const { error } = await supabase.from("sessions_revision").insert([{
    id: uid(),
    eleve_nom: s.eleveNom || "Anonyme",
    texte_id: s.texte_id,
    texte_titre: s.texte_titre || "",
    chapitre: s.chapitre || "",
    matiere: s.matiere || "hlp",
    notion_principale: s.notion_principale || "",
    duree_secondes: s.duree_secondes || 0,
    nb_messages: s.nb_messages || 0,
    created_at: Date.now(),
  }]);
  if (error) throw error;
};

export const dbLoadSessions = async () => {
  const { data, error } = await supabase
    .from("sessions_revision").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const dbLoadUsageStats = async () => {
  const { data, error } = await supabase
    .from('usage_stats').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) return [];
  return data || [];
};

export const dbLoadResultatsAll = async () => {
  const { data, error } = await supabase
    .from("resultats").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

// ── File extraction ───────────────────────────────────────────────────────────
export async function extractFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "txt") return file.text();
  if (ext === "docx" || ext === "doc") {
    const buf = await file.arrayBuffer();
    return (await mammoth.extractRawText({ arrayBuffer: buf })).value;
  }
  if (ext === "pdf") {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/extract", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.text) throw new Error(d.error || "Lecture du PDF impossible");
    return d.text as string;
  }
  throw new Error("Format non supporté (.txt, .docx, .pdf)");
}

export async function extractMetadataWithAI(content: string, filename: string, chapterHint: string) {
  const snippet = content.slice(0, 3000);
  const hint = chapterHint ? `\nHint chapitre : "${chapterHint}"` : "";
  const data = await callAI([{ role: "user", content:
    `Analyse ce texte et extrais ses métadonnées. Réponds UNIQUEMENT en JSON valide.${hint}
Format: {"author":"Prénom Nom","workTitle":"Titre","chapter":"Mouvement littéraire","notions":["notion1","notion2","notion3"]}
Fichier: ${filename}
Texte: ${snippet}` }], 400, true, "import");
  return parseJSON(getText(data));
}

// ── Quiz utils ────────────────────────────────────────────────────────────────
const shuffle = (arr: any[]) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const prepareQuiz = (questions: any[]) =>
  questions.map((q) => {
    const correctText = q.options[q.correctAnswer];
    const shuffled = shuffle(q.options);
    return { question: q.question, options: shuffled, correctIndex: shuffled.indexOf(correctText) };
  });

// ── APP ───────────────────────────────────────────────────────────────────────
export function getOrCreateVisitorId(): string {
  try {
    let id = localStorage.getItem("qcm_visitor_id");
    if (!id) {
      id = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
      localStorage.setItem("qcm_visitor_id", id);
    }
    _visitorId = id;
    return id;
  } catch { return "unknown"; }
}
