import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

type QueueItem = {
  id: number;
  run_date: string;
  process_name: string;
  attempt_count: number;
  gpt_run_id: string | null;
};

type Instrument = {
  id: string;
  symbol: string;
  instrument_name: string;
  exchange_code: string;
  asset_type: string;
  currency_code: string;
};

type AssessmentOutput = {
  rating: string;
  confidence: number;
  score: number;
  summary: string;
  bull_case: string;
  bear_case: string;
  technical_view: string;
  macro_view: string;
  valuation_view: string;
  key_catalysts: string;
  key_risks: string;
  evidence_summary: string;
  evidence: Array<{
    evidence_type: string;
    source_name: string | null;
    source_url: string | null;
    evidence_text: string;
    relevance_score: number;
    confidence: number;
  }>;
};

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "rating",
    "confidence",
    "score",
    "summary",
    "bull_case",
    "bear_case",
    "technical_view",
    "macro_view",
    "valuation_view",
    "key_catalysts",
    "key_risks",
    "evidence_summary",
    "evidence",
  ],
  properties: {
    rating: {
      type: "string",
      enum: ["Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"],
    },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    score: { type: "number", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    bull_case: { type: "string" },
    bear_case: { type: "string" },
    technical_view: { type: "string" },
    macro_view: { type: "string" },
    valuation_view: { type: "string" },
    key_catalysts: { type: "string" },
    key_risks: { type: "string" },
    evidence_summary: { type: "string" },
    evidence: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "evidence_type",
          "source_name",
          "source_url",
          "evidence_text",
          "relevance_score",
          "confidence",
        ],
        properties: {
          evidence_type: { type: "string" },
          source_name: { type: ["string", "null"] },
          source_url: { type: ["string", "null"] },
          evidence_text: { type: "string" },
          relevance_score: { type: "number", minimum: 0, maximum: 100 },
          confidence: { type: "number", minimum: 0, maximum: 100 },
        },
      },
    },
  },
};

function extractOutputText(response: any): string | null {
  for (const item of response?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const part of item?.content ?? []) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        return part.text;
      }
    }
  }
  return null;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanError(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Unexpected error");
}

