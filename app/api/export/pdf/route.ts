import { NextResponse } from "next/server";
import { floorPlansToPdf, floorPlanToPdf } from "@/lib/exportPdf";
import { isProRequest, PRO_REQUIRED_BODY } from "@/lib/proGate";
import type { FloorPlan } from "@/lib/layout/types";

interface ExportRequestBody {
  plan?: unknown;
  /** Multi-story plan: every floor, ground first — exported as one page per floor at a shared scale. */
  floors?: unknown;
}

const MAX_FLOORS = 4;

function isPlan(value: unknown): value is FloorPlan {
  const plan = value as FloorPlan | undefined;
  return !!plan && Array.isArray(plan.rooms) && !!plan.footprint;
}

function floorTitle(index: number, count: number): string {
  const name = index === 0 ? "Ground floor" : index === count - 1 ? "Upper floor" : `Floor ${index + 1}`;
  return `HomePlan — ${name} (${index + 1} of ${count})`;
}

export async function POST(request: Request) {
  if (!(await isProRequest(request))) {
    return NextResponse.json(PRO_REQUIRED_BODY, { status: 402 });
  }

  let body: ExportRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (body.floors !== undefined) {
    if (!Array.isArray(body.floors) || body.floors.length < 1 || body.floors.length > MAX_FLOORS || !body.floors.every(isPlan)) {
      return NextResponse.json({ error: `'floors' must be an array of 1-${MAX_FLOORS} valid plan objects.` }, { status: 400 });
    }
  } else if (!isPlan(body.plan)) {
    return NextResponse.json({ error: "Request must include a valid 'plan' object." }, { status: 400 });
  }

  try {
    const floors = body.floors as FloorPlan[] | undefined;
    const bytes = floors
      ? await floorPlansToPdf(floors.map((plan, i) => ({ plan, title: floorTitle(i, floors.length) })))
      : await floorPlanToPdf(body.plan as FloorPlan);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="homeplan-floor-plan.pdf"',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error building the PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
