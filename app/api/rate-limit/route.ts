import { NextResponse } from "next/server";
import { getRateLimitStatus, getAllRateLimitStatuses } from "@/services/rate-limiter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const engine = searchParams.get("engine");

    if (engine) {
      const status = getRateLimitStatus(engine);
      return NextResponse.json(status);
    }

    const allStatuses = getAllRateLimitStatuses();
    return NextResponse.json(allStatuses);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get rate limit status" },
      { status: 500 },
    );
  }
}
