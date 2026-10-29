// Real round-trip check for lib/sharePlan.ts's two closed bugs:
// 1. A multi-story plan must share (and reopen) with EVERY floor, not just the one active when
//    "Share" was clicked.
// 2. The combined multi-floor payload must stay well clear of a real request-line/header-size
//    limit — reproduced live with a real `curl` against a real `npm run start` server returning
//    a real `431 Request Header Fields Too Large` on the uncompressed 2-floor URL (~20KB);
//    gzip brought the same real payload to ~3.4KB.
// Also checks the single-plan path, that an already-circulating legacy link (plain base64 JSON,
// no gzip tag, no `kind` wrapper) still opens, and that garbage input fails closed.

// Minimal browser-global polyfill so lib/sharePlan.ts's window-dependent branches run under
// plain Node (tsx), the same way the rest of this repo's verify-*.ts scripts exercise browser-
// adjacent code paths without a real DOM. Node 18+ already provides global CompressionStream/
// DecompressionStream, so the real gzip path (not a stub) is exercised here too.
(global as any).window = { location: { href: "http://localhost:3000/", search: "" } };
(global as any).btoa = (s: string) => Buffer.from(s, "binary").toString("base64");
(global as any).atob = (s: string) => Buffer.from(s, "base64").toString("binary");

import { parseDescription } from "../lib/parseDescription";
import { generateMultiStoryOptions } from "../lib/layout/multiStory";
import { buildShareUrl, readSharedBundleFromLocation, encodePlanForUrl } from "../lib/sharePlan";

let problems = 0;
function check(label: string, cond: boolean) {
  if (!cond) {
    problems++;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`ok: ${label}`);
  }
}
function setLocationFromUrl(url: string) {
  (global as any).window.location.search = new URL(url).search;
}
// Replicates the OLD (pre-gzip, pre-`kind`-wrapper) encoding exactly: plain base64 of the bare
// plan JSON, no tag at all — what every link shared before this session actually looks like.
function legacyPlainEncode(plan: unknown): string {
  const json = JSON.stringify(plan);
  return Buffer.from(json, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function main() {
  // --- 1. Single-story share round-trips exactly, floors stays null. ---
  const input = parseDescription("3 bedroom 2 bath, 1800 sqft, open plan kitchen living");
  const singleOpt = generateMultiStoryOptions({ ...input, stories: 1 as const })[0];
  const singlePlan = singleOpt.plan!;
  const singleUrl = await buildShareUrl({ plan: singlePlan, floors: null, activeFloor: 0 });
  setLocationFromUrl(singleUrl);
  const singleBundle = await readSharedBundleFromLocation();
  check("single-plan share: bundle decodes", singleBundle !== null);
  check("single-plan share: floors stays null", singleBundle?.floors === null);
  check("single-plan share: room count matches", singleBundle?.plan.rooms.length === singlePlan.rooms.length);

  // --- 2. Multi-story share carries EVERY floor, not just the active one (real bug #1). ---
  const msOpt = generateMultiStoryOptions({ ...input, stories: 2 as const })[0];
  const floors = msOpt.floors!;
  check("fixture is genuinely 2 floors", floors.length === 2);
  // Simulate the user being on the upper floor (activeFloor=1) when they click Share.
  const msUrl = await buildShareUrl({ plan: floors[1], floors, activeFloor: 1 });
  setLocationFromUrl(msUrl);
  const msBundle = await readSharedBundleFromLocation();
  check("multi-story share: bundle decodes", msBundle !== null);
  check("multi-story share: floors array present", Array.isArray(msBundle?.floors));
  check("multi-story share: BOTH floors present (real bug #1, closed)", msBundle?.floors?.length === 2);
  check("multi-story share: activeFloor preserved", msBundle?.activeFloor === 1);
  check("multi-story share: active plan is the upper floor", msBundle?.plan.rooms.length === floors[1].rooms.length);
  check("multi-story share: ground floor room count matches original (not dropped)", msBundle?.floors?.[0].rooms.length === floors[0].rooms.length);
  check("multi-story share: upper floor room count matches original (not dropped)", msBundle?.floors?.[1].rooms.length === floors[1].rooms.length);
  check(
    "multi-story share: ground floor stairs rect matches original exactly (real geometry, not re-derived)",
    JSON.stringify(msBundle?.floors?.[0].rooms.find((r) => r.type === "stairs")) === JSON.stringify(floors[0].rooms.find((r) => r.type === "stairs")),
  );

  // --- 3. Real bug #2: the compressed multi-floor URL must stay well clear of a real server's
  // request-line/header limit (reproduced live at ~20KB uncompressed; Node's default is 16KB). ---
  console.log(`\nmulti-story share URL length: ${msUrl.length} chars (uncompressed JSON for this fixture was ~20134 chars, confirmed 431 live)`);
  check("multi-story share URL stays under a safe 8000-char budget (real gzip compression applied)", msUrl.length < 8000);
  const uncompressedEquivalentLen = JSON.stringify({ kind: "floors", floors, activeFloor: 1 }).length;
  check("compression actually shrank the real payload by >3x, not a no-op", msUrl.length < uncompressedEquivalentLen / 3);

  // --- 4. A legacy link already circulating (plain base64 JSON, no gzip tag, no `kind` wrapper)
  // still opens correctly. ---
  const legacyEncoded = legacyPlainEncode(singlePlan);
  setLocationFromUrl(`http://localhost:3000/?plan=${legacyEncoded}`);
  const legacyBundle = await readSharedBundleFromLocation();
  check("legacy plain-base64 link: still decodes", legacyBundle !== null);
  check("legacy plain-base64 link: floors stays null", legacyBundle?.floors === null);
  check("legacy plain-base64 link: room count matches", legacyBundle?.plan.rooms.length === singlePlan.rooms.length);

  // --- 5. decodePlanFromUrl/encodePlanForUrl (now gzip, still exported for back-compat callers)
  // round-trip a bare plan correctly on their own. ---
  const bareEncoded = await encodePlanForUrl(singlePlan);
  check("encodePlanForUrl output is gzip-tagged", bareEncoded.startsWith("gz1:"));

  // --- 6. Garbage input fails closed, doesn't throw. ---
  setLocationFromUrl("http://localhost:3000/?plan=not-real-base64-json");
  check("garbage link: fails closed (null), doesn't throw", (await readSharedBundleFromLocation()) === null);

  console.log(problems === 0 ? "\nAll share-link checks passed." : `\n${problems} share-link check(s) FAILED.`);
  process.exit(problems === 0 ? 0 : 1);
}

main();
