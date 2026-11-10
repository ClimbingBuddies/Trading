import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!url || !serviceRoleKey || !apiKey) {
    return json({ error: "Required server-side configuration is missing." }, 500);
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date();
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
  if (mappingsError) return json({ error: mappingsError.message }, 500);

  const allMappings = (mappings ?? []).filter((mapping: any) => mapping.instruments?.is_active);
  const eligibleMappings = allMappings.filter((mapping: any) =>
    isEligibleNow(String(mapping.instruments.asset_type ?? ""), now)
  );

  const { data: recent } = await db
    .from("market_observations")
    .select("instrument_id")
    .eq("provider_id", provider.id)
    .gte("loaded_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString());

  const seen = new Set((recent ?? []).map((row: any) => row.instrument_id));
  const batch = eligibleMappings
    .filter((mapping: any) => !seen.has(mapping.instrument_id))
    .sort((a: any, b: any) => a.instruments.symbol.localeCompare(b.instruments.symbol))
    .slice(0, 8);

  const runMetadata = {
    function: "full-twelve-data-load",
    batch_size: 8,
    market_hours_aware: true,
    eligible_count: eligibleMappings.length,
    skipped_out_of_session: allMappings.length - eligibleMappings.length,
    evaluated_at: now.toISOString(),
  };

  const { data: run, error: runError } = await db
    .from("sync_runs")
    .insert({
      provider_id: provider.id,
      requested_count: batch.length,
      status: "running",
      metadata: runMetadata,
    })
    .select("id")
    .single();
  if (runError || !run) return json({ error: "Could not create sync run." }, 500);

  let received = 0;
  let inserted = 0;
  const failures: any[] = [];

  for (const mapping of batch as any[]) {
    const symbol = mapping.instruments.symbol;
    try {
      const requestUrl = new URL("https://api.twelvedata.com/quote");
      requestUrl.searchParams.set("symbol", mapping.provider_symbol);
      requestUrl.searchParams.set("apikey", apiKey);
      const response = await fetch(requestUrl);
      const payload = await response.json();

      if (!response.ok || payload.status === "error" || payload.code) {
        failures.push({ symbol, message: payload.message ?? `HTTP ${response.status}` });
        continue;
      }

      received++;
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

      if (observationError) failures.push({ symbol, message: observationError.message });
      else inserted++;
    } catch (error) {
      failures.push({
        symbol,
        message: error instanceof Error ? error.message : "Unexpected error",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const status = failures.length === 0 ? "succeeded" : inserted ? "partial" : "failed";
  await db.from("sync_runs").update({
    finished_at: new Date().toISOString(),
    received_count: received,
    inserted_count: inserted,
    status,
    error_message: failures.length
      ? failures.map((failure: any) => `${failure.symbol}: ${failure.message}`).join("; ").slice(0, 4000)
      : null,
    metadata: runMetadata,
  }).eq("id", run.id);

  return json({
    ok: failures.length === 0,
    status,
    sync_run_id: run.id,
    requested_count: batch.length,
    received_count: received,
    inserted_count: inserted,
    eligible_count: eligibleMappings.length,
    skipped_out_of_session: allMappings.length - eligibleMappings.length,
    us_market_open: isUsMarketOpen(now),
    remaining_estimate: Math.max(0, eligibleMappings.length - seen.size - batch.length),
    failures,
  });
});
