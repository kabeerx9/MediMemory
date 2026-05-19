import "dotenv/config";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "./index";
import { user } from "./schema/auth";
import { doctorQuestions, healthSources, healthWorkspaces, medications, reportFiles, symptoms, timelineEntries } from "./schema/health";

const seedEmail = process.env.SEED_USER_EMAIL;
const seedFile = process.env.PERSONAL_SEED_FILE;

if (!seedEmail) {
  throw new Error("SEED_USER_EMAIL is required");
}
if (!seedFile) {
  throw new Error("PERSONAL_SEED_FILE is required");
}

const [owner] = await db.select().from(user).where(eq(user.email, seedEmail)).limit(1);
if (!owner) {
  throw new Error("No Better Auth user found for SEED_USER_EMAIL=" + seedEmail);
}

const raw = JSON.parse(fs.readFileSync(seedFile, "utf8")) as PersonalSeedData;
const workspaceName = "Dad RCC Stage 4";
const sourceTitle = "Curated Papa medical analysis import";

const [existingWorkspace] = await db
  .select()
  .from(healthWorkspaces)
  .where(eq(healthWorkspaces.ownerUserId, owner.id));

const workspaceId = existingWorkspace?.name === workspaceName ? existingWorkspace.id : randomUUID();

if (!existingWorkspace || existingWorkspace.name !== workspaceName) {
  await db.insert(healthWorkspaces).values({
    id: workspaceId,
    ownerUserId: owner.id,
    name: workspaceName,
    description: "Personal seeded workspace from curated ChatGPT medical-analysis export.",
    diagnosis: "Metastatic renal cell carcinoma history with RCC recurrence confirmed from pubic mass biopsy; bladder tumor history under surveillance.",
    currentStatusSummary: "On pembrolizumab plus axitinib after pelvic radiation. First follow-up PET showed significant reduction in size and FDG avidity with no new lesions, based on curated export data.",
    currentMedications: "Pembrolizumab ongoing. Axitinib started 5 mg twice daily and later reduced to 5 mg once daily after hand-foot symptoms. Other medicines should be verified from current prescription.",
    currentSymptoms: "Historically tracked cough, pelvic/hip pain, appetite changes, weight changes, hand-foot symptoms, sinus/allergy symptoms, and mild bowel changes.",
    recentChanges: "Weight recovered from a low around 71 kg to 75.8 kg by PET day; cough and pain were reported improved around later cycles.",
    latestReports: "Follow-up PET after fourth cycle: significant response; lung target non-FDG avid; bone/nodal SUV markedly reduced; no new lesions described.",
    openQuestions: "Confirm next scan timing, ongoing axitinib dose strategy, fracture precautions, iron support, PSA follow-up, and symptom thresholds requiring urgent contact.",
  });
}

const [existingSeedSource] = await db
  .select()
  .from(healthSources)
  .where(and(eq(healthSources.workspaceId, workspaceId), eq(healthSources.title, sourceTitle)))
  .limit(1);

if (existingSeedSource && process.env.FORCE_PERSONAL_SEED !== "true") {
  console.log("Personal seed already exists for", workspaceName, "and", seedEmail);
  process.exit(0);
}

const sourceId = randomUUID();
await db.insert(healthSources).values({
  id: sourceId,
  workspaceId,
  type: "seed",
  title: sourceTitle,
  content: JSON.stringify({ generated_from: raw.generated_from, objective_trends: raw.objective_trends }, null, 2),
  metadata: { seedFile },
});
const refs = [{ sourceId }];

const history = raw.patient_context?.major_history ?? [];
for (const event of history) {
  await db.insert(timelineEntries).values({
    id: randomUUID(),
    workspaceId,
    entryDate: event.date,
    entryType: inferEntryType(event.event),
    title: event.event,
    summary: event.details ?? event.event,
    details: event.details ?? null,
    sourceRefs: refs,
  });
}

await db.insert(medications).values([
  {
    id: randomUUID(),
    workspaceId,
    name: "Pembrolizumab / Keytruda",
    dose: "200 mg infusion; schedule per oncology plan",
    status: "current",
    startDate: "2026-01-20",
    reasonStarted: "Systemic treatment for metastatic RCC.",
    notes: "Seeded from curated timeline; verify current dose/schedule against prescription.",
    sourceRefs: refs,
  },
  {
    id: randomUUID(),
    workspaceId,
    name: "Axitinib",
    dose: "Started 5 mg twice daily; reduced to 5 mg once daily after hand-foot symptoms",
    status: "current",
    startDate: "2026-01-21",
    reasonStarted: "Targeted therapy combined with pembrolizumab for metastatic RCC.",
    sideEffects: "Hand-foot burning/redness/blister led to dose reduction in the curated export.",
    notes: "Verify latest dose with current prescription.",
    sourceRefs: refs,
  },
]);

