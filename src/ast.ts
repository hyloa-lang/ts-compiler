/**
  Defines the abstract syntax tree and grammar of the language.
**/

import { After, AstNode, And, Before, CharClass, Expr, Match, Maybe, Or, Repeat } from './parser';

const specialChars = new CharClass('()[]{}<>,.!@#$%^&*;:\'"\\|/?`~');

const space = <CType>(_T: { new(...args: any): CType }) => new Or<CType>(
  [ new Repeat([ new CharClass(' \n\t') ], 1) ],
  [ new Before([ specialChars ]) ],
  [ new After([ specialChars ]) ],
);
