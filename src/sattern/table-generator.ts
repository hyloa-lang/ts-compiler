import { ANode, Pattern, Symbol, Chars, After, Before, Not } from '.';


// TODO ckeck all AndState instantiations for whether expansion should follow.
// TODO make sure all created reachable orstates are added to states array
//   and there are no duplicates.
// TODO make sure cover is not used instead of state.
// TODO am I passing lookarounds everywhere I should in next and expand?
// TODO make sure lookarounds are passed in expand, not in next.
// TODO perhaps make a copy of every lookahead inside a lookbehind, and keep
//   lookbehinds in the main orstate afterall.
// TODO lookbehinds cannot hand over control to another symbol - copy all symbols
//   beware recursion - it should be handleable somehow, but looks like a special case.
// FUCK lookaheads in lookbehinds. And FUCK recursive lookbehinds. FUCK this
//   I've had enough. I spent more than a month on this stupid shit. I'll make
//   it less general and FUCK I hate all the special cases that are there.

const alphabet = (() => {
  const alphabet: string[] = [];
  
  for (let n = 0; n < 128; n++) {
    alphabet.push(Chars.getChar(n));
  }
  
  return alphabet;
})();

type Letter = string | Before<ANode> | After<ANode>;

function getTopState() {
  const top = new NdMultiState(null as any, null, true);
  
  top.cover = top;
  
  return top;
};

export class NdMultiFsa {
  top = getTopState();
  
  afters = new Map<Before<ANode>, Set<After<ANode>>>();
  
  constructor(
    public alphabet: Letter[],
    // Lookarounds are wrapped in their own state, symbols are not.
    public initial = new Map<Symbol | Before<ANode> | After<ANode>, NdMultiState>(),
  ) {}
  
  copy(init: Symbol, newTop: NdMultiState, exclude: Symbol): NdMultiState {
    const map = new Map<NdMultiState, NdMultiState>([ [ this.top, newTop ] ]);
    
    const initCopy = this.initial.get(init)!.copy(map);
    
    if (map.has(this.initial.get(exclude)!)) throw new Error("Grammar is not extended regular.");
    
    return initCopy;
  }
  
  befores(): Before<ANode>[] {
    return this.alphabet.filter(l => l instanceof Before) as Before<ANode>[];
  }
  
  toSimpleFsa(): Fsa {
    const befores = new Map<Before<ANode>, OrState>();
    const initMain = new OrState([ new AndState(this.top) ]);
    const initState = new Configuration(this, befores, initMain);
    
    for (const before of this.befores()) {
      initState.befores!.set(
        before, new OrState([ new AndState(this.initial.get(before)!) ]));
    }
    
    // TODO setup the initial state properly.
    initState.clearBefores();
    initState.main.expand(initState.acceptingBefores());
    
    const states = [ initState ];
    
    for (const state of states) {
      for (let under of this.alphabet) {
        state.next(states, under);
      }
    }
    
    // TODO minimize.
    return states[0].state;
  }
}

export class NdMultiState {
  transitionMap = new Map<string | null, Transition[]>();
  
  // Transitions of non-accepting inner states out of this state, under null.
  innerOutTransitions: NdMultiState[][] = [];
  
  state = this;
  
  isAccepting() { return this.isFinal; }
  
  constructor(
    public cover: NdMultiState,
    public lookaround: Before<ANode> | After<ANode> | null = null,
    public isFinal = false,
    // A state can contain other states.
    public innerInitial: NdMultiState | null = null,
  ) {}
  
  copy(map: Map<NdMultiState, NdMultiState>): NdMultiState {
    if (map.has(this)) return map.get(this)!;
    
    const theCopy = new NdMultiState(null as any, this.lookaround, this.isFinal);
    
    map.set(this, theCopy);
    
    for (let [ under, transitions ] of this.transitionMap.entries()) {
      for (let transition of transitions) {
        new Transition(under, theCopy, transition.to.map(t => t.copy(map)));
      }
    }
    
    theCopy.cover = this.cover.copy(map);
    theCopy.innerInitial = this.innerInitial ? this.innerInitial.copy(map) : null;
    
    return theCopy;
  }
  