await db.insert(symptoms).values([
  { id: randomUUID(), workspaceId, name: "Pelvic/hip bone pain", startDate: "2025-12", severity: "variable", pattern: "Pain related to pelvic bone lesion/fracture area; later reported improved", notes: "Seeded from curated export; monitor functional impact and weight-bearing issues.", sourceRefs: refs },
  { id: randomUUID(), workspaceId, name: "Cough", startDate: "2025-10", severity: "variable", pattern: "Present before treatment; later no coughing reported around sixth-dose update", notes: "Tracked because lung lesions were present on baseline PET.", sourceRefs: refs },
  { id: randomUUID(), workspaceId, name: "Hand-foot symptoms", startDate: "2026-03", severity: "mild-moderate", pattern: "Burning/redness/blister in fingers after axitinib", relatedMedication: "Axitinib", notes: "Led to axitinib dose reduction.", sourceRefs: refs },
  { id: randomUUID(), workspaceId, name: "Weight change", startDate: "2025-12", severity: "tracking", pattern: "Approx 80 kg to 71 kg, then up to 75.8 kg by PET day", notes: "Use trend rather than single-day weight.", sourceRefs: refs },
]);

const imaging = raw.imaging_response;
await db.insert(reportFiles).values({
  id: randomUUID(),
  workspaceId,
  filename: "Curated PET response summary.json",
  reportType: "PET response summary",
  reportDate: imaging?.followup_scan_date ?? "2026-04-18",
  textContent: JSON.stringify(imaging, null, 2),
  summary: imaging?.overall_followup_report_phrase ?? "Follow-up PET response summary from curated export.",
  sourceRefs: refs,
});

for (const lab of raw.lab_trends ?? []) {
  await db.insert(timelineEntries).values({
    id: randomUUID(),
    workspaceId,
    entryDate: lab.date,
    entryType: "lab_result",
    title: "Lab update - " + lab.context,
    summary: summarizeLab(lab),
    details: JSON.stringify(lab, null, 2),
    sourceRefs: refs,
  });
}

await db.insert(doctorQuestions).values([
  { id: randomUUID(), workspaceId, question: "What is the next scan timing and what response pattern are we watching for?", context: "After strong first follow-up PET response.", status: "open", sourceRefs: refs },
  { id: randomUUID(), workspaceId, question: "Should axitinib remain once daily or be adjusted later if side effects improve?", context: "Axitinib dose was reduced after hand-foot symptoms.", status: "open", sourceRefs: refs },
  { id: randomUUID(), workspaceId, question: "Does the non-FDG avid pubic ramus fracture need any activity restriction or orthopedic follow-up?", context: "Follow-up PET mentioned fracture with callus formation.", status: "open", sourceRefs: refs },
  { id: randomUUID(), workspaceId, question: "Should iron deficiency pattern be treated with supplements or diet changes?", context: "March 16 iron and transferrin saturation were low.", status: "open", sourceRefs: refs },
]);

console.log("Seeded workspace", workspaceName, "for", seedEmail);

type PersonalSeedData = {
  generated_from?: unknown;
  patient_context?: { major_history?: Array<{ date: string; event: string; details?: string }> };
  imaging_response?: { followup_scan_date?: string; overall_followup_report_phrase?: string };
  lab_trends?: Array<Record<string, unknown> & { date: string; context?: string }>;
  objective_trends?: unknown;
};

function inferEntryType(event: string) {
  const lower = event.toLowerCase();
  if (lower.includes("pet") || lower.includes("mri") || lower.includes("report")) return "report";
  if (lower.includes("biopsy") || lower.includes("diagnosis")) return "diagnosis_update";
  if (lower.includes("radiation") || lower.includes("cycle") || lower.includes("pembrolizumab") || lower.includes("axitinib")) return "treatment";
  if (lower.includes("cystoscopy") || lower.includes("turbt") || lower.includes("nephrectomy")) return "doctor_visit";
  return "note";
}

function summarizeLab(lab: Record<string, unknown>) {
  const parts = [
    lab.hemoglobin_g_dl ? "Hb " + lab.hemoglobin_g_dl + " g/dL" : null,
    lab.creatinine_mg_dl ? "Cr " + lab.creatinine_mg_dl + " mg/dL" : null,
    lab.potassium_mmol_l ? "K " + lab.potassium_mmol_l + " mmol/L" : null,
    lab.hba1c_percent ? "HbA1c " + lab.hba1c_percent + "%" : null,
    lab.triglycerides_mg_dl ? "TG " + lab.triglycerides_mg_dl + " mg/dL" : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : String(lab.context ?? "Lab values imported from curated export.");
}
