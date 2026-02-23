# Definition of Ready Checklist: pact-fmt (Group Envelope Primitives)

**Epic**: pact-y30
**Date**: 2026-02-23
**Author**: Luna (nw-product-owner)

---

## DoR Validation (8-Item Hard Gate)

### 1. Problem statement clear and in domain language
**Status**: ✅ PASS

**Evidence**: Each of the 5 user stories begins with a named persona in a concrete situation:
- US-1: "Tomás is a backend team lead... he has no way to specify that reviews should be claimable"
- US-2: "Cory is a developer who needs a code review from his backend team... he can only send to one person"
- US-3: "Kenji checks his inbox and only sees requests addressed directly to him"
- US-4: "Maria sees a code review request... spends 20 minutes forming comments — only to discover Kenji already submitted"
- US-5: "Cory sends a request to the whole backend team, he doesn't know when the request is 'done'"

All problems stated in user/domain language, no technical jargon in problem statements.

---

### 2. User/persona identified with specific characteristics
**Status**: ✅ PASS

**Evidence**: 4 personas used consistently across stories:
- **Tomás**: Backend team lead, defines pact types, comfortable with YAML
- **Cory**: Developer, sends requests, needs team-level coordination
- **Kenji**: Team member, receives group requests, decides whether to claim
- **Maria**: Team member, needs independent assessments, encounters race conditions

Each persona has role, context, and motivation specified.

---

### 3. At least 3 domain examples with real data
**Status**: ✅ PASS

**Evidence**: Every story has 3 domain examples with real names and scenarios:
- US-1: Claimable code review (Tomás), private assessment (Maria), broadcast (Kenji)
- US-2: Group code review (Cory → @backend-team), direct request (Priya → Kenji), broadcast (Tomás)
- US-3: Mixed inbox (Kenji), claimed request visible (Tomás claimed), non-claimable assessment
- US-4: Successful claim (Kenji), failed claim race (Maria), claim on non-claimable (Priya)
- US-5: Any-mode completion (Kenji), all-mode (4 respondents), private visibility (Maria)

---

### 4. UAT scenarios in Given/When/Then (3-7 scenarios)
**Status**: ✅ PASS

**Evidence**: 21 BDD scenarios across 5 stories:
- US-1: 3 scenarios (with defaults, without, all specified)
- US-2: 4 scenarios (group send, single recipient, validation, defaults merge)
- US-3: 4 scenarios (group in inbox, addressing metadata, claim status, non-claimable)
- US-4: 5 scenarios (successful claim, race condition, non-claimable, proactive offer, claim-before-work)
- US-5: 5 scenarios (any-mode, all-mode, none_required, private visibility, shared visibility)

All in Given/When/Then format with concrete data.

---

### 5. Acceptance criteria derived from UAT
**Status**: ✅ PASS

**Evidence**: 24 acceptance criteria (AC-1.1 through AC-X.4) directly traceable to UAT scenarios:
- AC-1.1–1.4 ← US-1 scenarios
- AC-2.1–2.5 ← US-2 scenarios
- AC-3.1–3.5 ← US-3 scenarios
- AC-4.1–4.6 ← US-4 scenarios
- AC-5.1–5.6 ← US-5 scenarios
- AC-X.1–X.4 ← cross-cutting integration concerns

---

### 6. Story right-sized (1-3 days, 3-7 scenarios)
**Status**: ✅ PASS

**Evidence**:
| Story | Effort | Scenarios | Verdict |
|-------|--------|-----------|---------|
| US-1 | 1-2 days | 3 | ✅ Right-sized |
| US-2 | 2-3 days | 4 | ✅ Right-sized |
| US-3 | 1-2 days | 4 | ✅ Right-sized |
| US-4 | 2-3 days | 5 | ✅ Right-sized |
| US-5 | 2-3 days | 5 | ✅ Right-sized |

All stories within 1-3 day range, 3-5 scenarios each.

---

### 7. Technical notes identify constraints and dependencies
**Status**: ✅ PASS

**Evidence**: Each story includes Technical Notes section:
- US-1: PactMetadata interface change, pact-loader.ts, pact-discover.ts
- US-2: Breaking schema change (recipient→recipients), schemas.ts, pact-request.ts
- US-3: pact-inbox.ts filter change, depends on US-2
- US-4: New pact-claim.ts, action-dispatcher.ts registration, git atomic operations
- US-5: pact-respond.ts mode logic, pact-status.ts/pact-thread.ts visibility filtering

Constraints documented: git transport, flat-file format, MCP tool surface, token budget.

---

### 8. Dependencies resolved or tracked
**Status**: ✅ PASS

**Evidence**: Dependency graph documented in user-stories.md:
```
US-1 → US-2 → US-3 → US-4 → US-5
```

Cross-task dependencies tracked:
- pact-fmt (format spec) blocks all stories
- pact-grp (group addressing schema) relates to US-2
- pact-meta (PactMetadata extension) relates to US-1

Deferred items tracked with revisit criteria in journey YAML and shared-artifacts-registry.md.

---

## Summary

| DoR Item | Status |
|----------|--------|
| 1. Problem statement clear | ✅ PASS |
| 2. User/persona identified | ✅ PASS |
| 3. 3+ domain examples | ✅ PASS |
| 4. UAT in Given/When/Then | ✅ PASS |
| 5. AC derived from UAT | ✅ PASS |
| 6. Right-sized stories | ✅ PASS |
| 7. Technical constraints | ✅ PASS |
| 8. Dependencies tracked | ✅ PASS |

**Verdict**: **ALL 8 ITEMS PASS** — Ready for peer review and DESIGN wave handoff.
