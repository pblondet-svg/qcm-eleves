import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Laisse le temps aux réponses « réfléchies » (deep) de se terminer sur Vercel
export const maxDuration = 60;

const GROQ_MODEL = "llama-3.1-8b-instant";
const GOOGLE_MODEL = "gemini-2.5-flash";
// Quota gratuit séparé et plus large : prend le relais quand Flash est épuisé
const GOOGLE_LITE_MODEL = "gemini-2.5-flash-lite";
const MISTRAL_MODEL = "mistral-small-latest";
const CEREBRAS_MODEL = "llama-3.3-70b";

// ── Quotas : on garde les en-têtes « x-ratelimit-* » renvoyés par les fournisseurs ──
// (Groq, Cerebras et Mistral indiquent ce qu'il reste ; Google ne le fait pas).
// Instantané enregistré dans config.ai_quota, au plus une fois par minute et par instance.
let quotaCache = {};
let lastQuotaWrite = 0;
function captureLimits(provider, headers) {
  const h = {};
  headers.forEach((v, k) => { if (k.toLowerCase().includes("ratelimit")) h[k.toLowerCase()] = v; });
  if (Object.keys(h).length) quotaCache[provider] = { headers: h, at: new Date().toISOString() };
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

// Appel Groq
async function callGroq(messages, max_tokens) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens, temperature: 0.7 }),
  });
  captureLimits("groq", response.headers);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Erreur Groq");
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

// Appel Google Gemini
async function callGoogle(messages, max_tokens, deep = false, model = GOOGLE_MODEL) {
  const systemMessage = messages.find((m) => m.role === "system");
  const userMessages = messages.filter((m) => m.role !== "system");
  const geminiBody = {
    system_instruction: systemMessage
      ? { parts: [{ text: systemMessage.content }] }
      : undefined,
    contents: userMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    // Par défaut, thinkingBudget: 0 : Gemini 2.5 ne « réfléchit » pas en silence (sinon cette
    // réflexion consomme les max_tokens et la réponse arrive vide ou coupée).
    // deep = true : on lui laisse un temps de réflexion, ajouté en plus de la longueur de réponse.
    generationConfig: {
      maxOutputTokens: deep ? max_tokens + 3000 : max_tokens,
      temperature: deep ? 0.5 : 0.7,
      thinkingConfig: { thinkingBudget: deep ? 3000 : 0 },
    },
  };
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Erreur Google");
  }
  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text.trim()) throw new Error("Réponse Google vide");
  return text;
}

// Appel Cerebras
async function callCerebras(messages, max_tokens) {
  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({ model: CEREBRAS_MODEL, messages, max_tokens, temperature: 0.7 }),
  });
  captureLimits("cerebras", response.headers);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Erreur Cerebras");
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

// Appel Mistral
async function callMistral(messages, max_tokens) {
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({ model: MISTRAL_MODEL, messages, max_tokens, temperature: 0.7 }),
  });
  captureLimits("mistral", response.headers);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Erreur Mistral");
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

// Cascade de fallback
const callGoogleLite = (messages, max_tokens, deep = false) => callGoogle(messages, max_tokens, deep, GOOGLE_LITE_MODEL);
const PROVIDER_NAMES = new Map([[callGroq, "groq"], [callGoogle, "google"], [callGoogleLite, "google-lite"], [callCerebras, "cerebras"], [callMistral, "mistral"]]);
async function callWithFallback(providers, messages, max_tokens, deep = false) {
  for (const provider of providers) {
    try {
      const text = await provider(messages, max_tokens, deep);
      return { text, provider: PROVIDER_NAMES.get(provider) || "inconnu" };
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

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, max_tokens = 2000, prefer_groq = false, module = "inconnu", visitor_id = "unknown", deep = false, prof = false } = body;
    const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();

    // Plafonds (le professeur, en Mode Prof, n'est pas limité)
    if (!prof) {
      const lim = await getLimites();
      const [parEleve, parConnexion] = await Promise.all([
        lim.par_eleve > 0 && visitor_id !== "unknown" ? compteDuJour("visitor_id", visitor_id) : 0,
        lim.par_connexion > 0 && ip !== "unknown" ? compteDuJour("ip", ip) : 0,
      ]);
      if ((lim.par_eleve > 0 && parEleve >= lim.par_eleve) || (lim.par_connexion > 0 && parConnexion >= lim.par_connexion)) {
        supabase.from("usage_stats").insert([{ module, action: "limite", ip, visitor_id }]).then(() => {}).catch(() => {});
        return Response.json({
          limite: true,
          content: [{ type: "text", text: "Tu as atteint la limite de réponses de l'IA pour aujourd'hui. Reviens demain, ou relis ton cours et les fiches méthode en attendant !" }],
        }, { status: 429 });
      }
    }

    let result = { text: "", provider: "inconnu" };

    if (prefer_groq) {
      // Requêtes légères : Groq → Cerebras → Google Flash-Lite → Google Flash → Mistral
      result = await callWithFallback(
        [callGroq, callCerebras, callGoogleLite, callGoogle, callMistral],
        messages, max_tokens
      );
    } else {
      // Requêtes lourdes : Google Flash → Google Flash-Lite → Mistral → Cerebras → Groq
      // (Mistral avant Cerebras et Groq : il accepte des requêtes plus longues)
      result = await callWithFallback(
        [callGoogle, callGoogleLite, callMistral, callCerebras, callGroq],
        messages, max_tokens, !!deep
      );
    }

    // Logger l'usage dans Supabase (sans bloquer la réponse)
    // action = « leger:groq », « lourd:google »… : on sait quel modèle a répondu
    supabase.from("usage_stats").insert([{
      module,
      action: (prefer_groq ? "leger" : "lourd") + ":" + result.provider,
      ip,
      visitor_id
    }]).then(() => {}).catch(() => {});

    await flushQuota();
    return Response.json({ content: [{ type: "text", text: result.text }] });
  } catch (error) {
    await flushQuota();
    return Response.json({ error: error.message }, { status: 500 });
  }
}
