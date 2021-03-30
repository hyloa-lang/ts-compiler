/**
  Regex definitions.
  
  Note the implementation is buggy and incomplete, wontfix.
**/

import { SNode, Symbol } from "./index.js";
import { NdMultiFsa, NdMultiState, Transition } from "./fsa-nested.js";
import { NonterminalsFromConstraints, createGrammarRules } from "./table-builder.js";
import { Grammar, GrammarSymbol, Nonterminal, RegularNt, GrammarRule, MatchNt } from "./parser.js";


const inspect = Symbol.for('nodejs.util.inspect.custom');

// Poor man's constraints. (The "real" `Constraints` type is below.)
export type PConstraints = Record<string, string | boolean | (string | boolean)[]>;

export abstract class SyntaxTreeNode<This extends SyntaxTreeNode<This>> {
  static hidden = false;
  
  // Keys that can hold a boolean value
  static constraintKeys: string[];
  
  // Nested maps that cache nonterminals for all unitary constraints.
  static nonterminals: NonterminalsFromConstraints | null = null;
  
  static rule: Pattern<SNode>;
  
  static boolArrToConstraints(arr: boolean[]) {
    return arr.reduce((a, c, i) => (a[this.constraintKeys[i]] = c, a), {} as Record<string, boolean>);
  }
  
  constructor(matched: { [Key in keyof This]: This[Key] }) {
    Object.assign(this, matched);
  }
  
  static preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
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

export abstract class Pattern<Node extends SyntaxTreeNode<Node>> {
  abstract kind: string;
  
  // Should find all symbols, befores and afters, and generate negated patterns.
  abstract preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
    isLookaround: boolean,
  ): void;
  
  abstract negate(): Pattern<Node>;
  
  abstract toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]): NdMultiState[];
  
  abstract toGrammarRule(
    grammar: Grammar,
    constraints: Record<string, boolean>,
    key?: Nonterminal,
  ): GrammarSymbol[];
}

export class Chars extends Pattern<SNode> {
  kind = 'CharClass' as 'CharClass';
  
  static tableSize = 128 as 128;

  // `tableSize[i] === true` iff ascii char `i` is included.
  charTable: boolean[];
  size: number;
  
  chars() { return this.charTable.map((b, i) => b ? Chars.getChar(i) : "").filter(a => a) }
  
  [inspect]() {
    return 'Chars (' + this.chars().map(c => c === '\n' ? '\\n' : c).join('') + ')';
  }
  
  constructor(chars: string | boolean[], negated = false) {
    super();
    
    if (Array.isArray(chars)) {
      if (chars.length != Chars.tableSize) throw new Error();
      
      this.charTable = chars.map(a => a != negated);
      this.size = this.charTable.reduce((a, c) => a + (c ? 1 : 0), 0);
      
      return;
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
    
    this.size = this.charTable.reduce((a, c) => a + (c ? 1 : 0), 0);
  }
  
  preprocess() {}
  
  // Returns a pattern without Nots that accepts iff this does not.
  negate() {
    return new Chars(this.charTable, true);
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]) {
    const to = new NdMultiState(cover);
    
    for (let [ index, b ] of this.charTable.entries()) {
      b && from.forEach(state => new Transition(Chars.getChar(index), state, [ to ]));
    }
    
    return [ to ];
  }
  
  toGrammarRule(
    grammar: Grammar,
    constraints: Record<string, boolean>,
    key?: Nonterminal,
  ): GrammarSymbol[] {
    if (key) grammar.insert(new GrammarRule(key, [ this ]));
    
    return [ key || this ];
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
  
  static equals(a: Chars, b: Chars): boolean {
    return a.charTable.every((c, i) => c === b.charTable[i]);
  }
}

export class Text extends Pattern<SNode> {
  kind = 'Text' as 'Text';
  
  constructor(public text: string, public negated = false) { super(); }
  
  preprocess() {}
  
  negate() {
    return new Text(this.text, !this.negated);
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]) {
    for (const char of this.text) {
      const charCode = char.codePointAt(0)!;
      const to = new NdMultiState(cover);
      
      if (128 <= charCode) throw new Error();
      
      from.forEach(state => new Transition(char, state, [ to ]));
      
      from = [ to ];
    }
    
    return from;
  }
  
  toGrammarRule(
    grammar: Grammar,
    constraints: Record<string, boolean>,
    key?: Nonterminal,
  ): GrammarSymbol[] {
    const arr = [ ...this.text ].map(c => new Chars(c));
    
    if (!key) return arr;
    
    grammar.insert(new GrammarRule(key, arr));
    
    return [ key ];
  }
}

