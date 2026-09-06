# Private holdings CSV import v1

**Status:** local contract, parser, atomic RPC and preview/confirmation UI implemented for MYDASH-004  
**Scope:** optional import into one existing owner-scoped manual portfolio  
**Out of scope:** broker files or identifiers, broker connections, live trading, instrument creation, valuation, quantity/value estimation and provider requests

## User flow and trust boundary

The authenticated user selects an active manual portfolio, then drops or chooses one UTF-8 `.csv` file. Parsing and preview occur in memory in the browser; selecting a file never writes data. The preview lists every input row with its normalized values and one state: `READY`, `WARNING` or `ERROR`. The confirmation control remains disabled while any row is `ERROR`. Persistence begins only after an explicit **Import holdings** confirmation and only for the displayed preview revision.

The browser obtains the current permanent user from Supabase immediately before preview and again immediately before confirmation. Signed-out and anonymous users are denied. Neither `owner_user_id`, `portfolio_id` nor `instrument_id` is accepted from the CSV. The selected portfolio must still be active, manual and owned by the current user; every inserted or updated position uses that current user's ID and remains protected by the existing RLS and parent-owner foreign key.

## Canonical file contract

- UTF-8 text, optional UTF-8 BOM, comma delimiter, RFC 4180 quoting, one header row, maximum 1 MiB and 1,000 data rows.
- Header comparison is case-insensitive after trimming. Unknown columns are an error so broker-account metadata cannot pass through unnoticed.
- Blank physical lines are ignored. A row whose canonical fields are all blank is an error rather than an inferred deletion.
- Decimal input uses an optional leading `+`, ASCII digits and at most one `.`; grouping separators, currency symbols, exponents, percentages, `NaN` and infinity are rejected.

| Column | Required | Contract |
|---|---:|---|
| `symbol` | yes | 1–32 trimmed characters; normalized to uppercase for matching; control characters rejected |
| `exchange_code` | yes | 1–16 trimmed ASCII letters, digits, `_`, `-` or `.`; normalized to uppercase |
| `quantity` | yes | Exact positive decimal with at most 12 fractional digits and at most 30 total digits; never derived from market value |
| `average_cost_per_unit` | no | Blank means explicitly incomplete cost basis; otherwise an exact non-negative decimal with the same precision limits |
| `cost_currency` | yes | Exactly three ASCII letters, normalized to uppercase |
| `acquired_at` | no | Blank or a real calendar date in `YYYY-MM-DD`; future dates are errors |
| `notes` | no | Trimmed, control-free text up to 500 characters; retained only as private position data |

The file must not contain account number, account name, broker, BSB, routing, tax identifier, market value, total cost, price or any unrecognized column. The UI explains that users should export or create only the canonical columns above.

## Instrument resolution and row validation

The preview resolves each normalized `(symbol, exchange_code)` against active rows already returned from `public.instruments`. Exactly one match is required. Zero matches produce `UNKNOWN_INSTRUMENT`; multiple matches produce `AMBIGUOUS_INSTRUMENT`. The importer never creates an instrument and never calls Tiingo, Twelve Data or another provider while parsing or confirming.

Rows are validated independently and retain their one-based CSV line number. Duplicate normalized instrument keys within the same file are `DUPLICATE_IN_FILE` errors; quantities are not summed. A match to an existing position in the selected portfolio is a `WILL_REPLACE` warning, showing old/new fields without persisting either in logs or documentation. New matches are `WILL_ADD`. Missing optional cost or acquisition date is a warning and remains null; it is never estimated. Validation output uses stable codes plus user-readable messages.

## Confirmation and persistence semantics

Confirmation rechecks the authenticated permanent user, selected portfolio ownership/status/kind, preview revision, and current positions. If any input affecting the preview changed, confirmation stops with `PREVIEW_STALE` and requires a fresh preview.

The v1 commit is all-or-nothing. In one owner-checking database transaction/RPC, lock the selected portfolio, re-resolve all instrument IDs, reject duplicates or validation drift, then upsert only the previewed rows using `(portfolio_id, instrument_id)`. Set `owner_user_id` from `auth.uid()`, `position_source = 'manual'`, `source_decision_id = null`, and copy only the canonical position fields. Existing positions absent from the file are unchanged; this is not portfolio replacement. Any failure rolls back every row. Success returns counts and IDs only for the active owner, after which the UI clears the in-memory file/preview and reloads private positions.

Direct browser multi-row writes are not sufficient because they cannot guarantee atomicity or preview freshness. The implementation step should add a narrowly granted `security invoker` RPC (or equivalent transactional database function) with an empty `search_path`, explicit permanent-user and portfolio-owner checks, a typed JSON row payload, and no service-role or provider credential in browser code.

## Required implementation and verification slices

1. **Implemented locally:** pure parser/normalizer with fixture-free synthetic tests for quoting, BOM, limits, decimals, dates, forbidden/unknown columns, duplicates and stable error codes.
2. **Implemented locally:** owner-checking atomic import migration/RPC and migration-source tests; existing manual single-position entry remains supported.
3. **Implemented locally:** accessible drop zone, file picker, in-memory preview table, error summary, explicit confirmation and stale/success states in Portfolio Health.
4. Verify desktop and 390 × 844 layout, keyboard-only file selection/confirmation, signed-out denial, Test A versus owner isolation, atomic rollback, replacement warning and explicit null cost basis. Never retain private CSV rows, screenshots, values or identifiers in repository evidence.
