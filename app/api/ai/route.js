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
// - Cerebras retiré (nov. 2026) : son offre gratuite est devenue un crédit limité avec carte bancaire
// - Google : gemini-2.5-flash n'a plus de quota gratuit pour les nouveaux comptes,
//   gemini-2.5-flash-lite n'est plus ouvert aux nouveaux utilisateurs → génération 3.x
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const GOOGLE_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GOOGLE_LITE_MODEL = process.env.GEMINI_LITE_MODEL || "gemini-3.5-flash-lite";
// Chaque modèle Gemini a son propre quota gratuit : un 3e modèle Google sert de relais supplémentaire
const GOOGLE_BIS_MODEL = process.env.GEMINI_BIS_MODEL || "gemini-3.5-flash"; // gemini-3.8-flash : trop lent (> 15 s)
// mistral-small-latest n'est plus ouvert à l'offre gratuite (nov. 2026) ; mistral-medium-latest : 1 requête/s, 20 000 tokens/min
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || "mistral-medium-latest";

// Message d'erreur lisible (statut HTTP + message du fournisseur), affiché dans la jauge
async function erreurLisible(nom, response) {
  let msg = "";
  try { const t = await response.text(); try { const j = JSON.parse(t); msg = j.error?.message || j.message || j.detail || t; } catch { msg = t; } } catch { /* rien */ }
  return new Error(`${nom} ${response.status} : ${String(msg || response.statusText).slice(0, 300)}`);
}

// ── Quotas : on garde les en-têtes « x-ratelimit-* » renvoyés par les fournisseurs ──
// (Groq et Mistral indiquent ce qu'il reste ; Google ne le fait pas).
// Instantané enregistré dans config.ai_quota, au plus une fois par minute et par instance.
let quotaCache = {};
let lastQuotaWrite = 0;
function captureLimits(provider, headers) {
  const h = {};
  headers.forEach((v, k) => { if (k.toLowerCase().includes("ratelimit")) h[k.toLowerCase()] = v; });
  if (Object.keys(h).length) quotaCache[provider] = { ...(quotaCache[provider] || {}), headers: h, at: new Date().toISOString() };
}
// Fusion de deux relevés d'une même IA : pour chaque information, on garde la plus récente
const plusRecent = (a, b) => (a && (!b || new Date(a) > new Date(b)) ? a : b);
function fusion(a = {}, b = {}) {
  const r = { ...a, ...b };
  const erreur = plusRecent(a.last_error_at, b.last_error_at) === a.last_error_at && a.last_error_at !== b.last_error_at ? a : b;
  if (erreur.last_error_at) Object.assign(r, { last_error: erreur.last_error, last_error_at: erreur.last_error_at, panne_ms: erreur.panne_ms });
  const releve = plusRecent(a.at, b.at) === a.at && a.at !== b.at ? a : b;
  if (releve.at) Object.assign(r, { headers: releve.headers, at: releve.at });
  r.last_ok_at = plusRecent(a.last_ok_at, b.last_ok_at);
  return r;
}
async function flushQuota() {
  if (Date.now() - lastQuotaWrite < 60000 || !Object.keys(quotaCache).length) return;
  lastQuotaWrite = Date.now();
  try {
    const { data } = await supabase.from("config").select("value").eq("key", "ai_quota").maybeSingle();
    let current = {};
    try { current = data?.value ? JSON.parse(data.value) : {}; } catch { current = {}; }
    const fusionne = { ...current };
    for (const [nom, l] of Object.entries(quotaCache)) fusionne[nom] = fusion(current[nom], l);
    await supabase.from("config").upsert({ key: "ai_quota", value: JSON.stringify(fusionne) }, { onConflict: "key" });
  } catch { /* silencieux */ }
}

