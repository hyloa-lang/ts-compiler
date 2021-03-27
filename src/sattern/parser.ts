/*
  Documentation is likely outdated.
  
  Produces an AST. Accepts satterns with the restriction that Not, Before and
  After only accept an extended regular satterns that do not contain submatches.

  A sattern is extended regular iff for all its rules R, every expression of that
  rule is either the last one or cannot derive R (ie. there is no recursion,
  except possibly for the last expresion).
  
  TODO stabilise the vocabulary. In particular expression, expressionComponent.
*/

import { promises } from 'fs';

import { Symbol, generateParserTables, Chars, Before, After, SNode, SyntaxTreeNode } from './index.js';
import { Fsa } from './fsa-nested.js';
import { getZerothOfRule, ParserStates } from './table-builder.js';


export abstract class Nonterminal {}

export class RegularNt extends Nonterminal {
  constructor(
    public constraints: Record<string, boolean> | null = null,
  ) { super(); }
}

export class MatchNt extends Nonterminal {
  constructor(
    public prop: string,
    public match: Symbol | null,
    public isArray: boolean,
  ) { super(); }
}

/*/
  Looking back, there should probably have been `string` instead of `Chars`.
  `Chars` only seems to cause a mild inconvenience, though, so I'll probably
  leave it as is.
/*/
export type GrammarSymbol = Chars | Nonterminal | Before<SNode> | After<SNode>;

function isLookaround(val: unknown): val is Before<SNode> | After<SNode> {
  return val instanceof Before || val instanceof After;
}

export class GrammarRule {
  symbolCount(): number {
    return this.expansion.reduce((a: number, c) => a + (isLookaround(c) ? 1 : 0), 0);
  }
  
  index: number | null = null;
  
  constructor(
    public nt: Nonterminal,
    public expansion: GrammarSymbol[],
  ) {}
}

export class Context {
  constructor(
    public chars: Chars,
    public canBeEmpty: boolean,
  ) {}
  
  static equals(a: Context, b : Context): boolean {
    return a.canBeEmpty === b.canBeEmpty && Chars.equals(a.chars, b.chars);
  }
}

export class RuleAt {
  at(): GrammarSymbol | null { return this.rule.expansion[this.dot] || null };
  
  isAtLookaround() {
    return this.at() instanceof Before || this.at() instanceof After;
  }
  
  constructor(
    public fsaState: Fsa,
    public rule: GrammarRule,
    public dot: number,
    public follow: Context,
    
    // The state in which the rule was entered.
    public origFsa:Fsa,
  ) {
    for (; this.isAtLookaround();) {
      const at = this.at() as Before<SNode> | After<SNode>;
      
      if (this.fsaState.transitions.has(at)) {
        this.fsaState = this.fsaState.transitions.get(at)!;
        this.dot += 1;
      } else break;
    }
  }
  
  followAt(grammar: Grammar) {
    return getZerothOfRule(
      grammar.zerothSets,
      this.rule.expansion,
      this.dot + 1,
      this.follow,
    );
  }
  
  expand(parserStates: ParserStates, parserState: ParserState) {
    if (this.isAtLookaround()) throw new Error('isAtLookaround');
    
    const at = this.at();
    
    if (at instanceof Nonterminal) {
      const follow = this.followAt(parserStates.grammar);
      
      parserStates.grammar.rules
        .filter(rule => rule.nt === at)
        .map(rule => new RuleAt(this.fsaState, rule, 0, follow, this.fsaState))
        .filter(ruleAt => !ruleAt.isAtLookaround())
        .forEach(ruleAt => parserState.insert(parserStates, ruleAt, false));
    }
  }
  
  shift(fsaState: Fsa | string): RuleAt | null {
    if (this.isAtLookaround()) throw new Error('isAtLookaround');
    
    const at = this.at();
    
    if (at === null) throw new Error('at null');
    
    if (at instanceof Chars !== (typeof fsaState === 'string')) throw new Error('chars string mismatch');
    
    if (at instanceof Chars) {
      const fsaStateMaybe = this.fsaState.transitions.get(fsaState as string);
      
      if (!fsaStateMaybe) return null;
      
      fsaState = fsaStateMaybe;
    }
    
    const shifted = new RuleAt(
      fsaState as Fsa,
      this.rule,
      this.dot + 1,
      this.follow,
      this.origFsa,
    );
    
    return shifted.isAtLookaround() ? null : shifted;
  }
  
