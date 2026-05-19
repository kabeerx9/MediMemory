import { extractedMemoryProposalSchema, type ExtractedMemoryProposal, type WorkspaceDetail } from "@health-conversation/contracts/health";
import { env } from "@health-conversation/env/server";

const proposalJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    shouldSave: { type: "boolean" },
    proposalType: { type: "string" },
    date: { type: ["string", "null"] },
    title: { type: "string" },
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          targetType: { type: "string", enum: ["timeline", "symptom", "medication", "doctor_question", "report", "current_status"] },
          operation: { type: "string", enum: ["create", "update"] },
          payload: { type: "object", additionalProperties: true },
          sourceExcerpt: { type: ["string", "null"] },
          confidence: { type: ["number", "null"] },
        },
        required: ["targetType", "operation", "payload", "sourceExcerpt", "confidence"],
      },
    },
    missingDetails: { type: "array", items: { type: "string" } },
    doctorQuestions: { type: "array", items: { type: "string" } },
    currentStatusPatch: { type: ["object", "null"], additionalProperties: true },
  },
  required: ["shouldSave", "proposalType", "date", "title", "summary", "items", "missingDetails", "doctorQuestions", "currentStatusPatch"],
};

export const memoryExtractionService = {
  async extractFromText(input: { workspace: WorkspaceDetail; sourceTitle: string; text: string }): Promise<ExtractedMemoryProposal> {
    if (!env.OPENAI_API_KEY) {
      return fallbackProposal(input.sourceTitle, input.text);
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
          { role: "user", content: buildUserPrompt(input.workspace, input.text) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "health_memory_proposal",
            schema: proposalJsonSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error("OpenAI extraction failed: " + body.slice(0, 800));
    }

    const json = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const text = json.output_text ?? json.output?.flatMap((item) => item.content ?? []).map((part) => part.text ?? "").join("") ?? "";
    return extractedMemoryProposalSchema.parse(JSON.parse(text));
  },
};

function systemPrompt() {
  return [
    "You extract curated permanent memory for a personal health-history app.",
    "You are not a doctor and must not diagnose or recommend treatment.",
    "Save only confirmed health facts, dates, medication changes, symptoms, report findings, doctor questions, and missing details.",
    "Do not save anxiety, speculation, generic medical explanations, or duplicate questions.",
    "Use source-backed, short, editable updates. If the content has no durable health facts, set shouldSave=false and return no items.",
    "Payloads must use simple keys that match the target type, for example timeline: entryDate, entryType, title, summary, details; symptom: name, startDate, severity, pattern, notes; medication: name, dose, status, startDate, stopDate, sideEffects, notes; doctor_question: question, context; report: filename, reportType, reportDate, textContent, summary; current_status: currentStatusSummary, currentMedications, currentSymptoms, recentChanges, latestReports, upcomingAppointments, openQuestions.",
  ].join("\n");
}

function buildUserPrompt(workspace: WorkspaceDetail, text: string) {
  return JSON.stringify({
    workspace: {
      name: workspace.workspace.name,
      diagnosis: workspace.workspace.diagnosis,
      currentStatusSummary: workspace.workspace.currentStatusSummary,
      currentMedications: workspace.workspace.currentMedications,
      currentSymptoms: workspace.workspace.currentSymptoms,
      recentChanges: workspace.workspace.recentChanges,
      latestReports: workspace.workspace.latestReports,
      openQuestions: workspace.workspace.openQuestions,
    },
    recentMemory: {
      timeline: workspace.timeline.slice(0, 8).map((entry) => ({ date: entry.entryDate, title: entry.title, summary: entry.summary })),
      medications: workspace.medications.slice(0, 8).map((med) => ({ name: med.name, dose: med.dose, status: med.status })),
      symptoms: workspace.symptoms.slice(0, 8).map((symptom) => ({ name: symptom.name, severity: symptom.severity, notes: symptom.notes })),
    },
    contentToExtract: text,
  });
}

function fallbackProposal(sourceTitle: string, text: string): ExtractedMemoryProposal {
  const clean = text.replace(/s+/g, " ").trim();
  const summary = clean.length > 450 ? clean.slice(0, 447) + "..." : clean;
  return {
    shouldSave: true,
    proposalType: "manual_review_needed",
    date: new Date().toISOString().slice(0, 10),
    title: sourceTitle || "Health update for review",
    summary: summary || "Imported health update requires review.",
    items: [
      {
        targetType: "timeline",
        operation: "create",
        payload: {
          entryDate: new Date().toISOString().slice(0, 10),
          entryType: "note",
          title: sourceTitle || "Health update for review",
          summary: summary || "Imported health update requires review.",
          details: clean,
        },
        sourceExcerpt: clean.slice(0, 1000),
        confidence: 0.35,
      },
    ],
    missingDetails: ["OPENAI_API_KEY is not configured; review extraction manually."],
    doctorQuestions: [],
    currentStatusPatch: null,
  };
}