async function createAssessment(
  openAiKey: string,
  model: string,
  enableWebSearch: boolean,
  instrument: Instrument,
  observations: unknown[],
  consensus: unknown,
  opinions: unknown[],
): Promise<AssessmentOutput> {
  const developerInstruction = [
    "You are producing a structured market assessment for a research dashboard.",
    "Use the supplied market observations as the primary quantitative evidence.",
    enableWebSearch
      ? "Use web search for current public company, macro, valuation, catalyst and risk context where relevant."
      : "Do not assume facts that are not present in the supplied context.",
    "Do not provide personalised financial advice or position sizing.",
    "Rate the instrument using only Strong Buy, Buy, Hold, Sell or Strong Sell.",
    "Confidence and score must be 0 to 100.",
    "Keep the summary concise and make bull and bear cases materially different.",
    "Evidence entries should identify the evidence actually relied on; include source URLs when available.",
  ].join("\n");

  const context = {
    instrument,
    recent_market_observations: observations,
    external_opinion_consensus: consensus,
    recent_external_opinions: opinions,
    generated_at: new Date().toISOString(),
  };

  const body: Record<string, unknown> = {
    model,
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: developerInstruction }],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Assess this instrument using the supplied context:\n${JSON.stringify(context)}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "market_assessment",
        strict: true,
        schema: outputSchema,
      },
    },
  };

  if (enableWebSearch) {
    body.tools = [{ type: "web_search" }];
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `OpenAI returned HTTP ${response.status}`);
  }

  const text = extractOutputText(payload);
  if (!text) throw new Error("OpenAI response did not contain output text.");

  const parsed = JSON.parse(text) as AssessmentOutput;
  if (!parsed.rating || !Array.isArray(parsed.evidence)) {
    throw new Error("Assessment output did not match the expected structure.");
  }
  return parsed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase server-side configuration is missing." }, 500);
  }

  let requestBody: { dry_run?: boolean; batch_size?: number; max_attempts?: number } = {};
  try {
    requestBody = await req.json();
  } catch {
    // Empty body uses defaults.
  }

  const batchSize = Math.max(1, Math.min(5, Number(requestBody.batch_size ?? 3)));
  const maxAttempts = Math.max(1, Math.min(30, Number(requestBody.max_attempts ?? 12)));
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (requestBody.dry_run) {
    const { data, error } = await db
      .from("market_assessment_queue")
      .select("id,run_date,status,process_name,attempt_count,gpt_run_id,created_at,started_at,processed_at,error_message")
      .in("status", ["pending", "ready_for_analysis", "processing"])
      .order("run_date", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, dry_run: true, work_items: data ?? [] });
  }

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL");
  const enableWebSearch = (Deno.env.get("OPENAI_ENABLE_WEB_SEARCH") ?? "true").toLowerCase() !== "false";
  if (!openAiKey || !model) {
    return json(
      {
        error: "Assessment worker is deployed but not activated. Configure OPENAI_API_KEY and OPENAI_MODEL first.",
      },
      503,
    );
  }

  let queue: QueueItem | null = null;
  const processingRes = await db
    .from("market_assessment_queue")
    .select("id,run_date,process_name,attempt_count,gpt_run_id")
    .eq("process_name", "daily_market_assessment")
    .eq("status", "processing")
    .order("run_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (processingRes.error) return json({ error: processingRes.error.message }, 500);

  if (processingRes.data) {
    queue = processingRes.data as QueueItem;
    const attemptRes = await db.rpc("begin_market_assessment_attempt", { p_queue_id: queue.id });
    if (attemptRes.error) return json({ error: attemptRes.error.message }, 500);
    queue.attempt_count = Number(attemptRes.data ?? queue.attempt_count + 1);
  } else {
    const claimRes = await db.rpc("claim_market_assessment_queue", {
      p_process_name: "daily_market_assessment",
    });
    if (claimRes.error) return json({ error: claimRes.error.message }, 500);
    const claimed = Array.isArray(claimRes.data) ? claimRes.data[0] : null;
    if (!claimed) return json({ ok: true, status: "no_work" });
    queue = { ...claimed, gpt_run_id: null } as QueueItem;
  }

  const instrumentsRes = await db
    .from("instruments")
    .select("id,symbol,instrument_name,exchange_code,asset_type,currency_code")
    .eq("is_active", true)
    .order("symbol", { ascending: true });
  if (instrumentsRes.error) return json({ error: instrumentsRes.error.message }, 500);
  const instruments = (instrumentsRes.data ?? []) as Instrument[];

  let runId = queue.gpt_run_id;
  if (!runId) {
    const runRes = await db
      .from("gpt_market_runs")
      .insert({
        analysis_cutoff_time: new Date().toISOString(),
        status: "running",
        model_name: model,
        prompt_version: "v2.0",
        analysis_mode: "scheduled",
        tickers_requested: instruments.length,
        tickers_completed: 0,
        notes: `Created by daily-market-assessment-worker for queue ${queue.id}.`,
      })
      .select("run_id")
      .single();
    if (runRes.error || !runRes.data) {
      await db.rpc("finalize_market_assessment_queue", {
        p_queue_id: queue.id,
        p_status: "failed",
        p_gpt_run_id: null,
        p_error_message: runRes.error?.message ?? "Could not create GPT market run.",
      });
      return json({ error: runRes.error?.message ?? "Could not create GPT market run." }, 500);
    }
    runId = runRes.data.run_id;
    await db
      .from("market_assessment_queue")
      .update({ gpt_run_id: runId, updated_at: new Date().toISOString() })
      .eq("id", queue.id);
  }

  const completedRes = await db
    .from("gpt_market_assessments")
    .select("instrument_id")
    .eq("run_id", runId);
  if (completedRes.error) return json({ error: completedRes.error.message }, 500);
  const completedIds = new Set((completedRes.data ?? []).map((row: any) => row.instrument_id));
  let pending = instruments.filter((instrument) => !completedIds.has(instrument.id));

  if (pending.length === 0) {
    await db.from("gpt_market_runs").update({
      status: "succeeded",
      tickers_completed: instruments.length,
      completed_at: new Date().toISOString(),
    }).eq("run_id", runId);
    await db.rpc("finalize_market_assessment_queue", {
      p_queue_id: queue.id,
      p_status: "succeeded",
      p_gpt_run_id: runId,
      p_error_message: null,
    });
    return json({ ok: true, status: "succeeded", queue_id: queue.id, run_id: runId, completed: instruments.length });
  }

  if (queue.attempt_count > maxAttempts) {
    const finalStatus = completedIds.size > 0 ? "partial" : "failed";
    const message = `Maximum worker attempts reached. Remaining instruments: ${pending.map((x) => x.symbol).join(", ")}`;
    await db.from("gpt_market_runs").update({
      status: finalStatus,
      tickers_completed: completedIds.size,
      completed_at: new Date().toISOString(),
      notes: message,
    }).eq("run_id", runId);
    await db.rpc("finalize_market_assessment_queue", {
      p_queue_id: queue.id,
      p_status: finalStatus,
      p_gpt_run_id: runId,
      p_error_message: message,
    });
    return json({ ok: false, status: finalStatus, queue_id: queue.id, run_id: runId, error: message }, 500);
  }

  const batch = pending.slice(0, batchSize);
  const failures: Array<{ symbol: string; message: string }> = [];
  const successes: string[] = [];

  for (const instrument of batch) {
    try {
      const [observationsRes, consensusRes, opinionsRes] = await Promise.all([
        db
          .from("market_observations")
          .select("observed_at,open,high,low,close,volume,currency_code,is_delayed")
          .eq("instrument_id", instrument.id)
          .order("observed_at", { ascending: false })
          .limit(24),
        db
          .from("instrument_opinion_consensus")
          .select("as_of_date,analyst_count,bullish_count,neutral_count,bearish_count,positive_news_count,negative_news_count,consensus_stance,consensus_score,key_change,is_material_change,generated_at")
          .eq("instrument_id", instrument.id)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("instrument_opinions")
          .select("opinion_type,stance,confidence,rating,target_price,target_currency,time_horizon,headline,summary,rationale,source_url,source_published_at,observed_at,is_material")
          .eq("instrument_id", instrument.id)
          .order("observed_at", { ascending: false })
          .limit(5),
      ]);

      if (observationsRes.error) throw observationsRes.error;
      if (consensusRes.error) throw consensusRes.error;
      if (opinionsRes.error) throw opinionsRes.error;

      const assessment = await createAssessment(
        openAiKey,
        model,
        enableWebSearch,
        instrument,
        observationsRes.data ?? [],
        consensusRes.data ?? null,
        opinionsRes.data ?? [],
      );

      const insertRes = await db
        .from("gpt_market_assessments")
        .insert({
          run_id: runId,
          instrument_id: instrument.id,
          assessment_date: queue.run_date,
          rating: assessment.rating,
          confidence: toNumber(assessment.confidence),
          score: toNumber(assessment.score),
          summary: assessment.summary,
          bull_case: assessment.bull_case,
          bear_case: assessment.bear_case,
          technical_view: assessment.technical_view,
          macro_view: assessment.macro_view,
          valuation_view: assessment.valuation_view,
          key_catalysts: assessment.key_catalysts,
          key_risks: assessment.key_risks,
          evidence_summary: assessment.evidence_summary,
          model_version: model,
        })
        .select("assessment_id")
        .single();

      if (insertRes.error || !insertRes.data) throw insertRes.error ?? new Error("Assessment insert failed.");

      if (assessment.evidence.length) {
        const evidenceRows = assessment.evidence.map((item) => ({
          assessment_id: insertRes.data.assessment_id,
          evidence_type: item.evidence_type,
          source_name: item.source_name,
          source_url: item.source_url,
          evidence_text: item.evidence_text,
          relevance_score: toNumber(item.relevance_score),
          confidence: toNumber(item.confidence),
        }));
        const evidenceInsert = await db.from("gpt_market_evidence").insert(evidenceRows);
        if (evidenceInsert.error) throw evidenceInsert.error;
      }

      successes.push(instrument.symbol);
    } catch (error) {
      failures.push({ symbol: instrument.symbol, message: cleanError(error).slice(0, 1000) });
    }
  }

  const countRes = await db
    .from("gpt_market_assessments")
    .select("assessment_id", { count: "exact", head: true })
    .eq("run_id", runId);
  if (countRes.error) return json({ error: countRes.error.message }, 500);
  const completedCount = countRes.count ?? 0;

  await db.from("gpt_market_runs").update({
    tickers_completed: completedCount,
    notes: failures.length
      ? `Latest worker batch failures: ${failures.map((x) => `${x.symbol}: ${x.message}`).join("; ").slice(0, 3500)}`
      : `Worker progressing normally. Queue ${queue.id}.`,
  }).eq("run_id", runId);

  if (completedCount >= instruments.length) {
    await db.from("gpt_market_runs").update({
      status: "succeeded",
      tickers_completed: completedCount,
      completed_at: new Date().toISOString(),
    }).eq("run_id", runId);
    await db.rpc("finalize_market_assessment_queue", {
      p_queue_id: queue.id,
      p_status: "succeeded",
      p_gpt_run_id: runId,
      p_error_message: null,
    });
    return json({ ok: true, status: "succeeded", queue_id: queue.id, run_id: runId, completed: completedCount });
  }

  if (queue.attempt_count >= maxAttempts && failures.length > 0) {
    const finalStatus = completedCount > 0 ? "partial" : "failed";
    const message = `Maximum worker attempts reached with ${completedCount}/${instruments.length} assessments completed. ${failures.map((x) => `${x.symbol}: ${x.message}`).join("; ").slice(0, 3000)}`;
    await db.from("gpt_market_runs").update({
      status: finalStatus,
      tickers_completed: completedCount,
      completed_at: new Date().toISOString(),
      notes: message,
    }).eq("run_id", runId);
    await db.rpc("finalize_market_assessment_queue", {
      p_queue_id: queue.id,
      p_status: finalStatus,
      p_gpt_run_id: runId,
      p_error_message: message,
    });
    return json({ ok: false, status: finalStatus, queue_id: queue.id, run_id: runId, completed: completedCount, failures }, 500);
  }

  return json({
    ok: failures.length === 0,
    status: "processing",
    queue_id: queue.id,
    run_id: runId,
    attempt_count: queue.attempt_count,
    completed: completedCount,
    requested: instruments.length,
    successes,
    failures,
    remaining: Math.max(0, instruments.length - completedCount),
  });
});
