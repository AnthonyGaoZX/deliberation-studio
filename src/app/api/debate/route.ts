import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { generateTurn, prepareDebate, summarizeDebate } from "@/lib/debate-engine";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body?.action === "prepare") {
      return NextResponse.json(await prepareDebate(body));
    }

    if (body?.action === "turn") {
      return NextResponse.json(await generateTurn(body));
    }

    if (body?.action === "summarize") {
      return NextResponse.json(await summarizeDebate(body));
    }

    return NextResponse.json({ error: "Unsupported API action." }, { status: 400 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Some required fields are missing or invalid.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown server error.";
    if (
      message.startsWith("Missing API key") ||
      message.startsWith("Please add at least one model") ||
      message.startsWith("We could not find the requested participant")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
