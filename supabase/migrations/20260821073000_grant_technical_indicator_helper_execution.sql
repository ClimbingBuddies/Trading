-- TECH-002 Auditor rework: complete the trusted SECURITY INVOKER call chain.
--
-- refresh_v1 executes as its caller. The service role therefore needs EXECUTE
-- on each private calculation helper invoked by the refresh entry point.
-- Client roles remain denied schema usage and function execution.

revoke execute on function technical_engine.sma(numeric[], integer)
  from public, anon, authenticated;
revoke execute on function technical_engine.ema(numeric[], integer)
  from public, anon, authenticated;
revoke execute on function technical_engine.rsi_wilder(numeric[], integer)
  from public, anon, authenticated;
revoke execute on function technical_engine.macd(numeric[])
  from public, anon, authenticated;
revoke execute on function technical_engine.annualised_volatility(numeric[], integer, integer)
  from public, anon, authenticated;

grant execute on function technical_engine.sma(numeric[], integer)
  to service_role;
grant execute on function technical_engine.ema(numeric[], integer)
  to service_role;
grant execute on function technical_engine.rsi_wilder(numeric[], integer)
  to service_role;
grant execute on function technical_engine.macd(numeric[])
  to service_role;
grant execute on function technical_engine.annualised_volatility(numeric[], integer, integer)
  to service_role;

comment on function technical_engine.refresh_v1(uuid) is
  'Service-role-only, idempotent refresh for technical-engine-v1. SECURITY INVOKER execution is supported by explicit service_role grants on all private calculation helpers.';
