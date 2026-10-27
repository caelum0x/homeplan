import { parseDescription } from "../lib/parseDescription";
import { generateMultiStoryOptions } from "../lib/layout/multiStory";
import type { FloorPlan } from "../lib/layout/types";

const briefs = process.argv.slice(2).length ? process.argv.slice(2) : [
  "4 bed 3 bath house, 2800 square feet, with a 2-car garage and a home office",
  "3 bedroom 2.5 bath, 2200 sqft, open plan kitchen living",
  "5 bedroom 3.5 bath family home, 3600 sqft, garage, separate dining",
  "2 bedroom 1 bath, 1400 sqft",
];
let totalProblems = 0;
for (const b of briefs) {
  const input = { ...parseDescription(b), stories: 2 as const };
  for (const opt of generateMultiStoryOptions(input)) {
    const floors = opt.floors!;
    const problems: string[] = [];
    const [g, u] = floors;
    if (g.footprint.w !== u.footprint.w || g.footprint.h !== u.footprint.h) problems.push(`footprint mismatch ${JSON.stringify(g.footprint)} vs ${JSON.stringify(u.footprint)}`);
    const st = g.rooms.find((r) => r.type === "stairs")!;
    const ld = u.rooms.find((r) => r.type === "stairs")!;
    const rect = (r: any) => JSON.stringify({ x: r.x, y: r.y, w: r.w, h: r.h, run: r.stairRun && { s: r.stairRun.start, l: r.stairRun.length, b: r.stairRun.bottomAt } });
    if (rect(st) !== rect(ld)) problems.push(`stairs rect mismatch ${rect(st)} vs ${rect(ld)}`);
    // body bbox (excluding garage) identical
    const body = (f: FloorPlan) => { const rs = f.rooms.filter((r) => r.type !== "garage"); return JSON.stringify([Math.min(...rs.map(r=>r.x)), Math.min(...rs.map(r=>r.y)), Math.max(...rs.map(r=>r.x+r.w)), Math.max(...rs.map(r=>r.y+r.h))].map(v=>Math.round(v*100)/100)); };
    if (body(g) !== body(u)) problems.push(`body bbox mismatch ${body(g)} vs ${body(u)}`);
    floors.forEach((f, fi) => {
      const EPS = 0.05;
      for (const r of f.rooms) {
        if (r.x < -EPS || r.y < -EPS || r.x + r.w > f.footprint.w + EPS || r.y + r.h > f.footprint.h + EPS) problems.push(`F${fi+1} BOUNDS ${r.label}`);
        // every room has a door that actually lies on its boundary
        const ds = f.doors.filter((d) => d.connects.includes(r.id));
        if (!ds.length) problems.push(`F${fi+1} NO DOOR: ${r.label}`);
        for (const d of ds) {
          const onEdge = d.orientation === "v"
            ? (Math.abs(d.x - r.x) < EPS || Math.abs(d.x - (r.x + r.w)) < EPS) && d.y - d.width/2 >= r.y - EPS && d.y + d.width/2 <= r.y + r.h + EPS
            : (Math.abs(d.y - r.y) < EPS || Math.abs(d.y - (r.y + r.h)) < EPS) && d.x - d.width/2 >= r.x - EPS && d.x + d.width/2 <= r.x + r.w + EPS;
          if (!onEdge) problems.push(`F${fi+1} DOOR ${d.id} not on ${r.label}'s wall`);
        }
      }
      for (let i = 0; i < f.rooms.length; i++) for (let j = i + 1; j < f.rooms.length; j++) {
        const a = f.rooms[i], c = f.rooms[j];
        const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x), oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
        if (ox > EPS && oy > EPS) problems.push(`F${fi+1} OVERLAP ${a.label}/${c.label}`);
      }
      const stairRoom = f.rooms.find((r) => r.type === "stairs")!;
      const sd = f.doors.find((d) => d.connects.includes(stairRoom.id));
      if (sd && stairRoom.stairRun) {
        const run0 = stairRoom.y + stairRoom.stairRun.start, run1 = run0 + stairRoom.stairRun.length;
        const lo = sd.y - sd.width / 2, hi = sd.y + sd.width / 2;
        if (hi > run0 + EPS && lo < run1 - EPS) problems.push(`F${fi+1} stair door overlaps flight`);
        const bottomEndY = stairRoom.stairRun.bottomAt === "start" ? run0 : run1;
        const correctSide = fi === 0 ? (stairRoom.stairRun.bottomAt === "start" ? hi <= run0 + EPS : lo >= run1 - EPS) : (stairRoom.stairRun.bottomAt === "start" ? lo >= run1 - EPS : hi <= run0 + EPS);
        if (!correctSide) problems.push(`F${fi+1} stair door at wrong end of flight (bottom at y=${bottomEndY})`);
      }
    });
    totalProblems += problems.length;
    console.log(`\n=== ${b} [${opt.variant.label}] footprint ${g.footprint.w}x${g.footprint.h}`);
    floors.forEach((f, fi) => {
      console.log(`  Floor ${fi + 1}: ${f.rooms.length} rooms, ${f.doors.length} doors, ${f.windows?.length} windows, ${f.furniture.length} furniture, ${f.totalAreaSqft} sqft`);
      for (const r of f.rooms) console.log(`    - ${r.label.padEnd(40)} ${r.type.padEnd(16)} x=${r.x.toFixed(1)} y=${r.y.toFixed(1)} ${r.w.toFixed(1)}x${r.h.toFixed(1)}${r.stairRun ? ` run=${JSON.stringify(r.stairRun)}` : ""}`);
      const sid = f.rooms.find((r) => r.type === "stairs")!.id;
      for (const d of f.doors.filter((d) => d.connects.includes(sid))) console.log(`    STAIR DOOR ${d.id}: ${d.connects.join(" <-> ")} at (${d.x}, ${d.y.toFixed(2)}) w=${d.width.toFixed(2)} swingInto=${d.swingInto}`);
      for (const w of f.warnings) console.log(`    ! ${w}`);
    });
    console.log(problems.length ? problems.map((p) => "  PROBLEM: " + p).join("\n") : "  CHECKS: footprint identical, stairs rect identical, every room has an on-wall door, no bounds/overlap, stair doors at correct flight ends");
  }
}
console.log(`\nTOTAL PROBLEMS: ${totalProblems}`);
