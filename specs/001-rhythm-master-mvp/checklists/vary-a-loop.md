# Specification Quality Checklist: Vary a loop (US-10.4)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-01
**Feature**: [spec.md](../spec.md) — User Story 67; design input in [variations-brief.md](../variations-brief.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — the one store key named, `rm.localMeta.v1`, is the spec's own convention for Local Metadata (FR-006)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — the three open questions (where chord changes live, catalogue scope, landing mode) were put to the maintainer on 2026-11-01 and answered before writing
- [x] Requirements are testable and unambiguous — every compound criterion is decomposed into numbered Cases; each technique's rule names its choice, its default and when it is unavailable
- [x] Success criteria are measurable — SC-001 to SC-007 are unchanged; the Independent Test names the observable outcomes
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified — cap, shipped Pattern, stopped transport, a technique invalidated by an earlier change, a chord lacking the override's member, a Pattern saved before overrides existed, progression changing every Measure
- [x] Scope is clearly bounded — out of scope, named in the brief: chord changes inside a Measure, passing chords, stroke types, half-time feel, humanise; editing an override by hand in the chord editor
- [x] Dependencies and assumptions identified — US-10.1 (append), US-2.15 (chord fill), US-2.16 (omit), US-2.11 (bass), US-2.14 (No dice framing), AC-2.7.1/4 (the overlay), D-021 (dice outside the core)

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows — build by hand, roll, accept and vary again, remove, export, compare
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Spec-first: the story, AC-15.1.8's dated note and the US-10.3 stub's pointer were written before any code (CLAUDE.md §2).
- Plan item P-071, tasks T466/T467, data-model §harmony (`overrides`), research.md D-025 and `phraseLength`'s return to Local Metadata land with the implementation, before the matrix is regenerated.
