import { NextResponse } from "next/server";
import { floorPlanToPdf } from "@/lib/exportPdf";
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
    const bytes = await floorPlanToPdf(plan);
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
