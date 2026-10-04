-- Independent monitor only. Does not invoke the AI controller or place trades.
begin;
select cron.schedule('trading-pipeline-watchdog-v1','*/15 * * * *','select private.run_trading_watchdog_v1();');
select private.run_trading_watchdog_v1();
commit;
