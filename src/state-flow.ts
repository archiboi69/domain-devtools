import { Array, Option } from "effect";
import type { Checker } from "typescript/sync";
import { effectOperation, handlerBody } from "./handler";
import {
  type Node,
  SyntaxKind,
  isArrowFunction,
  isFunctionExpression,
  isFunctionDeclaration,
  isBlock,
  isReturnStatement,
  isThrowStatement,
  isIfStatement,
  isSwitchStatement,
  isCaseClause,
  isBreakStatement,
  isVariableStatement,
  isExpressionStatement,
  isBinaryExpression,
  isPrefixUnaryExpression,
  isPropertyAccessExpression,
  isIdentifier,
  isStringLiteral,
  isParenthesizedExpression,
  isAsExpression,
  isSatisfiesExpression,
  isConditionalExpression,
  isCallExpression,
  isYieldExpression,
} from "typescript/ast";

export interface ReturnPath {
  readonly expression: Node;
  readonly aliases: ReadonlySet<string>;
}
interface Flow {
  readonly aliases: ReadonlySet<string>;
  readonly constants: ReadonlyMap<string, string>;
}
type Truth = boolean | undefined;

export function unwrap(node: Node): Node {
  if (isParenthesizedExpression(node) || isAsExpression(node) || isSatisfiesExpression(node))
    return unwrap(node.expression);
  return node;
}

/** A singleton literal from the compiler, never a guessed business discriminant. */
export function literalTag({
  checker,
  node,
}: {
  readonly checker: Checker;
  readonly node: Node;
}): string | undefined {
  const type = checker.getTypeAtLocation(node);
  const tag = type.getProperty("_tag");
  if (tag === undefined) return undefined;
  const value = checker.getTypeOfSymbolAtLocation(tag, node);
  return value.isStringLiteralType() ? value.value : undefined;
}

function stateTag(node: Node, aliases: ReadonlySet<string>): boolean {
  const value = unwrap(node);
  return (
    isPropertyAccessExpression(value) &&
    value.name.getText() === "_tag" &&
    isIdentifier(value.expression) &&
    aliases.has(value.expression.getText())
  );
}

function propertyPath(node: Node, aliases: ReadonlySet<string>): string | undefined {
  const value = unwrap(node);
  if (isIdentifier(value)) return aliases.has(value.getText()) ? "" : undefined;
  if (!isPropertyAccessExpression(value)) return undefined;
  const parent = propertyPath(value.expression, aliases);
  return parent === undefined
    ? undefined
    : parent === ""
      ? value.name.getText()
      : `${parent}.${value.name.getText()}`;
}

function truth(node: Node, flow: Flow): Truth {
  const value = unwrap(node);
  if (value.kind === SyntaxKind.TrueKeyword) return true;
  if (value.kind === SyntaxKind.FalseKeyword) return false;
  if (isPrefixUnaryExpression(value) && value.operator === SyntaxKind.ExclamationToken) {
    const inner = truth(value.operand, flow);
    return inner === undefined ? undefined : !inner;
  }
  if (!isBinaryExpression(value)) return undefined;
  const op = value.operatorToken.kind;
  if (op === SyntaxKind.AmpersandAmpersandToken || op === SyntaxKind.BarBarToken) {
    const left = truth(value.left, flow);
    const right = truth(value.right, flow);
    if (op === SyntaxKind.AmpersandAmpersandToken) {
      if (left === false || right === false) return false;
      return left === true && right === true ? true : undefined;
    }
    if (left === true || right === true) return true;
    return left === false && right === false ? false : undefined;
  }
  const left = unwrap(value.left);
  const right = unwrap(value.right);
  const leftPath = propertyPath(left, flow.aliases);
  const rightPath = propertyPath(right, flow.aliases);
  const actual =
    leftPath === undefined
      ? rightPath === undefined
        ? undefined
        : flow.constants.get(rightPath)
      : flow.constants.get(leftPath);
  const expected =
    leftPath !== undefined && isStringLiteral(right)
      ? right.text
      : rightPath !== undefined && isStringLiteral(left)
        ? left.text
        : undefined;
  if (actual === undefined || expected === undefined) return undefined;
  if (op === SyntaxKind.EqualsEqualsEqualsToken) return actual === expected;
  if (op === SyntaxKind.ExclamationEqualsEqualsToken) return actual !== expected;
  return undefined;
}