  static equals(a: RuleAt, b: RuleAt): boolean {
    return a.fsaState === b.fsaState
      && a.rule === b.rule
      && a.dot === b.dot
      && Context.equals(a.follow, b.follow)
    ;
  }
}

export class Grammar {
  zerothSets = new Map<Nonterminal, Context>();
  
  constructor(
    public topNonterminal: RegularNt,
    public rules: GrammarRule[] = [],
  ) {}
  
  insert(rule: GrammarRule) {
    rule.index = this.rules.length;
    
    // IMPROVEMENT: check for rule equality, and if a rule already exists or only
    // differs in key identity, return that key and don't insert.
    this.rules.push(rule);
    
    this.zerothSets.has(rule.nt) ||
      this.zerothSets.set(rule.nt, new Context(new Chars(""), false));
  }
}

class ReduceInfo {
  constructor(
    public rule: GrammarRule,
    public fsaFrom: Fsa,
    public fsaTo: Fsa,
  ) {}
  
  equal(rule: GrammarRule, fsaFrom: Fsa, fsaTo: Fsa) {
    return this.rule === rule && this.fsaFrom === fsaFrom && this.fsaTo === fsaTo;
  }
}

export class ParserTransition {
  constructor(
    public shift: ParserState | null = null,
    public reduce: ReduceInfo[] = [],
  ) {}
  
  hasReduce(rule: GrammarRule, fsaFrom: Fsa, fsaTo: Fsa) {
    return this.reduce.some(rInfo => rInfo.equal(rule, fsaFrom, fsaTo));
  }
  
  insertReduce(rule: GrammarRule, fsaFrom: Fsa, fsaTo: Fsa) {
    if (!this.hasReduce(rule, fsaFrom, fsaTo)) {
      this.reduce.push(new ReduceInfo(rule, fsaFrom, fsaTo));
    }
  }
}

export class ParserState {
  transitions = new Map<string | null, ParserTransition>();
  // IMPROVEMENT, replace `ParserTransition` with `ParserState`.
  ntTransitions = new Map<Nonterminal, Map<Fsa, ParserTransition>>();
  
  ruleAts: RuleAt[];
  
  constructor(
    ruleAts: RuleAt[],
    parserStates: ParserStates,
  ) {
    if (ruleAts.some(ruleAt => ruleAt.isAtLookaround())) throw new Error('isAtLookaround');
    
    ruleAts.forEach(ruleAt => this.insert(parserStates, ruleAt, false));
    
    this.expand(parserStates);
  }
  
  retTransition(under: string | null) {
    if (!this.transitions.has(under)) {
      this.transitions.set(under, new ParserTransition());
    }
    
    return this.transitions.get(under)!;
  }
  
  retNtTransition(nt: Nonterminal, fsa: Fsa) {
    if (!this.ntTransitions.has(nt)) {
      this.ntTransitions.set(nt, new Map());
    }
    
    const map = this.ntTransitions.get(nt)!;
    
    if (!map.has(fsa)) {
      map.set(fsa, new ParserTransition());
    }
    
    return map.get(fsa)!;
  }
  
  expand(parserStates: ParserStates, i = 0) {
    if (this.ruleAts.length <= i) return;
    
    this.ruleAts[i].expand(parserStates, this);
    
    this.expand(parserStates, i + 1);
  }
  
  addNtTransition(
    parserStates: ParserStates,
    nt: Nonterminal,
    fsaFrom: Fsa,
    fsaTo: Fsa,
  ) {
    for (const ruleAt of this.ruleAts) {
      if (ruleAt.at() !== nt) continue;
      if (ruleAt.fsaState !== fsaFrom) continue;
      
      const shifted = ruleAt.shift(fsaTo);
      
      if (shifted) {
        const transition = this.retNtTransition(nt, fsaFrom);
        
        transition.shift || (transition.shift = new ParserState([], parserStates));
        transition.shift.insert(parserStates, shifted);
        
        transition.shift = parserStates.insert(transition.shift);
      }
    }
  }
  