export class Before<Node extends SyntaxTreeNode<Node>> extends Pattern<SNode> {
  kind = 'Before' as 'Before';
  
  constructor(public expr: Pattern<Node>) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
    isLookaround: boolean,
  ) {
    lookarounds.includes(this) || lookarounds.push(this);
    
    this.expr.preprocess(symbols, lookarounds, negated, true);
  }
  
  negate() {
    return new Before(this.expr.negate());
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]) {
    const to: NdMultiState = new NdMultiState(cover, this);
    
    from.forEach(state => new Transition(null, state, [ to ]));
    
    return [ to ];
  }
  
  toGrammarRule(
    grammar: Grammar,
    constraints: Record<string, boolean>,
    key?: Nonterminal,
  ): GrammarSymbol[] {
    if (!key) return [ this ];
    
    grammar.insert(new GrammarRule(key, [ this ]));
    
    return [ key ];
  }
}

export class After<Node extends SyntaxTreeNode<Node>> extends Pattern<SNode> {
  kind = 'After' as 'After';
  
  constructor(public expr: Pattern<Node>) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
    isLookaround: boolean,
  ) {
    lookarounds.includes(this) || lookarounds.push(this);
    
    this.expr.preprocess(symbols, lookarounds, negated, isLookaround);
  }
  
  negate() {
    return new After(this.expr.negate());
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]) {
    const to: NdMultiState = new NdMultiState(cover, this);
    
    from.forEach(state => new Transition(null, state, [ to ]));
    
    return [ to ];
  }
  
  toGrammarRule(
    grammar: Grammar,
    constraints: Record<string, boolean>,
    key?: Nonterminal,
  ): GrammarSymbol[] {
    if (!key) return [ this ];
    
    grammar.insert(new GrammarRule(key, [ this ]));
    
    return [ key ];
  }
}

// Concatenation.
export class Caten<Node extends SyntaxTreeNode<Node>> extends Pattern<SNode> {
  kind = 'Caten' as 'Caten';
  
  exprs: Pattern<Node>[];

  constructor(...exprs: Pattern<Node>[]) {
    super();
    
    this.exprs = exprs;
  }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
    isLookaround: boolean,
  ) {
    this.exprs.forEach(expr => expr.preprocess(symbols, lookarounds, negated, isLookaround));
  }
  
  negate() {
    return new Cadul(...this.exprs.map(expr => expr.negate()));
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]) {
    for (const expr of this.exprs) { from = expr.toFsa(fsa, cover, from); }
    
    return from;
  }
  
  toGrammarRule(
    grammar: Grammar,
    constraints: Record<string, boolean>,
    key?: Nonterminal,
  ): GrammarSymbol[] {
    const exprs = this.exprs.flatMap(expr => expr.toGrammarRule(grammar, constraints));
    
    if (!key) return exprs;
    
    grammar.insert(new GrammarRule(key, exprs));
    
    return [ key ];
  }
}

// Concadulation, the dual of concatenation.
export class Cadul<Node extends SyntaxTreeNode<Node>> extends Pattern<SNode> {
  kind = 'Cadul' as 'Cadul';
  
  exprs: Pattern<Node>[];

  constructor(...exprs: Pattern<Node>[]) {
    super();
    
    this.exprs = exprs;
  }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
    isLookaround: boolean,
  ) {
    this.exprs.forEach(expr => expr.preprocess(symbols, lookarounds, negated, isLookaround));
  }
  
  negate() {
    return new Caten(...this.exprs.map(expr => expr.negate()));
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]) {
    let prevFrom = null;
    
    for (const expr of this.exprs) {
      const to = expr.toFsa(fsa, cover, from);
      
      const visited = new Set();
      
      function m(state: NdMultiState) {
        if (visited.has(state)) return;
        
        visited.add(state);
        
        state.innerOutTransitions.push(from);
        
        for (const [ under, transitions ] of state.transitionMap) {
          for (const transition of transitions) {
            for (const state of transition.to) m(state);
          }
        }
      }
      
      prevFrom && prevFrom.forEach(state => m(state));
      
      prevFrom = from;
      from = [ new NdMultiState(cover) ];
    }
    
    return [];
  }
  
  toGrammarRule(): GrammarSymbol[] { throw new Error("The programmer is lazy and unpaid."); }
}

export class And<Node extends SyntaxTreeNode<Node>> extends Pattern<SNode> {
  kind = 'And' as 'And';
  
  exprs: Pattern<Node>[];

