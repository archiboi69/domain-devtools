---
name: domain-devtools-investigation
description: Domain diagram investigation with Domain Devtools. Use when diagnosing surprising command or state transitions, reviewing lifecycle complexity, or verifying the behavioral effect of a domain refactor.
---

# Domain Devtools Investigation

**Triangulate** a suspicious transition with its handlers, callers, and behavioral evidence before drawing a conclusion.

## 1. Frame the question

Name the behavior under investigation: what starts an operation, what permits replacement, what makes an outcome final, or which states a command can change. Identify the owning aggregate and the expected rule from domain requirements or existing behavioral tests.

Use [domain-devtools](../domain-devtools/SKILL.md) to select, generate, and interpret the reports. Read analysis gaps before following arrows. An absent state graph alone does not justify a tagged-state refactor.

**Complete when:** the question, expected rule or unresolved requirement, and relevant reports are identified.

## 2. Triangulate surprises

For each transition relevant to the question:

1. Find its numbered evidence row and identify **From / Command / Event / To**.
2. Read the original `decide` and `evolve` handlers. Follow helpers and guards omitted from the graph, including operation identity and event ordering.
3. Trace the caller that supplies the command and the consumer that acts on its event. Check who owns retries, reconciliation, authorization, and idempotency.
4. Use an existing test or Story, or construct a focused scenario, to distinguish an executable path from a static candidate. Record untested paths as hypotheses.

Use graph shapes to choose questions, not verdicts:

| Signal | Question to investigate |
| --- | --- |
| Many states accept the same outcome event | Is this a shared rule, a broad status payload, or missing lifecycle guards? |
| Configuration also starts work | Does one command hide distinct intents? |
| A terminal state leads back to active work | Is this the same entity resuming, or a new operation replacing an old one? |
| The same lifecycle appears in an aggregate, workflow, and view | Which owner needs it for decisions, and which consumers can derive their representation? |
| A missing arrow or unexpected self-loop | Is behavior absent, same-tag data changing, or analysis incomplete? |

Classify each finding as a domain rule, a domain defect, an analysis limitation, or an unresolved hypothesis. For an analyzer defect, isolate the TypeScript pattern in a synthetic fixture; application-specific exceptions do not belong in the analyzer.

**Complete when:** every reported finding has source evidence and an explicit classification, with execution evidence distinguished from inference. For an analysis-only task, report the findings and stop here.

## 3. Verify an authorized change

Establish the invariant and ownership change before editing. Check persisted schemas and external callers before removing a contract. Preserve required concurrency and recovery behavior even when it makes the graph larger.

Regenerate the affected state and command reports through the usage skill. Compare transition tuples, not transition numbers: numbers belong to one report and can shift after edits. Explain each relevant added or removed transition, then verify the corresponding behavior with focused tests and the repository's required checks.

Judge simplification by fewer duplicated decisions and less state for a reader to track. Fewer nodes can also mean that complexity moved into a payload, helper, or another service.

**Complete when:** changed transitions are explained, preserved invariants have behavioral coverage, required checks have results, and remaining analysis gaps or migration requirements are explicit. A gap-free report is not a reachability proof or a substitute for those checks.