// Texte de la réponse, accompagné des tokens consommés (pour estimer les quotas restants dans la jauge)
function avecTokens(text, entree, sortie) {
  const t = new String(text);
  t.tokens = { in: Number(entree) || 0, out: Number(sortie) || 0 };
  return t;
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

// Appel d'une API « compatible OpenAI » (Groq, Mistral)
// Les modèles gpt-oss raisonnent avant de répondre : on demande un raisonnement court
// et on ajoute de la marge, sinon la réponse peut être coupée.
// Clé lue dans Vercel, sans espaces, guillemets ni « Bearer » collés par erreur
const cleNettoyee = (v) => String(v || "").trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim();
async function callCompat(nom, url, cleBrute, model, messages, max_tokens, delai = 20000, extra = {}) {
  const cle = cleNettoyee(cleBrute);
  if (!cle) throw new Error(`${nom} : clé API absente (variable d'environnement dans Vercel)`);
  messages = normaliserMessages(messages);
  const gptOss = /gpt-oss/.test(model);
  const corps = (avecRaisonnement) => JSON.stringify({
    model, messages,
    max_tokens: gptOss || extra.marge ? max_tokens + (extra.marge || 1500) : max_tokens,
    temperature: 0.7,
    ...(gptOss && avecRaisonnement && !extra.reasoning ? { reasoning_effort: "low" } : {}),
    ...(extra.reasoning ? { reasoning: extra.reasoning } : {}),
  });
  const envoyer = (avec) => fetchAvecDelai(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cle}` },
    body: corps(avec),
  }, delai);
  let response = await envoyer(true);
  captureLimits(nom, response.headers);
  if (response.status === 429 && delai > 6000) {
    // Limite « par seconde » des offres gratuites : on attend un peu et on réessaie une fois
    await new Promise((r) => setTimeout(r, 1500));
    response = await envoyer(true);
    captureLimits(nom, response.headers);
  }
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
  const u = data.usage || {};
  if (!text.trim()) {
    const e = new Error(`${nom} : réponse vide (modèle ${data.model || model}${data.choices?.[0]?.finish_reason ? ", arrêt : " + data.choices[0].finish_reason : ""})`);
    e.reponseVide = true;
    throw e;
  }
  return avecTokens(text, u.prompt_tokens, u.completion_tokens);
}
const callGroq = (m, t, deep, delai) => callCompat("groq", "https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY, GROQ_MODEL, m, t, delai);
const callMistral = (m, t, deep, delai) => callCompat("mistral", "https://api.mistral.ai/v1/chat/completions", process.env.MISTRAL_API_KEY, MISTRAL_MODEL, m, t, delai);

// ── OpenRouter : modèles gratuits (suffixe « :free »). OPENROUTER_MODEL facultatif : sinon on choisit
// automatiquement un bon modèle gratuit dans la liste publique (relue toutes les 6 heures).
let openrouterModeleCache = { id: "", at: 0 };
const openrouterEcartes = new Set(); // modèles gratuits qui ont répondu vide : on passe au suivant
async function modeleOpenRouter() {
  if (process.env.OPENROUTER_MODEL) return process.env.OPENROUTER_MODEL;
  if (openrouterModeleCache.id && Date.now() - openrouterModeleCache.at < 6 * 3600 * 1000) return openrouterModeleCache.id;
  const r = await fetchAvecDelai("https://openrouter.ai/api/v1/models", {}, 8000);
  if (!r.ok) throw await erreurLisible("openrouter (liste des modèles)", r);
  const ids = ((await r.json()).data || []).map((m) => m.id).filter((id) => /:free$/.test(id) && !openrouterEcartes.has(id));
  // D'abord les modèles qui répondent directement (sans longue réflexion préalable)
  const preferes = [/llama-3\.3-70b/, /deepseek-(chat|v3)/, /gemma-3-27b/, /mistral-(small|medium)/, /llama-4/, /qwen.*(72b|235b|32b)/, /gpt-oss-120b/, /llama/];
  const id = preferes.map((re) => ids.find((x) => re.test(x))).find(Boolean) || ids[0];
  if (!id) throw new Error("openrouter : aucun modèle gratuit disponible");
  openrouterModeleCache = { id, at: Date.now() };
  return id;
}
const callOpenRouter = async (m, t, deep, delai) => {
  const modele = process.env.OPENROUTER_API_KEY ? await modeleOpenRouter() : "";
  try {
    return await callCompat("openrouter", "https://openrouter.ai/api/v1/chat/completions", process.env.OPENROUTER_API_KEY,
      modele, m, t, delai, { marge: 2000, reasoning: { effort: "low", exclude: true } });
  } catch (e) {
    // Réponse vide ou modèle retiré : la prochaine fois, on prendra un autre modèle gratuit
    if (!process.env.OPENROUTER_MODEL && (e.reponseVide || / 404 /.test(e.message))) {
      openrouterEcartes.add(modele);
      openrouterModeleCache = { id: "", at: 0 };
    }
    throw e;
  }
};

// ── Cloudflare Workers AI (API compatible OpenAI) : CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN, CLOUDFLARE_MODEL facultatif
const CLOUDFLARE_MODEL = process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const callCloudflare = (m, t, deep, delai) =>
  callCompat("cloudflare", `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
    process.env.CLOUDFLARE_ACCOUNT_ID ? process.env.CLOUDFLARE_API_TOKEN : "", CLOUDFLARE_MODEL, m, t, delai);

// Appel Google Gemini
const niveauMinimalRefuse = new Set(); // modèles Gemini qui refusent thinkingLevel « minimal »
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
      ? { maxOutputTokens: max_tokens + (deep ? 4000 : 1000), thinkingConfig: { thinkingLevel: deep ? "medium" : (niveauMinimalRefuse.has(model) ? "low" : "minimal") } }
      : { maxOutputTokens: deep ? max_tokens + 3000 : max_tokens, temperature: deep ? 0.5 : 0.7, thinkingConfig: { thinkingBudget: deep ? 3000 : 0 } },
  };
  const envoyer = () => fetchAvecDelai(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) },
    delai
  );
  let response = await envoyer();
  if (!response.ok && response.status === 400 && geminiBody.generationConfig.thinkingConfig?.thinkingLevel === "minimal") {
    // Certains modèles refusent le niveau de réflexion « minimal » : on réessaie avec « low » (et on le retient)
    const err = await erreurLisible(model, response);
    if (!/thinking/i.test(err.message)) throw err;
    niveauMinimalRefuse.add(model);
    geminiBody.generationConfig.thinkingConfig.thinkingLevel = "low";
    response = await envoyer();
  }
  if (!response.ok) throw await erreurLisible(model, response);
  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  const um = data.usageMetadata || {};
  if (!text.trim()) throw new Error("Réponse Google vide");
  return avecTokens(text, um.promptTokenCount, (um.candidatesTokenCount || 0) + (um.thoughtsTokenCount || 0));
}