  constructor(...exprs: Pattern<Node>[]) {
    super();
    
    this.exprs = exprs;
  }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
    isLookaround: boolean,
  ) {
    this.exprs.forEach(expr => expr.preprocess(symbols, lookarounds, negated, isLookaround));
  }
  
  negate() {
    return new Or(...this.exprs.map(expr => expr.negate()));
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]) {
    return []; // TODO
  }
  
  toGrammarRule(): GrammarSymbol[] { throw new Error("The programmer is lazy and unpaid."); }
}

export class Or<Node extends SyntaxTreeNode<Node>> extends Pattern<SNode> {
  kind = 'Or' as 'Or';
  
  exprs: Pattern<Node>[];

  constructor(...exprs: Pattern<Node>[]) {
    super();
    
    this.exprs = exprs;
  }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
    isLookaround: boolean,
  ) {
    this.exprs.forEach(expr => expr.preprocess(symbols, lookarounds, negated, isLookaround));
  }
  
  negate() {
    return new And(...this.exprs.map(expr => expr.negate()));
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]) {
    return this.exprs.flatMap(expr => expr.toFsa(fsa, cover, from));
  }
  
  toGrammarRule(
    grammar: Grammar,
    constraints: Record<string, boolean>,
    key?: Nonterminal,
  ): GrammarSymbol[] {
    if (!key) key = new RegularNt(this);
    
    this.exprs.forEach(expr => expr.toGrammarRule(grammar, constraints, key));
    
    return [ key ];
  }
}

export class Not<Node extends SyntaxTreeNode<Node>> extends Pattern<SNode> {
  kind = 'Not' as 'Not';
  
  constructor(public expr: Pattern<Node>) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
    isLookaround: boolean,
  ) {
    isLookaround && negated.set(this, this.expr.negate());
    
    this.expr.preprocess(symbols, lookarounds, negated, isLookaround);
  }
  
  negate() { return this.expr; }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]) {
    return this.expr.negate().toFsa(fsa, cover, from);
  }
  
  toGrammarRule(
    grammar: Grammar,
    constraints: Record<string, boolean>,
    key?: Nonterminal,
  ): GrammarSymbol[] {
    if (this.expr instanceof Chars) {
      return new Chars(this.expr.charTable, true).toGrammarRule(grammar, constraints, key);
    }
    
    if (this.expr instanceof Text) {
      if (this.expr.text.length === 0) {
        return new Repeat(new Chars('', true), new Caten(), 1).toGrammarRule(grammar, constraints, key);
      }
      
      return new Or(
        new Caten(new Chars(this.expr.text[0], true), new Repeat()),
        new Caten(new Chars(this.expr.text[0]), new Not(new Text(this.expr.text.substring(1)))),
      ).toGrammarRule(grammar, constraints, key);
    }
    
    // The general case would be to create grammar rules for this.negate().
    // But that would, in general, require creating grammar rules for Cadul,
    // and that's what I'm lazy to do.
    
    throw new Error("The programmer is lazy and unpaid.");
  }
}

export class Maybe<Node extends SyntaxTreeNode<Node>> extends Pattern<SNode> {
  kind = 'Maybe' as 'Maybe';
  
  constructor(public expr: Pattern<Node>) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
    isLookaround: boolean,
  ) {
    this.expr.preprocess(symbols, lookarounds, negated, isLookaround);
  }
  
  negate() {
    // `And(Not(Caten), Not(expr))`.
    return new And(new Cadul(), this.expr.negate());
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]) {
    return new Or(new Caten(), this.expr).toFsa(fsa, cover, from);
  }
  
  toGrammarRule(
    grammar: Grammar,
    constraints: Record<string, boolean>,
    key?: Nonterminal,
  ): GrammarSymbol[] {
    return new Or(new Caten(), this.expr).toGrammarRule(grammar, constraints, key);
  }
}

export class Repeat<Node extends SyntaxTreeNode<Node>> extends Pattern<SNode> {
  kind = 'Repeat' as 'Repeat';
  
