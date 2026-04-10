// Modèles utilisés
const GROQ_MODEL = "llama-3.1-8b-instant";
const GOOGLE_MODEL = "gemini-2.5-flash";

// Appel Groq
async function callGroq(messages, max_tokens) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens,
      temperature: 0.7,
    }),
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
    generationConfig: {
      maxOutputTokens: max_tokens,
      temperature: 0.7,
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Erreur Google");
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, max_tokens = 2000, prefer_groq = false } = body;

    let text = "";

    if (prefer_groq) {
      // Essayer Groq en premier, fallback Google si erreur
      try {
        text = await callGroq(messages, max_tokens);
      } catch (groqError) {
        console.warn("Groq failed, falling back to Google:", groqError.message);
        text = await callGoogle(messages, max_tokens);
      }
    } else {
      // Google en priorité pour les requêtes lourdes
      try {
        text = await callGoogle(messages, max_tokens);
      } catch (googleError) {
        console.warn("Google failed, falling back to Groq:", googleError.message);
        text = await callGroq(messages, max_tokens);
      }
    }

    return Response.json({
      content: [{ type: "text", text }],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
