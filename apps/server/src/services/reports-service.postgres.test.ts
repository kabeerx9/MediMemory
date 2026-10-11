import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { db } from "@caretalk/db";
import { user } from "@caretalk/db/schema/auth";
import { sourceFiles, uploadLinks, workspaces } from "@caretalk/db/schema/health";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createLocalFileStore, type FileStore } from "../lib/file-store";
import { HttpError } from "../lib/http-error";
import { reportsRepository } from "../repositories/reports-repository";
import { createReportsService } from "./reports-service";

// Upload links are the one unauthenticated write into the system, so their
// failure modes get real-database coverage: single use under concurrency,
// expiry, a bad file not burning the link, and storage failure releasing it.
//
//   RUN_DB_TESTS=1 pnpm -F server test
const enabled = process.env.RUN_DB_TESTS === "1";
const describeDb = enabled ? describe : describe.skip;

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const HTML = Buffer.from("<!doctype html><script>alert(1)</script>");
const ownerId = `test-user-${randomUUID()}`;
const strangerId = `test-user-${randomUUID()}`;
const workspaceId = `test-ws-${randomUUID()}`;

const tokenFrom = (url: string) => url.split("/upload/")[1] ?? "";

async function expectHttpError(promise: Promise<unknown>, status: number) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).statusCode).toBe(status);
}

describeDb("reports service against Postgres", () => {
  let root: string;
  let store: FileStore;
  let service: ReturnType<typeof createReportsService>;
  let reportId: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "caretalk-files-"));
    store = createLocalFileStore(root);
    service = createReportsService(store);
    const now = new Date();
    await db.insert(user).values([
      { id: ownerId, name: "Owner", email: `${ownerId}@example.test`, emailVerified: false, createdAt: now, updatedAt: now },
      { id: strangerId, name: "Stranger", email: `${strangerId}@example.test`, emailVerified: false, createdAt: now, updatedAt: now },
    ]);
    await db.insert(workspaces).values({ id: workspaceId, ownerUserId: ownerId, name: "Dad" });
    reportId = (await reportsRepository.createReportSource(workspaceId, { title: "CT abdomen", client: null })).id;
  });

  afterAll(async () => {
    await db.delete(user).where(inArray(user.id, [ownerId, strangerId]));
    await rm(root, { recursive: true, force: true });
  });

  it("describes a fresh link without leaking more than the page needs", async () => {
    const link = await service.createUploadLink(workspaceId, reportId, "https://caretalk.example");
    expect(link.url).toMatch(/^https:\/\/caretalk\.example\/upload\/[A-Za-z0-9_-]{43}$/);
    const info = await service.getUploadLinkInfo(tokenFrom(link.url));
    expect(info).toMatchObject({ status: "ready", reportTitle: "CT abdomen", workspaceName: "Dad" });
  });

  it("stores only the token hash", async () => {
    const link = await service.createUploadLink(workspaceId, reportId, "https://caretalk.example");
    const rows = await db.select().from(uploadLinks).where(eq(uploadLinks.sourceId, reportId));
    expect(rows.map((row) => row.tokenHash)).not.toContain(tokenFrom(link.url));
  });

  it("accepts exactly one of two concurrent uploads on the same link", async () => {
    const link = await service.createUploadLink(workspaceId, reportId, "https://caretalk.example");
    const token = tokenFrom(link.url);
    const results = await Promise.allSettled([
      service.uploadWithLink(token, PDF, "scan.pdf"),
      service.uploadWithLink(token, PDF, "scan.pdf"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as HttpError).statusCode).toBe(410);
    expect((await service.getUploadLinkInfo(token)).status).toBe("used");
  });

  it("rejects a disguised file without spending the link", async () => {
    const link = await service.createUploadLink(workspaceId, reportId, "https://caretalk.example");
    const token = tokenFrom(link.url);
    await expectHttpError(service.uploadWithLink(token, HTML, "report.pdf"), 415);
    expect((await service.getUploadLinkInfo(token)).status).toBe("ready");
    const stored = await service.uploadWithLink(token, PDF, "report.pdf");
    expect(stored.mediaType).toBe("application/pdf");
  });

  it("refuses an expired link", async () => {
    const link = await service.createUploadLink(workspaceId, reportId, "https://caretalk.example", new Date(Date.now() - 60 * 60 * 1000));
    const token = tokenFrom(link.url);
    expect((await service.getUploadLinkInfo(token)).status).toBe("expired");
    await expectHttpError(service.uploadWithLink(token, PDF, "late.pdf"), 410);
  });

  it("404s an unknown token", async () => {
    await expectHttpError(service.getUploadLinkInfo("not-a-real-token-but-long-enough"), 404);
    await expectHttpError(service.uploadWithLink("not-a-real-token-but-long-enough", PDF, "x.pdf"), 404);
  });

  it("releases the link when storage fails after the claim", async () => {
    const failing = createReportsService({
      put: async () => {
        throw new Error("disk full");
      },
      read: store.read,
      remove: store.remove,
    });
    const link = await failing.createUploadLink(workspaceId, reportId, "https://caretalk.example");
    const token = tokenFrom(link.url);
    await expect(failing.uploadWithLink(token, PDF, "x.pdf")).rejects.toThrow("disk full");
    expect((await failing.getUploadLinkInfo(token)).status).toBe("ready");
  });

  it("keeps files readable by the owner only", async () => {
    const file = await service.attachFile(ownerId, workspaceId, reportId, PDF, "kft.pdf");
    const { bytes } = await service.readFile(ownerId, workspaceId, file.id);
    expect(Buffer.compare(bytes, PDF)).toBe(0);
    await expectHttpError(service.readFile(strangerId, workspaceId, file.id), 404);
    await expectHttpError(service.attachFile(strangerId, workspaceId, reportId, PDF, "x.pdf"), 404);
  });

  it("never writes outside the store root", async () => {
    await expect(store.put("../escape/attempt", PDF)).rejects.toThrow("Invalid storage key");
    const top = await readdir(root);
    expect(top).toEqual([workspaceId]);
  });

  it("lists reports with their files and refuses to work without storage", async () => {
    const listed = await service.listReports(ownerId, workspaceId);
    const report = listed.reports.find((entry) => entry.id === reportId);
    expect(report?.files.length).toBeGreaterThan(0);
    expect(listed.fileStorageEnabled).toBe(true);

    const disabled = createReportsService(null);
    expect((await disabled.listReports(ownerId, workspaceId)).fileStorageEnabled).toBe(false);
    await expectHttpError(disabled.attachFile(ownerId, workspaceId, reportId, PDF, "x.pdf"), 503);

    const rows = await db.select().from(sourceFiles).where(eq(sourceFiles.workspaceId, workspaceId));
    expect(rows.every((row) => row.sha256.length === 64)).toBe(true);
  });
});
