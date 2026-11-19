# Research source collection and recovery

**Execution contract:** 1.1, 19 November 2026. This changes collection and failure evidence, not analytical methodology, source approval or schedules.

The daily controller, External Opinion and independent Market research must read this file at the same resolved GitHub commit before collection. Use only tools actually available in that invocation. A local operator's successful fetch does not prove the hosted task can fetch the same document.

## Collect before freezing the cutoff

1. Resolve the active instrument's issuer and exchange identity before searching. A ticker alone can identify a former or unrelated company. Use current issuer/exchange provenance; do not copy a search engine's stale company label.
2. Read the live source registry. For issuer documents, establish the official investor-relations page first. An explicitly linked publication host can be an issuer's delivery channel; retain the official page -> document link as provenance. This does not approve that host for a statically restricted source family.
3. Follow the actual document link and read its body. A search snippet, announcement title, HTTP 200, index page or PDF header alone is not evidence for the document's claims. Preserve original URL, resolved URL, publication date and actual verification time separately. A listing's generic page-count badge is not proof of document length.
4. Complete required private research receipts before freezing a new Market cutoff. Use the existing trusted helpers and receipt/evidence links; never change receipt times or an existing cutoff. A diagnostic fetch after a cutoff cannot repair that run.

## Bounded fallback order

On an unsuccessful initial read, classify the failure before trying at most two distinct alternatives for that item, within the controller's existing 90-minute invocation budget. Do not loop on an unchanged failing URL or spend the whole stage on one source. Continue other eligible instruments/families; record unvisited scope explicitly when time expires.

| Observed failure | Allowed recovery | Remaining reason if unsuccessful |
| --- | --- | --- |
| Reader says content is too large | Follow an official HTML/text version of the same document, or use an already available authorized bounded PDF reader. If a different current issuer document is available, assess it on its own date and claims and retain the unread item's limitation. | `READER_SIZE_LIMIT` |
| Reader cannot open a URL, without an upstream response | Try the original publisher's linked canonical URL or another available authorized public HTTP reader. Do not describe this as an issuer 403. | `READER_FETCH_UNAVAILABLE` |
| Empty JavaScript announcement page | Inspect the page's public publication links/feed using a capable tool. Verify the feed is referenced by the official site's public assets. Retrieve the individual document before using its claims. An empty HTML shell does not prove no announcements exist. | `DYNAMIC_INDEX_UNREADABLE` |
| Actual HTTP 401/403, login/paywall/CAPTCHA | Stop that protected path. A separately published public issuer/regulator document can be evaluated independently, without impersonation, proxies or circumventing restrictions. | `SOURCE_ACCESS_DENIED` |
| HTTP 429 or explicit rate limit | Honour Retry-After; stop new requests to that host for this invocation if the wait exceeds the remaining budget. | `SOURCE_RATE_LIMITED` |
| HTTP 404/410 | Follow the current official index to a replacement; never synthesize a document ID or publication date. | `SOURCE_DOCUMENT_MISSING` |
| Document opens but relevant content/date/identity cannot be verified | Omit unsupported claims; preserve valid independently verified evidence with its limitations. | `SOURCE_CONTENT_UNVERIFIED` |
| No usable tool for the required fallback | Record the missing capability. Do not assume a desktop CLI, local files or a browser session exists in a cloud task. | `RUNTIME_READER_CAPABILITY_UNAVAILABLE` |

For PDFs, retain a hash of the complete fetched content when the existing receipt contract requires it. Do not hash a URL, an HTTP header, a title or a truncated extract as if it were the complete document. A tool's byte/page limit remains binding. Do not rehost publisher content publicly to work around a reader limitation.

Recovering one current document does not establish comprehensive current-news coverage. An unread material newer document must remain a disclosed gap and can still block an assessment under the existing methodology. Do not turn incomplete information into a bullish/neutral opinion merely to obtain a green run.

For paginated indexes, inspect returned page/count/total metadata; a requested page size is not proof that the server honoured it. Follow public next-page links within the collection budget and applicable lookback. Record any pages/scope left unread. A homepage's "latest" label is not a publication date; verify the actual document date and compare with the current index. Never substitute an older presentation as current merely because it is easier to open.

