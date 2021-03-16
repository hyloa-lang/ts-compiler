/**
  Regex definitions and parser.
**/

import { ANode, AstNodeExtra, Symbol } from ".";
import { emptyAfters, NdMultiFsa, NdMultiState, Transition } from "./table-generator";

export abstract class AstNode<This extends AstNode<This>> {
  static hidden = false;
  
  static rule: Pattern<ANode>;

  constructor(matched: { [Key in keyof This]: This[Key] }) {
    Object.assign(this, matched);
  }
  
  static preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    if (symbols.includes(this as Symbol)) return;
    
    symbols.push(this as Symbol);
    
    this.rule.preprocess(symbols, lookarounds, negated, isLookaround);
  }
  
  static negate() {
    return this.rule.negate();
  }
}

export abstract class Pattern<Node extends AstNode<Node>> {
  abstract kind: string;
  
  // Should find all symbols, befores and afters, and generate negated patterns.
  abstract preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ): void;
  
  abstract negate(): Pattern<Node>;
  
  abstract toFsa(fsa: NdMultiFsa, from: NdMultiState[]): NdMultiState[];
}

export class Chars extends Pattern<ANode> {
  kind = 'CharClass' as 'CharClass';
  
  static tableSize = 128 as 128;

  // `tableSize[i] === true` iff ascii char `i` is included.
  charTable: boolean[];
  
  constructor(chars: string | boolean[], negated = false) {
    super();
    
    if (Array.isArray(chars)) {
      if (chars.length != Chars.tableSize) throw new Error();
      
      return this.charTable = chars.map(a => a != negated) as any;
    }

    this.charTable = [];

    for (let i = 0; i < Chars.tableSize; i++) {
      this.charTable.push(negated);
    }

    for (let char of chars) {
      const charCode = char.charCodeAt(0);
      
      if (charCode >= Chars.tableSize) {
        throw new Error(`Cannot include char '${char}' (charcode ${charCode}) in CharClass. Charcode too high.`);
      }

      this.charTable[char.charCodeAt(0)] = !negated;
    }
  }
  
  preprocess() {}
  
  // Returns a pattern without Nots that accepts iff this does not.
  negate() {
    return new Chars(this.charTable, true);
  }
  
  toFsa(fsa: NdMultiFsa, from: NdMultiState[]) {
    const to = new NdMultiState();
    
    for (let [ index, b ] of this.charTable.entries()) {
      b && from.forEach(state => new Transition(Chars.getChar(index), state, [ to ]));
    }
    
    return [ to ];
  }
  
  static getChar(n : number) {
    return String.fromCharCode(n);
  }
  
  static and(a: Chars, b: Chars) {
    return new Chars(a.charTable.map((bool, i) => bool && b.charTable[i]));
  }

  static or(a: Chars, b: Chars) {
    return new Chars(a.charTable.map((bool, i) => bool || b.charTable[i]));
  }
}

export class Text extends Pattern<ANode> {
  kind = 'Text' as 'Text';
  
  constructor(public text: string, public negated = false) { super(); }
  
  preprocess() {}
  
  negate() {
    return new Text(this.text, !this.negated);
  }
  
  toFsa(fsa: NdMultiFsa, from: NdMultiState[]) {
    for (const char of this.text) {
      const charCode = char.codePointAt(0)!;
      const to = new NdMultiState();
      
      if (128 <= charCode) throw new Error();
      
      from.forEach(state => new Transition(char, state, [ to ]));
      
      from = [ to ];
    }
    
    return from;
  }
}

export class Before<Node extends AstNode<Node>> extends Pattern<ANode> {
  kind = 'Before' as 'Before';
  
  constructor(public expr: Pattern<Node>) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    lookarounds.push(this);
    
    this.expr.preprocess(symbols, lookarounds, negated, true);
  }
  
  negate() {
    return new Before(this.expr.negate());
  }
  
  toFsa(fsa: NdMultiFsa, from: NdMultiState[]) {
    if (!fsa.initial.get(this)) {
      const init = new NdMultiState();
      
      this.expr.toFsa(fsa, [ init ]).forEach(state => state.isFinal = true);
      
      const cover = new NdMultiState(false, init);
      const fsaNull = fsa.initial.get(null)!;
      
      fsa.initial.set(this, cover);
      
      new Transition(null, fsaNull, [ fsaNull, cover ]);
    }
    
    const to = new NdMultiState();
    
    from.forEach(state => new Transition(this, state, [ to ]));
    
    return [ to ];
  }
}

export class After<Node extends AstNode<Node>> extends Pattern<ANode> {
  kind = 'After' as 'After';
  
  constructor(public expr: Pattern<Node>) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    lookarounds.push(this);
    
