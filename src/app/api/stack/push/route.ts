import { NextResponse } from "next/server";
import { createUntypedClient } from "@/lib/supabase/admin";
import { PelotonClient, PelotonAuthError } from "@/lib/peloton/client";
import { syncTodayToStack, getStackStatus } from "@/lib/peloton/stack-sync";
import { decryptToken, DecryptionError } from "@/lib/crypto";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { timezone } = body;

    const supabase = await createUntypedClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's Peloton tokens
    const { data: tokens, error: tokensError } = await supabase
      .from("peloton_tokens")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (tokensError || !tokens) {
      return NextResponse.json(
        { error: "Peloton not connected" },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (new Date(tokens.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Peloton token expired. Please reconnect." },
        { status: 401 }
      );
    }

    const peloton = new PelotonClient(decryptToken(tokens.access_token_encrypted));

    // Sync today's workouts to the stack
    const result = await syncTodayToStack(user.id, peloton, supabase, { timezone });

    // Log the sync operation
    const { error: logError } = await supabase.from("stack_sync_logs").insert({
      user_id: user.id,
      sync_type: "manual" as const,
      workouts_pushed: result.pushed,
      success: result.success,
      error_message: result.error || null,
    });

    if (logError) {
      console.error("Failed to log sync operation:", logError);
    }

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || "Sync failed",
          pushed: result.pushed,
          expected: result.expected,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: result.pushed > 0
        ? `Synced ${result.pushed} workout(s) to stack`
        : "Stack cleared (no workouts for today)",
      pushed: result.pushed,
      expected: result.expected,
      warning: result.error, // Contains truncation warning if applicable
    });
  } catch (error) {
    console.error("Stack push error:", error);

    if (error instanceof DecryptionError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    if (error instanceof PelotonAuthError) {
      return NextResponse.json(
        { error: "Peloton authentication failed. Please reconnect." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to check stack status
export async function GET() {
  try {
    const supabase = await createUntypedClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's Peloton tokens
    const { data: tokens, error: tokensError } = await supabase
      .from("peloton_tokens")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (tokensError || !tokens) {
      return NextResponse.json(
        { error: "Peloton not connected" },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (new Date(tokens.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Peloton token expired. Please reconnect." },
        { status: 401 }
      );
    }

    const peloton = new PelotonClient(decryptToken(tokens.access_token_encrypted));
    const stackStatus = await getStackStatus(peloton);

    // Get recent sync logs
    const { data: syncLogs } = await supabase
      .from("stack_sync_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      stack: stackStatus,
      recentSyncs: syncLogs || [],
    });
  } catch (error) {
    if (error instanceof DecryptionError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }
    if (error instanceof PelotonAuthError) {
      return NextResponse.json(
        { error: "Peloton authentication failed. Please reconnect." },
        { status: 401 }
      );
    }
    console.error("Stack status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
