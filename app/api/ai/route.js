import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, max_tokens = 4000 } = body;
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens,
      temperature: 0.7,
    });
    return Response.json({
      content: [{ type: "text", text: completion.choices[0].message.content }]
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
