# Specification Quality Checklist: US-10.3 — Add a variation to a loop

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-25
**Feature**: [spec.md — User Story 62](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — the story names stores by their contract names (`rm.localMeta.v1`, FR-006), as every neighbouring story does; module names live in research D-020 and tasks T436 only
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders — each device is stated as what a musician hears change
- [x] All mandatory sections completed — User Story, rationale, Independent Test, Acceptance Scenarios with Cases

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — the three open questions (structure, base phrase, ghost notes) were put to the maintainer on 2026-10-25 and are recorded in the rationale; the turnaround question is answered in the rationale and D-020
- [x] Requirements are testable and unambiguous — every device Case states its rule and its unavailability condition
- [x] Success criteria are measurable — the existing Success Criteria section is unchanged; this story adds no new measurable outcome beyond AC coverage
- [x] Success criteria are technology-agnostic
- [x] All acceptance scenarios are defined — AC-10.3.1–AC-10.3.5, 45 Cases; AC-15.1.8 revised with a dated parenthetical
- [x] Edge cases are identified — the cap, a shipped Pattern, a remembered length longer than the Pattern, a draft Slot without a Pitch, a note at the octave limit, a chord-tone Pitch
- [x] Scope is clearly bounded — ghost notes, layers, a harmonic turnaround and the per-control dice are named as out
- [x] Dependencies and assumptions identified — US-10.1, US-7.2, US-7.3, AC-1.1.3, AC-1.1.9, AC-2.2.8, AC-2.6.3, FR-006

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows — add one, add over the latest, add over the original, hit the cap, discard
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Traceability: P-066 in plan.md, T436 (implementation) and T437 (tests) in tasks.md, D-020 in research.md, `phraseLength` in data-model §6 — all added in the same change, per CLAUDE.md §2b.
- `check:trace` T5/T6 will report the new criteria until T437's tests exist; they land in the same PR.
