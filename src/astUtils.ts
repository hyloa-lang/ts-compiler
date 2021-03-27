import { After, Before, Chars, Or, Repeat, Caten } from './sattern/index.js';

const specialChars = new Chars('()[]{}<>,.!@#$%^&*;:\'"\\|/?`~');

export const letters = new Chars('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
export const numbers = new Chars('0123456789');
export const numLet = Chars.or(letters, numbers);

// TODO uncomment this simpler definition once ambiguous grammars are allowed
// for as long as they do not match.
export const space = new Or<any>(/*
  new Caten( new Repeat( new Chars(' \n'), new Caten(), 1) ),
  new Caten( new Before( specialChars ) ),
  new Caten( new After( specialChars ) ),
  */
  new Caten( new Repeat( new Chars(' \n'), new Caten(), 1) ),
  new Caten( new Before( specialChars ), new After( new Chars(' \n', true) ) ),
  new Caten( new Before( new Chars(specialChars.charTable, true) ), new After( specialChars ) ),
);
