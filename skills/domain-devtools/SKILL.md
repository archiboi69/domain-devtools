---
name: domain-devtools
description: Domain Devtools for Alchemy.Domain. Use when generating, rendering, or explaining command and aggregate state diagrams, or when another skill needs domain diagram artifacts.
---

# Domain Devtools

Produce diagrams from the application's actual contracts and source. Choose the view for the reader's task, preserve analysis limits, and deliver a usable artifact.

## 1. Select scope and view

Locate the application's model exports and existing discovery configuration. Use Domain names from the tool's discovery output rather than guessing from filenames or export aliases. Resolve ambiguity by narrowing the model or entry, not by changing the application's exports.

Choose the smallest useful report:

| Reader needs                                      | View               |
| ------------------------------------------------- | ------------------ |
| One command's intent, outcomes, and handlers      | One command        |
| An aggregate's full command surface               | Aggregate commands |
| Lifecycle structure, including same-state changes | Aggregate states   |

For a broad overview, start with state reports and generate command detail for the aggregates the reader selects. For an explicitly requested complete set, enumerate targets from discovery and account for each one.

**Complete when:** the application, entries, targets, and report types are identified.

## 2. Generate against the application

Read [setup and invocation](../../README.md#generate-a-diagram) and consult CLI help for syntax. Resolve the tool location from this skill's repository, then run from the application's directory so its dependencies and TypeScript configuration supply the analysis context.

Inspect entry modules before importing them: discovery executes module-level code. Prefer existing model exports over diagram-only models. Keep generated reports outside application source unless the user requests maintained documentation.

The CLI writes Markdown to stdout and diagnostics to stderr. Choose an output destination for the task:

- Redirect to a file for later reading, comparison, or documentation.
- Pipe to a pager, another program, or an existing documentation pipeline for immediate use.
- Preview with an available Mermaid-compatible Markdown viewer when the user wants a visual diagram.

Keep diagnostics separate from the Markdown and check the generator's exit status. In a pipeline, preserve upstream failures rather than relying only on the last program's status. When replacing an existing report, generate into a temporary file and publish it only after success; direct redirection can truncate the previous report. For a batch, retain the target-to-output mapping and failures for individual targets.

**Complete when:** every selected target has either successful output at its chosen destination, with diagnostics accounted for, or an explicit failure.

## 3. Read and deliver

Read [output interpretation](../../README.md#read-the-output) before explaining a diagram. Include relevant analysis gaps with the artifact. When a state graph is unavailable, retain the structural schema report and offer command diagrams as the useful alternative.

Use the user's available tools for visual output. If no suitable viewer is available, deliver the Markdown and explain that a Mermaid-compatible preview is optional. Make visual claims only after inspecting the rendered result. Review generated handler source for sensitive content before sharing it beyond the local workspace.

Identify saved artifact paths or the destination that received the output, explain what each view answers, and state any limits that affect the reader's question. Generation alone does not call for tests or changes to application behavior. When the user asks whether a surprising diagram reveals a domain problem, use [domain-devtools-investigation](../domain-devtools-investigation/SKILL.md).

**Complete when:** the requested artifacts are accessible, visual claims have rendered evidence, and failures or partial analysis are visible to the reader.
