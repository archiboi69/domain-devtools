import { Array, Effect, Function, Option } from "effect";
import { API, type Checker, SymbolFlags } from "typescript/sync";
import {
  type Node,
  isArrowFunction,
  isAsExpression,
  isClassDeclaration,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isVariableDeclaration,
} from "typescript/ast";
import type { HandlerSource } from "./diagram";
import { DiagramError } from "./diagram-error";

function referenceInitializer(expression: Node, checker: Checker): Node {
  const location = isPropertyAccessExpression(expression) ? expression.name : expression;
  const symbol = isShorthandPropertyAssignment(expression.parent)
    ? checker.getShorthandAssignmentValueSymbol(expression.parent)
    : checker.getSymbolAtLocation(location);
  if (symbol === undefined)
    throw new Error(`Unresolved handler reference: ${expression.getText()}`);
  // oxlint-disable-next-line no-bitwise -- TypeScript exposes symbol kinds as a bitmask.
  const resolved =
    (symbol.flags & SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
  const declaration = resolved.valueDeclaration?.resolve();
  if (declaration === undefined) throw new Error(`Missing declaration: ${expression.getText()}`);
  return declarationValue(declaration);
}

function declarationValue(declaration: Node): Node {
  if (isFunctionDeclaration(declaration) && declaration.body !== undefined) return declaration;
  if (
    (isVariableDeclaration(declaration) || isPropertyAssignment(declaration)) &&
    declaration.initializer !== undefined
  )
    return declaration.initializer;
  throw new Error(`Unsupported handler declaration: ${declaration.getText()}`);
}

/** Resolve syntax and symbols, never execute expressions or infer their behavior. */
function resolveExpression(expression: Node, checker: Checker, active = new Set<Node>()): Node {
  if (active.has(expression)) throw new Error(`Cyclic handler reference: ${expression.getText()}`);
  active.add(expression);
  try {
    if (
      isParenthesizedExpression(expression) ||
      isAsExpression(expression) ||
      isSatisfiesExpression(expression)
    ) {
      return resolveExpression(expression.expression, checker, active);
    }
    if (isIdentifier(expression) || isPropertyAccessExpression(expression)) {
      return resolveExpression(referenceInitializer(expression, checker), checker, active);
    }
    return expression;
  } finally {
    active.delete(expression);
  }
}

function handlerEntry(property: Node, checker: Checker): readonly [string, string] {
  if (!isPropertyAssignment(property) && !isShorthandPropertyAssignment(property)) {
    throw new Error(`Unsupported handler member: ${property.getText()}`);
  }
  if (!isIdentifier(property.name))
    throw new Error(`Unsupported handler key: ${property.name.getText()}`);
  const key = property.name.getText();
  const value = isPropertyAssignment(property) ? property.initializer : property.name;
  const handler = resolveExpression(value, checker);
  if (
    !isArrowFunction(handler) &&
    !isFunctionExpression(handler) &&
    !isFunctionDeclaration(handler)
  ) {
    throw new Error(`Expected a handler function for ${key}, got: ${handler.getText()}`);
  }
  return [key, handler.getText()];
}

function handlerTable(
  expression: Node,
  checker: Checker,
  active = new Set<Node>(),
): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  const table = resolveExpression(expression, checker);
  if (!isObjectLiteralExpression(table))
    throw new Error(`Expected a handler object, got: ${table.getText()}`);
  if (active.has(table)) throw new Error("Cyclic handler table spread");
  active.add(table);
  try {
    for (const property of table.properties) {
      if (isSpreadAssignment(property)) {
        // Map.set implements object spread's left-to-right, last-write-wins behavior.
        for (const [key, value] of handlerTable(property.expression, checker, active))
          entries.set(key, value);
        continue;
      }
      const [key, value] = handlerEntry(property, checker);
      entries.set(key, value);
    }
  } finally {
    active.delete(table);
  }
  return entries;
}

/** Fail closed for executable table factories, dynamic keys, and other unsupported syntax. */
export const readHandlerSource: {
  (exportName: string): (path: string) => Effect.Effect<HandlerSource, DiagramError>;
  (path: string, exportName: string): Effect.Effect<HandlerSource, DiagramError>;
} = Function.dual(2, (path: string, exportName: string) =>
  Effect.acquireUseRelease(
    Effect.try({
      try: () => new API(),
      catch: (cause) => DiagramError.make({ message: "Cannot start TypeScript compiler", cause }),
    }),
    (api) =>
      Effect.try({
        try: () => {
          using snapshot = api.createSnapshot({ openFiles: [path] });
          const project = snapshot.getDefaultProjectForFile(path);
          const file = project?.program.getSourceFile(path);
          if (file === undefined || project === undefined)
            throw new Error(`TypeScript cannot load ${path}`);
          const declaration = Option.getOrUndefined(
            Array.findFirst(
              file.statements,
              (statement) =>
                isClassDeclaration(statement) && statement.name?.getText() === exportName,
            ),
          );
          if (declaration === undefined)
            throw new Error(`Expected a local class named ${exportName}`);
          const tables = new Map<string, ReadonlyMap<string, string>>();
          const visit = (node: Node): void => {
            if (isPropertyAssignment(node)) {
              const name = node.name.getText();
              if (name === "decide" || name === "evolve") {
                if (tables.has(name)) throw new Error(`Ambiguous ${name} table`);
                tables.set(name, handlerTable(node.initializer, project.checker));
                return;
              }
            }
            node.forEachChild(visit);
          };
          visit(declaration);
          const decide = tables.get("decide");
          const evolve = tables.get("evolve");
          if (decide === undefined || evolve === undefined)
            throw new Error("Missing handler tables");
          return { decide, evolve } satisfies HandlerSource;
        },
        catch: (cause) =>
          DiagramError.make({ message: `Cannot extract ${exportName} from ${path}`, cause }),
      }),
    (api) =>
      Effect.sync(() => {
        api.close();
      }),
  ),
);
