const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    ok: true,
    mode: "central",
    providers: {
      gemini: Boolean(env.GEMINI_API_KEY),
      huggingface: Boolean(env.HF_TOKEN),
      groq: Boolean(env.GROQ_API_KEY),
    },
    models: {
      gemini: env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
    },
  }), { status: 200, headers });
}
