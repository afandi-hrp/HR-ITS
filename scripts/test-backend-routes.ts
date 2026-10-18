// READ-ONLY integration test of server/routes/* against the real database
// (uses SUPABASE_SERVICE_ROLE_KEY from .env, like the server). Only GET and
// read-only POST endpoints are called — never delete/insert/update ones.
//
//   npx tsx scripts/test-backend-routes.ts <config.json>
//
// config.json (ids from your own DB; not committed):
// { "hrId", "umId", "umCandidateId", "umKtpPath", "umPayslipPath",
//   "otherCandidateId", "otherKtpPath", "logId", "logsTotal",
//   "tokensTotal", "tokensUnused", "unlinkedCandidateId", "candidatesTotal",
//   "umAssignedCount", "directorId", "archivedPosition",
//   "archivedPositionCount", "psikotesPending", "umCandidateEvaluations" }
import "dotenv/config";
import fs from "node:fs";
import assert from "node:assert/strict";
import express, { type RequestHandler } from "express";
import type { AddressInfo } from "node:net";
import { registerExternalDataRoutes } from "../server/routes/externalData";
import { registerRegistrationTokenRoutes } from "../server/routes/registrationTokens";
import { registerLogRoutes } from "../server/routes/logs";
import { registerDocumentRoutes } from "../server/routes/documents";
import { registerCandidateRoutes } from "../server/routes/candidates";
import { registerScheduleRoutes } from "../server/routes/schedules";
import { registerAnalyticsRoutes } from "../server/routes/analytics";
import { registerContentRoutes } from "../server/routes/content";
import { getSupabaseAdmin } from "../server/supabase";
import { SALARY_FORM_FIELDS } from "../src/lib/documentPaths";

const cfg = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

// Stand-in for requireAuth: the caller is whoever the x-test-user header names.
const fakeAuth: RequestHandler = async (req: any, _res, next) => {
  const id = req.headers["x-test-user"];
  const { data } = await getSupabaseAdmin()
    .from("profiles")
    .select("id, role, department, full_name")
    .eq("id", id)
    .single();
  req.user = { id };
  req.profile = data;
  next();
};

const app = express();
app.use(express.json());
registerExternalDataRoutes(app, fakeAuth);
registerRegistrationTokenRoutes(app, fakeAuth);
registerLogRoutes(app, fakeAuth);
registerDocumentRoutes(app, fakeAuth);
registerCandidateRoutes(app, fakeAuth);
registerScheduleRoutes(app, fakeAuth);
registerAnalyticsRoutes(app, fakeAuth);
registerContentRoutes(app, fakeAuth);

// Silence audit lines during the test.
const realLog = console.log;
console.log = (...a: any[]) => {
  if (typeof a[0] === "string" && a[0].startsWith('{"audit"')) return;
  realLog(...a);
};

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function call(user: string, method: string, url: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { "x-test-user": user, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}

let passed = 0;
const failed: string[] = [];
async function t(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    realLog("  ok   " + name);
  } catch (e: any) {
    failed.push(name);
    realLog("  FAIL " + name + "\n       " + e.message);
  }
}
const noSalary = (row: any) =>
  SALARY_FORM_FIELDS.forEach((k) => assert.ok(!(k in row), `field gaji "${k}" masih terkirim`));

const HR = cfg.hrId;
const UM = cfg.umId;

