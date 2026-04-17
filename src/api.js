// API key는 Amplify 환경변수에서 주입
// Amplify Console → App settings → Environment variables
// Key: VITE_ANTHROPIC_API_KEY  Value: sk-ant-...

const KEY   = import.meta.env.VITE_ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-20250514";
const URL   = "https://api.anthropic.com/v1/messages";

export async function claude(system, userMsg, maxTokens = 300) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.map((c) => c.text || "").join("").trim();
}