  next(
    under: string | null,
  ): OrState {
    const transitions = this.transitionMap.get(under) || [];
    
    return new OrState(transitions.map(transition => {
      const lookaround = transition.to.reduce((a: Before<ANode> | After<ANode> | null, c) => {
        if (a) throw new Error('Multiple lookarounds. This is a programmer error.');
        
        return a || c.lookaround;
      }, null);
      
      return new AndState(this.cover, transition.to, lookaround);
    }));
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
    public lookaround: Before<ANode> | After<ANode> | null = null,
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
  
  // TODO detect when a before is recognized as accepting, and unblock andstates.
  expand(
    fsa: NdMultiFsa,
    blocked = new Map<Before<ANode>, AndState[]>(),
    acceptingBefores: Before<ANode>[] = [],
    i = 0,
  ): OrState {
    if (this.states.length <= i) return this;
    
    const andState = this.states[i];
    
    if (andState.lookaround instanceof After) {
      andState.insert(new AndState(fsa.top, [ fsa.initial.get(andState.lookaround)! ]));
      
      andState.lookaround = null;
    }
    
    if (andState.lookaround instanceof Before) {
      const before = andState.lookaround;
      
      andState.lookaround = null;
      
      if (!acceptingBefores.includes(before)) {
        blocked.has(before) || blocked.set(before, []);
        
        blocked.get(before)!.push(andState);
        
        return this.expand(fsa, blocked, acceptingBefores, i);
      }
    }
    
    if (!andState.lookaround) {
      for (const state of andState.innerStates) {
        const expanded = state instanceof NdMultiState
          ? state.next(null) : new OrState([ state ]).expand(fsa, blocked, acceptingBefores);
        
        expanded.states.forEach(s => this.insert(andState.copy(state).and(s)));
      }
      
      if (andState.isFinal) {
        this.insert(andState.state.next(null));
        
      } else {
        andState.state.innerOutTransitions.map(
          t => this.insert(new AndState(andState.state.cover, t)),
        );
      }
    }
    
    return this.expand(fsa, blocked, acceptingBefores, i + 1);
  }
  
  static equals(a: OrState, b: OrState): boolean {
    return a.states.length === b.states.length
      && a.states.every(s => b.states.some(t => AndState.equals(s, t as AndState)));
  }
}

type ConfBefores = Map<Before<ANode>, OrState>;

class Configuration {
  state = new Fsa();
  
  // It would be possible to merge befores into the main orState, but it would
  // create unnecessary duplicities in the configuration.
  befores = new Map<Before<ANode>, OrState>();
  
  constructor(
    public fsa: NdMultiFsa,
    public main: OrState,
  ) {}
  
  accepts(before: Before<ANode>) { return this.befores.get(before)!.isFinal; }
  
  getAfters(before: Before<ANode>) {
    const beforeState = this.fsa.initial.get(before);
    const or = this.befores.get(before)!;
    
    return new OrState(or.states.filter(s => s.state !== beforeState));
  }
  
  next(
    states: Configuration[],
    under: string | Before<ANode> | After<ANode>,
  ): Configuration {
    const blocked = new Map<Before<ANode>, OrState>();
    
    if (under instanceof After) {
      const after = new OrState(
        [ new AndState(this.fsa.top, [ this.fsa.initial.get(under)! ]) ]
      ).expand();
      
      return new Configuration(
        this.fsa,
        this.main.and(after.filter(s => { const b = s.look })), // TODO there might be other ands.
      );
    }
    
    if (under instanceof Before) {
      const underState = this.acceptingBefores.get(under)!;
      
      if (this.accepts(under)) {
        return new Configuration(
          this.fsa,
          this.main.and(this.getAfters(under)),
        );
      }
      
      return new Configuration(this.fsa, Configuration.emptyBefores, new OrState([]));
    }
    
    const nextBefores = this.nextBefores();
    
    
    const nextNew = OrState.or(this.states.map(state => state.next(under, befores)));
    const nextExisting = states.find(state => OrState.equals(state, nextNew));
    
    if (!nextExisting) {
      states.push(nextNew);
    }
    
    this.state.transitions.set(under, (nextExisting || nextNew).state);

  }
  
  nextBefores(): ConfBefores {
    // TODO
  }
  
  static clearBefores(befores: ConfBefores) {
    const acceptingBefores = new Set<Before<ANode>>();
    
    let acceptingBeforesSize = -1;
    
    while (acceptingBeforesSize < acceptingBefores.size) {
      acceptingBeforesSize = acceptingBefores.size;
      
      for (const [ before, orState ] of befores) {
        for (const andState of orState.states) {
          acceptingBefores.forEach(before => andState.lookaround.delete(before));
          
          if (andState.lookaround.size === 0) acceptingBefores.add(before);
        }
      }
    }
    
  }
  
  static equals(a: Configuration, b: Configuration): boolean {}
}

class Fsa {
  isFinal: boolean = false;
  transitions = new Map<string | Before<ANode> | After<ANode>, Fsa>();
}

function generateFsa(startingSymbols: Set<Symbol>): Fsa {
  const symbols: Symbol[] = [];
  const lookarounds: (Before<ANode> | After<ANode>)[] = [];
  const negated: Map<Not<ANode> | Symbol, Pattern<ANode>> = new Map();
  
  for (const symbol of startingSymbols) {
    symbol.preprocess(symbols, lookarounds, negated, false);
  }
  
  const fsa = new NdMultiFsa(alphabet.concat(lookarounds as any));
  const fsaNull = new NdMultiState(fsa.top, null, true);
  
  fsa.initial.set(null, fsaNull);
  alphabet.forEach(l => new Transition(l, fsaNull, [ fsaNull ]));
  
  for (const lookaround of lookarounds) {
    const initial = new NdMultiState(fsa.top, null);
    
    new Transition(null, fsaNull, [ fsaNull, initial ]);
    
    lookaround.toFsa(fsa, [ initial ]);
  }
  
  return fsa.toSimpleFsa();
}

export function generateParserTables(startingSymbols: Set<Symbol>) {
  const fsa = generateFsa(startingSymbols);
  
  // TODO LR parser
}