## Source-specific collection

- **Official company:** follow the issuer's current announcement/financial-report page and its actual document links. Some issuer sites use a linked WebLink feed and return a PDF after an ASPX redirect. Treat discovery, document fetch and evidence validation as separate steps. Do not guess headline IDs or globally approve WebLink domains.
- **Research:** prefer the publisher's current index, then its HTML version when a PDF cannot be read. For Federal Reserve minutes, start at `https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm`, follow the actual minutes link and record release date separately from meeting date. Test instrument relevance; one macro document is not automatically an opinion for every instrument.
- **Regulatory:** obey the current static domain registry. For SEC filings, discover the actual issuer/CIK, accession and primary filing URL through official indexes or a public issuer link to SEC; a JavaScript search shell is not a completed filing check. Preserve access failures. ASX documents are not implicitly approved for the SEC-only regulatory family; verified issuer copies may belong to official-company evidence.
- **Financial news:** use the approved original article body/date. A Reuters listing, syndicated copy or search snippet is not a replacement for a blocked original under the existing registry. Preserve that gap and continue other families.
- **Analyst consensus:** verify the current dated source page and security identity. A successfully read snapshot is valid scoped evidence; it does not prove full-universe analyst coverage.

## Durable failure evidence

Use existing `external_opinion.record_source_result_v1` metadata; no schema change is needed. For each active source family record `collection_contract: research-source-recovery-v1`, `source_sha`, `checked_at`, and a disjoint per-instrument `coverage_ledger`.

Also record `reader_capabilities` from this invocation: actual tool identifiers, whether original HTTP response status was observed, whether a full document body/hash was obtained, and any byte/page/extraction limits observed. Mark untested capabilities `unverified`; an available tool name or a desktop diagnostic does not prove hosted PDF support. These fields describe observations and do not authorize new tools, permissions or infrastructure.

Each `coverage_ledger` row has:

- `instrument_id` and `outcome`: `verified_material`, `checked_no_material`, `not_applicable`, `blocked`, or `not_checked`;
- a concrete `reason`, with `not_checked` explaining time/capability limits;
- `attempts`: original/resolved public URL, tool identity, actual observation time, observed HTTP status if available (otherwise null), error class and whether the document body was read;
- publication date and provenance reference for accepted evidence; missing dates remain missing;
- a specific `next_action` for blocked/not-checked rows.

Reconcile ledger rows to the active run scope, without duplicates. Keep this detail in protected database metadata, not public GitHub issues. Never include credentials, headers containing tokens, cookies, personal notes, portfolio data or raw publisher documents.

The family result is `succeeded` only if every applicable instrument was checked reliably, including valid no-material-item outcomes. It is `skipped` only when the entire family is explicitly not applicable. Any blocked/unvisited applicable scope keeps it `failed` with the exact reasons, even if some opinions were inserted. Keep accepted opinions and their counts; do not overwrite history to make the status green. Coverage `current/stale/none` describes saved opinions, not whether today's collection succeeded.

Run `scripts/research-source-failures.sql` as a read-only diagnostic. It distinguishes saved partial output from source failure and missing collection telemetry. Historical records without this ledger remain unverified; do not invent retrospective attempts.

## Verification boundary

An operator diagnosis on 19 November reproduced a web-reader size rejection for an issuer PDF while a different current issuer document was readable. Another issuer's dynamic index/feed and PDF were reachable via public HTTP but unavailable through the web reader. Federal Reserve minutes were readable through the official calendar's HTML link. Reuters retrieval remained unavailable. These observations justify fallback and precise telemetry; they do not certify a future hosted invocation or clear any saved-run blocker.

Accept recovery only after a genuine scheduled invocation adopts this source commit, saves truthful per-source evidence and any eligible research/publication through the existing lifecycle. No same-date duplicate run, cutoff rewrite, new scheduler, source-domain expansion or provider migration is authorized by this contract.
