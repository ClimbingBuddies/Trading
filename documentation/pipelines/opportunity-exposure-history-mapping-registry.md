# Opportunity Exposure History Mapping Registry

**Registry version:** 1.0  
**Last updated:** 02 September 2026  
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

This registry records explicit, reviewed provider-identity decisions for external Opportunity exposures used only for long-term historical trend support.

It supplements `documentation/pipelines/opportunity-exposure-history-cleanup.md`. The cleanup must retrieve this file fresh whenever an external exposure requires a non-trivial Tiingo identity or an ADR/OTC historical proxy.

A registry entry is an identity decision, not permission to promote a security into the active Trading universe.

## Safety boundary

- Active Trading universe remains `public.instruments.is_active = true`.
- Historical-only and proxy instruments remain `is_active = false` outside a bounded provider call.
- No Twelve Data mapping may be created for a history-only/proxy instrument unless separately approved.
- An ADR/OTC proxy must have its own supporting `public.instruments` row with its own trading currency. Never store proxy USD prices under the local-market instrument's currency.
- Proxy history is suitable for percentage trend/research context; it is not the local ordinary share's exact raw-price series.
- Provider pulls remain subject to the current Tiingo licensing gate in the cleanup specification.

## High-confidence resolved mappings — 02 September 2026

| Canonical Opportunity exposure | Historical support | Mapping kind | Tiingo symbol | Currency | Status | Basis |
|---|---|---|---|---|---|---|
| `300750.SZ` CATL | same security, Shenzhen A-share | direct | `300750` | CNY | RESOLVED | Tiingo EOD explicitly covers Shenzhen A-shares; local security ticker is 300750. |
| `688836.SS` Unitree Robotics | same security, Shanghai A-share | direct | `688836` | CNY | RESOLVED | Tiingo EOD explicitly covers Shanghai A-shares; local security ticker is 688836. Since listing is recent, available history may be short. |
| `ABBNY` ABB Ltd. | current US ADR | direct ADR | `ABBNY` | USD | RESOLVED | ABB's former NYSE `ABB` ADS was delisted in 2023; current Level I ADR trades OTC as ABBNY. Tiingo publicly identifies ABB Ltd as ABBNY. Opportunity exposure identity was corrected from stale `ABB`/NYSE to `ABBNY`/OTC. |
| `1211.HK` BYD Co. Ltd | `BYDDY` ADR | historical proxy ADR | `BYDDY` | USD | RESOLVED_PROXY | Citi identifies active OTC ADR BYDDY linked to ordinary ticker 1211 HK, current ratio 1:1. Tiingo EOD covers OTC securities. |
| `SU.PA` Schneider Electric SE | `SBGSY` ADR | historical proxy ADR | `SBGSY` | USD | RESOLVED_PROXY | Citi identifies active OTC ADR SBGSY linked to Schneider ordinary share, ratio 1:5. Tiingo EOD covers OTC securities. |
| `VIE.PA` Veolia Environnement SA | `VEOEY` ADR | historical proxy ADR | `VEOEY` | USD | RESOLVED_PROXY | Veolia identifies sponsored Level 1 OTC ADR VEOEY linked to its Paris ordinary share, ratio 1:1. Tiingo EOD covers OTC securities. |

## Persisted Supabase representation

The direct historical-only rows are:

- `300750.SZ` -> Tiingo `300750`
- `688836.SS` -> Tiingo `688836`
- `ABBNY` -> Tiingo `ABBNY`

The proxy supporting rows are:

- `BYDDY`, metadata `proxy_for_external_symbol = '1211.HK'`
- `SBGSY`, metadata `proxy_for_external_symbol = 'SU.PA'`
- `VEOEY`, metadata `proxy_for_external_symbol = 'VIE.PA'`

Proxy mappings use `tracking_scope = 'external_opportunity_history_proxy'` and `mapping_kind = 'historical_proxy_adr'` in `public.provider_instruments.metadata`.

## Still unresolved

The following remain unresolved for five-year Tiingo historical support and must not be guessed:

- `000660.KS` — SK hynix. New US ADR/ADS history is too recent to substitute for a five-year Korean ordinary-share trend.
- `373220.KS` — LG Energy Solution. No approved long-history US proxy established.
- `2082.SR` — ACWA Power. Saudi primary listing; no approved Tiingo-supported proxy established.
- `ADANIENSOL.NS` — Adani Energy Solutions. Indian primary listing; no approved Tiingo-supported proxy established.
- `ENR.DE` — Siemens Energy. `SMERY` is a plausible current US OTC route, but the recent symbol/program transition requires continuity validation before it is accepted as a five-year proxy.

## Controller interpretation

When the cleanup sees a canonical exposure covered by `RESOLVED_PROXY`, it must look for the supporting proxy instrument through `public.provider_instruments.metadata ->> 'proxy_for_external_symbol'` instead of creating a same-symbol instrument.

A proxy is complete only when the proxy support row has acceptable Tiingo coverage and the controller report clearly labels the history as a proxy.

Do not silently rewrite the canonical Opportunity exposure to the proxy symbol, except where this registry explicitly records a corrected current security identity such as ABB -> ABBNY.
