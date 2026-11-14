import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BATCH_SIZE, DB_REQUEST_TIMEOUT_MS, orderedCycleMappings, refreshCycle, REQUEST_TIMEOUT_MS } from "./cycle.ts";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

const num = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const localParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
};

const utcDate = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day));

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const nthWeekday = (year: number, month: number, weekday: number, occurrence: number) => {
  const first = utcDate(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utcDate(year, month, 1 + offset + (occurrence - 1) * 7);
};

const lastWeekday = (year: number, month: number, weekday: number) => {
  const last = new Date(Date.UTC(year, month, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return utcDate(year, month, last.getUTCDate() - offset);
};

const observedFixedHoliday = (year: number, month: number, day: number) => {
  const holiday = utcDate(year, month, day);
  const weekday = holiday.getUTCDay();
  if (weekday === 6) return dateKey(utcDate(year, month, day - 1));
  if (weekday === 0) return dateKey(utcDate(year, month, day + 1));
  return dateKey(holiday);
};

const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
};

const usMarketHolidays = (year: number) => {
  const holidays = new Set<string>();
  holidays.add(observedFixedHoliday(year, 1, 1));
  holidays.add(dateKey(nthWeekday(year, 1, 1, 3)));
  holidays.add(dateKey(nthWeekday(year, 2, 1, 3)));
  holidays.add(dateKey(new Date(easterSunday(year).getTime() - 2 * 86400000)));
  holidays.add(dateKey(lastWeekday(year, 5, 1)));
  holidays.add(observedFixedHoliday(year, 6, 19));
  holidays.add(observedFixedHoliday(year, 7, 4));
  holidays.add(dateKey(nthWeekday(year, 9, 1, 1)));
  holidays.add(dateKey(nthWeekday(year, 11, 4, 4)));
  holidays.add(observedFixedHoliday(year, 12, 25));
  return holidays;
};

const isUsMarketOpen = (now: Date) => {
  const local = localParts(now);
  if (local.weekday === "Sat" || local.weekday === "Sun") return false;
  const today = dateKey(utcDate(local.year, local.month, local.day));
  if (usMarketHolidays(local.year).has(today)) return false;
  const minutes = local.hour * 60 + local.minute;
  return minutes >= 570 && minutes < 960;
};

const isEligibleNow = (assetType: string, now: Date) => {
  const type = assetType.toLowerCase();
  if (type === "forex" || type === "crypto") return true;
  if (type === "equity" || type === "etf") return isUsMarketOpen(now);
  if (type === "futures" || type === "future") return false;
  return false;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const now = new Date();
  const cycle = refreshCycle(now);
  if (!cycle.acceptsStarts) {
    return json({ ok: true, status: "skipped", reason: "outside_refresh_window", cycle_started_at: cycle.startedAt });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!url || !serviceRoleKey || !apiKey) {
    return json({ error: "Required server-side configuration is missing." }, 500);
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(DB_REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(DB_REQUEST_TIMEOUT_MS),
    }) },
  });

  const { data: provider, error: providerError } = await db
    .from("data_providers")
    .select("id")
    .eq("provider_code", "twelvedata")
    .single();
  if (providerError || !provider) {
    return json({ error: "Twelve Data provider is not configured." }, 500);
  }

  const { data: mappings, error: mappingsError } = await db
    .from("provider_instruments")
    .select("provider_symbol,instrument_id,instruments(symbol,currency_code,is_active,asset_type)")
    .eq("provider_id", provider.id)
    .eq("is_active", true);
  if (mappingsError) return json({ error: "Could not read provider mappings." }, 500);

  const allMappings = (mappings ?? []).filter((mapping: any) => mapping.instruments?.is_active);
  const eligibleMappings = allMappings.filter((mapping: any) =>
    isEligibleNow(String(mapping.instruments.asset_type ?? ""), now)
  );

  let ordered;
  try {
    ordered = orderedCycleMappings(eligibleMappings);
  } catch {
    return json({ error: "Cycle instrument capacity requires review." }, 500);
  }
  const { data: claims, error: claimError } = await db.rpc("claim_twelve_data_cycle_batch_v1", {
    p_provider_id: provider.id,
    p_instrument_ids: ordered.map((mapping: any) => mapping.instrument_id),
  });
  if (claimError || !Array.isArray(claims) || claims.length !== 1) {
    return json({ error: "Could not confirm atomic cycle claim." }, 500);
  }
  const claim = claims[0];
  if (claim.claim_status !== "claimed") {
    if (!["outside_refresh_window", "batch_running", "batch_cooldown", "no_unattempted_eligible_instruments"].includes(claim.claim_status)
      || claim.sync_run_id !== null || !Array.isArray(claim.selected_instrument_ids) || claim.selected_instrument_ids.length) {
      return json({ error: "Invalid atomic cycle claim response." }, 500);
    }
    return json({ ok: true, status: "skipped", reason: claim.claim_status,
      cycle_started_at: claim.cycle_started_at, eligible_count: claim.eligible_count,
      remaining_estimate: claim.remaining_count });
  }
  const mappingById = new Map(ordered.map((mapping: any) => [mapping.instrument_id, mapping]));
  const selectedIds = claim.selected_instrument_ids;
  if (typeof claim.sync_run_id !== "string" || !claim.sync_run_id || !Array.isArray(selectedIds)
    || selectedIds.length < 1 || selectedIds.length > BATCH_SIZE || new Set(selectedIds).size !== selectedIds.length
    || selectedIds.some((id: unknown) => typeof id !== "string" || !mappingById.has(id))) {
    return json({ error: "Invalid atomic cycle claim response." }, 500);
  }
  const run = { id: claim.sync_run_id };
  const batch = selectedIds.map((id: string) => mappingById.get(id));

  let received = 0;
  let inserted = 0;
  const failures: any[] = [];

  for (const mapping of batch as any[]) {
    const symbol = mapping.instruments.symbol;
    let observationWriteStarted = false;
    try {
      const requestUrl = new URL("https://api.twelvedata.com/quote");
      requestUrl.searchParams.set("symbol", mapping.provider_symbol);
      requestUrl.searchParams.set("apikey", apiKey);
      const response = await fetch(requestUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const payload = await response.json();

      if (!response.ok || payload.status === "error" || payload.code) {
        failures.push({ symbol, message: !response.ok ? `PROVIDER_HTTP_${response.status}` : "PROVIDER_REPORTED_ERROR" });
      } else {
        received++;
        observationWriteStarted = true;
        const { error: observationError } = await db.from("market_observations").insert({
          instrument_id: mapping.instrument_id,
          provider_id: provider.id,
          interval_code: "quote",
          observed_at: now.toISOString(),
          open: num(payload.open),
          high: num(payload.high),
          low: num(payload.low),
          close: num(payload.close),
          adjusted_close: num(payload.close),
          volume: num(payload.volume),
          currency_code: payload.currency ?? mapping.instruments.currency_code,
          is_delayed: true,
          raw_payload: payload,
        });

        // An unreturned/failed database write may still have committed. Stop
        // without a terminal claim; recovery will retain counts as unverified.
        if (observationError) return json({ error: "Observation write outcome could not be confirmed.", sync_run_id: run.id }, 500);
        inserted++;
      }
    } catch (error) {
      if (observationWriteStarted) return json({ error: "Observation write outcome could not be confirmed.", sync_run_id: run.id }, 500);
      failures.push({
        symbol,
        message: error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
          ? "PROVIDER_REQUEST_TIMEOUT" : "PROVIDER_REQUEST_FAILED",
      });
    }
    try {
      const { data: progress, error: progressError } = await db.from("sync_runs").update({
        received_count: received, inserted_count: inserted,
      }).eq("id", run.id).eq("status", "running").select("id");
      if (progressError || !Array.isArray(progress) || progress.length !== 1 || progress[0].id !== run.id) {
        return json({ error: "Sync run progress could not be confirmed.", sync_run_id: run.id }, 500);
      }
    } catch {
      return json({ error: "Sync run progress could not be confirmed.", sync_run_id: run.id }, 500);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const status = failures.length === 0 ? "succeeded" : inserted ? "partial" : "failed";
  let finishConfirmed = false;
  try {
    const { data: finished, error: finishError } = await db.from("sync_runs").update({
      finished_at: new Date().toISOString(),
      received_count: received,
      inserted_count: inserted,
      status,
      error_message: failures.length
        ? failures.map((failure: any) => `${failure.symbol}: ${failure.message}`).join("; ").slice(0, 4000)
        : null,
    }).eq("id", run.id).eq("status", "running").select("id");
    finishConfirmed = !finishError && Array.isArray(finished) && finished.length === 1 && finished[0].id === run.id;
  } catch { /* Preserve the durable running receipt for interruption recovery. */ }

  if (!finishConfirmed) return json({ error: "Sync run finalization could not be confirmed.", sync_run_id: run.id }, 500);

  return json({
    ok: failures.length === 0,
    status,
    sync_run_id: run.id,
    cycle_started_at: claim.cycle_started_at,
    requested_count: batch.length,
    received_count: received,
    inserted_count: inserted,
    eligible_count: eligibleMappings.length,
    skipped_out_of_session: allMappings.length - eligibleMappings.length,
    us_market_open: isUsMarketOpen(now),
    remaining_estimate: claim.remaining_count,
    failures,
  });
});