/** Bounded tag-only control-flow analysis. Other guards fork, never become states. */
export function returnPaths(request: {
  readonly handler: Node;
  readonly tag: string;
  readonly checker: Checker;
  readonly stateTags: readonly string[];
  readonly constants: ReadonlyMap<string, string>;
  readonly report: (reason: string) => void;
}): readonly ReturnPath[] {
  const { tag, checker, stateTags, report } = request;
  const resolved = handlerBody({ node: request.handler, checker });
  const handler = resolved?.body;
  if (handler === undefined) {
    report(resolved?.issue ?? "Unsupported handler function");
    return [];
  }
  if (
    !isArrowFunction(handler) &&
    !isFunctionExpression(handler) &&
    !isFunctionDeclaration(handler)
  ) {
    report("Unsupported handler function");
    return [];
  }
  const parameter = handler.parameters[0]?.name;
  if ((parameter !== undefined && !isIdentifier(parameter)) || handler.body === undefined) {
    report("Missing plain state parameter or handler body");
    return [];
  }
  const returns: ReturnPath[] = [];
  let steps = 0;
  const emit = (node: Node, flow: Flow): void => {
    const value = unwrap(node);
    if (isConditionalExpression(value)) {
      const condition = truth(value.condition, flow);
      if (condition !== false) emit(value.whenTrue, flow);
      if (condition !== true) emit(value.whenFalse, flow);
      return;
    }
    if (isYieldExpression(value) && value.expression !== undefined) {
      emit(value.expression, flow);
      return;
    }
    if (isCallExpression(value)) {
      const operation = effectOperation({ node: value.expression, checker });
      if (operation === "fail" || operation === "die") return;
      const argument = value.arguments[0];
      if (operation === "succeed" && value.arguments.length === 1 && argument !== undefined) {
        emit(argument, flow);
        return;
      }
      if (
        operation === "gen" &&
        value.arguments.length === 1 &&
        argument !== undefined &&
        isFunctionExpression(argument) &&
        argument.asteriskToken !== undefined
      ) {
        walk(argument.body, flow);
        return;
      }
    }
    returns.push({ expression: value, aliases: flow.aliases });
  };
  const sequence = (nodes: readonly Node[], initial: readonly Flow[]): readonly Flow[] => {
    let flows = initial;
    for (const node of nodes) flows = Array.flatMap(flows, (flow) => walk(node, flow));
    return flows;
  };
  const walk = (node: Node, flow: Flow): readonly Flow[] => {
    steps += 1;
    if (steps > 2000) {
      report("Control-flow analysis budget exceeded");
      return [];
    }
    if (isBlock(node)) return sequence(node.statements, [flow]);
    if (isReturnStatement(node)) {
      if (node.expression !== undefined) emit(node.expression, flow);
      return [];
    }
    if (isThrowStatement(node)) return [];
    if (isIfStatement(node)) {
      const condition = truth(node.expression, flow);
      return [
        ...(condition !== false ? walk(node.thenStatement, flow) : []),
        ...(condition !== true
          ? node.elseStatement === undefined
            ? [flow]
            : walk(node.elseStatement, flow)
          : []),
      ];
    }
    if (isSwitchStatement(node)) {
      if (!stateTag(node.expression, flow.aliases)) {
        report(`Unsupported switch: ${node.expression.getText()}`);
        return [];
      }
      const clauses = node.caseBlock.clauses;
      let index = Array.findFirstIndex(
        clauses,
        (clause) =>
          isCaseClause(clause) &&
          isStringLiteral(clause.expression) &&
          clause.expression.text === tag,
      );
      if (Option.isNone(index))
        index = Array.findFirstIndex(clauses, (clause) => !isCaseClause(clause));
      if (Option.isNone(index)) return [flow];
      let flows: readonly Flow[] = [flow];
      for (const clause of Array.drop(clauses, index.value)) {
        for (const statement of clause.statements) {
          if (isBreakStatement(statement)) return flows;
          // Switch cases in aggregate handlers commonly wrap their body in a block.
          const statements = isBlock(statement) ? statement.statements : [statement];
          for (const inner of statements) {
            if (isBreakStatement(inner)) return flows;
            flows = Array.flatMap(flows, (current) => walk(inner, current));
          }
        }
      }
      return flows;
    }
    if (isVariableStatement(node)) {
      const aliases = new Set(flow.aliases);
      for (const declaration of node.declarationList.declarations) {
        const value =
          declaration.initializer === undefined ? undefined : unwrap(declaration.initializer);
        if (isIdentifier(declaration.name) && aliases.has(declaration.name.getText())) {
          report(`Root alias shadowed: ${declaration.name.getText()}`);
          return [];
        }
        if (isIdentifier(declaration.name) && value !== undefined) {
          if (isIdentifier(value) && aliases.has(value.getText())) {
            aliases.add(declaration.name.getText());
          } else {
            const selectedTag = checker
              .getTypeAtLocation(value)
              .getNonNullableType()
              .getProperty("_tag");
            if (selectedTag !== undefined) {
              const selectedType = checker.getTypeOfSymbolAtLocation(selectedTag, value);
              const members = selectedType.isUnionType() ? selectedType.getTypes() : [selectedType];
              if (
                Array.some(
                  members,
                  (member) =>
                    member.isStringLiteralType() && Array.contains(stateTags, member.value),
                )
              ) {
                report(`State selection is not a root alias: ${value.getText()}`);
                return [];
              }
            }
          }
        }
      }
      return [{ ...flow, aliases }];
    }
    if (isExpressionStatement(node)) {
      const expression = node.expression;
      if (
        isBinaryExpression(expression) &&
        expression.operatorToken.kind === SyntaxKind.EqualsToken
      ) {
        if (propertyPath(expression.left, flow.aliases) !== undefined) {
          report(`State alias reassigned: ${expression.getText()}`);
          return [];
        }
      }
      return [flow];
    }
    // Loops, try/finally and other statement-level control flow require dedicated support.
    report(`Unsupported statement: ${SyntaxKind[node.kind]}`);
    return [];
  };
  const initial = {
    aliases: new Set(parameter === undefined ? [] : [parameter.getText()]),
    constants: request.constants,
  };
  if (isBlock(handler.body)) walk(handler.body, initial);
  else emit(handler.body, initial);
  return returns;
}
