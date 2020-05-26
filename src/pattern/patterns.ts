/**
  Regex definitions and parser.
**/

export abstract class AstNode<This> {
  constructor(matched: { [Key in keyof This]: This[Key] }) {
    Object.assign(this, matched);
  }
}

export class CharClass {
  constructor(public chars: string, public negated = true) {}
}

export class Before<Node extends AstNode<Node>> {
  constructor(public expr: Expr<Node>) {}
}

export class After<Node extends AstNode<Node>> {
  constructor(public expr: Expr<Node>) {}
}

export class And<Node extends AstNode<Node>> {
  exprs: Expr<Node>[];
  
  constructor(...exprs: Expr<Node>[]) {
    this.exprs = exprs;
  }
}

export class Or<Node extends AstNode<Node>> {
  exprs: Expr<Node>[];
  
  constructor(...exprs: Expr<Node>[]) {
    this.exprs = exprs;
  }
}

export class Maybe<Node extends AstNode<Node>> {
  constructor(public expr: Expr<Node>) {}
}

export class Repeat<Node extends AstNode<Node>> {
  constructor(
    public expr: Expr<Node>,
    public min: number = 0,
    public max: number = Infinity,
  ) {}
}

type KeysOfType<T, TProp> = { [P in keyof T]: T[P] extends TProp? P : never}[keyof T];

export class Match<Node extends AstNode<Node>, Matched extends AstNode<Matched>> {
  constructor(
    public match: { new(...args: any): Matched },
    public prop: null | keyof Node = null,
    public args: { [key in keyof Matched]?: Matched[key] | KeysOfType<Node, Matched[key]> } = {},
  ) {}
}

export type Expr<Node extends AstNode<Node>> =
  (CharClass | Before<Node> | After<Node> | And<Node> | Or<Node> | Maybe<Node> | Repeat<Node> | Match<Node, any>)[];