// Cascade de fallback
const callGoogleLite = (messages, max_tokens, deep = false, delai) => callGoogle(messages, max_tokens, deep, delai, GOOGLE_LITE_MODEL);
const callGoogleBis = (messages, max_tokens, deep = false, delai) => callGoogle(messages, max_tokens, deep, delai, GOOGLE_BIS_MODEL);
const PROVIDER_NAMES = new Map([[callGroq, "groq"], [callGoogle, "google"], [callGoogleLite, "google-lite"], [callGoogleBis, "google-bis"], [callOpenRouter, "openrouter"], [callCloudflare, "cloudflare"], [callMistral, "mistral"]]);
// Une IA qui vient d'échouer est essayée en dernier pendant un moment : les élèves n'attendent pas
// à chaque question qu'elle réponde enfin. La durée dépend de l'erreur :
// - quota du jour épuisé → 1 heure
// - limite « par seconde / par minute » (429 simple, ex. Mistral) → 1 minute
// - serveur surchargé (503 « high demand »), délai dépassé, autre erreur → 5 minutes
const quotaDuJour = (nom, msg) => / 429 /.test(msg) && (/per.?day|daily|jour/i.test(msg) || (/^google/.test(nom) && /quota/i.test(msg) && !/retry in/i.test(msg)));
function dureePanne(nom, msg) {
  if (quotaDuJour(nom, msg)) return 60 * 60 * 1000;
  if (/ 429 /.test(msg) || /rate.?limit|too many/i.test(msg)) return 60 * 1000;
  return 5 * 60 * 1000;
}
function enPanne(nom) {
  const q = quotaCache[nom];
  if (!q?.last_error_at) return false;
  const t = new Date(q.last_error_at).getTime();
  const duree = q.panne_ms || 5 * 60 * 1000;
  return Date.now() - t < duree && (!q.last_ok_at || new Date(q.last_ok_at).getTime() < t);
}
function noterErreur(nom, err) {
  const msg = String(err?.message || err || "").slice(0, 200);
  quotaCache[nom] = { ...(quotaCache[nom] || {}), last_error: msg, last_error_at: new Date().toISOString(), panne_ms: dureePanne(nom, msg) };
  lastQuotaWrite = 0; // une panne est partagée tout de suite avec les autres serveurs
}
// Vercel fait tourner plusieurs serveurs : chacun relit (au plus une fois par minute) les pannes vues par les autres,
// pour ne pas renvoyer les élèves vers une IA que l'on sait surchargée.
let dernierChargement = 0;
async function chargerEtats() {
  if (Date.now() - dernierChargement < 60000) return;
  dernierChargement = Date.now();
  try {
    const { data } = await supabase.from("config").select("value").eq("key", "ai_quota").maybeSingle();
    const distant = data?.value ? JSON.parse(data.value) : {};
    for (const [nom, d] of Object.entries(distant)) quotaCache[nom] = fusion(d, quotaCache[nom]);
  } catch { /* silencieux */ }
}

