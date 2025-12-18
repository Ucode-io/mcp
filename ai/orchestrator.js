import { buildSystemPrompt } from "./prompt.js";
import { callLLM } from "./llm.js";

export async function generateUI({ prompt }) {
  const systemPrompt = buildSystemPrompt();

  const raw = await callLLM({
    system: systemPrompt,
    user: prompt
  });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error("LLM returned invalid JSON");
  }

  return parsed;
}
