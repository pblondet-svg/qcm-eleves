export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, max_tokens = 2000 } = body;

    // Séparer le system prompt des autres messages
    const systemMessage = messages.find((m) => m.role === "system");
    const userMessages = messages.filter((m) => m.role !== "system");

    // Construire le corps de la requête pour Gemini
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        { error: JSON.stringify(data) },
        { status: 500 }
      );
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return Response.json({
      content: [{ type: "text", text }],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