  private populateTransitions(parserStates: ParserStates) {
    if (this.transitions.size > 0) throw new Error('transitions already populated');
    
    for (const ruleAt of this.ruleAts) {
      if (ruleAt.isAtLookaround()) throw new Error('isAtLookaround');
      
      const at = ruleAt.at();
      
      if (at === null) {
        // IMPROVEMENT: perhaps Context should be a Set<string | null>.
        if (ruleAt.follow.canBeEmpty) {
          const transition = this.retTransition(null);
          
          transition.insertReduce(ruleAt.rule, ruleAt.origFsa, ruleAt.fsaState);
        }
        
        for (const ch of ruleAt.follow.chars.chars()) {
          const transition = this.retTransition(ch);
          
          transition.insertReduce(ruleAt.rule, ruleAt.origFsa, ruleAt.fsaState);
        }
        
      } else if (at instanceof Chars) {
        for (const ch of at.chars()) {
          const shifted = ruleAt.shift(ch);
          
          if (shifted) {
            const transition = this.retTransition(ch);
            
            transition.shift || (transition.shift = new ParserState([], parserStates));
            
            transition.shift.insert(parserStates, shifted);
          }
        }
      }
    }
  }
  
  insert(parserStates: ParserStates, ruleAt: RuleAt, expand = true) {
    if (this.transitions.size > 0) throw new Error('cannot insert if transitions populated');
    
    const isUnique = this.ruleAts.every(rule => !RuleAt.equals(ruleAt, rule));
    
    if (isUnique) {
      this.ruleAts.push(ruleAt);
      
      const at = ruleAt.at();
      
      at instanceof Nonterminal && parserStates.retNtInfo(at, ruleAt.fsaState).insertState(this);
      
      expand && this.expand(parserStates, this.ruleAts.length - 1);
    }
  }
  
  addStates(parserStates: ParserStates) {
    this.populateTransitions(parserStates);
    
    for (const transition of this.transitions.values()) {
      if (transition.shift) {
        transition.shift = parserStates.insert(transition.shift);
      }
      
      for (const reduceInfo of transition.reduce) {
        parserStates.createPairIfNonexisting(
          reduceInfo.rule.nt,
          reduceInfo.fsaFrom,
          reduceInfo.fsaTo,
        );
      }
    }
  }
  
  static equals(a: ParserState, b: ParserState) {
    return a.ruleAts.length === b.ruleAts.length
      && a.ruleAts.every(ra => b.ruleAts.some(rb => RuleAt.equals(ra, rb)));
  }
}

function initialFromJson(initialJson: unknown): Map<Symbol, ParserState> {
  // TODO load parser table from json.
  throw new Error('Not yet implemented');
}

function saveParserState(
  obj: any,
  state: ParserState & { index?: number } | null,
  ctx: {
    includeDebugInfo: boolean;
    stateCount: number;
    pairCount: number;
    ntFsaPairMap: Map<Nonterminal, Map<Fsa, number>>;
  },
  prop?: string | number,
) {
  if (state === null) return null;
  if ('index' in state) return state;
  
  function retNt(nt: Nonterminal, fsa: Fsa) {
    ctx.ntFsaPairMap.has(nt) || ctx.ntFsaPairMap.set(nt, new Map());
    
    const map = ctx.ntFsaPairMap.get(nt)!;
    
    map.has(fsa) || map.set(fsa, ctx.pairCount++);
    
    return map.get(fsa)!;
  }
  
  state.index = ctx.stateCount++;
  prop || (prop = state.index);
  
  const stateJsonObj = obj[prop] = {
    index: state.index,
    transitions: {} as any,
  };
  
  for (const [ under, transition ] of state.transitions) {
    stateJsonObj.transitions[under || ''] = {
      shift: saveParserState(obj, transition.shift, ctx)?.index || null,
      reduce: transition.reduce.map(reduceInfo => retNt(reduceInfo.rule.nt, reduceInfo.fsaTo)),
    }
  }
  
  for (const [ nt, map ] of state.ntTransitions) {
    for (const [ fsa, transition ] of map) {
      stateJsonObj.transitions[retNt(nt, fsa)] = {
        shift: saveParserState(obj, transition.shift, ctx)?.index || null,
        reduce: [],
      }
    }
  }
  
  return stateJsonObj;
}

async function saveToJson(initial: Map<Symbol, ParserState>) {
  const ctx = {
    includeDebugInfo: false, // IMPROVEMENT implement this.
    stateCount: 0,
    pairCount: 0,
    ntFsaPairMap: new Map<Nonterminal, Map<Fsa, number>>(),
  };
  
  const obj: Record<string, any> = {};
  
  for (const [ symbol, state ] of initial) {
    saveParserState(obj, state, ctx, symbol.name);
  }
  
  console.log('Number of parser states: ', ctx.stateCount);
  
  await promises.writeFile('./parser-table.json', JSON.stringify(obj));
}

