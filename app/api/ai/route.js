import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Client serveur (clé service_role, déjà utilisée pour la FAQ) : productions des élèves, inaccessibles aux navigateurs
const admin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// Laisse le temps aux réponses « réfléchies » (deep) de se terminer sur Vercel
export const maxDuration = 60;

// Modèles utilisés (novembre 2026). Chacun peut être changé sans toucher au code,
// en ajoutant la variable correspondante dans Vercel (Settings → Environment Variables).
// - Groq a retiré llama-3.1-8b-instant de son offre gratuite → gpt-oss-20b
// - Cerebras ne propose plus llama-3.3-70b → gpt-oss-120b (65k de contexte en gratuit)
// - Google : gemini-2.5-flash n'a plus de quota gratuit pour les nouveaux comptes,
//   gemini-2.5-flash-lite n'est plus ouvert aux nouveaux utilisateurs → génération 3.x
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const GOOGLE_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GOOGLE_LITE_MODEL = process.env.GEMINI_LITE_MODEL || "gemini-3.5-flash-lite";
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || "mistral-small-latest";
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || "gpt-oss-120b";

// Message d'erreur lisible (statut HTTP + message du fournisseur), affiché dans la jauge
async function erreurLisible(nom, response) {
  let msg = "";
  try { const t = await response.text(); try { const j = JSON.parse(t); msg = j.error?.message || j.message || j.detail || t; } catch { msg = t; } } catch { /* rien */ }
  return new Error(`${nom} ${response.status} : ${String(msg || response.statusText).slice(0, 300)}`);
}

// ── Quotas : on garde les en-têtes « x-ratelimit-* » renvoyés par les fournisseurs ──
// (Groq, Cerebras et Mistral indiquent ce qu'il reste ; Google ne le fait pas).
// Instantané enregistré dans config.ai_quota, au plus une fois par minute et par instance.
let quotaCache = {};
let lastQuotaWrite = 0;
function captureLimits(provider, headers) {
  const h = {};
  headers.forEach((v, k) => { if (k.toLowerCase().includes("ratelimit")) h[k.toLowerCase()] = v; });
  if (Object.keys(h).length) quotaCache[provider] = { ...(quotaCache[provider] || {}), headers: h, at: new Date().toISOString() };
}
async function flushQuota() {
  if (Date.now() - lastQuotaWrite < 60000 || !Object.keys(quotaCache).length) return;
  lastQuotaWrite = Date.now();
  try {
    const { data } = await supabase.from("config").select("value").eq("key", "ai_quota").maybeSingle();
    let current = {};
    try { current = data?.value ? JSON.parse(data.value) : {}; } catch { current = {}; }
    await supabase.from("config").upsert({ key: "ai_quota", value: JSON.stringify({ ...current, ...quotaCache }) }, { onConflict: "key" });
  } catch { /* silencieux */ }
}

// Les IA de secours refusent certaines conversations que Gemini accepte (deux messages de suite du même rôle,
// conversation qui commence ou finit par une réponse de l'IA) : on remet la conversation en forme.
function normaliserMessages(messages) {
  const out = [];
  for (const m of messages) {
    const role = m.role === "system" ? "system" : m.role === "assistant" ? "assistant" : "user";
    const content = String(m.content ?? "");
    if (!content.trim()) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === role && role !== "system") prev.content += "\n\n" + content;
    else out.push({ role, content });
  }
  const debut = out.findIndex((m) => m.role !== "system");
  if (debut !== -1 && out[debut].role === "assistant") out.splice(debut, 0, { role: "user", content: "Bonjour." });
  while (out.length && out[out.length - 1].role === "assistant") out.pop();
  return out;
}

// Délai maximum d'une IA avant de passer à la suivante (sinon une IA trop lente bloque toute la cascade
// jusqu'à la coupure de Vercel, et les IA de secours ne sont jamais appelées)
const fetchAvecDelai = (url, options, ms) => fetch(url, { ...options, signal: AbortSignal.timeout(Math.max(3000, ms)) })
  .catch((e) => { throw new Error(e?.name === "TimeoutError" || e?.name === "AbortError" ? `pas de réponse en ${Math.round(ms / 1000)} s` : String(e?.message || e)); });

