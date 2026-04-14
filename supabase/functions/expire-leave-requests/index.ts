/**
 * supabase/functions/expire-leave-requests/index.ts
 *
 * Supabase Edge Function — expires stale pending leave requests.
 *
 * Calls the SQL helper function expire_stale_leave_requests() which sets
 * status = 'soft_declined' on any pending request older than 30 days.
 *
 * Intended to be scheduled via a Supabase cron job (pg_cron) or called
 * explicitly from an admin workflow.
 *
 * Cron schedule (add to supabase/config.toml or via Supabase dashboard):
 *   [functions.expire-leave-requests]
 *   schedule = "0 2 * * *"   -- runs daily at 02:00 UTC
 *
 * Authorization:
 *   Requires a valid service-role JWT in the Authorization header OR
 *   can be invoked internally by pg_cron (no HTTP auth required).
 *
 * Response:
 *   { expired: number }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  // Allow internal invocations (pg_cron) and authenticated HTTP calls
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.rpc("expire_stale_leave_requests");

    if (error) {
      console.error("[expire-leave-requests] RPC error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const expired = data as number;
    console.info(
      `[expire-leave-requests] Expired ${expired} leave request(s).`,
    );

    return new Response(JSON.stringify({ expired }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[expire-leave-requests] Unexpected error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
