/**
  Regex definitions and parser.
**/

import { ANode, AstNodeExtra } from ".";
import { FixedLengthArray } from "../typeUtils";

export abstract class AstNode<This extends AstNode<This>> {
  static extra = new AstNodeExtra();
  
  static rule: Expr<ANode>;

  constructor(matched: { [Key in keyof This]: This[Key] }) {
    Object.assign(this, matched);
  }
}

type CharTable = FixedLengthArray<boolean, typeof CharClass.tableSize>;

export class CharClass {
  kind = 'CharClass' as 'CharClass';
  
  static tableSize = 128 as 128;

  // `tableSize[i] === true` iff ascii char `i` is included.
  charTable: CharTable;
  constructor(chars: string | CharTable, negated = false) {
    if (Array.isArray(chars)) {
      return this.charTable = chars as any;
    }

    const table = [];

    for (let i = 0; i < CharClass.tableSize; i++) {
      table.push(negated);
    }

    for (let char of chars as string) {
      const charCode = char.charCodeAt(0);
      if (charCode >= CharClass.tableSize) {
        throw new Error(`Cannot include char '${char}' (charcode ${charCode}) in CharClass. CharCode too high.`);
      }

      table[char.charCodeAt(0)] = !negated;
    }

    this.charTable = table as any as FixedLengthArray<boolean, typeof CharClass.tableSize>;
  }

  static and(a: CharClass, b: CharClass) {
    return new CharClass(a.charTable.map((bool, i) => bool && b.charTable[i]));
  }

  static or(a: CharClass, b: CharClass) {
    return new CharClass(a.charTable.map((bool, i) => bool || b.charTable[i]));
  }
}

export class Text {
  kind = 'Text' as 'Text';
  
  constructor(public text: string) {}
}

export class Before<Node extends AstNode<Node>> {
  kind = 'Before' as 'Before';
  
  constructor(public expr: Expr<Node>) {}
}

export class After<Node extends AstNode<Node>> {
  kind = 'After' as 'After';
  
  constructor(public expr: Expr<Node>) {}
}

export class And<Node extends AstNode<Node>> {
  kind = 'And' as 'And';
  
  exprs: Expr<Node>[];

  constructor(...exprs: Expr<Node>[]) {
    this.exprs = exprs;
  }
}

export class Or<Node extends AstNode<Node>> {
  kind = 'Or' as 'Or';
  
  exprs: Expr<Node>[];

  constructor(...exprs: Expr<Node>[]) {
    this.exprs = exprs;
  }
}

export class Not<Node extends AstNode<Node>> {
  kind = 'Not' as 'Not';
  
  constructor(public expr: Expr<Node>) {}
}

export class Maybe<Node extends AstNode<Node>> {
  kind = 'Maybe' as 'Maybe';
  
  constructor(public expr: Expr<Node>) {}
}

export class Repeat<Node extends AstNode<Node>> {
  kind = 'Repeat' as 'Repeat';
  
  constructor(
    public repeat: Expr<Node>,
    public delimiter: Expr<Node>,
    public min: number = 0,
    public max: number = Infinity,
  ) {}
}

type KeysOfType<T, TProp> = { [P in keyof T]: T[P] extends TProp? P : never}[keyof T];
// This should be recursive.
type Constraints<Node, Matched> = { [key in keyof Matched]?: Matched[key] | KeysOfType<Node, Matched[key]> };

export class Equals<Node extends AstNode<Node>, MatchedT extends typeof AstNode, Matched extends AstNode<Matched>> {
  kind = 'Equals' as 'Equals';
  
  match: MatchedT & (new(...args: any) => Matched) | null;
  prop: keyof Node | null;
  exprOrConstraints: Expr<Node>[] | Constraints<Node, Matched>;
  
  constructor(
    match: new(...args: any) => Matched,
    prop?: null | keyof Node,
    constraints?: Constraints<Node, Matched>,
  );
  constructor(
    prop: keyof Node,
    constraints: string | number | Constraints<Node, any>,
  );
  constructor(
    prop: keyof Node,
    expr: Expr<Node>,
  );
  constructor(
    a: { new(...args: any): Matched } | keyof Node,
    b?: (null | keyof Node) | (string | number | Constraints<Node, any>),
    c?: Constraints<Node, Matched>,
  ) {
    if (a instanceof AstNode) {
      this.match = a as any;
      this.prop = b as any || null;
      this.exprOrConstraints = c as any || {};
    } else {
      this.match = null;
      this.prop = a as any;
      this.exprOrConstraints = b as any;
    }
  }
  
  hasExpr(): this is this & { exprOrConstraints: Expr<Node> } {
    return Array.isArray(this.exprOrConstraints);
  }
}

export class EqualsArr<Node extends AstNode<Node>, MatchedT extends typeof AstNode, Matched extends AstNode<Matched>> {
  kind = 'EqualsArr' as 'EqualsArr';
  
  match: MatchedT & (new(...args: any) => Matched) | null;
  prop: keyof Node | null;
  exprOrConstraints: Expr<Node>[] | Constraints<Node, Matched>;
  
  constructor(
    match: new(...args: any) => Matched,
    prop?: null | keyof Node,
    constraints?: Constraints<Node, Matched>,
  );
  constructor(
    prop: keyof Node,
    constraints: string | number | Constraints<Node, any>,
  );
  constructor(
    prop: keyof Node,
    expr: Expr<Node>,
  );
  constructor(
    a: { new(...args: any): Matched } | keyof Node,
    b?: (null | keyof Node) | (string | number | Constraints<Node, any>),
    c?: Constraints<Node, Matched>,
  ) {
    if (a instanceof AstNode) {
      this.match = a as any;
      this.prop = b as any || null;
      this.exprOrConstraints = c as any || {};
    } else {
      this.match = null;
      this.prop = a as any;
      this.exprOrConstraints = b as any;
    }
  }
  
  hasExpr(): this is this & { exprOrConstraints: Expr<Node> } {
    return Array.isArray(this.exprOrConstraints);
  }
}

export type ExprComponent<Node extends AstNode<Node>> = (
    CharClass
  | Text
  | Before<Node>
  | After<Node>
  | And<Node>
  | Or<Node>
  | Not<Node>
  | Maybe<Node>
  | Repeat<Node>
  | Equals<Node, typeof AstNode, ANode>
  | EqualsArr<Node, typeof AstNode, ANode>
);

export type Expr<Node extends AstNode<Node>> = ExprComponent<Node>[];
