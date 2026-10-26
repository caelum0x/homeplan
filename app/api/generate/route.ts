import { NextResponse } from "next/server";
import { parseDescription } from "@/lib/parseDescription";
import { generateFloorPlan } from "@/lib/layout/generate";

interface GenerateRequestBody {
  description?: unknown;
}

export async function POST(request: Request) {
  let body: GenerateRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const description = body.description;
  if (typeof description !== "string" || description.trim().length < 5) {
    return NextResponse.json(
      { error: "Please provide a short description of the home (at least 5 characters)." },
      { status: 400 },
    );
  }
  if (description.length > 2000) {
    return NextResponse.json({ error: "Description is too long (max 2000 characters)." }, { status: 400 });
  }

  const input = parseDescription(description);
  const plan = generateFloorPlan(input);

  return NextResponse.json({ input, plan });
}
