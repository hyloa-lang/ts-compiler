// This was a 5-minute long attempt to try to get rid of nested states.
// It is relatively easily doable, and would likely make a few things easier,
// but I'm not sure that it's worth the effort now that the nested version is
// mostly already done (hopefully).

import { SNode, Pattern, Symbol, Chars, After, Before, Not } from './index.js';


type Letter = string | Before<SNode> | After<SNode>;

export class NdMultiFsa {
  afters = new Map<Before<SNode>, Set<After<SNode>>>();
  
  constructor(
    public alphabet: Letter[],
    public initial = new Map<Symbol | Before<SNode> | After<SNode> | null, NdMultiState>(),
  ) {}
  
  copy(init: Symbol, exclude: Symbol): NdMultiState {
    const map = new Map<NdMultiState, NdMultiState>();
    
    const initCopy = this.initial.get(init)!.copy(map);
    
    if (map.has(this.initial.get(exclude)!)) throw new Error("Grammar is not extended regular.");
    
    return initCopy;
  }
  
  befores(): Before<SNode>[] {
    return this.alphabet.filter(l => l instanceof Before) as Before<SNode>[];
  }
  
  toSimpleFsa(): Fsa {
    const initMain = new OrState([ new AndState(this.initial.get(null)!) ]).expand(this);
    const initState = new Configuration(this, initMain);
    
    const states = [ initState ];
    
    for (const state of states) {
      for (let under of this.alphabet) {
        const nextNew = state.next(states, under);
        const nextExisting = states.find(state => Configuration.equals(state, nextNew));
        
        if (!nextExisting) {
          states.push(nextNew);
        }
        
        state.state.transitions.set(under, (nextExisting || nextNew).state);
      }
    }
    
    // TODO minimize.
    return states[0].state;
  }
}

export class NdMultiState {
  transitionMap = new Map<string | null, Transition[]>();
  
  isAccepting() { return this.isFinal; }
  
  constructor(
    public isFinal = false,
    public before: Before<SNode> | After<SNode> | null = null,
    public source: Before<SNode> | After<SNode> | null = null,
  ) {}
  
  copy(map: Map<NdMultiState, NdMultiState>): NdMultiState {
    if (map.has(this)) return map.get(this)!;
    
    const theCopy = new NdMultiState(this.isFinal, this.before, this.source);
    
    map.set(this, theCopy);
    
    for (let [ under, transitions ] of this.transitionMap.entries()) {
      for (let transition of transitions) {
        new Transition(under, theCopy, transition.to.map(t => t.copy(map)));
      }
    }
    
    return theCopy;
  }
  
  next(
    under: string | null,
  ): OrState {
    const transitions = this.transitionMap.get(under) || [];
    
    return new OrState(transitions.map(transition => new AndState(transition.to, null)));
  }
}

export class Transition {
  constructor(
    under: string | null,
    from: NdMultiState,
    public to: NdMultiState[],
  ) {
    if (!from.transitionMap.has(under)) from.transitionMap.set(under, []);
    
    from.transitionMap.get(under)!.push(this);
  }
}

function deduplicate<T>(arr: T[], eq: (a: T, b: T) => boolean) {
  for (let i = 0; i < arr.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (eq(arr[i], arr[j])) {
        const elem = arr.pop()!;
        
        if (i < arr.length) {
          arr[i] = elem;
          j = -1;
        } else return;
      }
    }
  }
}

class AndState {
  // This is true iff all child states are final. Even if their cover is not.
  isFinal: boolean;
  
  isAccepting() { return this.isFinal && this.state.isFinal; }
  
  constructor(
    public state: NdMultiState,
    public innerStates: (NdMultiState | AndState)[] = [ state.innerInitial! ],
    public lookaround: Before<SNode> | After<SNode> | null = null,
  ) {
    if (innerStates[0] === null) throw new Error('Missing the argument "states". This is a programmer error.');
    
    this.innerStates = this.innerStates.map(inner => {
      if (this.lookaround && inner.lookaround) throw new Error('Multiple lookarounds. This is a programmer error.');
      
      this.lookaround = inner.lookaround;
      inner.lookaround = null;
      
      if (inner instanceof AndState || !inner.innerInitial) return inner;
      
      return new AndState(inner, [ inner.innerInitial ]);
    });
    
    this.isFinal = this.innerStates.every(inner => inner.isAccepting());
    
    deduplicate(innerStates, AndState.equals);
  }
  