realLog("HR_ADMIN");
await t("external-data list (hide_archived)", async () => {
  const r = await call(HR, "GET", "/api/external-data?page=1&pageSize=5&status=hide_archived");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.rows.length <= 5 && r.body.total > 0);
  assert.ok(["active", "archived", "available"].includes(r.body.rows[0]._link_status));
});
for (const status of ["all", "available", "active", "archived"]) {
  await t(`external-data list status=${status}`, async () => {
    const r = await call(HR, "GET", `/api/external-data?pageSize=3&status=${status}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });
}
await t("external-data full-text search", async () => {
  const r = await call(HR, "GET", "/api/external-data?pageSize=3&status=all&search=Medan");
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
await t("logs list total = DB count", async () => {
  const r = await call(HR, "GET", "/api/logs?page=1&pageSize=5");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.total, Number(cfg.logsTotal));
  assert.ok(r.body.rows.length === 5);
  assert.ok(!Array.isArray(r.body.rows[0].external_data), "embed external_data harus di-flatten");
});
await t("logs filter status=hired", async () => {
  const r = await call(HR, "GET", "/api/logs?status=hired&pageSize=50");
  assert.equal(r.status, 200);
  assert.ok(r.body.rows.every((x: any) => x.status_screening === "hired"));
});
await t("logs search + date range", async () => {
  const r = await call(HR, "GET", "/api/logs?search=a&startDate=2026-01-01&endDate=2026-12-31");
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
await t("logs search with special chars doesn't break the filter", async () => {
  const r = await call(HR, "GET", "/api/logs?search=" + encodeURIComponent("a,b(c)%"));
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
await t("logs export = same filter, no paging", async () => {
  const r = await call(HR, "GET", "/api/logs/export");
  assert.equal(r.status, 200);
  assert.equal(r.body.rows.length, Number(cfg.logsTotal));
});
await t("registration-tokens overview", async () => {
  const r = await call(HR, "GET", "/api/registration-tokens");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.tokens.length, Number(cfg.tokensTotal));
  assert.ok(typeof r.body.recipients === "object" && typeof r.body.submissions === "object");
});
await t("registration-tokens available = unused only", async () => {
  const r = await call(HR, "GET", `/api/registration-tokens/available?candidateId=${cfg.umCandidateId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.tokens.length, Number(cfg.tokensUnused));
});
await t("for-candidate (linked) returns form + links", async () => {
  const r = await call(HR, "GET", `/api/external-data/for-candidate/${cfg.umCandidateId}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.linked?.uid_sheet);
  assert.ok("current_salary" in r.body.linked || "expected_salary" in r.body.linked, "HR harus tetap lihat gaji");
});
await t("for-candidate (archived)", async () => {
  const r = await call(HR, "GET", `/api/external-data/for-candidate/${cfg.logId}?archived=1`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
await t("for-candidate (unlinked) returns suggestions array", async () => {
  const r = await call(HR, "GET", `/api/external-data/for-candidate/${cfg.unlinkedCandidateId}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(Array.isArray(r.body.suggestions));
});
await t("links + by-uids", async () => {
  const f = await call(HR, "GET", `/api/external-data/for-candidate/${cfg.umCandidateId}`);
  const uid = f.body.linked.uid_sheet;
  const l = await call(HR, "POST", "/api/external-data/links", { uids: [uid] });
  assert.ok(l.body.links.some((x: any) => x.id === cfg.umCandidateId));
  const b = await call(HR, "POST", "/api/external-data/by-uids", { uids: [uid] });
  assert.equal(b.body.rows.length, 1);
});
await t("signed-url any document", async () => {
  const r = await call(HR, "GET", `/api/documents/signed-url?path=${encodeURIComponent(cfg.otherKtpPath)}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.url);
});

realLog("USER_MANAGER");
for (const url of ["/api/external-data", "/api/logs", "/api/logs/export", "/api/registration-tokens", "/api/registration-tokens/available"]) {
  await t(`GET ${url} -> 403`, async () => {
    assert.equal((await call(UM, "GET", url)).status, 403);
  });
}
await t("POST by-uids -> 403", async () => {
  assert.equal((await call(UM, "POST", "/api/external-data/by-uids", { uids: ["x"] })).status, 403);
});
await t("for-candidate own assigned candidate: OK, no salary fields", async () => {
  const r = await call(UM, "GET", `/api/external-data/for-candidate/${cfg.umCandidateId}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.linked?.uid_sheet);
  noSalary(r.body.linked);
});
await t("for-candidate other candidate -> 403", async () => {
  assert.equal((await call(UM, "GET", `/api/external-data/for-candidate/${cfg.otherCandidateId}`)).status, 403);
});
await t("for-candidate archived -> 403", async () => {
  assert.equal((await call(UM, "GET", `/api/external-data/for-candidate/${cfg.logId}?archived=1`)).status, 403);
});
await t("links: other forms are hidden", async () => {
  const f = await call(HR, "GET", `/api/external-data/for-candidate/${cfg.otherCandidateId}`);
  const r = await call(UM, "POST", "/api/external-data/links", { uids: [f.body.linked.uid_sheet] });
  assert.equal(r.status, 200);
  assert.equal(r.body.links.length, 0);
});
await t("signed-url own candidate's KTP: OK", async () => {
  const r = await call(UM, "GET", `/api/documents/signed-url?path=${encodeURIComponent(cfg.umKtpPath)}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
await t("signed-url own candidate's payslip -> 403 (salary)", async () => {
  assert.equal(
    (await call(UM, "GET", `/api/documents/signed-url?path=${encodeURIComponent(cfg.umPayslipPath)}`)).status,
    403,
  );
});
await t("signed-url other candidate's KTP -> 403", async () => {
  assert.equal(
    (await call(UM, "GET", `/api/documents/signed-url?path=${encodeURIComponent(cfg.otherKtpPath)}`)).status,
    403,
  );
});

// ------------------------------------------------------------- Fase 2
realLog("HR_ADMIN (Fase 2)");
await t("screening: all active candidates", async () => {
  const r = await call(HR, "GET", "/api/candidates/screening");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.total, Number(cfg.candidatesTotal));
  assert.ok(!Array.isArray(r.body.rows[0].external_data), "embed external_data harus di-flatten");
});
await t("screening: filters", async () => {
  const r = await call(HR, "GET", "/api/candidates/screening?search=a&startDate=2026-01-01&endDate=2026-12-31&position=all");
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
await t("positions", async () => {
  const r = await call(HR, "GET", "/api/candidates/positions");
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.positions) && r.body.positions.length > 0);
});
await t("archived-for-position", async () => {
  const r = await call(HR, "GET", `/api/candidates/archived-for-position?position=${encodeURIComponent(cfg.archivedPosition)}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.rows.length, Number(cfg.archivedPositionCount));
});
await t("profile active + archived", async () => {
  const a = await call(HR, "GET", `/api/candidates/${cfg.umCandidateId}`);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.archived, false);
  assert.ok(Array.isArray(a.body.candidate.candidate_assignees));
  const b = await call(HR, "GET", `/api/candidates/${cfg.logId}`);
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(b.body.archived, true);
});
await t("notes + evaluations", async () => {
  const n = await call(HR, "GET", `/api/candidates/${cfg.umCandidateId}/notes`);
  assert.equal(n.status, 200, JSON.stringify(n.body));
  const e = await call(HR, "GET", `/api/candidates/${cfg.umCandidateId}/evaluations`);
  assert.equal(e.status, 200, JSON.stringify(e.body));
  assert.equal(e.body.rows.length, Number(cfg.umCandidateEvaluations));
  const ea = await call(HR, "GET", `/api/candidates/${cfg.logId}/evaluations`);
  assert.equal(ea.status, 200, JSON.stringify(ea.body));
});
await t("assignable profiles", async () => {
  const r = await call(HR, "GET", "/api/profiles/assignable");
  assert.equal(r.status, 200);
  assert.ok(r.body.rows.length > 0);
});
for (const type of ["psikotes", "interview"]) {
  for (const tab of ["pending", "confirmed", "no_show"]) {
    await t(`schedules ${type} tab=${tab}`, async () => {
      const r = await call(HR, "GET", `/api/schedules/${type}?tab=${tab}&pageSize=5&search=a`);
      assert.equal(r.status, 200, JSON.stringify(r.body));
    });
  }
  await t(`schedules ${type} calendar + schedulable candidates`, async () => {
    const c = await call(HR, "GET", `/api/schedules/${type}/calendar?start=2026-09-29T00:00:00.000Z&end=2026-11-09T00:00:00.000Z`);
    assert.equal(c.status, 200, JSON.stringify(c.body));
    const s = await call(HR, "GET", `/api/schedules/${type}/candidates`);
    assert.equal(s.status, 200, JSON.stringify(s.body));
  });
}
await t("schedules psikotes pending total = DB count", async () => {
  const r = await call(HR, "GET", "/api/schedules/psikotes?tab=pending&pageSize=1");
  assert.equal(r.body.total, Number(cfg.psikotesPending));
});
await t("invalid schedule type -> 400", async () => {
  assert.equal((await call(HR, "GET", "/api/schedules/foo")).status, 400);
});

realLog("USER_MANAGER (Fase 2)");
await t("screening: only assigned candidates, no salary", async () => {
  const r = await call(UM, "GET", "/api/candidates/screening");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.total, Number(cfg.umAssignedCount));
  r.body.rows.forEach((c: any) => c.external_data?.raw_data && noSalary(c.external_data.raw_data));
});
await t("archived-for-position -> empty for non-HR", async () => {
  const r = await call(UM, "GET", `/api/candidates/archived-for-position?position=${encodeURIComponent(cfg.archivedPosition)}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.rows.length, 0);
});
await t("profile own: OK; other: 403; archived: 404", async () => {
  assert.equal((await call(UM, "GET", `/api/candidates/${cfg.umCandidateId}`)).status, 200);
  assert.equal((await call(UM, "GET", `/api/candidates/${cfg.otherCandidateId}`)).status, 403);
  assert.equal((await call(UM, "GET", `/api/candidates/${cfg.logId}`)).status, 404);
});
await t("notes/evaluations of other candidate -> 403", async () => {
  assert.equal((await call(UM, "GET", `/api/candidates/${cfg.otherCandidateId}/notes`)).status, 403);
  assert.equal((await call(UM, "GET", `/api/candidates/${cfg.otherCandidateId}/evaluations`)).status, 403);
});
// Write endpoints: only the rejection path (checked before any DB write).
const denied: Array<[string, string, unknown?]> = [
  ["POST", `/api/candidates/${cfg.umCandidateId}/status`, { status: "accepted" }],
  ["POST", `/api/candidates/${cfg.umCandidateId}/assessment`, {}],
  ["PATCH", `/api/candidates/${cfg.umCandidateId}`, { full_name: "x" }],
  ["PUT", `/api/candidates/${cfg.umCandidateId}/assignees`, { userIds: [] }],
  ["POST", `/api/candidates/${cfg.umCandidateId}/approval`, { status: "accepted" }],
  ["POST", `/api/candidates/${cfg.umCandidateId}/interview-questions`, { questions: [] }],
  ["POST", "/api/blacklist", { email: "x@y.z" }],
  ["GET", "/api/profiles/assignable"],
  ["GET", "/api/schedules/psikotes"],
  ["POST", "/api/schedules/psikotes", {}],
  ["POST", "/api/schedules/interview/00000000-0000-0000-0000-000000000000/attendance", { action: "confirm" }],
  ["DELETE", "/api/schedules/interview/00000000-0000-0000-0000-000000000000"],
  ["POST", `/api/evaluations`, { candidate_id: cfg.otherCandidateId, template_id: "x", evaluation_type: "USER" }],
  ["POST", `/api/evaluations`, { candidate_id: cfg.umCandidateId, template_id: "x", evaluation_type: "REFERENCE_CHECK" }],
];
for (const [m, url, body] of denied) {
  await t(`${m} ${url.replace(/[0-9a-f-]{36}/g, ":id")} -> 403`, async () => {
    const r = await call(UM, m, url, body);
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });
}
if (cfg.directorId) {
  await t("DIRECTOR approval on a candidate not assigned to them -> 403", async () => {
    const r = await call(cfg.directorId, "POST", `/api/candidates/${cfg.otherCandidateId}/approval`, { status: "hold" });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });
  await t("DIRECTOR approval on an archived candidate -> 404 (was silent no-op)", async () => {
    const r = await call(cfg.directorId, "POST", `/api/candidates/${cfg.logId}/approval`, { status: "hold" });
    assert.equal(r.status, 404, JSON.stringify(r.body));
  });
}

// ------------------------------------------------------------- Fase 3
realLog("HR_ADMIN (Fase 3)");
await t("dashboard: counts match DB", async () => {
  const r = await call(HR, "GET", "/api/dashboard");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.counts.cTotal, Number(cfg.candidatesTotal));
  assert.equal(r.body.counts.lTotal, Number(cfg.logsTotal));
  for (const k of ["recentCands", "recentLogs", "recentPsi", "recentInt", "allActiveCandidates", "upcomingPsiData", "upcomingIntData", "newCandidatesData"]) {
    assert.ok(Array.isArray(r.body[k]), k);
  }
});
await t("dashboard: filters + positions", async () => {
  const r = await call(HR, "GET", `/api/dashboard?position=${encodeURIComponent(cfg.archivedPosition)}&start=2026-01-01T00:00:00.000Z&search=a`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = await call(HR, "GET", "/api/dashboard/positions");
  assert.ok(p.body.positions.length > 0);
});
await t("funnel: counts, stage rows resolved, sources", async () => {
  const r = await call(HR, "GET", "/api/funnel");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.counts?.total_applied > 0, "total_applied");
  assert.ok(r.body.stageRows.length > 0);
  assert.equal(
    r.body.candidateRows.length + r.body.logRows.length,
    new Set(r.body.stageRows.map((s: any) => `${s.source_table}:${s.candidate_id}`)).size,
  );
  assert.ok(Array.isArray(r.body.activeSources) && Array.isArray(r.body.psikotesSchedules));
});
await t("funnel: date range + position + positions list", async () => {
  const r = await call(HR, "GET", `/api/funnel?position=${encodeURIComponent(cfg.archivedPosition)}&start=2026-01-01T00:00:00.000Z&end=2026-12-31T23:59:59.999Z`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = await call(HR, "GET", "/api/funnel/positions");
  assert.ok(p.body.positions.length > 0);
});
await t("tracking: active + logged", async () => {
  const r = await call(HR, "GET", "/api/tracking");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.active.length, Number(cfg.candidatesTotal));
  assert.equal(r.body.logged.length, Number(cfg.logsTotal));
});
await t("open-recruitment: all / published / positions only", async () => {
  const a = await call(HR, "GET", "/api/open-recruitment");
  assert.equal(a.body.rows.length, Number(cfg.openRecruitmentTotal));
  const p = await call(HR, "GET", "/api/open-recruitment?published=1&fields=position");
  assert.equal(p.body.rows.length, Number(cfg.openRecruitmentPublished));
  assert.deepEqual(Object.keys(p.body.rows[0]), ["position"]);
});
await t("email templates: paged + all + order", async () => {
  const pg = await call(HR, "GET", "/api/email-templates?page=1&pageSize=2");
  assert.equal(pg.body.total, Number(cfg.emailTemplates));
  assert.equal(pg.body.rows.length, Math.min(2, Number(cfg.emailTemplates)));
  const all = await call(HR, "GET", "/api/email-templates?all=1&order=name");
  assert.equal(all.body.rows.length, Number(cfg.emailTemplates));
});
await t("evaluation templates: all / type / excludeType", async () => {
  const a = await call(HR, "GET", "/api/evaluation-templates");
  assert.equal(a.body.rows.length, Number(cfg.evaluationTemplates));
  const rc = await call(HR, "GET", "/api/evaluation-templates?type=REFERENCE_CHECK");
  assert.equal(rc.body.rows.length, Number(cfg.referenceCheckTemplates));
  const ex = await call(HR, "GET", "/api/evaluation-templates?excludeType=REFERENCE_CHECK");
  assert.equal(ex.body.rows.length, Number(cfg.evaluationTemplates) - Number(cfg.referenceCheckTemplates));
});
await t("profiles + departments", async () => {
  const r = await call(HR, "GET", "/api/profiles");
  assert.equal(r.body.rows.length, Number(cfg.profilesTotal));
  const d = await call(HR, "GET", "/api/profiles/departments");
  assert.ok(Array.isArray(d.body.departments));
});
await t("candidates-by-email (archived match) + invalid email", async () => {
  const r = await call(HR, "GET", `/api/candidates-by-email?email=${encodeURIComponent(cfg.someLogEmail.toUpperCase())}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.candidates.some((c: any) => c.archived), "case-insensitive match di Log");
  const bad = await call(HR, "GET", "/api/candidates-by-email?email=bukan-email");
  assert.deepEqual(bad.body, { candidates: [], blacklist: [] });
});
await t("send modal: candidate with full schedules", async () => {
  const r = await call(HR, "GET", `/api/candidates/${cfg.umCandidateId}?full=1`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(Array.isArray(r.body.candidate.psikotes_schedules));
});
await t("content writes: validation before DB (no row written)", async () => {
  assert.equal((await call(HR, "POST", "/api/open-recruitment", { position: "  " })).status, 400);
  // Wrong type -> rejected by the column whitelist before any insert.
  assert.equal((await call(HR, "POST", "/api/email-templates", { name: 5 })).status, 400);
  // Only unknown columns -> nothing to insert -> 400.
  assert.equal((await call(HR, "POST", "/api/email-templates", { id: "x", created_at: "y" })).status, 400);
  assert.equal((await call(HR, "PATCH", "/api/evaluation-templates/x", {})).status, 400);
  assert.equal((await call(HR, "PATCH", "/api/tracking/x", { fields: { join_date: "kemarin" } })).status, 400);
});

realLog("USER_MANAGER (Fase 3)");
for (const url of [
  "/api/dashboard",
  "/api/dashboard/positions",
  "/api/funnel",
  "/api/funnel/positions",
  "/api/tracking",
  "/api/open-recruitment",
  "/api/email-templates",
  "/api/profiles",
  "/api/profiles/departments",
  "/api/candidates-by-email?email=a@b.co",
]) {
  await t(`GET ${url} -> 403`, async () => {
    assert.equal((await call(UM, "GET", url)).status, 403);
  });
}
for (const [m, url] of [
  ["POST", "/api/open-recruitment"],
  ["PATCH", "/api/email-templates/x"],
  ["DELETE", "/api/evaluation-templates/x"],
  ["PATCH", "/api/tracking/x"],
] as const) {
  await t(`${m} ${url} -> 403`, async () => {
    assert.equal((await call(UM, m, url, { name: "x" })).status, 403);
  });
}
await t("evaluation templates readable by reviewers (EvaluationModal)", async () => {
  const r = await call(UM, "GET", "/api/evaluation-templates?excludeType=REFERENCE_CHECK");
  assert.equal(r.status, 200);
  assert.ok(r.body.rows.length > 0);
});

server.close();
realLog(`\n${passed} lulus, ${failed.length} gagal`);
process.exit(failed.length ? 1 : 0);
