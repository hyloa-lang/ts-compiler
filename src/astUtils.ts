import { After, Before, CharClass, Or, Repeat } from './parser';

const specialChars = new CharClass('()[]{}<>,.!@#$%^&*;:\'"\\|/?`~');

export const space = new Or<any>(
  [ new Repeat([ new CharClass(' \n\t') ], 1) ],
  [ new Before([ specialChars ]) ],
  [ new After([ specialChars ]) ],
);