  // Creates a conjunction with a state whose cover must be `this.cover` or its child.
  and(childOrEqual: AndState): AndState;
  // Produces a state that is a conjunction of OrStates whose cover must be `this.cover` or its child.
  and(ors: OrState[]): OrState;
  
  and(arg: AndState | OrState[]): AndState | OrState {
    if (Array.isArray(arg)) {
      return arg.reduce((a, c) => a.and(c), new OrState([ new AndState(this.state, []) ]));
    }
    
    if (this.lookaround && arg.lookaround) throw new Error('Multiple lookarounds. This is a programmer error.');
    
    return new AndState(
      this.state,
      this.state === arg.state
        ? [ ...this.innerStates, ...arg.innerStates ]
        : [ ...this.innerStates, arg ],
      this.lookaround || arg.lookaround,
    );
  }
  
  insert(state: AndState) {
    if (this.innerStates.every(s => !AndState.equals(s, state))) {
      this.innerStates.push(state);
      this.isFinal = this.isFinal && state.isAccepting();
    }
  }
  
  next(under: string): OrState {
    const innerNexts = this.and(this.innerStates.map(state => state.next(under)));
    
    return this.isFinal
      ? OrState.or([ innerNexts, this.state.next(under) ]) : innerNexts;
  }
  
  copy(except: NdMultiState | AndState | null = null): AndState {
    return new AndState(
      this.state,
      this.innerStates.filter(a => a === except),
      this.lookaround,
    );
  }
  
  static equals(a: NdMultiState | AndState, b: NdMultiState | AndState): boolean {
    if (a instanceof NdMultiState && b instanceof NdMultiState) return a === b;
    if (a instanceof NdMultiState || b instanceof NdMultiState) return false;
    
    return a.state === b.state
      && a.innerStates.length === b.innerStates.length
      && a.innerStates.every(s => b.innerStates.some(t => AndState.equals(s, t)))
      && a.lookaround === b.lookaround;
  }
}

class OrState {
  isFinal: boolean;
  
  constructor(
    public states: AndState[],
  ) {
    this.isFinal = this.states.some(s => s.isAccepting());
    
    deduplicate(this.states, AndState.equals);
  }
  
  // The state must be a child or equal with respect to covers.
  and(state: AndState | OrState): OrState {
    if (state instanceof OrState) return OrState.or(state.states.map(s => this.and(s)));
    
    return new OrState(this.states.map(s => s.and(state)));
  }
  
  static or(states: OrState[]) {
    return new OrState(states.flatMap(orState => orState.states));
  }
  
  insert(state: AndState | OrState): void {
    if (state instanceof OrState) return state.states.forEach(s => this.insert(s));
    
    if (this.states.every(s => !AndState.equals(s, state))) {
      this.states.push(state);
      this.isFinal = this.isFinal || state.isAccepting();
    }
  }
  
  next(under: string) {
    return OrState.or(this.states.map(state => state.next(under)));
  }
  
  handleLookaround(
    fsa: NdMultiFsa,
    state: AndState,
    blocked = new Map<Before<SNode>, AndState[]>(),
    acceptingBefores = new Set<Before<SNode>>(),
  ) {
    if (state.lookaround instanceof After) {
      state.insert(new AndState(fsa.top, [ fsa.initial.get(state.lookaround)! ]));
      
      state.lookaround = null;
    }
    
    if (state.lookaround instanceof Before) {
      const before = state.lookaround;
      
      state.lookaround = null;
      
      if (!acceptingBefores.has(before)) {
        blocked.has(before) || blocked.set(before, []);
        
        blocked.get(before)!.push(state);
        
        return true;
      }
    }
    
    return false;
  }
  
  unblock(
    state: AndState,
    blocked: Map<Before<SNode>, AndState[]>,
    acceptingBefores = new Set<Before<SNode>>(),
  ) {
    for (const s of state.innerStates) {
      if (s.isFinal && s.state.source instanceof Before) {
        acceptingBefores.add(s.state.source);
        
        if (blocked.has(s.state.source)) {
          blocked.get(s.state.source)!.forEach(s => this.insert(s));
          blocked.delete(s.state.source);
        }
      }
    }
  }
  