function setProgress(progressPtr: { value: boolean } | null, val: boolean) {
  progressPtr && (progressPtr.value = val);
}

type ParseHeadValue = Record<string, boolean | string | SNode>;

class ParseHead {
  reduced = false;
  
  constructor(
    public value: ParseHeadValue,
    public state: ParserState,
    public previous: ParseHead | null,
    public start: number,
    public end: number,
  ) {
    if (!state) throw new Error('programmer error');
  }
  
  shift(word: string, char: string): ParseHead | null {
    const transition = this.state.transitions.get(char);
    
    if (!transition) return null;
    
    return new ParseHead(
      {},
      transition.shift!,
      this,
      this.end,
      this.end + 1,
    );
  }
  
  // TODO break up into smaller functions.
  reduce(
    word: string,
    char: string | null,
    progressPtr: { value: boolean } | null = null,
  ): ParseHead[] {
    if (!this.reduced) return [ this ];
    
    this.reduced = true;
    
    const transition = this.state.transitions.get(char)!;
    
    0 < transition.reduce.length && setProgress(progressPtr, true);
    
    const nextHeads = transition.reduce.map(reduceInfo => {
      const symbolCount = reduceInfo.rule.symbolCount();
      
      function mergeValues(head: ParseHead, count: number): [ ParseHead, ParseHeadValue ] {
        if (count === 0) return [ head, Object.assign({}, head.value) ];
        
        const [ prevHead, value ] = mergeValues(head.previous!, count - 1);
        
        for (const key of Object.keys(head.value)) {
          value[key] = key in value
            ? [ ...(value[key] as any), head.value[key] ] : head.value[key];
        }
        
        return [ prevHead, value ];
      };
      
      const [ prevHead, value ] = mergeValues(this, symbolCount);
      
      if (reduceInfo.rule.nt instanceof MatchNt) {
        let toInsert;
        
        if (reduceInfo.rule.nt.match) {
          const symbolInstance = new reduceInfo.rule.nt.match(
            Object.assign(
              value,
              (reduceInfo.rule.expansion[0] as RegularNt).constraints!,
            ),
          );
          
          toInsert = symbolInstance;
          value[reduceInfo.rule.nt.prop] = symbolInstance;
        } else {
          toInsert = word.substring(prevHead.start, this.end);
        }
        
        if (reduceInfo.rule.nt.isArray) {
          reduceInfo.rule.nt.prop in value || (value[reduceInfo.rule.nt.prop] = []);
          
          (value[reduceInfo.rule.nt.prop] as (SNode | string)[]).push(toInsert);
        } else {
          value[reduceInfo.rule.nt.prop] = toInsert;
        }
      }
      
      return new ParseHead(
        value,
        prevHead.state.retNtTransition(reduceInfo.rule.nt, reduceInfo.fsaTo).shift!,
        prevHead,
        prevHead.start,
        this.end,
      );
    });
    
    return transition.shift ? [ this, ...nextHeads ] : nextHeads;
  }
}

export class Parser<T extends Symbol> {
  initial = new Map<Symbol, ParserState>();
  
  constructor(
    public startingSymbols: Set<T>,
    initial?: any,
  ) {
    if (arguments.length === 3) {
      // TODO: validate initial.
    }
    
    if (initial) {
      this.initial = initialFromJson(initial);
    } else {
      this.initial = generateParserTables(startingSymbols);
      
      saveToJson(this.initial);
    }
  }
  
  // TODO in case of no match, some kind of error.
  //parse<S extends (new(...args: any) => InstanceType<S>) & T>(word: string, symbol: S): InstanceType<S> | null {
  parse<S extends new(...args: any) => InstanceType<S>>(word: string, symbol: S): InstanceType<S> | null {
    let heads = [ new ParseHead({}, this.initial.get(symbol)!, null, 0, 0) ];
    let i = 0;
    
    const progressPtr = { value: true };
    
    for (; 0 < heads.length && (i < word.length || progressPtr.value);) {
      const canShift = !progressPtr.value;
      
      progressPtr.value = false;
      
      heads = canShift
        ? heads.map(head => head.shift(word, word[i])!).filter(a => a)
        : heads.flatMap(head => head.reduce(word, word[i] || null, progressPtr))
      ;
      
      canShift && (i += 1);
    }
    
    if (heads.length > 1) {
      console.log(heads);
      throw new Error('multiple parses.');
    }
    
    console.log(heads[0])
    console.log(heads[0].value)
    return heads[0] ? heads[0].value.root as any : null;
  }
}
