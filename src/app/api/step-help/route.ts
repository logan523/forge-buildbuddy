import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkApiGuards, clientIp } from "@/lib/api-guards";

/**
 * "Ask about this step" (E2) — answers a beginner's free-text question using
 * ONLY the derived facts the screen already shows, so the answer can never
 * disagree with the ConnectionsTable. Fail-closed everywhere: any failure
 * returns a friendly message steering back to the offline symptom menu.
 */

interface StepHelpBody {
  question: string;
  stepTitle?: string;
  stepGoal?: string;
  connections?: {
    colorName?: string;
    fromLabel?: string;
    fromPin?: string;
    toLabel?: string;
    toPin?: string;
    netName?: string;
  }[];
  checks?: { instruction?: string; expected?: string }[];
  partsDigest?: string;
}

const FAIL_CLOSED =
  "The helper isn't available right now — try the “I'm stuck” symptom menu, which works offline.";

const SYSTEM = `You are Forge's build helper for COMPLETE beginners (they don't know what a pull-up resistor is).
Rules:
- Answer the question in ≤150 words of plain, warm English. No markdown headings.
- Pins and wire colors: use ONLY the DERIVED CONNECTIONS provided — quote pin labels and colors verbatim from them. Never invent a pin, color, or physical pin position ("leftmost pin").
- If the answer isn't derivable from the provided facts, say so honestly and suggest the "I'm stuck" menu or re-checking the connections table.
- Safety first: never suggest bypassing protection circuits, working powered, or removing a Li-ion cell's wrap.`;

export interface StepHelpResult {
  status: number;
  body: { answer: string } | { error: string; fallback: "unstick" };
}

/** Core handler — dependency-injected completion fn so contract tests run without the SDK. */
export async function handleStepHelp(
  raw: unknown,
  ip: string,
  complete: (system: string, user: string) => Promise<string>
): Promise<StepHelpResult> {
  const body = raw as StepHelpBody | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return { status: 400, body: { error: "Ask a question about this step.", fallback: "unstick" } };
  }
  if (question.length > 500) {
    return {
      status: 413,
      body: { error: "Keep the question under 500 characters.", fallback: "unstick" },
    };
  }

  const connections = (Array.isArray(body?.connections) ? body!.connections! : [])
    .slice(0, 40)
    .map(
      (c) =>
        `${String(c.colorName ?? "").slice(0, 12)} wire: ${String(c.fromLabel ?? "").slice(0, 40)} pin ${String(c.fromPin ?? "").slice(0, 12)} → ${String(c.toLabel ?? "").slice(0, 40)} pin ${String(c.toPin ?? "").slice(0, 12)} (net ${String(c.netName ?? "").slice(0, 20)})`
    );
  const checks = (Array.isArray(body?.checks) ? body!.checks! : [])
    .slice(0, 10)
    .map((c) => `${String(c.instruction ?? "").slice(0, 120)} → ${String(c.expected ?? "").slice(0, 40)}`);

  const user = [
    `CURRENT STEP: ${String(body?.stepTitle ?? "").slice(0, 120)}`,
    body?.stepGoal ? `GOAL: ${String(body.stepGoal).slice(0, 200)}` : "",
    connections.length ? `DERIVED CONNECTIONS (the only pin/color truth):\n${connections.join("\n")}` : "DERIVED CONNECTIONS: none for this step.",
    checks.length ? `CHECKS:\n${checks.join("\n")}` : "",
    body?.partsDigest ? `PARTS: ${String(body.partsDigest).slice(0, 400)}` : "",
    `QUESTION: ${question}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const guard = checkApiGuards("step-help", ip, user.length);
  if (!guard.ok) {
    return { status: guard.status, body: { error: guard.message, fallback: "unstick" } };
  }

  try {
    const answer = (await complete(SYSTEM, user)).trim();
    if (!answer) {
      return { status: 502, body: { error: FAIL_CLOSED, fallback: "unstick" } };
    }
    return { status: 200, body: { answer } };
  } catch {
    return { status: 502, body: { error: FAIL_CLOSED, fallback: "unstick" } };
  }
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body.", fallback: "unstick" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: FAIL_CLOSED, fallback: "unstick" }, { status: 503 });
  }
  const client = new Anthropic({ apiKey });

  const result = await handleStepHelp(raw, clientIp(request), async (system, user) => {
    const response = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        temperature: 0.2,
        system,
        messages: [{ role: "user", content: user }],
      },
      { timeout: 30_000 }
    );
    const content = response.content[0];
    return content?.type === "text" ? content.text : "";
  });

  return NextResponse.json(result.body, { status: result.status });
}