  constructor(
    // TODO exclude weird unprintable ASCII chars.
    public expr: Pattern<Node> = new Chars('', true),
    public delimiter: Pattern<Node> = new Caten(),
    public min: number = 0,
    public max: number = Infinity,
  ) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
    isLookaround: boolean,
  ) {
    this.expr.preprocess(symbols, lookarounds, negated, isLookaround);
    this.delimiter.preprocess(symbols, lookarounds, negated, isLookaround);
  }
  
  negate() {
    return new Meld(this.expr.negate(), this.delimiter.negate(), this.min, this.max);
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[], includeDelimiter = false): NdMultiState[] {
    if (this.min > 0) {
      from = this.expr.toFsa(fsa, cover, from);
      
      new Repeat(this.expr, this.delimiter, this.min - 1, this.max - 1)
        .toFsa(fsa, cover, from, true);
    }
    
    if (this.max === 0) return from;
    
    if (this.max === Infinity) {
      const ret = new NdMultiState(cover);
      
      from.forEach(f => new Transition(null, f, [ ret ]));
      from = [ ret ];
      
      if (includeDelimiter) from = this.delimiter.toFsa(fsa, cover, from);
      
      this.expr.toFsa(fsa, cover, from).forEach(state => new Transition(null, state, [ ret ]));
      
      return [ ret ];
    }
    
    if (includeDelimiter) from = this.delimiter.toFsa(fsa, cover, from);
    
    from = this.expr.toFsa(fsa, cover, from);
    
    return new Repeat(this.expr, this.delimiter, 0, this.max - 1).toFsa(fsa, cover, from, true);
  }
  
  toGrammarRule(
    grammar: Grammar,
    constraints: Record<string, boolean>,
    key?: Nonterminal,
    includeDelimiter = false,
  ): GrammarSymbol[] {
    if (!key) key = new RegularNt(this);
    
    const delim = includeDelimiter ? this.delimiter.toGrammarRule(grammar, constraints) : [];
    const once = this.expr.toGrammarRule(grammar, constraints);
    
    if (this.min > 0) {
      const rest =
        new Repeat(this.expr, this.delimiter, this.min - 1, this.max - 1)
        .toGrammarRule(grammar, constraints, undefined, true);
      
      grammar.insert(new GrammarRule(key, [ ...delim, ...once, ...rest ]));
      
      return [ key ];
    }
    
    if (this.max === 0) {
      grammar.insert(new GrammarRule(key, []));
    }
    
    if (this.max === Infinity) {
      if (includeDelimiter) {
        grammar.insert(new GrammarRule(key, []));
        grammar.insert(new GrammarRule(key, [ ...delim, ...once, key ]));
      } else {
        const rest = this.toGrammarRule(grammar, constraints, undefined, true);
        
        grammar.insert(new GrammarRule(key, []));
        grammar.insert(new GrammarRule(key, [ ...once, ...rest ]));
      }
    }
    
    if (this.max !== 0 && this.max !== Infinity) {
      const rest =
        new Repeat(this.expr, this.delimiter, 0, this.max - 1)
        .toGrammarRule(grammar, constraints, undefined, true);
      
      grammar.insert(new GrammarRule(key, []));
      grammar.insert(new GrammarRule(key, [ ...delim, ...once, ...rest ]));
    }
    
    return [ key ];
  }
}

export class Meld<Node extends SyntaxTreeNode<Node>> extends Pattern<SNode> {
  kind = 'Meld' as 'Meld';
  
  constructor(
    public expr: Pattern<Node>,
    public delimiter: Pattern<Node> = new Caten(),
    public min: number = 0,
    public max: number = Infinity,
  ) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
    isLookaround: boolean,
  ) {
    this.expr.preprocess(symbols, lookarounds, negated, isLookaround);
    this.delimiter.preprocess(symbols, lookarounds, negated, isLookaround);
  }
  
  negate() {
    return new Repeat(this.expr.negate(), this.delimiter.negate(), this.min, this.max);
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]) {
    return []; // TODO
  }
  
  toGrammarRule(): GrammarSymbol[] { throw new Error("The programmer is lazy and unpaid."); }
}

type Primitive<T> = T extends boolean ? T : never;
type KeysOfType<T, TProp> = { [P in keyof T]: T[P] extends TProp? P : never}[keyof T];
type Constraints<Node, Matched> = {
  [key in keyof Matched]?:
    | Primitive<Matched[key]>
    | KeysOfType<Node, Matched[key]>
    | Pattern<any>
    // | Constraints<Node, Matched[key]> -- not supported.
};

export class Match<
  Node extends SyntaxTreeNode<Node>,
  Matched extends SyntaxTreeNode<Matched>,
