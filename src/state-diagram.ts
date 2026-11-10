import { Array, Effect, Function, Predicate, Schema, SchemaAST, String as Str } from "effect";
import { type Checker, TypeFlags } from "typescript/sync";
import {
  type Node,
  isConditionalExpression,
  isArrayLiteralExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isStringLiteral,
  isNewExpression,
  isYieldExpression,
} from "typescript/ast";
import { type AggregateContract, stateTags } from "./diagram";
import { inspectHandlers, type HandlerNodes } from "./source";
import { literalTag, returnPaths, unwrap, type ReturnPath } from "./state-flow";
import type { DiagramError } from "./diagram-error";

export interface StateTransition {
  readonly from: string;
  readonly event: string;
  readonly to: string;
  readonly command: string;
}
export interface StateDiagram {
  readonly name: string;
  readonly states: readonly string[];
  readonly initial: string | undefined;
  readonly transitions: readonly StateTransition[];
  readonly unresolved: readonly string[];
}

function tagAlternatives(expression: Node): readonly (string | undefined)[] {
  const value = unwrap(expression);
  if (isStringLiteral(value)) return [value.text];
  if (isConditionalExpression(value))
    return Array.fromIterable(
      new Set([...tagAlternatives(value.whenTrue), ...tagAlternatives(value.whenFalse)]),
    );
  return [undefined];
}

function destinations(
  path: ReturnPath,
  from: string,
  checker: Checker,
): readonly (string | undefined)[] {
  const node = unwrap(path.expression);
  if (isIdentifier(node) && path.aliases.has(node.getText())) return [from];
  if (!isObjectLiteralExpression(node)) return [literalTag({ checker, node })];
  let tags: readonly (string | undefined)[] = [undefined];
  for (const property of node.properties) {
    if (isPropertyAssignment(property)) {
      const name = property.name;
      if (!isIdentifier(name) && !isStringLiteral(name)) return [undefined];
      if ((isIdentifier(name) ? name.getText() : name.text) === "_tag")
        tags = tagAlternatives(property.initializer);
    } else if (isSpreadAssignment(property)) {
      const spread = unwrap(property.expression);
      if (isIdentifier(spread) && path.aliases.has(spread.getText())) tags = [from];
      else {
        const spreadType = checker.getTypeAtLocation(spread);
        // oxlint-disable-next-line no-bitwise -- TypeScript exposes type categories as a bitmask.
        if ((spreadType.flags & (TypeFlags.Any | TypeFlags.Unknown)) !== 0) return [undefined];
        // A typed spread with no _tag cannot overwrite the discriminant in this model.
        if (spreadType.getProperty("_tag") !== undefined)
          tags = [literalTag({ checker, node: spread })];
      }
    } else if (isShorthandPropertyAssignment(property)) {
      if (property.name.getText() === "_tag") return [undefined];
    } else {
      return [undefined];
    }
  }
  return tags;
}

function stateConstants(ast: SchemaAST.AST, tag: string): ReadonlyMap<string, string> {
  const constants = new Map<string, string>([["_tag", tag]]);
  const members = SchemaAST.isUnion(ast) ? ast.types : [ast];
  const visit = (node: SchemaAST.AST, prefix: string, depth: number): void => {
    if (depth > 16 || node.context?.isOptional === true) return;
    if (SchemaAST.isLiteral(node) && Predicate.isString(node.literal))
      constants.set(prefix, node.literal);
    if (SchemaAST.isObjects(node)) {
      for (const property of node.propertySignatures) {
        if (Predicate.isString(property.name))
          visit(
            property.type,
            prefix === "" ? property.name : `${prefix}.${property.name}`,
            depth + 1,
          );
      }
    }
  };
  for (const member of members) {
    if (
      SchemaAST.isObjects(member) &&
      Array.some(
        member.propertySignatures,
        (property) =>
          property.name === "_tag" &&
          SchemaAST.isLiteral(property.type) &&
          property.type.literal === tag,
      )
    )
      visit(member, "", 0);
  }
  return constants;
}

