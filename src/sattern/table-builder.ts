import { Chars, Before, After, Symbol, PConstraints } from "./index.js";
import { Nonterminal, GrammarSymbol, Grammar, MatchNt, ParserState, RegularNt, GrammarRule, RuleAt, Context } from "./parser.js";
import { generateFsa, Fsa } from "./fsa-nested.js";


// TODO compute all nt fsa pairs upfront.

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

class NtInfo {
  ruleAts: RuleAt[] = [];
  indices = new Map<Fsa, number>();
  
  insertRuleAt(ruleAt: RuleAt) {
    if (this.ruleAts.every(rAt => !RuleAt.equals(rAt, ruleAt))) {
      this.ruleAts.push(ruleAt);
    }
  }
  
  insertIndex(fsaTo: Fsa, index: number): boolean {
    if (!this.indices.has(fsaTo)) {
      this.indices.set(fsaTo, index);
      
      return true;
    }
    
    return false;
  }
}

export class GrammarExplorer {
  ntCounter = 0;
  ntFromToTo = new Map<Nonterminal, Map<Fsa, NtInfo>>();
  
  constructor(
    public grammar: Grammar,
  ) {}
  
  findAllNtFsaPairs(ruleAts: RuleAt[], i = 0): void {
    function push(ruleAt: RuleAt | null) {
      ruleAt && ruleAts.every(rAt => !RuleAt.equals(rAt, ruleAt)) && ruleAts.push(ruleAt);
    }
    
    if (ruleAts.length <= i) return;
    
    const ruleAt = ruleAts[i];
    const at = ruleAt.at();
    
    if (at instanceof Nonterminal) {
      const ntInfo = this.ret(at, ruleAt.fsaState);
      
      ntInfo.insertRuleAt(ruleAt);
      
      for (const [ fsaTo ] of ntInfo.indices) {
        const shifted = ruleAt.shift(fsaTo);
        
        push(shifted);
      }
      
      for (const rule of this.grammar.rules.filter(rule => rule.nt === at)) {
        const shifted = new RuleAt(ruleAt.fsaState, rule, 0, ruleAt.followAt(this.grammar), ruleAt.fsaState);
        
        push(shifted);
      }
    }
    
    if (at instanceof Chars) {
      for (const char of at.chars()) {
        const shifted = ruleAt.shift(char);
        
        push(shifted);
      }
    }
    
    if (at === null) {
      const ntInfo = this.ret(ruleAt.rule.nt, ruleAt.origFsa);
      
      if (ntInfo.insertIndex(ruleAt.fsaState, this.ntCounter)) {
        
        this.ntCounter += 1;
        
        for (const otherRuleAt of ntInfo.ruleAts) {
          const shifted = otherRuleAt.shift(ruleAt.fsaState);
          
          shifted && ruleAts.push(shifted);
        }
      }
    }
    
    //await new Promise(f => process.nextTick(f));
    
    return this.findAllNtFsaPairs(ruleAts, i + 1);
  }
  
  ret(nt: Nonterminal, fsa: Fsa) {
    this.ntFromToTo.has(nt) || this.ntFromToTo.set(nt, new Map());
    
    const map = this.ntFromToTo.get(nt)!;
    
    map.has(fsa) || map.set(fsa, new NtInfo());
    
    return map.get(fsa)!;
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
  const nt = prop ? new MatchNt(prop, symbol, isArray) : new RegularNt(symbol);
  
  for (const nonterminal of constraintsToAllNonterminals(symbol, constraints, parentConstraints)) {
    grammar.insert(new GrammarRule(nt, [ nonterminal ]));
  }
  
  return nt;
}

function createAllNonterminals(symbol: Symbol, arr: boolean[] = []): RegularNt[] | null {
  if (arr.length === 0) {
    if (symbol.nonterminals) return null;
    
    if (symbol.constraintKeys.length === 0) {
      symbol.nonterminals = new RegularNt(symbol, {});
      
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
          ? new RegularNt(symbol, symbol.boolArrToConstraints(arr))
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

export function createGrammarRules(
  grammar: Grammar,
  symbol: Symbol,
  prop: string | null = null,
  isArray: boolean = prop == null ? false : (undefined as any),
  constraints: PConstraints = {},
  parentConstraints: Record<string, boolean> = {},
): Nonterminal {
  const matchNts = createAllNonterminals(symbol);
  
  if (matchNts) matchNts.forEach(nt => symbol.rule.toGrammarRule(grammar, nt.constraints!, nt));
  
  return constraintsToNonterminal(grammar, symbol, prop, isArray, constraints, parentConstraints);
}

export class ParserStates {
  states: ParserState[] = [];
  
  explorer = new GrammarExplorer(this.grammar);
  
  constructor(
    public grammar: Grammar,
  ) {}
  
  insert(state: ParserState) {
    const foundState = this.states.find(s => ParserState.equals(s, state));
    
    if (foundState) return foundState;
    
    this.states.push(state);
    
    return state;
  }
  
  expand(i = 0) {
    if (this.states.length <= i) return;
    
    this.states[i].addStates(this);
    
    this.expand(i + 1);
  }
}

export function generateParserTables(
  startingSymbols: Set<Symbol>,
): [ Map<Symbol, ParserState>, Grammar, GrammarExplorer ] {
  const fsa = generateFsa(startingSymbols);
  
  const topNonterminal = new RegularNt(null);
  const grammar: Grammar = new Grammar(topNonterminal);
  const parserStates = new ParserStates(grammar);
  const map = new Map<Symbol, ParserState>();
  
  topNonterminal.isTop = true;
  
  const startingRules = [ ...startingSymbols ]
    .map((symbol): [ Symbol, Nonterminal ] => [ symbol, createGrammarRules(grammar, symbol, 'root', false) ]);
  
  computeZeroth(grammar);
  
  grammar.prettyPrint();
  
  for (const [ symbol, nt ] of startingRules) {
    const rule = new GrammarRule(topNonterminal, [ nt ]);
    const ruleAt = new RuleAt(fsa, rule, 0, new Context(new Chars(""), true), fsa);
    
    if (ruleAt.isAtLookaround()) continue;
    
    parserStates.explorer.findAllNtFsaPairs([ ruleAt ]);
    
    const parserState = new ParserState([ ruleAt ], parserStates);
    
    parserStates.insert(parserState);
    
    map.set(symbol, parserState);
  };
  
  parserStates.expand();
  
  return [ map, grammar, parserStates.explorer ];
}
