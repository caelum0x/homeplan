import { NextResponse } from "next/server";
import { floorPlanToDxf } from "@/lib/exportDxf";
import type { FloorPlan } from "@/lib/layout/types";

interface ExportRequestBody {
  plan?: unknown;
}

export async function POST(request: Request) {
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
    const dxfString = floorPlanToDxf(plan);
    return new NextResponse(dxfString, {
      status: 200,
      headers: {
        "Content-Type": "application/dxf",
        "Content-Disposition": 'attachment; filename="homeplan-floor-plan.dxf"',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error building the DXF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