    this.expr.preprocess(symbols, lookarounds, negated, isLookaround);
  }
  
  negate() {
    return new After(this.expr.negate());
  }
  
  toFsa(fsa: NdMultiFsa, from: NdMultiState[]) {
    if (!fsa.initial.has(this)) {
      const init = new NdMultiState(fsa.initial.get(null)!, emptyAfters);
      
      this.expr.toFsa(fsa, [ init ]).forEach(state => {
        new Transition(null, state, []);
      });
      
      fsa.initial.set(this, init);
    }
    
    const to = new NdMultiState(cover, isFinal, new Set([ this ]));
    
    from.forEach(state => new Transition(null, state, [ to ]));
    
    return [ to ];
  }
}

// Concatenation.
export class Caten<Node extends AstNode<Node>> extends Pattern<ANode> {
  kind = 'Caten' as 'Caten';
  
  exprs: Pattern<Node>[];

  constructor(...exprs: Pattern<Node>[]) {
    super();
    
    this.exprs = exprs;
  }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    this.exprs.forEach(expr => expr.preprocess(symbols, lookarounds, negated, isLookaround));
  }
  
  negate() {
    return new Cadul(...this.exprs.map(expr => expr.negate()));
  }
  
  toFsa(fsa: NdMultiFsa, from: NdMultiState[]) {
    for (const expr of this.exprs) { from = expr.toFsa(fsa, from); }
    
    return from;
  }
}

// Concadulation, the dual of concatenation.
export class Cadul<Node extends AstNode<Node>> extends Pattern<ANode> {
  kind = 'Cadul' as 'Cadul';
  
  exprs: Pattern<Node>[];

  constructor(...exprs: Pattern<Node>[]) {
    super();
    
    this.exprs = exprs;
  }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    this.exprs.forEach(expr => expr.preprocess(symbols, lookarounds, negated, isLookaround));
  }
  
  negate() {
    return new Caten(...this.exprs.map(expr => expr.negate()));
  }
  
  toFsa(fsa: NdMultiFsa, from: NdMultiState[]) {
    for (const expr of this.exprs) {
      const final = expr.toFsa(fsa, from);
      
      const to = new NdMultiState();
      
      from.forEach(function forEachReachable(state) {
        if (!final.includes(state)) new Transition(null, state, [ to ]);
      });
      
      from = [ to ];
    }
    
    return 0;
  }
}

export class And<Node extends AstNode<Node>> extends Pattern<ANode> {
  kind = 'And' as 'And';
  
  exprs: Pattern<Node>[];

  constructor(...exprs: Pattern<Node>[]) {
    super();
    
    this.exprs = exprs;
  }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    this.exprs.forEach(expr => expr.preprocess(symbols, lookarounds, negated, isLookaround));
  }
  
  negate() {
    return new Or(...this.exprs.map(expr => expr.negate()));
  }
}

export class Or<Node extends AstNode<Node>> extends Pattern<ANode> {
  kind = 'Or' as 'Or';
  
  exprs: Pattern<Node>[];

  constructor(...exprs: Pattern<Node>[]) {
    super();
    
    this.exprs = exprs;
  }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    this.exprs.forEach(expr => expr.preprocess(symbols, lookarounds, negated, isLookaround));
  }
  
  negate() {
    return new And(...this.exprs.map(expr => expr.negate()));
  }
}

export class Not<Node extends AstNode<Node>> extends Pattern<ANode> {
  kind = 'Not' as 'Not';
  
  constructor(public expr: Pattern<Node>) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    isLookaround && negated.set(this, this.expr.negate());
    
    this.expr.preprocess(symbols, lookarounds, negated, isLookaround);
  }
  
  negate() { return this.expr; }
}

export class Maybe<Node extends AstNode<Node>> extends Pattern<ANode> {
  kind = 'Maybe' as 'Maybe';
  
  constructor(public expr: Pattern<Node>) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    this.expr.preprocess(symbols, lookarounds, negated, isLookaround);
  }
  
  negate() {
    // `And(Not(Caten), Not(expr))`.
    return new And(new Cadul(), this.expr.negate());
  }
}

export class Repeat<Node extends AstNode<Node>> extends Pattern<ANode> {
  kind = 'Repeat' as 'Repeat';
  
  constructor(
    public expr: Pattern<Node>,
    public delimiter: Pattern<Node> = new Caten(),
    public min: number = 0,
    public max: number = Infinity,
  ) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    this.expr.preprocess(symbols, lookarounds, negated, isLookaround);
    this.delimiter.preprocess(symbols, lookarounds, negated, isLookaround);
  }
  
  negate() {
    return new Meld(this.expr.negate(), this.delimiter.negate(), this.min, this.max);
  }
}

export class Meld<Node extends AstNode<Node>> extends Pattern<ANode> {
  kind = 'Meld' as 'Meld';
  
