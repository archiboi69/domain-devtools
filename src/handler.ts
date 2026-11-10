import { Array } from "effect";
import { type Checker, SymbolFlags } from "typescript/sync";
import {
  type Node,
  isArrowFunction,
  isAsExpression,
  isCallExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isSatisfiesExpression,
  isVariableDeclaration,
} from "typescript/ast";

export interface HandlerBody {
  readonly body: Node | undefined;
  readonly issue: string | undefined;
}

function unwrap(node: Node): Node {
  if (isAsExpression(node) || isSatisfiesExpression(node) || isParenthesizedExpression(node))
    return unwrap(node.expression);
  return node;
}

function declaration(node: Node, checker: Checker): Node | undefined {
  const location = isPropertyAccessExpression(node) ? node.name : node;
  const symbol = checker.getSymbolAtLocation(location);
  if (symbol === undefined) return undefined;
  // oxlint-disable-next-line no-bitwise -- TypeScript exposes symbol categories as a bitmask.
  const resolved =
    (symbol.flags & SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
  return resolved.valueDeclaration?.resolve();
}

/** Resolve the actual Effect export, including namespace, named and local aliases. */
function effectFunction(node: Node, checker: Checker, seen = new Set<Node>()): string | undefined {
  const value = unwrap(node);
  if (seen.has(value)) return undefined;
  seen.add(value);
  const target = declaration(value, checker);
  if (target === undefined || !isVariableDeclaration(target)) return undefined;
  const name = target.name.getText();
  const file = target.getSourceFile().fileName;
  if (
    Array.contains(
      ["fn", "fnUntraced", "fnUntracedEager", "gen", "succeed", "fail", "die"],
      name,
    ) &&
    /(?:^|[/\\])effect[/\\](?:src|dist)[/\\]Effect\.(?:d\.)?ts$/u.test(file)
  )
    return name;
  return target.initializer === undefined
    ? undefined
    : effectFunction(target.initializer, checker, seen);
}

export function effectOperation(request: {
  readonly node: Node;
  readonly checker: Checker;
}): string | undefined {
  return effectFunction(request.node, request.checker);
}

/** Source keeps the wrapper; flow analysis sees its body only when no transform can replace its result. */
export function handlerBody(request: {
  readonly node: Node;
  readonly checker: Checker;
}): HandlerBody | undefined {
  const { checker } = request;
  const seen = new Set<Node>();
  const resolve = (node: Node): HandlerBody | undefined => {
    const value = unwrap(node);
    if (seen.has(value)) return undefined;
    seen.add(value);
    if (isArrowFunction(value) || isFunctionExpression(value) || isFunctionDeclaration(value))
      return { body: value, issue: undefined };
    if (isIdentifier(value) || isPropertyAccessExpression(value)) {
      const target = declaration(value, checker);
      if (target !== undefined && isVariableDeclaration(target) && target.initializer !== undefined)
        return resolve(target.initializer);
      if (target !== undefined && isFunctionDeclaration(target)) return resolve(target);
      return undefined;
    }
    if (!isCallExpression(value)) return undefined;
    const callee = unwrap(value.expression);
    const name = isCallExpression(callee)
      ? effectFunction(callee.expression, checker)
      : effectFunction(callee, checker);
    if (
      name === undefined ||
      !Array.contains(["fn", "fnUntraced", "fnUntracedEager"], name) ||
      (isCallExpression(callee) && name !== "fn")
    )
      return undefined;
    if (value.arguments.length !== 1)
      return {
        body: undefined,
        issue: `Effect.${name} transforms or self binding require analysis; the body alone does not determine emitted events`,
      };
    const body = value.arguments[0];
    const resolved = body === undefined ? undefined : resolve(body);
    return resolved ?? { body: undefined, issue: `Cannot resolve Effect.${name} callback` };
  };
  return resolve(request.node);
}
