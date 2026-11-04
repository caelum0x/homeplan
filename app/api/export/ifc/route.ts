import { NextResponse } from "next/server";
import { floorPlanToIfc } from "@/lib/exportIfc";
import { isProRequest, PRO_REQUIRED_BODY } from "@/lib/proGate";
import type { FloorPlan } from "@/lib/layout/types";

interface ExportRequestBody {
  plan?: unknown;
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

  const plan = body.plan as FloorPlan | undefined;
  if (!plan || !Array.isArray(plan.rooms) || !plan.footprint) {
    return NextResponse.json({ error: "Request must include a valid 'plan' object." }, { status: 400 });
  }

  try {
    const ifcString = floorPlanToIfc(plan);
    return new NextResponse(ifcString, {
      status: 200,
      headers: {
        "Content-Type": "application/x-step",
        "Content-Disposition": 'attachment; filename="homeplan-floor-plan.ifc"',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error building the IFC file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
