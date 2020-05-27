/**
  Regex definitions and parser.
**/

import { FixedLengthArray } from "../typeUtils";

export abstract class AstNode<This extends AstNode<any>> {
  constructor(matched: { [Key in keyof This]: This[Key] }) {
    Object.assign(this, matched);
  }
}

type CharTable = FixedLengthArray<boolean, typeof CharClass.tableSize>;

export class CharClass {
  static tableSize = 128 as 128;
  
  // `tableSize[i] === true` iff ascii char `i` is included.
  charTable: CharTable;
  
  constructor(chars: string | CharTable, negated = true) {
    if (Array.isArray(chars)) {
      this.charTable = chars as any;
      
      return;
    }
    
    const table = [];
    
    for (let i = 0; i < CharClass.tableSize; i++) {
      table.push(!negated);
    }
    
    for (let char of chars as string) {
      if (char.charCodeAt(0) >= CharClass.tableSize) {
        throw new Error(`Cannot include char ${char} in CharClass. CharCode too high.`);
      }
      
      table[char.charCodeAt(0)] = negated;
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
