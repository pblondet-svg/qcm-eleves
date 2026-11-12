import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

// Appel d'une API « compatible OpenAI » (Groq, Cerebras, Mistral)
// Les modèles gpt-oss raisonnent avant de répondre : on demande un raisonnement court
// et on ajoute de la marge, sinon la réponse peut être coupée.
async function callCompat(nom, url, cle, model, messages, max_tokens) {
  const gptOss = /gpt-oss/.test(model);
  const corps = (avecRaisonnement) => JSON.stringify({
    model, messages,
    max_tokens: gptOss ? max_tokens + 1500 : max_tokens,
    temperature: 0.7,
    ...(gptOss && avecRaisonnement ? { reasoning_effort: "low" } : {}),
  });
  const envoyer = (avec) => fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cle}` },
    body: corps(avec),
  });
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
const callGroq = (m, t) => callCompat("groq", "https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY, GROQ_MODEL, m, t);
const callCerebras = (m, t) => callCompat("cerebras", "https://api.cerebras.ai/v1/chat/completions", process.env.CEREBRAS_API_KEY, CEREBRAS_MODEL, m, t);
const callMistral = (m, t) => callCompat("mistral", "https://api.mistral.ai/v1/chat/completions", process.env.MISTRAL_API_KEY, MISTRAL_MODEL, m, t);

// Appel Google Gemini
async function callGoogle(messages, max_tokens, deep = false, model = GOOGLE_MODEL) {
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
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) }
  );
  if (!response.ok) throw await erreurLisible(model, response);
  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text.trim()) throw new Error("Réponse Google vide");
  return text;
}

// Cascade de fallback
const callGoogleLite = (messages, max_tokens, deep = false) => callGoogle(messages, max_tokens, deep, GOOGLE_LITE_MODEL);
const PROVIDER_NAMES = new Map([[callGroq, "groq"], [callGoogle, "google"], [callGoogleLite, "google-lite"], [callCerebras, "cerebras"], [callMistral, "mistral"]]);
async function callWithFallback(providers, messages, max_tokens, deep = false) {
  for (const provider of providers) {
    try {
      const text = await provider(messages, max_tokens, deep);
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
    limitesCache = { v: { par_eleve: 40, par_connexion: 150, ...v }, at: Date.now() };
  } catch { limitesCache.at = Date.now(); }
  return limitesCache.v;
}
// Minuit à Paris, en heure UTC
function debutJourParis() {
  const now = new Date();
  const paris = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const ecart = paris.getTime() - now.getTime();
  const minuit = new Date(paris); minuit.setHours(0, 0, 0, 0);
  return new Date(minuit.getTime() - ecart).toISOString();
}
async function compteDuJour(colonne, valeur) {
  const { count, error } = await supabase.from("usage_stats").select("*", { count: "exact", head: true })
    .gte("created_at", debutJourParis()).eq(colonne, valeur).neq("action", "call").neq("action", "limite");
  return error ? 0 : count || 0;
}

// Enregistre un appel ; si la colonne eleve_nom n'existe pas encore (usage_eleve_nom.sql), on l'enregistre sans le prénom
function logUsage(row) {
  supabase.from("usage_stats").insert([row]).then(({ error }) => {
    if (error && row.eleve_nom !== undefined) {
      const { eleve_nom, ...sansNom } = row;
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

// GET /api/ai?visitor_id=… : compteur affiché à l'élève
export async function GET(request) {
  try {
    const visitor_id = new URL(request.url).searchParams.get("visitor_id") || "unknown";
    const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const lim = await getLimites();
    const [parEleve, parConnexion] = await Promise.all([
      lim.par_eleve > 0 && visitor_id !== "unknown" ? compteDuJour("visitor_id", visitor_id) : 0,
      lim.par_connexion > 0 && ip !== "unknown" ? compteDuJour("ip", ip) : 0,
    ]);
    return Response.json({ limite: lim.par_eleve || 0, restant: calculRestant(lim, parEleve, parConnexion) });
  } catch {
    return Response.json({ limite: 0, restant: null });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, max_tokens = 2000, prefer_groq = false, module = "inconnu", visitor_id = "unknown", deep = false, prof = false } = body;
    const eleve_nom = String(body.eleve_nom || "").trim().slice(0, 60) || null;
    const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();

    // Plafonds (le professeur, en Mode Prof, n'est pas limité)
    let quota = null;
    if (!prof) {
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
    logUsage({ module, action: (prefer_groq ? "leger" : "lourd") + ":" + result.provider, ip, visitor_id, eleve_nom });

    await flushQuota();
    return Response.json({ content: [{ type: "text", text: result.text }], quota });
  } catch (error) {
    await flushQuota();
    return Response.json({ error: error.message }, { status: 500 });
  }
}
