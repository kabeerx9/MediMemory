import dotenv from "dotenv";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

dotenv.config({ path: "../../apps/server/.env" });

const seedEmail = process.env.SEED_USER_EMAIL;
const seedFile = process.env.PERSONAL_SEED_FILE;
const forceSeed = process.env.FORCE_PERSONAL_SEED === "true";

if (!seedEmail) throw new Error("SEED_USER_EMAIL is required");
if (!seedFile) throw new Error("PERSONAL_SEED_FILE is required");

const [{ db }, { user }, healthSchema] = await Promise.all([
  import("./index"),
  import("./schema/auth"),
  import("./schema/health"),
]);

const { doctorQuestions, healthSources, healthWorkspaces, medications, reportFiles, symptoms, timelineEntries } = healthSchema;

const [owner] = await db.select().from(user).where(eq(user.email, seedEmail)).limit(1);
if (!owner) throw new Error("No Better Auth user found for SEED_USER_EMAIL=" + seedEmail);

const raw = JSON.parse(fs.readFileSync(seedFile, "utf8")) as PersonalSeedData | CuratedSeedFile;

if ("workspaces" in raw && Array.isArray(raw.workspaces)) {
  await seedCurated(raw);
} else {
  await seedLegacyPapa(raw as PersonalSeedData);
}

async function seedCurated(file: CuratedSeedFile) {
  for (const workspace of file.workspaces) {
    const workspaceId = await upsertWorkspace(workspace);
    for (const batch of workspace.seedBatches) {
      const sourceTitle = batch.source.title;
      const [existingSource] = await db
        .select()
        .from(healthSources)
        .where(and(eq(healthSources.workspaceId, workspaceId), eq(healthSources.title, sourceTitle)))
        .limit(1);

      if (existingSource && !forceSeed) {
        console.log("Seed batch already exists:", workspace.name, "-", sourceTitle);
        continue;
      }

      const sourceId = randomUUID();
      await db.insert(healthSources).values({
        id: sourceId,
        workspaceId,
        type: batch.source.type ?? "seed",
        title: sourceTitle,
        content: batch.source.content ?? null,
        metadata: { ...(batch.source.metadata ?? {}), seedFile, seedVersion: file.seedVersion ?? null },
      });
      const sourceRefs = [{ sourceId }];

      for (const entry of batch.timeline ?? []) {
        await db.insert(timelineEntries).values({
          id: randomUUID(),
          workspaceId,
          entryDate: entry.entryDate,
          entryType: entry.entryType,
          title: entry.title,
          summary: entry.summary,
          details: entry.details ?? null,
          sourceRefs,
        });
      }

      for (const med of batch.medications ?? []) {
        await db.insert(medications).values({
          id: randomUUID(),
          workspaceId,
          name: med.name,
          dose: med.dose ?? null,
          status: med.status ?? "current",
          startDate: med.startDate ?? null,
          stopDate: med.stopDate ?? null,
          reasonStarted: med.reasonStarted ?? null,
          reasonStopped: med.reasonStopped ?? null,
          sideEffects: med.sideEffects ?? null,
          notes: med.notes ?? null,
          sourceRefs,
        });
      }

      for (const symptom of batch.symptoms ?? []) {
        await db.insert(symptoms).values({
          id: randomUUID(),
          workspaceId,
          name: symptom.name,
          startDate: symptom.startDate ?? null,
          severity: symptom.severity ?? null,
          pattern: symptom.pattern ?? null,
          possibleTrigger: symptom.possibleTrigger ?? null,
          relatedMedication: symptom.relatedMedication ?? null,
          notes: symptom.notes ?? null,
          sourceRefs,
        });
      }

      for (const report of batch.reports ?? []) {
        await db.insert(reportFiles).values({
          id: randomUUID(),
          workspaceId,
          filename: report.filename,
          reportType: report.reportType ?? null,
          reportDate: report.reportDate ?? null,
          textContent: report.textContent,
          summary: report.summary ?? null,
          sourceRefs,
        });
      }

      for (const question of batch.doctorQuestions ?? []) {
        await db.insert(doctorQuestions).values({
          id: randomUUID(),
          workspaceId,
          question: question.question,
          context: question.context ?? null,
          status: question.status ?? "open",
          answer: question.answer ?? null,
          sourceRefs,
        });
      }

      console.log("Seeded batch:", workspace.name, "-", sourceTitle);
    }
  }
}

