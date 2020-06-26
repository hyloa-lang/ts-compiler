/*
  Produces an AST. Accepts satterns with the restriction that Not, Before and
  After only accept an extended regular satterns that do not contain submatches.
  
  A sattern is extended regular iff for all its rules R, every expression of that
  rule is either the last one or cannot derive R (ie. there is no recursion,
  except possibly for the last expresion).
*/
import { Symbol, CharClass } from ".";
import { FixedLengthArray } from "../typeUtils";


// Fixed length equal to `CharClass.tableSize + 1`.
type NdTransition = number[];

/**
  Represents a non-deterministic finite state automaton. Starting state has
  index 0.
**/
class NdFsa {
  constructor(
    public states: NdTransition[],
    public accepting: Set<number>,
  ) {
    for (let stateIndex of accepting) {
      if (stateIndex >= states.length) {
        throw new Error(`StateIndex: ${stateIndex}, length: ${states.length}`);
      }
    }
  }
  
  negate() {
    const accepting = new Set<number>();
    
    for (let i = 0; i < this.states.length; i++) {
      this.accepting.has(i) || accepting.add(i);
    }
    
    return new NdFsa(this.states, accepting);
  }
  
  // Produce an equivalent Fsa.
  determinize(): { fsa: Fsa } {
    // Map from states of the fsa to $2^{this.states}$.
    const states: { ndStates: Set<number>, transitions: number[] | null }[] = [
      { ndStates: new Set([ 0 ]), transitions: null },
    ];
    
    for (let statesIndex = 0; statesIndex < states.length; statesIndex++) {
      
    }
    
    return new Fsa(states.reduce);
  }
}

// Determinized ndfsa without epsilon steps.
class Fsa {
  constructor(
    public states: { ndStates }[],
    public accepting: Set<number>,
  ) {
    for (let stateIndex of accepting) {
      if (stateIndex >= states.length) {
        throw new Error(`StateIndex: ${stateIndex}, length: ${states.length}`);
      }
    }
  }
}

/**
  Create a Fsa from which it is possible to find out whether a word $w$ equals
  $u . v$ for some $u$, $v$ such that $v$ matches a ndfsa from `nfdsas` (And
  know which one).
**/
function combineFsas(ndfsas: NdFsa[]) {
  
}

// Represents one state of a deterministic finite state automaton.
class FsaState {
  constructor(public fsa: Fsa, public currentState: number) {}
  
  step(char: string) {
    const nextStates = ;
    
    return new FsaState(this.fsa, nextStates);
  }
}

// Produces an AST.
export class Parser {
  table: num[] = [];
  
  constructor(symbols: Set<Symbol>) {
    // TODO
  }
  
  parse<S extends Symbol>(str: string, symbol: S): InstanceType<S> {
    // TODO
  }
}