function analyze(
  aggregate: AggregateContract,
  handlers: HandlerNodes,
  checker: Checker,
): StateDiagram {
  const states = stateTags(aggregate.definition.state.ast);
  const unresolved = new Set<string>();
  const transitions = new Map<string, StateTransition>();
  const initialValue = aggregate.definition.initial;
  const initial =
    Predicate.hasProperty(initialValue, "_tag") &&
    Predicate.isString(initialValue._tag) &&
    Array.contains(states, initialValue._tag)
      ? initialValue._tag
      : undefined;
  if (states.length === 0)
    unresolved.add(
      "State schema has no complete top-level _tag union; no state nodes or status-based substates invented.",
    );
  if (initial === undefined) unresolved.add("Initial state has no declared top-level state tag.");
  for (const command of aggregate.definition.commands) {
    const handler = handlers.decide.get(command.tag);
    if (handler === undefined) {
      unresolved.add(`Missing decision: ${command.tag}`);
      continue;
    }
    for (const from of states) {
      const paths = returnPaths({
        handler,
        tag: from,
        checker,
        stateTags: states,
        constants: stateConstants(Schema.toType(aggregate.definition.state).ast, from),
        report: (reason) => {
          unresolved.add(`${command.tag}: ${reason}`);
        },
      });
      for (const path of paths) {
        const expression = unwrap(path.expression);
        if (!isArrayLiteralExpression(expression)) {
          const tag = literalTag({ checker, node: expression });
          if (
            !isNewExpression(expression) &&
            !isYieldExpression(expression) &&
            !Array.some(command.rejects, (rejection) => rejection.tag === tag)
          )
            unresolved.add(
              `${command.tag}: nonliteral event-array return: ${expression.getText()}`,
            );
          continue;
        }
        let current: readonly string[] = [from];
        for (const eventExpression of expression.elements) {
          const event = literalTag({ checker, node: eventExpression });
          if (
            event === undefined ||
            !Array.some(command.events, (contract) => contract.tag === event)
          ) {
            unresolved.add(`${command.tag}: unresolved event: ${eventExpression.getText()}`);
            break;
          }
          const evolution = handlers.evolve.get(event);
          if (evolution === undefined) {
            unresolved.add(`Missing evolution: ${event}`);
            break;
          }
          const next = new Set<string>();
          for (const before of current) {
            const results = returnPaths({
              handler: evolution,
              tag: before,
              checker,
              stateTags: states,
              constants: stateConstants(Schema.toType(aggregate.definition.state).ast, before),
              report: (reason) => {
                unresolved.add(`${event}: ${reason}`);
              },
            });
            for (const result of results) {
              for (const to of destinations(result, before, checker)) {
                if (to === undefined || !Array.contains(states, to)) {
                  unresolved.add(
                    `${event}: unresolved destination: ${result.expression.getText()}`,
                  );
                  continue;
                }
                const transition = { from: before, event, to, command: command.tag };
                transitions.set(
                  `${before}\u0000${event}\u0000${to}\u0000${command.tag}`,
                  transition,
                );
                next.add(to);
              }
            }
          }
          // Later events evolve the result of earlier events, not the original input state.
          current = Array.fromIterable(next);
        }
      }
    }
  }
  return {
    name: aggregate.aggregateName,
    states,
    initial,
    transitions: Array.fromIterable(transitions.values()),
    unresolved: Array.fromIterable(unresolved),
  };
}

export function readStateDiagram(request: {
  readonly path: string;
  readonly exportName: string;
  readonly aggregate: AggregateContract;
}): Effect.Effect<StateDiagram, DiagramError> {
  return inspectHandlers({
    ...request,
    inspect: (handlers, checker) => analyze(request.aggregate, handlers, checker),
  });
}

function escape(value: string): string {
  return Function.pipe(
    value,
    Str.replaceAll("#", "#35;"),
    Str.replaceAll('"', "#quot;"),
    Str.replaceAll("<", "#60;"),
    Str.replaceAll(">", "#62;"),
  );
}

/** Event labels only. Unknown paths remain outside the graph, never fake state nodes. */
export function renderStateDiagram(request: {
  readonly diagram: StateDiagram;
  readonly includeSelfLoops: boolean;
}): string {
  const { diagram, includeSelfLoops } = request;
  const lines = [
    `# ${diagram.name} — static state overview`,
    "Static candidates from tag guards, returned event arrays, and evolution source. Other guards remain unevaluated; this is not proof of reachability or complete coverage.",
  ];
  if (diagram.states.length > 0) {
    const ids = new Map(Array.map(diagram.states, (tag, index) => [tag, `s${index}`] as const));
    lines.push("```mermaid", "stateDiagram-v2", "    direction LR");
    for (const [tag, id] of ids) lines.push(`    state "${escape(tag)}" as ${id}`);
    if (diagram.initial !== undefined) lines.push(`    [*] --> ${ids.get(diagram.initial)}`);
    const edges = new Set<string>();
    for (const transition of diagram.transitions) {
      if (!includeSelfLoops && transition.from === transition.to) continue;
      edges.add(
        `    ${ids.get(transition.from)} --> ${ids.get(transition.to)}: ${escape(transition.event)}`,
      );
    }
    lines.push(...edges, "```");
  }
  lines.push(
    "## Transition evidence",
    "| From | Event | To | Command |",
    "| --- | --- | --- | --- |",
  );
  for (const transition of diagram.transitions)
    lines.push(
      `| ${transition.from} | ${transition.event} | ${transition.to} | ${transition.command} |`,
    );
  if (!includeSelfLoops)
    lines.push("Same-state events remain in the table but are omitted from the graph.");
  if (diagram.unresolved.length > 0) {
    lines.push("## Unresolved paths");
    for (const reason of diagram.unresolved) lines.push(`- ${Str.replaceAll("\n", " ")(reason)}`);
  }
  return `${Array.join(lines, "\n")}\n`;
}
