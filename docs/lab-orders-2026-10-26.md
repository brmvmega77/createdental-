# Separate production work per service

A clinic order remains the commercial record, print document and shared source-file folder. Distinct service IDs generate stable child work IDs for the laboratory. Repeated positions of the same service remain one work; surgical sockets stay with their template. Each work has its own assignments, production statuses, QC, CAD review, history and salary accruals.

Routes read the current catalogue, including existing orders. Doctor approval follows CAD only for planning/diagnostics and restorations. Unknown historical categories retain their prior doctor-approval contract until classified. Other services use the chief's CAD QC as their production/payment gate. Restorations exclude the category-one technician. Intermediate QC is mapped onto its associated stage in clinic progress.

The clinic sees a per-service route and completed visible steps / total visible steps across all works. All works must pass final QC before the chief can dispatch the common order. Clinical acceptance completes all works atomically. A rework request reopens production and clears common dispatch readiness.

Collection writes reconcile parent/children in the existing transaction, with collection and record revisions. Commercial prices/delivery/payment are counted once. Existing payroll entries are preserved; inherited completed roles cannot accrue twice. The chief prints the parent document from any child. Shared input files remain in the existing folder, new work files use subfolders; file API authorization still checks assignments. Clinic notifications link to the common order.

Validated locally: syntax checks; 96 tests, including split/idempotency, actual catalogue categories in digital/analog flows, independent CAD and payroll, scoped files, service edits, stale writes, shared delivery, acceptance, rework, failed cloud setup cleanup, and restart persistence.
Validated on isolated PostgreSQL databases: six lab-order tests and nine flow-integrity tests, including rollback on persistence failure. No working database was used for test writes, and no real Telegram messages were sent during testing.
Browser QA: clinic group and per-service routes at desktop/mobile widths; no horizontal overflow; chief work confirmation and CAD assignment on a disconnected local copy.

Production preflight: 5 clinic orders -> 13 lab works, unchanged commercial totals and existing salary ledger; stable repeat migration. Fresh pre-deploy full backup: /root/backups/lab-work-split-final-20261026-192843 (database dump, state, files and previous application code).
