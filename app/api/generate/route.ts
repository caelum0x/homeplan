import { NextResponse } from "next/server";
import { parseDescription } from "@/lib/parseDescription";
import { generateFloorPlanOptions } from "@/lib/layout/generate";
import { generateMultiStoryOptions } from "@/lib/layout/multiStory";

interface GenerateRequestBody {
  description?: unknown;
  /** Optional explicit story count from the UI toggle — overrides whatever the description implies. */
  stories?: unknown;
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

  if (body.stories !== undefined && body.stories !== 1 && body.stories !== 2) {
    return NextResponse.json({ error: "'stories' must be 1 or 2." }, { status: 400 });
  }

  const parsed = parseDescription(description);
  const input = body.stories === undefined ? parsed : { ...parsed, stories: body.stories as 1 | 2 };
  const options = input.stories === 2 ? generateMultiStoryOptions(input) : generateFloorPlanOptions(input);

  return NextResponse.json({ input, options });
}