// Délai accordé à chaque IA : les Gemini (réponses de qualité) ont plus de temps ; les IA de secours
// sont coupées plus tôt pour que l'élève n'attende pas une minute quand plusieurs sont lentes.
const DELAI_GEMINI = 20000, DELAI_GEMINI_DEEP = 35000;
const DELAI_SECOURS = 12000, DELAI_SECOURS_DEEP = 20000;

async function callWithFallback(providersDemandes, messages, max_tokens, deep = false) {
  await chargerEtats();
  const providers = [
    ...providersDemandes.filter((p) => !enPanne(PROVIDER_NAMES.get(p))),
    ...providersDemandes.filter((p) => enPanne(PROVIDER_NAMES.get(p))),
  ];
  const fin = Date.now() + 55000; // Vercel coupe à 60 s
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const reste = fin - Date.now();
    if (reste < 4000) break;
    // Délai de cette IA, sans priver les suivantes de tout le temps restant (la dernière a tout le temps restant)
    const restantes = providers.length - i - 1;
    const gemini = /^google/.test(PROVIDER_NAMES.get(provider) || "");
    const base = gemini ? (deep ? DELAI_GEMINI_DEEP : DELAI_GEMINI) : (deep ? DELAI_SECOURS_DEEP : DELAI_SECOURS);
    const delai = restantes ? Math.min(base, reste - Math.min(restantes, 2) * 6000) : reste;
    try {
      const brut = await provider(messages, max_tokens, deep, delai);
      const text = String(brut);
      const name = PROVIDER_NAMES.get(provider) || "inconnu";
      // Dernier succès : la jauge n'affiche plus une erreur antérieure à ce succès
      quotaCache[name] = { ...(quotaCache[name] || {}), last_ok_at: new Date().toISOString() };
      return { text, provider: name, tokens: brut?.tokens };
    } catch (err) {
      console.warn(`Provider failed: ${err.message}, trying next...`);
      noterErreur(PROVIDER_NAMES.get(provider) || "inconnu", err);
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

// Enregistre un appel. Si des colonnes facultatives n'existent pas encore (sql/usage_eleve_nom.sql, sql/usage_tokens.sql),
// on réessaie sans elles, pour ne jamais perdre la ligne.
function logUsage(row) {
  const sansTokens = { ...row }; delete sansTokens.tokens_in; delete sansTokens.tokens_out;
  const minimal = { ...sansTokens }; delete minimal.eleve_nom;
  const essais = [row, sansTokens, minimal];
  const essayer = (k) => supabase.from("usage_stats").insert([essais[k]]).then(({ error }) => {
    if (error && k + 1 < essais.length) essayer(k + 1);
  }, () => {});
  essayer(0);
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
  const MODELES_URL = {
    groq: ["https://api.groq.com/openai/v1/models", process.env.GROQ_API_KEY, GROQ_MODEL],
    mistral: ["https://api.mistral.ai/v1/models", process.env.MISTRAL_API_KEY, MISTRAL_MODEL],
    openrouter: ["https://openrouter.ai/api/v1/models", process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL || openrouterModeleCache.id || "choix automatique d'un modèle gratuit"],
    cloudflare: [`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/models/search?task=Text%20Generation`, process.env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_MODEL],
  };
  const modelesDisponibles = async (nom) => {
    if (nom.startsWith("google") && process.env.GOOGLE_AI_API_KEY) {
      try {
        const r = await fetchAvecDelai(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${process.env.GOOGLE_AI_API_KEY}`, {}, 8000);
        if (!r.ok) return undefined;
        return ((await r.json()).models || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent") && /gemini/.test(m.name))
          .map((m) => m.name.replace("models/", "")).slice(0, 25);
      } catch { return undefined; }
    }
    const [url, cle] = MODELES_URL[nom] || [];
    if (!url || !cle) return undefined;
    try {
      const r = await fetchAvecDelai(url, { headers: { Authorization: `Bearer ${cle}` } }, 8000);
      if (!r.ok) return undefined;
      const d = await r.json();
      const liste = (d.data || d.result || []).map((m) => m.id && !String(m.id).match(/^[0-9a-f-]{36}$/) ? m.id : m.name).filter(Boolean);
      return (nom === "openrouter" ? liste.filter((x) => /:free$/.test(x)) : liste).slice(0, 25);
    } catch { return undefined; }
  };
  const MODELE_GOOGLE = { google: GOOGLE_MODEL, "google-lite": GOOGLE_LITE_MODEL, "google-bis": GOOGLE_BIS_MODEL };
  const resultats = await Promise.all([...PROVIDER_NAMES.entries()].map(async ([fn, nom]) => {
    const t0 = Date.now();
    try {
      try { await fn(question, 50, false, 15000); }
      catch (e) {
        // OpenRouter : si le modèle gratuit répond vide, on essaie aussitôt le suivant
        if (nom === "openrouter" && e.reponseVide) await fn(question, 50, false, 15000); else throw e;
      }
      quotaCache[nom] = { ...(quotaCache[nom] || {}), last_ok_at: new Date().toISOString() };
      return { nom, ok: true, ms: Date.now() - t0, modele: nom === "openrouter" ? (process.env.OPENROUTER_MODEL || openrouterModeleCache.id) : MODELES_URL[nom]?.[2] || MODELE_GOOGLE[nom] };
    } catch (e) {
      const erreur = String(e?.message || e).slice(0, 200);
      noterErreur(nom, erreur);
      const refuse = / (402|403|404) /.test(erreur) || /model/i.test(erreur);
      return { nom, ok: false, ms: Date.now() - t0, erreur, modele: MODELES_URL[nom]?.[2] || MODELE_GOOGLE[nom], modeles: refuse ? await modelesDisponibles(nom) : undefined };
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

    // Groq passe juste après les Gemini : c'est le secours qui tient le mieux quand les autres sont surchargés.
    // Priorités (choix du professeur, nov. 2026) : les deux meilleurs modèles Gemini, dont le quota gratuit est
    // très limité (~20 réponses/jour chacun), sont réservés au chatbot de l'accueil et aux entraînements
    // « introduction » et « paragraphe ». Le plan dialectique et les autres outils passent par les IA de secours.
    const prioritaire = module === "methode_accueil" || (/^entrainement_/.test(module) && !/plan/.test(module));
    const chaine = prioritaire
      ? [callGoogle, callGoogleBis, callGoogleLite, callGroq, callOpenRouter, callCloudflare, callMistral]
      : prefer_groq
        ? [callGroq, callGoogleLite, callOpenRouter, callCloudflare, callMistral]
        : [callGoogleLite, callGroq, callOpenRouter, callCloudflare, callMistral];
    result = await callWithFallback(chaine, messages, max_tokens, prioritaire && !!deep);

    // Logger l'usage dans Supabase (sans bloquer la réponse)
    // action = « leger:groq », « lourd:google »… : on sait quel modèle a répondu
    logUsage({ module, action: (seance ? "seance:" : "") + (prefer_groq ? "leger" : "lourd") + ":" + result.provider, ip, visitor_id, eleve_nom,
      tokens_in: result.tokens?.in ?? null, tokens_out: result.tokens?.out ?? null });
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