> extends Pattern<SNode> {
  kind = 'Match' as 'Match';
  
  match: typeof SyntaxTreeNode & (new(...args: any) => Matched) | Pattern<Node>;
  prop: (string & keyof Node) | null;
  constraints: Constraints<Node, Matched> | null;
  
  // Matches if `prop` matches `match` with constraints `constraints`.
  constructor(
    isArray: boolean,
    match: new(...args: any) => Matched,
    prop?: null | (string & keyof Node),
    constraints?: Constraints<Node, Matched>,
  );
  // Matches if `prop` matches the pattern `expr`.
  constructor(
    isArray: boolean,
    prop: string & keyof Node,
    expr: string | number | Pattern<Node>,
  );
  constructor(
    public isArray: boolean,
    a: any,
    b?: any,
    c?: any,
  ) {
    super();
    
    if (a.prototype instanceof SyntaxTreeNode) { // IMPROVEMENT: recursive search
      this.match = a as any;
      this.prop = b as any || null;
      this.constraints = c as any || {};
    } else {
      if (typeof a !== 'string') throw new Error('arg bad');
      
      this.match = b as any;
      this.prop = a as any;
      this.constraints = null;
    }
  }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Not<SNode> | Symbol, Pattern<SNode>>,
    isLookaround: boolean,
  ) {
    if (this.match) {
      
      this.match instanceof Pattern || (this.match.preprocess = SyntaxTreeNode.preprocess);
      this.match.preprocess(symbols, lookarounds, negated, isLookaround);
    }
    
    if (this.constraints instanceof Pattern) {
      this.constraints.preprocess(symbols, lookarounds, negated, isLookaround);
    }
  }
  
  negate() {
    if (this.match) {
      if (this.constraints) throw new Error('Cannot negate Equals with constraints (yet).');
    }
    
    if (this.constraints instanceof Pattern) {
      return this.constraints.negate();
    }
    
    throw new Error('Cannot negate Equals with constraints (yet).');
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]) {
    if (this.constraints instanceof Pattern) {
      return this.constraints.toFsa(fsa, cover, from);
    }
    
    return from;
  }
  
  toGrammarRule(
    grammar: Grammar,
    constraints: Record<string, boolean>,
    key?: Nonterminal,
  ) {
    if (typeof this.match === "function") {
      const nt = createGrammarRules(
        grammar,
        this.match,
        this.prop,
        this.isArray,
        this.constraints as any || {},
        constraints,
      );
      
      if (key) {
        grammar.insert(new GrammarRule(key, [ nt ]));
        
        return [ key ];
      }
      
      return [ nt ];
    }
    
    const nt = new MatchNt(this.prop!, null, this.isArray);
    const arr = this.match.toGrammarRule(grammar, constraints, nt);
    
    if (!key) return [ nt ];
    
    grammar.insert(new GrammarRule(key, [ nt ]));
    
    return [ key ];
  }
  
  hasExpr(): this is this & { exprOrConstraints: Pattern<Node> } {
    return Array.isArray(this.constraints);
  }
}

export enum EqualsType {
  single,
  exists,
  all,
  prev,
  next,
}

function constraintsSatisfy(model: Record<string, boolean>, theory: PConstraints) {
  for (const key of Object.keys(model)) {
    if (!(key in theory)) continue;
    
    const tKey = theory[key]
    
    if (Array.isArray(tKey) ? tKey.includes(model[key]) : tKey === model[key]) continue;
    
    return false;
  }
  
  return true;
}

const neverMatch = new RegularNt('neverMatch' as any);

export class Equals<Node extends SyntaxTreeNode<Node>> extends Pattern<Node> {
  kind: 'Equals' = 'Equals';
  
  // Zero-width match if `this` matches `constraints`.
  constructor(
    public constraints: string | Pattern<Node> | Constraints<Node, any>,
    public type = EqualsType.single,
  ) { super(); }
  
  preprocess(
    symbols: Symbol[],
    lookarounds: (Before<SNode> | After<SNode>)[],
    negated: Map<Symbol | Not<SNode>, Pattern<SNode>>,
    isLookaround: boolean,
  ): void {
    if (this.constraints instanceof Pattern) throw new Error("Pattern matching in equals unsupported")
  }
  
  negate(): Pattern<Node> {
    throw new Error("Method not implemented.");
  }
  
  toFsa(fsa: NdMultiFsa, cover: NdMultiState, from: NdMultiState[]): NdMultiState[] {
    throw new Error("Equals in Arounds unsupported.");
  }
  
  toGrammarRule(
    grammar: Grammar,
    constraints: Record<string, boolean>,
    key?: Nonterminal,
  ): GrammarSymbol[] {
    if (this.type !== EqualsType.single) throw new Error('EqualsType unsupported');
    if (typeof this.constraints === "string"
      || this.constraints instanceof Pattern) throw new Error('constraints unsupported');
    
    if (constraintsSatisfy(constraints, this.constraints)) {
      if (key) grammar.insert(new GrammarRule(key, []))
      
      return [];
    }
    
    grammar.insert(new GrammarRule(neverMatch, [ neverMatch ]));
    
    return [ neverMatch ];
  }
}
