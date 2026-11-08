const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function onRequestGet({ env }) {
  const limited = Boolean(env.PRISMA_RATE_DB?.prepare);
  return new Response(JSON.stringify({
    ok: true,
    mode: "central",
    protection: { d1RateLimiting: limited },
    providers: {
      gemini: limited && Boolean(env.GEMINI_API_KEY),
      huggingface: limited && Boolean(env.HF_TOKEN),
      groq: limited && Boolean(env.GROQ_API_KEY),
    },
    models: {
      gemini: env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
      huggingface: "openai/gpt-oss-20b:cheapest",
    },
  }), { status: 200, headers });
}
