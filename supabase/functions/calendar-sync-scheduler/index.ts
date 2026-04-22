const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEDULER_SECRET = Deno.env.get("CALENDAR_SYNC_SCHEDULER_SECRET") || "";

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (SCHEDULER_SECRET) {
    const provided = req.headers.get("x-scheduler-secret") || "";
    if (provided !== SCHEDULER_SECRET) {
      return json(401, { error: "Invalid scheduler secret." });
    }
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/calendar-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "x-scheduler-secret": SCHEDULER_SECRET,
      },
      body: JSON.stringify({ action: "scheduled_poll" }),
    });

    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
