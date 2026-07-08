import Anthropic from "@anthropic-ai/sdk";

export function extractJsonObject(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object in model response");
  return JSON.parse(match[0]);
}

export async function claudeJson(opts: {
  client: Anthropic;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<unknown> {
  const response = await opts.client.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    },
    { timeout: opts.timeoutMs ?? 60000 }
  );
  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return extractJsonObject(content.text);
}