  constructor(
    public expr: Pattern<Node>,
    public delimiter: Pattern<Node> = new Caten(),
    public min: number = 0,
    public max: number = Infinity,
  ) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    this.expr.preprocess(symbols, lookarounds, negated, isLookaround);
    this.delimiter.preprocess(symbols, lookarounds, negated, isLookaround);
  }
  
  negate() {
    return new Repeat(this.expr.negate(), this.delimiter.negate(), this.min, this.max);
  }
}

type Primitive<T> = T extends boolean | number ? T : never;
type KeysOfType<T, TProp> = { [P in keyof T]: T[P] extends TProp? P : never}[keyof T];
// This should be recursive.
type Constraints<Node, Matched> = {
  [key in keyof Matched]?:
    | Primitive<Matched[key]>
    | Constraints<Node, Matched[key]>
    | KeysOfType<Node, Matched[key]>
};

export class Equals<
  Node extends AstNode<Node>,
  Matched extends AstNode<Matched>,
> extends Pattern<ANode> {
  kind = 'Equals' as 'Equals';
  
  match: typeof AstNode & (new(...args: any) => Matched) | null;
  prop: keyof Node | null;
  exprOrConstraints: Pattern<Node> | Constraints<Node, Matched>;
  
  // Matches if `match` with constraints `constraints` matches `prop`.
  constructor(
    match: new(...args: any) => Matched,
    prop?: null | keyof Node,
    constraints?: Constraints<Node, Matched>,
  );
  // Zero-width match if `prop` matches `constraints`.
  constructor(
    prop: keyof Node,
    constraints: string | number | Constraints<Node, any>,
  );
  // Matches if `prop` matches the pattern `expr`.
  constructor(
    prop: keyof Node,
    expr: Pattern<Node>,
  );
  constructor(
    a: { new(...args: any): Matched } | keyof Node,
    b?: (null | keyof Node) | (string | number | Constraints<Node, any>),
    c?: Constraints<Node, Matched>,
  ) {
    super();
    
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
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    if (this.match) {
      this.match.preprocess(symbols, lookarounds, negated, isLookaround);
    }
    
    if (this.exprOrConstraints instanceof Pattern) {
      this.exprOrConstraints.preprocess(symbols, lookarounds, negated, isLookaround);
    }
  }
  
  negate() {
    if (this.match) {
      if (this.exprOrConstraints) throw new Error('Cannot negate Equals with constraints (yet).');
    }
    
    if (this.exprOrConstraints instanceof Pattern) {
      return this.exprOrConstraints.negate();
    }
    
    throw new Error('Cannot negate Equals with constraints (yet).');
  }
  
  hasExpr(): this is this & { exprOrConstraints: Pattern<Node> } {
    return Array.isArray(this.exprOrConstraints);
  }
}

export class EqualsArr<
  Node extends AstNode<Node>,
  Matched extends AstNode<Matched>,
> extends Pattern<ANode> {
  kind = 'EqualsArr' as 'EqualsArr';
  
  canInsert: boolean;
  match: typeof AstNode & (new(...args: any) => Matched) | null;
  prop: keyof Node | null;
  exprOrConstraints: Pattern<Node> | Constraints<Node, Matched>;
  
  constructor(
    canInsert: boolean,
    match: new(...args: any) => Matched,
    prop?: null | keyof Node,
    constraints?: Constraints<Node, Matched>,
  );
  constructor(
    canInsert: boolean,
    prop: keyof Node,
    constraints: string | number | Constraints<Node, any>,
  );
  constructor(
    canInsert: boolean,
    prop: keyof Node,
    expr: Pattern<Node>,
  );
  constructor(
    canInsert: boolean,
    a: { new(...args: any): Matched } | keyof Node,
    b?: (null | keyof Node) | (string | number | Constraints<Node, any>),
    c?: Constraints<Node, Matched>,
  ) {
    super();
    
    this.canInsert = canInsert;
    
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
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<ANode> | After<ANode>)[],
    negated: Map<Not<ANode> | Symbol, Pattern<ANode>>,
    isLookaround: boolean,
  ) {
    if (this.match) {
      this.match.preprocess(symbols, lookarounds, negated, isLookaround);
    }
    
    if (this.exprOrConstraints instanceof Pattern) {
      this.exprOrConstraints.preprocess(symbols, lookarounds, negated, isLookaround);
    }
  }
  
  negate() {
    if (this.match) {
      if (this.exprOrConstraints) throw new Error('Cannot negate Equals with constraints (yet).');
    }
    
    if (this.exprOrConstraints instanceof Pattern) {
      return this.exprOrConstraints.negate();
    }
    
    throw new Error('Cannot negate Equals with constraints (yet).');
  }
  
  hasExpr(): this is this & { exprOrConstraints: Pattern<Node> } {
    return Array.isArray(this.exprOrConstraints);
  }
}
