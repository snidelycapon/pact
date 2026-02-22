# ADR-016: Condition Evaluation Strategy

## Status: Accepted

## Context

Brain processing rules (ADR-015) use conditions to determine when a rule should fire. The condition evaluation strategy defines how field values in a request envelope are matched against rule criteria. This decision affects expressiveness, security, testability, and implementation complexity.

The conditions must support:
- Matching field values in the request envelope (top-level and nested in context_bundle)
- Multiple conditions per rule (AND-joined)
- Operators for common comparison patterns (equality, containment, membership, existence, ordering)
- No external dependencies for evaluation

## Decision

Use declarative key-value matching with a closed set of operators. Conditions reference request envelope fields via dot-notation paths and compare against expected values using typed operators.

### Operator Set

| Operator | Input Types | Behavior |
|----------|------------|----------|
| `equals` | string, number, boolean | Exact match. Type-coerced: `"3"` does not equal `3`. |
| `contains` | string | Substring match. Case-insensitive. |
| `in` | any scalar | Value is a member of the provided array. |
| `exists` | boolean | `true`: field is present and not null/undefined. `false`: field is absent or null/undefined. |
| `gt` | number, ISO 8601 date string | Greater than. Numeric comparison for numbers. Lexicographic for ISO dates (which sort correctly as strings). |
| `lt` | number, ISO 8601 date string | Less than. Same typing as `gt`. |

### Field Path Resolution

Dot-notation paths resolve into the request envelope object:
- `status` resolves to `envelope.status`
- `sender.user_id` resolves to `envelope.sender.user_id`
- `context_bundle.urgency` resolves to `envelope.context_bundle.urgency`
- `amendments.0.fields.priority` -- array index access is NOT supported. Use `exists` on the parent array field instead.

If a path resolves to `undefined` (field does not exist), all operators except `exists` evaluate to `false`. The `exists: false` operator evaluates to `true` for missing fields.

### Combination Logic

- Multiple conditions within a single rule are AND-joined. All must match for the rule to fire.
- Multiple rules within a stage are independent. Evaluation semantics are stage-specific:
  - **Validation/Enrichment**: All matching rules fire (accumulative).
  - **Routing**: First matching rule wins (short-circuit).
  - **Auto-response**: Single rule (not an array), fires if all conditions match.

### Template Variable Substitution

Actions that produce text output support `{{field_path}}` substitution:
- `{{context_bundle.question}}` inserts the value of the question field
- `{{sender.display_name}}` inserts the sender's name
- Missing fields resolve to an empty string (no error)

## Alternatives Considered

### JavaScript Expression Strings

Allow conditions to be JavaScript expressions evaluated at runtime (e.g., `"context_bundle.severity > 3 && sender.user_id !== 'bot'"`).

- **Pro**: Maximum expressiveness. Any boolean logic expressible in JavaScript can be a condition.
- **Pro**: Familiar syntax for developers.
- **Con**: Security risk. Expression evaluation is code execution. Even sandboxed eval (vm2, isolated-vm) has a history of sandbox escape vulnerabilities. Skill files are committed by any team member.
- **Con**: Dependency. Requires a JavaScript expression evaluator or `eval`-equivalent in the brain runtime. The brain should be implementable in any language.
- **Con**: Testing complexity. Freeform expressions cannot be structurally validated; they must be executed to verify correctness. Declarative operators can be validated by schema.
- **Con**: Readability in YAML. Multi-line JavaScript expressions in YAML strings are error-prone (quoting, escaping).
- **Rejection rationale**: The security and complexity costs outweigh the expressiveness benefit. The closed operator set covers the known use cases (field matching, containment, existence, ordering). If more complex logic is needed, it belongs in an imperative brain script (out of scope for declarative rules).

### JSONPath / JMESPath Expressions

Use JSONPath or JMESPath for field path resolution and filtering.

- **Pro**: Standardized query languages for JSON data. Well-defined semantics.
- **Pro**: Support array filtering, projections, and multi-value matching natively.
- **Con**: New runtime dependency. JSONPath (`jsonpath-plus`, ~45KB) or JMESPath (`@jmespath/jmespath`, ~35KB) packages would be required.
- **Con**: Over-powered for the use case. Brain conditions match individual fields, not query/filter across arrays or project nested structures. Dot-notation paths with simple operators are sufficient.
- **Con**: Learning curve. JSONPath/JMESPath syntax is non-trivial. Skill authors would need to learn a query language to write conditions.
- **Rejection rationale**: The added dependency and complexity are not justified. Dot-notation field paths with a closed operator set achieve the same result for the known use cases. If array querying or complex projections are needed in the future, JMESPath can be added as an extension operator.

### CEL (Common Expression Language)

Use Google's Common Expression Language for condition evaluation.

- **Pro**: Designed for policy evaluation. Type-safe, sandboxed, non-Turing-complete.
- **Pro**: Used by Firebase Security Rules, Envoy, Kubernetes. Well-established.
- **Con**: Requires a CEL runtime library. No maintained JavaScript/TypeScript CEL implementation with broad adoption.
- **Con**: Heavyweight for the use case. CEL supports macros, list comprehensions, and type checking -- features that are unnecessary for field matching.
- **Con**: Skill authors would need to learn CEL syntax, which is less familiar than YAML key-value matching.
- **Rejection rationale**: CEL is architecturally sound but practically unavailable in the TypeScript/Node.js ecosystem. The closed operator set achieves the same safety guarantees (non-Turing-complete, deterministic) without a runtime dependency.

## Consequences

### Positive

- Deterministic evaluation. Every operator has defined behavior for every input type. No edge cases from expression parsing or runtime evaluation.
- Structurally validatable. A YAML schema can verify that conditions use valid operators, field paths are strings, and operator values are the correct type. No execution needed to validate rule syntax.
- Language-agnostic. The operator set can be implemented in any language (TypeScript brain, Python brain, Go brain). No dependency on a specific expression evaluator.
- Secure by construction. No code execution, no eval, no sandbox needed. Conditions are data, not code.
- Small implementation surface. Six operators, each a pure function (field value, operator, expected value) -> boolean. Estimated ~50 lines of evaluation logic.

### Negative

- Limited expressiveness. Cannot express: OR conditions (only AND within a rule), negation (no `not_equals`, though `exists: false` covers absence), complex boolean combinations, arithmetic in conditions, or regex matching.
- OR logic requires multiple rules. To match "urgency is high OR severity > 3", two separate rules must be written with the same action. This is verbose but unambiguous.
- No negation operator. `not_equals` is omitted to keep the operator set minimal. Workaround: use `in` with all valid values except the excluded one. If negation proves necessary, `not_equals` can be added as a backward-compatible extension.
- Dot-notation does not support array indexing. Conditions cannot match "the first amendment's note contains X". This is acceptable because brain processing typically operates on the initial request, not amendment history.