  // TODO befores should be unblocked anytime a new before is found because
  // of nested afters that need to be copied into the unblocked andstates.
  //
  // Current algorithm should be fine if no before contains an after that
  // can match beyond the end of the match of the before.
  //
  // To implement it properly, it might be a good idea to move this method
  // to Configuration.
  expand(
    fsa: NdMultiFsa,
    blocked = new Map<Before<SNode>, AndState[]>(),
    acceptingBefores = new Set<Before<SNode>>(),
    i = 0,
  ): OrState {
    if (this.states.length <= i) return this;
    
    const andState = this.states[i];
    
    const isBlocked = this.handleLookaround(fsa, andState, blocked, acceptingBefores);
    
    if (isBlocked) return this.expand(fsa, blocked, acceptingBefores, i);
    
    this.unblock(andState, blocked, acceptingBefores);
    
    if (andState.isFinal) {
      this.insert(andState.state.next(null));
    } else { // TODO this transition is not optional.
      andState.state.innerOutTransitions.map(
        t => this.insert(new AndState(andState.state.cover, t)),
      );
    }
    
    for (const state of andState.innerStates) {
      const expanded = state instanceof NdMultiState
        ? state.next(null) : new OrState([ state ]).expand(fsa, blocked, acceptingBefores);
      
      expanded.states.forEach(s => this.insert(andState.copy(state).and(s)));
    }
    
    return this.expand(fsa, blocked, acceptingBefores, i + 1);
  }
  
  static equals(a: OrState, b: OrState): boolean {
    return a.states.length === b.states.length
      && a.states.every(s => b.states.some(t => AndState.equals(s, t as AndState)));
  }
}

class Configuration {
  state = new Fsa();
  
  /* Too much work.
  // It would be possible to merge befores into the main orState, but it would
  // create unnecessary duplicities in the configuration.
  befores = new Map<Before<ANode>, OrState>();
  */
  
  constructor(
    public fsa: NdMultiFsa,
    public main: OrState,
  ) {}
  
  accepts(fsa: NdMultiFsa, before: Before<SNode>) {
    const cover = fsa.initial.get(before);
    
    return this.main.states.some(state => state.innerStates.find(s => s.state === cover));
  }
  
  /*
  getAfters(before: Before<ANode>) {
    const beforeState = this.fsa.initial.get(before);
    const or = this.befores.get(before)!;
    
    return new OrState(or.states.filter(s => s.state !== beforeState));
  }*/
  
  next(
    states: Configuration[],
    under: string | Before<SNode> | After<SNode>,
  ): Configuration {
    
    if (under instanceof After) {
      const after = new AndState(this.fsa.top, [ this.fsa.initial.get(under)! ]);
      
      return new Configuration(
        this.fsa,
        this.main.and(after).expand(this.fsa),
      );
    }
    
    if (under instanceof Before) {
      if (this.accepts(this.fsa, under)) {
        return this;
        
        /*/ TODO here, afters of the before should be added. Too much work.
            See todos elsewhere in this file for more info.
        return new Configuration(
          this.fsa,
          this.main.and(this.getAfters(under)),
        );
        /*/
      }
      
      return new Configuration(this.fsa, new OrState([]));
    }
    
    return new Configuration(this.fsa, this.main.next(under).expand(this.fsa));
  }
  
  static equals(a: Configuration, b: Configuration): boolean {
    return OrState.equals(a.main, b.main);
  }
}

class Fsa {
  isFinal: boolean = false;
  transitions = new Map<string | Before<SNode> | After<SNode>, Fsa>();
}

function generateFsa(startingSymbols: Set<Symbol>): Fsa {
  const symbols: Symbol[] = [];
  const lookarounds: (Before<SNode> | After<SNode>)[] = [];
  const negated: Map<Not<SNode> | Symbol, Pattern<SNode>> = new Map();
  
  for (const symbol of startingSymbols) {
    symbol.preprocess(symbols, lookarounds, negated, false);
  }
  
  const alphabet = (() => {
    const alphabet: string[] = [];
    
    for (let n = 0; n < 128; n++) {
      alphabet.push(Chars.getChar(n));
    }
    
    return alphabet;
  })();

  const fsa = new NdMultiFsa(alphabet.concat(lookarounds as any));
  const fsaNull = new NdMultiState(fsa.top, null, true);
  
  fsa.initial.set(null, fsaNull);
  alphabet.forEach(l => new Transition(l, fsaNull, [ fsaNull ]));
  
  for (const lookaround of lookarounds) {
    const initial = new NdMultiState(fsa.top, null);
    
    lookaround.toFsa(fsa, [ initial ]);
    fsa.initial.set(lookaround, initial);
    
    lookaround instanceof Before &&
      new Transition(null, fsaNull, [ fsaNull, initial ]);
  }
  
  return fsa.toSimpleFsa();
}
