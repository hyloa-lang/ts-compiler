import { Chars, Before, After, Symbol, PConstraints } from "./index.js";
import { Nonterminal, GrammarSymbol, Grammar, MatchNt, ParserState, RegularNt, GrammarRule, RuleAt, Context } from "./parser.js";
import { generateFsa, Fsa } from "./fsa-nested.js";


export type NonterminalsFromConstraints =
  Map<boolean, NonterminalsFromConstraints | RegularNt> | RegularNt;

export function getZerothOfRule(
  alreadyKnownZeroths: Map<Nonterminal, Context>,
  rule: GrammarSymbol[],
  i = 0,
  follow: Context | null = null,
): Context {
  let chars = new Chars("");
  let canBeEmpty = true;
  
  for (; i < rule.length; i++) {
    const gs = rule[i];
    
    if (gs instanceof Before || gs instanceof After) continue;
    
    if (gs instanceof Chars) {
      chars = Chars.or(chars, gs);
      canBeEmpty = false;
    }
    
    if (gs instanceof Nonterminal) {
      const { chars: gsChars, canBeEmpty: gsCanBeEmpty } = alreadyKnownZeroths.get(gs)!;
      
      chars = Chars.or(chars, gsChars);
      canBeEmpty = gsCanBeEmpty;
    }
    
    if (!canBeEmpty) break;
  }
  
  if (!follow) return new Context(chars, canBeEmpty);
  
  return new Context(Chars.or(chars, follow.chars), canBeEmpty && follow.canBeEmpty);
}

function computeZeroth(grammar: Grammar) {
  let change = true;
  
  while (change) {
    change = false;
    
    for (const { nt, expansion } of grammar.rules) {
      let { chars, canBeEmpty } = grammar.zerothSets.get(nt)!;
      
      const { chars: ruleChars, canBeEmpty: ruleCanBeEmpty } = getZerothOfRule(grammar.zerothSets, expansion);
      const newChars = Chars.or(chars, ruleChars);
      
      !canBeEmpty && ruleCanBeEmpty || chars.size < newChars.size && (change = true);
      
      chars = newChars;
      canBeEmpty = canBeEmpty || ruleCanBeEmpty;
      
      grammar.zerothSets.set(nt, new Context(chars, canBeEmpty));
    }
  }
}

function getConstraintForKey(
  key: string,
  constraints: PConstraints,
  parentConstraints: Record<string, boolean>,
  array: true,
): boolean[];

// TODO is this overload necessary?
function getConstraintForKey(
  key: string,
  constraints: PConstraints,
  parentConstraints: Record<string, boolean>,
  array: false,
): boolean | null;

function getConstraintForKey(
  key: string,
  constraints: PConstraints,
  parentConstraints: Record<string, boolean>,
  array: boolean,
): boolean[] | boolean | null {
  const constraint = constraints[key] || [ false, true ];
  
  if (Array.isArray(constraint)) {
    if (constraint.length === 0) throw new Error('501 - lazy programmer');
    
    const arr = [ ...new Set(constraint.map(c => typeof c === 'boolean' ? c : parentConstraints[key])) ];
    
    return arr.length === 2 ? null : arr[0];
  }
  
  const ret = typeof constraint === 'boolean' ? constraint : parentConstraints[key];
  
  return array ? [ ret ] : ret;
}

function constraintsToAllNonterminals(
  symbol: Symbol,
  constraints: PConstraints,
  parentConstraints: Record<string, boolean>,
  arr: boolean[] = [],
): RegularNt[] {
  if (arr.length === symbol.constraintKeys.length) {
    return [ arr.reduce((a, c) => a.get(c), symbol.nonterminals as any) ];
  }
  
  const constraintsForKey = getConstraintForKey(
    symbol.constraintKeys[arr.length],
    constraints,
    parentConstraints,
    true,
  );
  
  return constraintsForKey.flatMap(constraint => constraintsToAllNonterminals(
    symbol, constraints, parentConstraints, [ ...arr, constraint ]));
}

function constraintsToNonterminal(
  grammar: Grammar,
  symbol: Symbol,
  prop: string | null,
  isArray: boolean,
  constraints: PConstraints,
  parentConstraints: Record<string, boolean>,
) {
  const nt = prop ? new MatchNt(prop, symbol, isArray) : new RegularNt();
  
  for (const nonterminal of constraintsToAllNonterminals(symbol, constraints, parentConstraints)) {
    grammar.insert(new GrammarRule(nt, [ nonterminal ]));
  }
  
  return nt;
}

/* This version tried to cache returned nonterminals.
function constraintsToNonterminal(
  symbol: Symbol,
  constraints: PConstraints,
  parentConstraints: Record<string, boolean>,
  map: any = symbol.nonterminals!,
  i = 0,
): { nt: Nonterminal, isNew: boolean } {
  if (i === symbol.constraintKeys.length) return { nt: map, isNew: false };
  
  const constraintsForKey = getConstraintsForKey(
    symbol.constraintKeys[i],
    constraints,
    parentConstraints,
    false,
  );
  
  if (!map.has(constraintsForKey)) {
    if (i + 1 === symbol.constraintKeys.length) {
      const nt = new MatchNoneNt();
      
      map.set(constraintsForKey, nt);
      
      return { nt, isNew: true };
    } else {
      map.set(constraintsForKey, new Map());
    }
  }
  
  return constraintsToNonterminal(
    symbol,
    constraints,
    parentConstraints,
    map.get(constraintsForKey),
    i + 1,
  );
}
*/

