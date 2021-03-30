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

import { Symbol, generateParserTables, Chars, Before, After, SNode, SyntaxTreeNode, Pattern } from './index.js';
import { Fsa } from './fsa-nested.js';
import { getZerothOfRule, ParserStates, GrammarExplorer } from './table-builder.js';


export abstract class Nonterminal {
  isTop = false;
}

export class RegularNt extends Nonterminal {
  constructor(
    // Just for ease of debugging.
    public source: Pattern<SNode> | Symbol | null,
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
  takeCount(): number {
    return this.expansion.reduce((a: number, c) => a + (isLookaround(c) ? 0 : 1), 0);
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
  
  toArr(): (string | null)[] {
    return [ ...this.chars.chars(), ...(this.canBeEmpty ? [ null ] : []) ];
  }
  
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
  
  // IMPROVEMENT change parserStates back to grammar.
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
      && a.origFsa === b.origFsa;
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
  
  prettyPrint() {
    let ntIndex = 0;
    
    for (const nt of this.zerothSets.keys()) nt.index = ntIndex++;
    
    for (const nt of this.zerothSets.keys()) {
      console.log();
      console.log();
      console.log(nt.source || null);
      console.log(nt.index, ': follow', '(' + this.zerothSets.get(nt)!.chars.chars().map(c => c === '\n' ? '\\n' : c).join('') + ')', this.zerothSets.get(nt)!.canBeEmpty);
      this.rules.forEach(rule => rule.nt === nt && console.log('(' + rule.index + ')', '=>', rule.expansion.map(gs => {
        if (gs instanceof Before) return 'Before';
        if (gs instanceof After) return 'After';
        if (gs instanceof Nonterminal) return 'index' in gs ? gs.index : '(index does not exist)';
        return '(' + gs.chars().map(c => c === '\n' ? '\\n' : c).join('') + ')';
      }).join(' ')|| '(empty)'));
    }
  }
}

class ReduceInfo {
  constructor(
    public rule: GrammarRule,
    public index: number,
  ) {}
  
  equal(rule: GrammarRule, index: number) {
    return this.rule === rule && this.index === index;
  }
}

export class ParserTransition {
  constructor(
    public shift: ParserState | null = null,
    public reduce: ReduceInfo[] = [],
  ) {}
  
  hasReduce(rule: GrammarRule, index: number) {
    return this.reduce.some(rInfo => rInfo.equal(rule, index));
  }
  
  insertReduce(rule: GrammarRule, index: number) {
    if (!this.hasReduce(rule, index)) {
      this.reduce.push(new ReduceInfo(rule, index));
    }
  }
}

export class ParserState {
  transitions = new Map<string | null, ParserTransition>();
  // IMPROVEMENT, replace `ParserTransition` with `ParserState`.
  ntTransitions = new Map<number, ParserTransition>();
  
  ruleAts: RuleAt[] = [];
  
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
  
  retNtTransition(index: number) {
    if (!this.ntTransitions.has(index)) {
      this.ntTransitions.set(index, new ParserTransition());
    }
    
    return this.ntTransitions.get(index)!;
  }
  
  expand(parserStates: ParserStates, i = 0) {
    if (this.ruleAts.length <= i) return;
    
    this.ruleAts[i].expand(parserStates, this);
    
    this.expand(parserStates, i + 1);
  }
  
  /* TODO delete
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
  }*/
  
  private populateTransitions(parserStates: ParserStates) {
    if (this.transitions.size > 0) throw new Error('transitions already populated');
    
    for (const ruleAt of this.ruleAts) {
      const at = ruleAt.at();
      
      if (at instanceof Before || at instanceof After) throw new Error('isAtLookaround');
      
      if (at === null) {
        const index = parserStates
          .explorer
          .ret(ruleAt.rule.nt, ruleAt.origFsa)
          .indices.get(ruleAt.fsaState)!;
        
        // IMPROVEMENT: perhaps Context should be a Set<string | null>.
        if (ruleAt.follow.canBeEmpty) {
          const transition = this.retTransition(null);
          
          transition.insertReduce(ruleAt.rule, index);
        }
        
        for (const ch of ruleAt.follow.chars.chars()) {
          const transition = this.retTransition(ch);
          
          transition.insertReduce(ruleAt.rule, index);
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
      } else {
        for (const [ fsa, index ] of parserStates.explorer.ret(at, ruleAt.fsaState).indices) {
          const shifted = ruleAt.shift(fsa);
          
          if (shifted) {
            const transition = this.retNtTransition(index);
            
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
      
      expand && this.expand(parserStates, this.ruleAts.length - 1);
    }
  }
  
  addStates(parserStates: ParserStates) {
    this.populateTransitions(parserStates);
    
    for (const transition of this.transitions.values()) {
      if (transition.shift) {
        transition.shift = parserStates.insert(transition.shift);
      }
    }
    
    for (const transition of this.ntTransitions.values()) {
      if (transition.shift) {
        transition.shift = parserStates.insert(transition.shift);
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
  explorer: GrammarExplorer,
  ctx: {
    includeDebugInfo: boolean;
    stateCount: number;
  },
  prop?: string | number,
) {
  if (state === null) return null;
  if ('index' in state) return state;
  
  state.index = ctx.stateCount++;
  prop || (prop = state.index);
  
  const stateJsonObj = obj[prop] = {
    index: state.index,
    transitions: {} as any,
    ntTransitions: {} as any,
  };
  
  for (const [ under, transition ] of state.transitions) {
    stateJsonObj.transitions[under || ''] = {
      shift: saveParserState(obj, transition.shift, explorer, ctx)?.index || null,
      reduce: transition.reduce.map(reduceInfo => ({ ruleIndex: reduceInfo.rule.index, ntIndex: reduceInfo.index })),
    }
  }
  
  for (const [ ntIndex, transition ] of state.ntTransitions) {
    stateJsonObj.ntTransitions[ntIndex] = {
      shift: saveParserState(obj, transition.shift, explorer, ctx)?.index || null,
      reduce: [],
    }
  }
  
  return stateJsonObj;
}

async function saveToJson(initial: Map<Symbol, ParserState>, explorer: GrammarExplorer) {
  const ctx = {
    includeDebugInfo: false, // IMPROVEMENT implement this.
    stateCount: 0,
  };
  
  const obj: Record<string, any> = {};
  
  for (const [ symbol, state ] of initial) {
    saveParserState(obj, state, explorer, ctx, symbol.name);
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
    public wordIndex: number,
    // How many heads back value did change.
    public lastValueChangeIndex: number,
  ) {
    if (!state) throw new Error('programmer error');
  }
  
  shift(word: string, char: string): ParseHead | null {
    const transition = this.state.transitions.get(char);
    
    if (!transition || !transition.shift) return null;
    
    return new ParseHead(
      {},
      transition.shift,
      this,
      this.wordIndex + 1,
      this.lastValueChangeIndex + 1,
    );
  }
  
  // TODO break up into smaller functions.
  reduce(
    word: string,
    char: string | null,
    progressPtr: { value: boolean } | null = null,
  ): ParseHead[] {
    if (this.reduced) return [ this ];
    
    this.reduced = true;
    
    const transition = this.state.transitions.get(char);
    
    if (!transition) return [];
    
    const nextHeads = transition.reduce.map(reduceInfo => {
      if (reduceInfo.rule.nt.isTop) return this;
      
      setProgress(progressPtr, true);
      
      const symbolCount = reduceInfo.rule.takeCount();
      
      function mergeValues(head: ParseHead, count: number): [ ParseHead, ParseHeadValue ] {
        if (count === 0) return [ head, {} ];
        
        const [ prevHead, value ] = mergeValues(head.previous!, count - 1);
        
        let hasKeys = false;
        
        for (const key of Object.keys(head.value)) {
          hasKeys = true;
          
          value[key] = key in value
            ? [ ...(value[key] as any), head.value[key] ] : head.value[key];
        }
        
        return [ prevHead, value ];
      };
      
      let [ prevHead, value ] = mergeValues(this, symbolCount); // asdf
      
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
          value = {};
        } else {
          toInsert = word.substring(prevHead.wordIndex, this.wordIndex);
        }
        
        if (reduceInfo.rule.nt.isArray) {
          reduceInfo.rule.nt.prop in value || (value[reduceInfo.rule.nt.prop] = []);
          
          (value[reduceInfo.rule.nt.prop] as (SNode | string)[]).push(toInsert);
        } else {
          value[reduceInfo.rule.nt.prop] = toInsert;
        }
      }
      
      const valueChanged = reduceInfo.rule.nt instanceof MatchNt
        || this.lastValueChangeIndex < symbolCount;
      
      return new ParseHead(
        value,
        prevHead.state.retNtTransition(reduceInfo.index).shift!,
        prevHead,
        this.wordIndex,
        valueChanged ? 0 : prevHead.lastValueChangeIndex + 1,
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
      //generateParserTables(startingSymbols).then(([ initial, explorer ]) => {
      const [ initial, explorer ] = generateParserTables(startingSymbols);
      
      saveToJson(initial, explorer);
      
      this.initial = initial;
    }
  }
  
  // TODO in case of no match, some kind of error.
  parse<S extends Symbol>(word: string, symbol: S): InstanceType<S> | number {
    let heads = [ new ParseHead({}, this.initial.get(symbol)!, null, 0, 0) ];
    let i = 0;
    
    // IMPROVEMENT: calculate whether shifting is allowed in the next round its preceding round.
    // Currently, there are rounds with canShift false that do not reduce anything.
    const progressPtr = { value: true };
    
    for (; 0 < heads.length && (i < word.length || progressPtr.value);) {
console.log('here', i);
      const canShift = !progressPtr.value;
      
      progressPtr.value = !progressPtr.value;
      
      heads = canShift
        ? heads.map(head => head.shift(word, word[i])!).filter(a => a)
        : heads.flatMap(head => head.reduce(word, word[i] || null, progressPtr))
      ;
      
      /* TODO deduplicate heads (if a.state === b.state, and lastValueChangeIndex)
      for (let i = 0; i < heads.length; i += 1) {
        for (let j = i + 1; j < heads.length; j += 1) {
          const [ headA, headB ] = [ heads[i], heads[j] ];
          
          if (headA.state === headB.state && headA.previous === headB.previous) {
            if (headA.lastValueChangeIndex) TODO
            
            const replacement = heads.pop();
            
            if (j < heads.length) {
              heads[j] = replacement;
              j -= 1;
            }
          }
        }
      }*/
      
      canShift && (i += 1);
    }
    
    if (heads.length > 1) {
      console.log(heads);
      throw new Error('multiple parses.');
    }
    
    console.log(heads[0])
    console.log(heads[0].value)
    return heads[0] ? heads[0].value.root as any : i;
  }
}