async function upsertWorkspace(workspace: CuratedWorkspaceSeed) {
  const [existing] = await db
    .select()
    .from(healthWorkspaces)
    .where(and(eq(healthWorkspaces.ownerUserId, owner.id), eq(healthWorkspaces.name, workspace.name)))
    .limit(1);

  const values = {
    description: workspace.description ?? null,
    diagnosis: workspace.diagnosis ?? null,
    currentStatusSummary: workspace.currentStatusSummary ?? null,
    currentMedications: workspace.currentMedications ?? null,
    currentSymptoms: workspace.currentSymptoms ?? null,
    recentChanges: workspace.recentChanges ?? null,
    latestReports: workspace.latestReports ?? null,
    upcomingAppointments: workspace.upcomingAppointments ?? null,
    openQuestions: workspace.openQuestions ?? null,
  };

  if (existing) {
    await db.update(healthWorkspaces).set(values).where(eq(healthWorkspaces.id, existing.id));
    return existing.id;
  }

  const id = randomUUID();
  await db.insert(healthWorkspaces).values({ id, ownerUserId: owner.id, name: workspace.name, ...values });
  return id;
}

async function seedLegacyPapa(raw: PersonalSeedData) {
  const workspaceName = "Dad RCC Stage 4";
  const sourceTitle = "Curated Papa medical analysis import";
  const workspaceId = await upsertWorkspace({
    name: workspaceName,
    description: "Personal seeded workspace from curated ChatGPT medical-analysis export.",
    diagnosis: "Metastatic renal cell carcinoma history with RCC recurrence confirmed from pubic mass biopsy; bladder tumor history under surveillance.",
    currentStatusSummary: "On pembrolizumab plus axitinib after pelvic radiation. First follow-up PET showed significant reduction in size and FDG avidity in all sites with no new lesions, based on curated export data.",
    currentMedications: "Pembrolizumab ongoing. Axitinib started 5 mg twice daily and later reduced to 5 mg once daily after hand-foot symptoms. Verify latest prescription.",
    currentSymptoms: "Historically tracked cough, pelvic/hip pain, appetite changes, weight changes, hand-foot symptoms, sinus/allergy symptoms, and mild bowel changes.",
    recentChanges: "Weight recovered from a low around 71 kg to 75.8 kg by PET day; cough and pain were reported improved around later cycles.",
    latestReports: "Follow-up PET after fourth cycle: significant response; lung target non-FDG avid; bone/nodal SUV markedly reduced; no new lesions described.",
    openQuestions: "Confirm next scan timing, ongoing axitinib dose strategy, fracture precautions, iron support, PSA follow-up, and symptom thresholds requiring urgent contact.",
  });

  const [existingSeedSource] = await db
    .select()
    .from(healthSources)
    .where(and(eq(healthSources.workspaceId, workspaceId), eq(healthSources.title, sourceTitle)))
    .limit(1);

  if (existingSeedSource && !forceSeed) {
    console.log("Personal seed already exists for", workspaceName, "and", seedEmail);
    return;
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

  for (const event of raw.patient_context?.major_history ?? []) {
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
    { id: randomUUID(), workspaceId, name: "Pembrolizumab / Keytruda", dose: "200 mg infusion; schedule per oncology plan", status: "current", startDate: "2026-01-20", reasonStarted: "Systemic treatment for metastatic RCC.", notes: "Seeded from curated timeline; verify current dose/schedule against prescription.", sourceRefs: refs },
    { id: randomUUID(), workspaceId, name: "Axitinib", dose: "Started 5 mg twice daily; reduced to 5 mg once daily after hand-foot symptoms", status: "current", startDate: "2026-01-21", reasonStarted: "Targeted therapy combined with pembrolizumab for metastatic RCC.", sideEffects: "Hand-foot burning/redness/blister led to dose reduction in the curated export.", notes: "Verify latest dose with current prescription.", sourceRefs: refs },
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
}

type CuratedSeedFile = { seedVersion?: string; workspaces: CuratedWorkspaceSeed[] };
type CuratedWorkspaceSeed = {
  name: string;
  description?: string | null;
  diagnosis?: string | null;
  currentStatusSummary?: string | null;
  currentMedications?: string | null;
  currentSymptoms?: string | null;
  recentChanges?: string | null;
  latestReports?: string | null;
  upcomingAppointments?: string | null;
  openQuestions?: string | null;
  seedBatches: CuratedSeedBatch[];
};
type CuratedSeedBatch = {
  source: { title: string; type?: string; content?: string | null; metadata?: Record<string, unknown> | null };
  timeline?: Array<{ entryDate: string; entryType: string; title: string; summary: string; details?: string | null }>;
  medications?: Array<{ name: string; dose?: string | null; status?: string; startDate?: string | null; stopDate?: string | null; reasonStarted?: string | null; reasonStopped?: string | null; sideEffects?: string | null; notes?: string | null }>;
  symptoms?: Array<{ name: string; startDate?: string | null; severity?: string | null; pattern?: string | null; possibleTrigger?: string | null; relatedMedication?: string | null; notes?: string | null }>;
  reports?: Array<{ filename: string; reportType?: string | null; reportDate?: string | null; textContent: string; summary?: string | null }>;
  doctorQuestions?: Array<{ question: string; context?: string | null; status?: string; answer?: string | null }>;
};
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
