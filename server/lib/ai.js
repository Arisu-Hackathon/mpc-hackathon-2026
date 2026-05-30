import dotenv from "dotenv";
dotenv.config();

const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function callGroq(prompt) {
  if (!GROQ_KEY) {
    throw new Error("GROQ_API_KEY is missing from .env");
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Groq API error ${response.status}: ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const raw = data.choices[0].message.content;

  const clean = raw.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    throw new Error(`Failed to parse Groq response as JSON: ${raw}`);
  }
}