function createAllNonterminals(symbol: Symbol, arr: boolean[] = []): RegularNt[] | null {
  if (arr.length === 0) {
    if (symbol.nonterminals) return null;
    
    if (symbol.constraintKeys.length === 0) {
      symbol.nonterminals = new RegularNt({});
      
      return [ symbol.nonterminals ];
    } else {
      symbol.nonterminals = new Map();
    }
  }
  
  if (arr.length === symbol.constraintKeys.length) {
    return [ arr.reduce((a, c, i) => {
      const lastConstraint = i + 1 === arr.length;
      
      if (!a.has(c)) {
        a.set(c, lastConstraint
          ? new RegularNt(symbol.boolArrToConstraints(arr))
          : new Map(),
        );
      }
      
      return a.get(c);
    }, symbol.nonterminals as any) ];
  } else {
    return [
      ...createAllNonterminals(symbol, [ ...arr, false ])!,
      ...createAllNonterminals(symbol, [ ...arr, true ])!,
    ];
  }
}

function createGrammarRule(grammar: Grammar, symbol : Symbol, nt: RegularNt) {
  const rule = symbol.rule.toGrammarRule(grammar, nt.constraints!, nt);
  
  grammar.insert(new GrammarRule(nt, rule));
}

export function createGrammarRules(
  grammar: Grammar,
  symbol: Symbol,
  prop: string | null = null,
  isArray: boolean = prop == null ? false : (undefined as any),
  constraints: PConstraints = {},
  parentConstraints: Record<string, boolean> = {},
): Nonterminal {
  const matchNts = createAllNonterminals(symbol);
  
  if (matchNts) matchNts.forEach(nt => createGrammarRule(grammar, symbol, nt));
  
  return constraintsToNonterminal(grammar, symbol, prop, isArray, constraints, parentConstraints);
}

class NtInfo {
  // Sates where the nonterminal is used.
  states: ParserState[] = [];
  // Nonterminals to which this nonterminal can reduce.
  fsas: Fsa[] = [];
  
  insertFsa(fsa: Fsa): boolean {
    if (!this.hasFsa(fsa)) {
      this.fsas.push(fsa);
      
      return true;
    }
    
    return false;
  }
  
  hasFsa(fsa: Fsa) { return this.fsas.includes(fsa); }
  
  insertState(state: ParserState) {
    if (!this.hasState(state)) this.states.push(state);
  }
  
  hasState(state: ParserState) { return this.states.includes(state); }
}

export class ParserStates {
  states: ParserState[] = [];
  
  constructor(
    public grammar: Grammar,
  ) {}
  
  ntInfos = new Map<Nonterminal, Map<Fsa, NtInfo>>();
  
  insert(state: ParserState) {
    const foundState = this.states.find(s => ParserState.equals(s, state));
    
    // IMPROVEMENT here, you can increment a refcount if you decide to track
    // which states are used.
    if (foundState) return foundState;
    
    this.states.push(state);
    
    return state;
  }
  
  expand(i = 0) {
    if (this.states.length <= i) return;
    
    this.states[i].addStates(this);
    
    this.expand(i + 1);
  }
  
  retNtInfo(ntFrom: Nonterminal, fsaFrom: Fsa): NtInfo {
    if (!this.ntInfos.has(ntFrom)) this.ntInfos.set(ntFrom, new Map());
    
    const map = this.ntInfos.get(ntFrom)!;
    
    if (!map.has(fsaFrom)) map.set(fsaFrom, new NtInfo());
    
    return map.get(fsaFrom)!;
  }
  
  createPairIfNonexisting(
    nt: Nonterminal,
    fsaFrom: Fsa,
    fsaTo: Fsa,
  ) {
    const ntInfo = this.retNtInfo(nt, fsaFrom);
    const inserted = ntInfo.insertFsa(fsaTo);
      
    if (inserted) {
      for (const state of ntInfo.states) {
        // IMPROVEMENT if inefficiency is a concern, perhaps track disowned states and don't expand them
        state.addNtTransition(this, nt, fsaFrom, fsaTo);
      }
    }
  }
}

export function generateParserTables(
  startingSymbols: Set<Symbol>,
): Map<Symbol, ParserState> {
  const fsa = generateFsa(startingSymbols);
  
  const topNonterminal = new RegularNt();
  const grammar: Grammar = new Grammar(topNonterminal);
  const parserStates = new ParserStates(grammar);
  
  const map = new Map<Symbol, ParserState>();
  
  const startingRules = [ ...startingSymbols ]
    .map((symbol): [ Symbol, Nonterminal ] => [ symbol, createGrammarRules(grammar, symbol, 'root', false) ]);
  
  computeZeroth(grammar);
  
  for (const [ symbol, nt ] of startingRules) {
    const rule = new GrammarRule(topNonterminal, [ nt ])
    const ruleAt = new RuleAt(fsa, rule, 0, new Context(new Chars(""), true), fsa);
    
    if (ruleAt.isAtLookaround()) continue;
    
    const parserState = new ParserState([ ruleAt ], parserStates);
    
    parserStates.insert(parserState);
    
    map.set(symbol, parserState);
  };
  
  parserStates.expand();
  
  return map;
}
