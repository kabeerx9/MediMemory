import type { TemporaryChatMessageInput, WorkspaceDetail } from "@health-conversation/contracts/health";
import { env } from "@health-conversation/env/server";

export const chatResponseService = {
  async answer(input: { workspace: WorkspaceDetail; message: string; messages?: TemporaryChatMessageInput[] }) {
    if (!env.OPENAI_API_KEY) {
      return "I received your message. OPENAI_API_KEY is not configured yet, so I cannot generate a full AI answer. I can still help organize this into memory using the review flow.";
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.OPENAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        input: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: buildPrompt(input.workspace, input.message, input.messages ?? []) },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error("OpenAI chat failed: " + body.slice(0, 800));
    }

    const json = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    return json.output_text ?? json.output?.flatMap((item) => item.content ?? []).map((part) => part.text ?? "").join("") ?? "I could not generate a response.";
  },
};

function systemPrompt() {
  return [
    "You are the chat interface for a personal longitudinal health memory app.",
    "You help organize health facts, summarize reports, prepare doctor questions, and review patterns.",
    "Do not present yourself as a doctor. Do not diagnose or make treatment decisions.",
    "When something sounds urgent, tell the user to contact a medical professional.",
    "Keep answers practical, factual, and grounded in the provided workspace context.",
  ].join("\n");
}

function buildPrompt(workspace: WorkspaceDetail, message: string, messages: TemporaryChatMessageInput[]) {
  return JSON.stringify({
    currentStatus: workspace.workspace,
    recentTimeline: workspace.timeline.slice(0, 8).map((entry) => ({ date: entry.entryDate, type: entry.entryType, title: entry.title, summary: entry.summary })),
    medications: workspace.medications.slice(0, 10).map((med) => ({ name: med.name, dose: med.dose, status: med.status, notes: med.notes })),
    symptoms: workspace.symptoms.slice(0, 10).map((symptom) => ({ name: symptom.name, severity: symptom.severity, pattern: symptom.pattern, notes: symptom.notes })),
    openDoctorQuestions: workspace.doctorQuestions.filter((question) => question.status === "open").slice(0, 10).map((question) => question.question),
    temporaryChatSoFar: messages.slice(-12).map((entry) => ({ role: entry.role, content: entry.content })),
    userMessage: message,
  });
}