// Appel d'une API « compatible OpenAI » (Groq, Cerebras, Mistral)
// Les modèles gpt-oss raisonnent avant de répondre : on demande un raisonnement court
// et on ajoute de la marge, sinon la réponse peut être coupée.
async function callCompat(nom, url, cle, model, messages, max_tokens, delai = 20000) {
  if (!cle) throw new Error(`${nom} : clé API absente (variable d'environnement dans Vercel)`);
  messages = normaliserMessages(messages);
  const gptOss = /gpt-oss/.test(model);
  const corps = (avecRaisonnement) => JSON.stringify({
    model, messages,
    max_tokens: gptOss ? max_tokens + 1500 : max_tokens,
    temperature: 0.7,
    ...(gptOss && avecRaisonnement ? { reasoning_effort: "low" } : {}),
  });
  const envoyer = (avec) => fetchAvecDelai(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cle}` },
    body: corps(avec),
  }, delai);
  let response = await envoyer(true);
  captureLimits(nom, response.headers);
  if (!response.ok && gptOss && response.status === 400) {
    // Si le fournisseur refuse le réglage du raisonnement, on réessaie sans
    const err = await erreurLisible(nom, response);
    if (!/reasoning/i.test(err.message)) throw err;
    response = await envoyer(false);
    captureLimits(nom, response.headers);
  }
  if (!response.ok) throw await erreurLisible(nom, response);
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new Error(`${nom} : réponse vide`);
  return text;
}
const callGroq = (m, t, deep, delai) => callCompat("groq", "https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY, GROQ_MODEL, m, t, delai);
const callCerebras = (m, t, deep, delai) => callCompat("cerebras", "https://api.cerebras.ai/v1/chat/completions", process.env.CEREBRAS_API_KEY, CEREBRAS_MODEL, m, t, delai);
const callMistral = (m, t, deep, delai) => callCompat("mistral", "https://api.mistral.ai/v1/chat/completions", process.env.MISTRAL_API_KEY, MISTRAL_MODEL, m, t, delai);

// Appel Google Gemini
async function callGoogle(messages, max_tokens, deep = false, delai = 25000, model = GOOGLE_MODEL) {
  if (!process.env.GOOGLE_AI_API_KEY) throw new Error(`${model} : clé API absente (GOOGLE_AI_API_KEY dans Vercel)`);
  const systemMessage = messages.find((m) => m.role === "system");
  const userMessages = messages.filter((m) => m.role !== "system");
  // Gemini 3 refuse une conversation qui se termine par une réponse du modèle
  while (userMessages.length && userMessages[userMessages.length - 1].role === "assistant") userMessages.pop();
  const geminiBody = {
    system_instruction: systemMessage
      ? { parts: [{ text: systemMessage.content }] }
      : undefined,
    contents: userMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    // Gemini 3.x : réflexion réglée par niveau (minimal / medium), et plus de « temperature ».
    // Gemini 2.5 : thinkingBudget 0 (sinon la réflexion consomme les max_tokens).
    // deep = true : on laisse un temps de réflexion, ajouté en plus de la longueur de réponse.
    generationConfig: /^gemini-[3-9]/.test(model)
      ? { maxOutputTokens: max_tokens + (deep ? 4000 : 1000), thinkingConfig: { thinkingLevel: deep ? "medium" : "minimal" } }
      : { maxOutputTokens: deep ? max_tokens + 3000 : max_tokens, temperature: deep ? 0.5 : 0.7, thinkingConfig: { thinkingBudget: deep ? 3000 : 0 } },
  };
  const response = await fetchAvecDelai(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) },
    delai
  );
  if (!response.ok) throw await erreurLisible(model, response);
  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text.trim()) throw new Error("Réponse Google vide");
  return text;
}

// Cascade de fallback
const callGoogleLite = (messages, max_tokens, deep = false, delai) => callGoogle(messages, max_tokens, deep, delai, GOOGLE_LITE_MODEL);
const PROVIDER_NAMES = new Map([[callGroq, "groq"], [callGoogle, "google"], [callGoogleLite, "google-lite"], [callCerebras, "cerebras"], [callMistral, "mistral"]]);
async function callWithFallback(providers, messages, max_tokens, deep = false) {
  const fin = Date.now() + 55000; // Vercel coupe à 60 s
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const reste = fin - Date.now();
    if (reste < 4000) break;
    // Délai de cette IA : 20 s (35 s en réponse « réfléchie »), sans priver les suivantes de tout le temps restant
    const restantes = providers.length - i - 1;
    const delai = Math.min(deep ? 35000 : 20000, restantes ? reste - Math.min(restantes, 2) * 6000 : reste);
    try {
      const text = await provider(messages, max_tokens, deep, delai);
      const name = PROVIDER_NAMES.get(provider) || "inconnu";
      // Dernier succès : la jauge n'affiche plus une erreur antérieure à ce succès
      quotaCache[name] = { ...(quotaCache[name] || {}), last_ok_at: new Date().toISOString() };
      return { text, provider: name };
    } catch (err) {
      console.warn(`Provider failed: ${err.message}, trying next...`);
      const name = PROVIDER_NAMES.get(provider) || "inconnu";
      quotaCache[name] = { ...(quotaCache[name] || {}), last_error: String(err.message || "").slice(0, 200), last_error_at: new Date().toISOString() };
    }
  }
  throw new Error("Tous les providers ont échoué");
}

// ── Plafonds par élève et par connexion ──────────────────────────────────────
// Réglés dans Mode Prof → Fonctionnalités (config.ai_limites_eleves), relus au plus une fois par minute.
let limitesCache = { v: { par_eleve: 40, par_connexion: 150 }, at: 0 };
async function getLimites() {
  if (Date.now() - limitesCache.at < 60000) return limitesCache.v;
  try {
    const { data } = await supabase.from("config").select("value").eq("key", "ai_limites_eleves").maybeSingle();
    const v = data?.value ? JSON.parse(data.value) : {};
    limitesCache = { v: { par_eleve: 40, par_connexion: 150, entrainements_par_eleve: 10, reponses_par_entrainement: 30, ...v }, at: Date.now() };
  } catch { limitesCache.at = Date.now(); }
  return limitesCache.v;
}
// Appareils déclarés par le professeur (Mode Prof → Usage IA → « Cet appareil est le mien ») :
// ils ne sont pas limités, même hors Mode Prof.
let appareilsCache = { v: [], at: 0 };
async function getAppareilsProf() {
  if (Date.now() - appareilsCache.at < 60000) return appareilsCache.v;
  try {
    const { data } = await supabase.from("config").select("value").eq("key", "appareils_prof").maybeSingle();
    const v = data?.value ? JSON.parse(data.value) : [];
    appareilsCache = { v: Array.isArray(v) ? v.map((a) => a?.id).filter(Boolean) : [], at: Date.now() };
  } catch { appareilsCache.at = Date.now(); }
  return appareilsCache.v;
}
// Minuit à Paris, en heure UTC
function debutJourParis() {
  const now = new Date();
  const paris = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const ecart = paris.getTime() - now.getTime();
  const minuit = new Date(paris); minuit.setHours(0, 0, 0, 0);
  return new Date(minuit.getTime() - ecart).toISOString();
}
// Réponses du jour, hors réponses données dans un entraînement (action « seance:… », comptées par exercice)
async function compteDuJour(colonne, valeur) {
  const { count, error } = await supabase.from("usage_stats").select("*", { count: "exact", head: true })
    .gte("created_at", debutJourParis()).eq(colonne, valeur).neq("action", "call").neq("action", "limite")
    .not("action", "like", "seance:%");
  return error ? 0 : count || 0;
}

// ─── Entraînements : un exercice complet compte pour une seule « question » ───
// Chaque exercice a un identifiant (session_id) et une ligne dans productions_eleves.
// L'élève a droit à `entrainements_par_eleve` exercices par jour, de `reponses_par_entrainement` réponses chacun.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXERCICE_DU_MODULE = (m) => (/intro/.test(m) ? "intro" : /plan/.test(m) ? "plan" : "paragraphe");

// Exercices commencés aujourd'hui par l'élève (les plus anciens d'abord), ou null si la table n'existe pas
async function seancesDuJour(visitor_id) {
  if (!admin || !visitor_id || visitor_id === "unknown") return null;
  const { data, error } = await admin.from("productions_eleves").select("id, nb_reponses")
    .eq("visitor_id", visitor_id).gte("created_at", debutJourParis()).order("created_at", { ascending: true }).limit(500);
  return error ? null : data || [];
}

// Vérifie qu'une réponse peut être donnée dans cet exercice. Renvoie null si le système
// d'entraînement n'est pas disponible (on revient alors au comptage normal).
async function controleSeance(lim, session_id, visitor_id, module) {
  const seances = await seancesDuJour(visitor_id);
  if (!seances) return null;
  const max = lim.entrainements_par_eleve || 0;
  let idx = seances.findIndex((x) => x.id === session_id);
  if (idx === -1) {
    const { data: autre } = await admin.from("productions_eleves").select("visitor_id").eq("id", session_id).maybeSingle();
    if (autre) return null; // exercice d'un autre jour ou d'un autre navigateur : comptage normal
    if (max > 0 && seances.length >= max) return { refus: "entrainements", seances: seances.length, max };
    const { error } = await admin.from("productions_eleves").insert({ id: session_id, visitor_id, exercice: EXERCICE_DU_MODULE(module), nb_reponses: 0 });
    if (error) return null;
    seances.push({ id: session_id, nb_reponses: 0 });
    idx = seances.length - 1;
  }
  if (max > 0 && idx >= max) return { refus: "entrainements", seances: seances.length, max };
  const cap = lim.reponses_par_entrainement || 0;
  const utilisees = seances[idx].nb_reponses || 0;
  if (cap > 0 && utilisees >= cap) return { refus: "seance", cap };
  return { ok: true, utilisees, cap, seances: seances.length, max };
}

const quotaEntrainements = (c) => c?.max > 0 ? { limite: c.max, restant: Math.max(0, c.max - c.seances) } : null;

// Enregistre un appel ; si la colonne eleve_nom n'existe pas encore (sql/usage_eleve_nom.sql), on l'enregistre sans le prénom
function logUsage(row) {
  supabase.from("usage_stats").insert([row]).then(({ error }) => {
    if (error && row.eleve_nom !== undefined) {
      const sansNom = { ...row };
      delete sansNom.eleve_nom;
      supabase.from("usage_stats").insert([sansNom]).then(() => {}, () => {});
    }
  }, () => {});
}

// Réponses restantes aujourd'hui pour cet élève (la plus contraignante des deux limites)
function calculRestant(lim, parEleve, parConnexion) {
  const r = [];
  if (lim.par_eleve > 0) r.push(lim.par_eleve - parEleve);
  if (lim.par_connexion > 0) r.push(lim.par_connexion - parConnexion);
  if (!r.length) return null;
  return Math.max(0, Math.min(...r));
}

// Test de chaque IA (Mode Prof → Usage IA → « Tester les IA ») : petite question envoyée à toutes en même temps
async function testerIA(request) {
  const code = request.headers.get("x-prof-code") || "";
  const { data } = await supabase.from("config").select("value").eq("key", "prof_code").maybeSingle();
  if (!code || code !== (data?.value || "prof1234")) return Response.json({ error: "réservé au professeur" }, { status: 401 });
  const question = [{ role: "user", content: "Réponds seulement par le mot : OK" }];
  const resultats = await Promise.all([...PROVIDER_NAMES.entries()].map(async ([fn, nom]) => {
    const t0 = Date.now();
    try {
      await fn(question, 50, false, 15000);
      quotaCache[nom] = { ...(quotaCache[nom] || {}), last_ok_at: new Date().toISOString() };
      return { nom, ok: true, ms: Date.now() - t0 };
    } catch (e) {
      const erreur = String(e?.message || e).slice(0, 200);
      quotaCache[nom] = { ...(quotaCache[nom] || {}), last_error: erreur, last_error_at: new Date().toISOString() };
      return { nom, ok: false, ms: Date.now() - t0, erreur };
    }
  }));
  await flushQuota();
  return Response.json({ resultats });
}

// GET /api/ai?visitor_id=… : compteur affiché à l'élève
export async function GET(request) {
  if (new URL(request.url).searchParams.get("test") === "ia") return testerIA(request);
  try {
    const visitor_id = new URL(request.url).searchParams.get("visitor_id") || "unknown";
    const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    if ((await getAppareilsProf()).includes(visitor_id)) return Response.json({ limite: 0, restant: null, prof: true });
    const lim = await getLimites();
    const [parEleve, parConnexion] = await Promise.all([
      lim.par_eleve > 0 && visitor_id !== "unknown" ? compteDuJour("visitor_id", visitor_id) : 0,
      lim.par_connexion > 0 && ip !== "unknown" ? compteDuJour("ip", ip) : 0,
    ]);
    const seances = await seancesDuJour(visitor_id);
    const max = lim.entrainements_par_eleve || 0;
    return Response.json({
      limite: lim.par_eleve || 0, restant: calculRestant(lim, parEleve, parConnexion),
      entrainements: seances && max > 0 ? { limite: max, restant: Math.max(0, max - seances.length) } : null,
    });
  } catch {
    return Response.json({ limite: 0, restant: null });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, max_tokens = 2000, prefer_groq = false, module = "inconnu", visitor_id = "unknown", deep = false, prof = false } = body;
    const session_id = UUID.test(String(body.session_id || "")) && String(module).startsWith("entrainement_") ? String(body.session_id) : null;
    const eleve_nom = String(body.eleve_nom || "").trim().slice(0, 60) || null;
    const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();

    // Plafonds (le professeur, en Mode Prof, n'est pas limité)
    let quota = null;
    let seance = null; // exercice d'entraînement en cours (compté à part)
    const appareilProf = !prof && visitor_id !== "unknown" && (await getAppareilsProf()).includes(visitor_id);
    if (!prof && !appareilProf && session_id) {
      const lim = await getLimites();
      const c = await controleSeance(lim, session_id, visitor_id, module);
      if (c?.refus) {
        logUsage({ module, action: "limite", ip, visitor_id, eleve_nom });
        const text = c.refus === "seance"
          ? `Cet exercice a atteint ${c.cap} réponses du tuteur. Termine-le de ton côté, ou commence un nouvel exercice avec un nouveau sujet.`
          : `Tu as fait tes ${c.max} entraînements pour aujourd'hui. Reviens demain pour un nouvel exercice !`;
        return Response.json({ limite: true, content: [{ type: "text", text }],
          quota: { entrainements: c.refus === "entrainements" ? { limite: c.max, restant: 0 } : undefined } }, { status: 429 });
      }
      if (c?.ok) {
        seance = c;
        quota = { entrainements: quotaEntrainements(c), seance: { limite: c.cap, utilisees: c.utilisees + 1 } };
      }
    }
    if (!prof && !appareilProf && !seance) {
      const lim = await getLimites();
      const [parEleve, parConnexion] = await Promise.all([
        lim.par_eleve > 0 && visitor_id !== "unknown" ? compteDuJour("visitor_id", visitor_id) : 0,
        lim.par_connexion > 0 && ip !== "unknown" ? compteDuJour("ip", ip) : 0,
      ]);
      if ((lim.par_eleve > 0 && parEleve >= lim.par_eleve) || (lim.par_connexion > 0 && parConnexion >= lim.par_connexion)) {
        logUsage({ module, action: "limite", ip, visitor_id, eleve_nom });
        return Response.json({
          limite: true,
          content: [{ type: "text", text: "Tu as atteint la limite de réponses de l'IA pour aujourd'hui. Reviens demain, ou relis ton cours et les fiches méthode en attendant !" }],
          quota: { limite: lim.par_eleve || 0, restant: 0 },
        }, { status: 429 });
      }
      const r = calculRestant(lim, parEleve + 1, parConnexion + 1);
      if (r !== null) quota = { limite: lim.par_eleve || 0, restant: r };
    }

    let result = { text: "", provider: "inconnu" };

    if (prefer_groq) {
      // Requêtes légères : Groq → Cerebras → Google Flash-Lite → Google Flash → Mistral
      result = await callWithFallback(
        [callGroq, callCerebras, callGoogleLite, callGoogle, callMistral],
        messages, max_tokens
      );
    } else {
      // Requêtes lourdes : Google Flash → Google Flash-Lite → Cerebras (gpt-oss-120b, long contexte) → Mistral → Groq
      result = await callWithFallback(
        [callGoogle, callGoogleLite, callCerebras, callMistral, callGroq],
        messages, max_tokens, !!deep
      );
    }

    // Logger l'usage dans Supabase (sans bloquer la réponse)
    // action = « leger:groq », « lourd:google »… : on sait quel modèle a répondu
    logUsage({ module, action: (seance ? "seance:" : "") + (prefer_groq ? "leger" : "lourd") + ":" + result.provider, ip, visitor_id, eleve_nom });
    if (seance) {
      await admin.from("productions_eleves").update({ nb_reponses: seance.utilisees + 1, updated_at: new Date().toISOString() }).eq("id", session_id).then(() => {}, () => {});
    }

    await flushQuota();
    return Response.json({ content: [{ type: "text", text: result.text }], quota });
  } catch (error) {
    await flushQuota();
    return Response.json({ error: error.message }, { status: 500 });
  }
}
