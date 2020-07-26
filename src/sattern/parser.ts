/*
  Produces an AST. Accepts satterns with the restriction that Not, Before and
  After only accept an extended regular satterns that do not contain submatches.

  A sattern is extended regular iff for all its rules R, every expression of that
  rule is either the last one or cannot derive R (ie. there is no recursion,
  except possibly for the last expresion).
  
  TODO stabilise the vocabulary. In particular expression, expressionComponent.
*/
import { Symbol, generateParserTables } from '.';


export enum TableStateType {
  read,
  reduce,
}

export type Read = { type: TableStateType.read, state: number };
export type Reduce = { type: TableStateType.reduce, rule: number };

export type Table = Map<string | number, Read | Reduce>[];

export class Parser<T extends Symbol> {
  table: Table;
  
  constructor(
    public startingSymbols: Set<T>,
    // The type is correct. The table is imported from a `.json` file, and the
    // filesystem can contain anything,
    table?: any,
  ) {
    if (arguments.length === 2) {
      if (!Array.isArray(table)) throw new Error(`Table must be an array, instead found ${table}`);
      
      // TODO: validate tables.
    }
    
    this.table = table || generateParserTables(startingSymbols);
  }

  parse<S extends (new(...args: any) => InstanceType<S>) & T>(str: string, symbol: S): InstanceType<S> {
    // TODO.
  }
}
