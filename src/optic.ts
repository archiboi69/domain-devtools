import { Array } from "effect";
import { type Checker, SymbolFlags } from "typescript/sync";
import {
  type Node,
  isCallExpression,
  isFunctionDeclaration,
  isIdentifier,
  isPropertyAccessExpression,
  isStringLiteral,
  isVariableDeclaration,
} from "typescript/ast";
import { unwrap } from "./state-flow";

interface Focus {
  readonly keys: readonly string[];
  readonly rootTags: readonly string[];
}
export type OpticUpdate =
  | { readonly kind: "preserve" }
  | { readonly kind: "replace"; readonly value: Node }
  | { readonly kind: "modify"; readonly callback: Node };

function declaration(node: Node, checker: Checker): Node | undefined {
  const symbol = checker.getSymbolAtLocation(isPropertyAccessExpression(node) ? node.name : node);
  if (symbol === undefined) return undefined;
  // oxlint-disable-next-line no-bitwise -- Compiler symbol categories are a bitmask.
  const resolved =
    (symbol.flags & SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
  return resolved.valueDeclaration?.resolve();
}

function operation(node: Node, checker: Checker, depth = 0): string | undefined {
  if (depth > 16) return undefined;
  const target = declaration(unwrap(node), checker);
  if (target === undefined) return undefined;
  if (isVariableDeclaration(target) || isFunctionDeclaration(target)) {
    const name = target.name?.getText();
    if (
      name !== undefined &&
      Array.contains(["id", "replace", "modify"], name) &&
      /(?:^|[/\\])effect[/\\](?:src|dist)[/\\]Optic\.(?:d\.)?ts$/u.test(
        target.getSourceFile().fileName,
      )
    )
      return name;
    if (isVariableDeclaration(target) && target.initializer !== undefined)
      return operation(target.initializer, checker, depth + 1);
  }
  return undefined;
}

function focus(node: Node, checker: Checker, depth = 0): Focus | undefined {
  if (depth > 16) return undefined;
  const value = unwrap(node);
  if (isIdentifier(value)) {
    const target = declaration(value, checker);
    return target !== undefined && isVariableDeclaration(target) && target.initializer !== undefined
      ? focus(target.initializer, checker, depth + 1)
      : undefined;
  }
  if (!isCallExpression(value)) return undefined;
  if (operation(value.expression, checker) === "id" && value.arguments.length === 0)
    return { keys: [], rootTags: [] };
  if (!isPropertyAccessExpression(value.expression) || value.arguments.length !== 1)
    return undefined;
  const parent = focus(value.expression.expression, checker, depth + 1);
  const argument = value.arguments[0];
  if (parent === undefined || argument === undefined || !isStringLiteral(argument))
    return undefined;
  const name = value.expression.name.getText();
  if (name === "key") return { ...parent, keys: [...parent.keys, argument.text] };
  if (name === "tag")
    return {
      ...parent,
      rootTags: parent.keys.length === 0 ? [...parent.rootTags, argument.text] : parent.rootTags,
    };
  return undefined;
}

/** Only recognized Effect optics can establish preservation; a root/tag update is never assumed harmless. */
export function opticUpdate(request: {
  readonly expression: Node;
  readonly aliases: ReadonlySet<string>;
  readonly from: string;
  readonly checker: Checker;
}): OpticUpdate | undefined {
  const { checker, aliases, from } = request;
  const node = unwrap(request.expression);
  if (!isCallExpression(node)) return undefined;
  let source: Node | undefined;
  let optic: Node | undefined;
  let change: Node | undefined;
  let kind: string | undefined;
  const callee = unwrap(node.expression);
  if (node.arguments.length === 3) {
    kind = operation(callee, checker);
    [source, optic, change] = node.arguments;
  } else if (node.arguments.length === 1 && isCallExpression(callee)) {
    [source] = node.arguments;
    kind = operation(callee.expression, checker);
    if (kind !== undefined && callee.arguments.length === 2) [optic, change] = callee.arguments;
    else if (isPropertyAccessExpression(callee.expression) && callee.arguments.length === 1) {
      kind = callee.expression.name.getText();
      optic = callee.expression.expression;
      [change] = callee.arguments;
    }
  }
  if (
    (kind !== "replace" && kind !== "modify") ||
    source === undefined ||
    optic === undefined ||
    change === undefined
  )
    return undefined;
  const input = unwrap(source);
  if (!isIdentifier(input) || !aliases.has(input.getText())) return undefined;
  const target = focus(optic, checker);
  if (target === undefined) return undefined;
  if (Array.some(target.rootTags, (tag) => tag !== from)) return { kind: "preserve" };
  const key = target.keys[0];
  if (key !== undefined) return key === "_tag" ? undefined : { kind: "preserve" };
  return kind === "replace" ? { kind, value: change } : { kind, callback: change };
}
