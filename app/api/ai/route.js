import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const GROQ_MODEL = "llama-3.1-8b-instant";
const GOOGLE_MODEL = "gemini-2.5-flash";
const MISTRAL_MODEL = "mistral-small-latest";
const CEREBRAS_MODEL = "llama-3.3-70b";

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
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Erreur Groq");
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

// Appel Google Gemini
async function callGoogle(messages, max_tokens) {
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
    generationConfig: { maxOutputTokens: max_tokens, temperature: 0.7 },
  };
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(geminiBody) }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Erreur Google");
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Erreur Mistral");
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

// Cascade de fallback
async function callWithFallback(providers, messages, max_tokens) {
  for (const provider of providers) {
    try {
      return await provider(messages, max_tokens);
    } catch (err) {
      console.warn(`Provider failed: ${err.message}, trying next...`);
    }
  }
  throw new Error("Tous les providers ont échoué");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, max_tokens = 2000, prefer_groq = false, module = "inconnu" } = body;

    let text = "";

    if (prefer_groq) {
      // Requêtes légères : Groq → Cerebras → Google → Mistral
      text = await callWithFallback(
        [callGroq, callCerebras, callGoogle, callMistral],
        messages, max_tokens
      );
    } else {
      // Requêtes lourdes : Google → Cerebras → Groq → Mistral
      text = await callWithFallback(
        [callGoogle, callCerebras, callGroq, callMistral],
        messages, max_tokens
      );
    }

    // Logger l'usage dans Supabase (sans bloquer la réponse)
    supabase.from("usage_stats").insert([{
      module,
      action: prefer_groq ? "leger" : "lourd",
      ip: request.headers.get("x-forwarded-for") || "unknown"
    }]).then(() => {}).catch(() => {});

    return Response.json({ content: [{ type: "text", text }] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
