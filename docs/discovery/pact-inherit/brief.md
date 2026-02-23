# Discovery Brief: Pact Inheritance (Layered Defaults)

**Date**: 2026-02-23 (updated 2026-02-23)
**Origin**: DISCUSS wave for pact-fmt (Q11, interactive session with Cory)
**Status**: Folded into pact-fmt — design decided, spec updated
**Epic**: pact-y30 (Pact store)

> **Resolution**: Inheritance design was folded into the pact format spec
> (docs/discovery/pact-format-spec.md) rather than requiring a separate
> DISCOVER wave. Key insight: bundle merge complexity doesn't exist because
> bundles are agent instructions, not validated schemas. The protocol passes
> bundles through untouched. Inheritance is a catalog/presentation concern —
> the loader resolves the chain at read time so agents see a single merged
> result. Single-level only (child → parent, no grandchild chains).
> Colon naming convention: `request:backend`.

---

## The Problem

When a team wants a specialized version of an existing pact — say a `security-code-review` that inherits from `code-review` but adds security-specific context fields and overrides `response_mode: all` — they have two bad options today:

1. **Duplicate the pact**: Copy `code-review/PACT.md` to `security-code-review/PACT.md`, modify the copy. Now two files drift independently. If the base `code-review` adds a new field or tightens its contract, `security-code-review` doesn't inherit the change.

2. **Overload the base pact**: Add optional security-specific fields to `code-review` and rely on agents to know when to fill them. The pact becomes a grab-bag that doesn't clearly communicate intent.

Neither scales to 20-30 repos with teams creating domain-specific variations of common pact patterns.

## The Insight

From the DISCUSS session (2026-02-23, Q11):

> "I see a lot of pacts being an 'override layering scheme' almost akin to helm charts being layered. There's the base protocol's handling which if specified by a given Pact has things overridden or changed in logic; and then there's this specific request being sent which can also override or modify things on top of that."
>
> "If a team wants to make a new `ask` pact that's got some domain knowledge or team-specific handling in it, they don't need to edit the old one or duplicate it — they just make a child pact that will override and append as required. Then they can make multiple copies of those and have more nuanced 'asks' which aren't just duplicating the core ask. And if the core ask is changed; the rest are obviously all going to have their inherited values function appropriately."

This describes a **layered inheritance model** where:
- Protocol defaults → base pact → child pact → (future: request-time override)
- Each layer only specifies what it changes
- Inherited values propagate automatically when the parent changes

## What Needs Validation

### Core Questions

1. **Is pact duplication actually happening?** We have ~8 default pacts planned. How many teams would create variations? At what scale does duplication become painful? (Revisit criteria from DISCUSS: "When teams start duplicating pact definitions")

2. **What gets inherited?** Candidates:
   - `defaults` section (response_mode, visibility, claimable) — most obvious
   - `context_bundle` fields — append new required/optional fields to parent's bundle
   - `response_bundle` fields — same
   - `when_to_use` guidance — override or append?
   - `description` — always override?

3. **Resolution semantics**: When child and parent both define `context_bundle.required`, does the child:
   - **Replace** the parent's list entirely?
   - **Merge** (union of both lists)?
   - **Something else** (explicit `+field` / `-field` syntax)?

4. **Depth**: Is single-level inheritance (child → parent) sufficient, or do teams need chains (grandchild → child → parent)? Helm charts support arbitrary depth but most usage is 2-3 levels.

5. **Cross-repo inheritance**: With 20-30 repos sharing a pact store, can a child pact in repo A inherit from a base pact in the shared org store? This connects to the federation config question from the DISCOVER wave.

6. **Catalog impact**: How does inheritance affect `pact_discover`? Does the catalog show the child pact as a standalone entry with resolved values, or does it show the inheritance chain?

### Systems to Analyze

| System | Inheritance Model | Relevance |
|--------|------------------|-----------|
| **Helm charts** | values.yaml layering, deep merge, array replace | Direct analogy — Cory cited this |
| **CSS cascade** | Specificity-based override, inheritance through DOM tree | Layered override model |
| **Docker Compose** | extends + override files | Service definition inheritance |
| **Terraform modules** | Input variables with defaults, module composition | Infrastructure inheritance |
| **OpenAPI** | `$ref` + `allOf` for schema composition | Schema inheritance |
| **GitHub Actions** | Reusable workflows with inputs/overrides | Workflow template inheritance |
| **Protobuf/gRPC** | Message extension, oneof, nested messages | Schema evolution |
| **YAML anchors** | `&anchor` / `*alias` / `<<: *merge` | Native YAML inheritance (limited) |

### Risks to Probe

- **Complexity cliff**: Helm chart debugging is notoriously hard when values cascade through 4+ layers. At what depth does pact inheritance become more confusing than helpful?
- **Merge ambiguity**: Deep-merging nested structures (like bundle field definitions) is where every inheritance system hits edge cases. Arrays, maps, and overrides interact poorly.
- **Tooling tax**: Every tool that reads pacts (pact_discover, pact_do, agents) must now resolve inheritance. What's the token cost of resolution?
- **Breaking parent changes**: If a parent adds a required field, does that break all children? Or do children get a grace period?

## Scope Boundaries

### In Scope for DISCOVER
- Validate whether pact duplication is a real problem at the target scale (~100 users, 20-30 repos)
- Analyze 6-8 real-world inheritance systems for resolution semantics
- Determine which pact fields benefit from inheritance vs. which should always be explicit
- Cost-benefit analysis: implementation complexity vs. duplication pain saved
- Token budget impact of inheritance resolution

### Out of Scope
- Implementation design (DESIGN wave)
- Request-time overrides (deferred separately in DISCUSS, DEF5)
- Federation/multi-repo sync (separate concern, though related)

## Connection to Existing Work

### Current Layering (v1, from DISCUSS)
```
protocol_defaults → pact_defaults → request
     (hardcoded)     (frontmatter)    (no override in v1)
```

### Proposed Layering (if validated)
```
protocol_defaults → base_pact → child_pact → request
     (hardcoded)    (PACT.md)   (PACT.md     (future: sender
                                 + parent:)    override)
```

### Related Beads Issues
- **pact-fmt** (in progress): Defines the `defaults:` section that inheritance would extend
- **pact-meta** (open): Extends PactMetadata — would need a `parent` or `extends` field
- **pact-def** (open): Creates 8 default pacts — these become the base pacts that teams inherit from
- **pact-cat** (open): Compressed catalog — must account for inherited pacts

### Related Deferred Items
- **DEF5** (request-time overrides): The rightmost layer in the chain. Separate from pact-to-pact inheritance but same mental model.
- **Federation config**: Cross-repo pact sharing intersects with cross-repo inheritance.

## Recommended Approach

Start with the **Mom Test**: look at real pact duplication pressure in existing systems (Helm, Docker Compose, OpenAPI) and the team's own likely pact variations. If the evidence says single-level inheritance with merge-for-bundles/override-for-defaults covers 90% of cases, that's the v1 design. If the evidence says teams rarely need inheritance and explicit duplication is fine at this scale, defer it entirely.

Don't start from the solution (inheritance). Start from the pain (duplication, drift, maintenance burden). Let the evidence decide.
