# Phase 1 Schema Proposal

**Status: SUPERSEDED**

This document was written against the earlier multi-phase roadmap. The project
scope has since been narrowed to a local-only extension (no backend, no accounts,
no remote config). The Phase 1 entity design in that roadmap has also changed.

The active Phase 1 specification is in `docs/pricewatch-roadmap.md`, PART B.
Key differences from what was proposed here:

| Topic | Old proposal | New spec |
|---|---|---|
| Entities | Product + Variant + PriceObservation + Watch (4) | Product + PriceObservation + Watch (3, no Variant entity) |
| Observation storage | Per-observation storage keys | Compact positional arrays on Product record |
| Observation cap | 200 per product | 400 per product, plus permanent all-time min/max |
| Storage engine | Split chrome.storage.local keys | chrome.storage.local (split key design still recommended, but this is part of the new proposal to write) |
| Variant identity | Explicit Variant entity with size/color/seller | Not in scope for Phase 1 |
| Phase 3-6 scope | Price protection, shared polling, cross-retailer matching | Dropped entirely |

Do not implement from this document. Wait for the new Phase 1 schema proposal
to be written and approved per `docs/pricewatch-roadmap.md` PART B instructions.
