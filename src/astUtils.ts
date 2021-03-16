import { After, Before, CharClass, Or, Repeat, Caten } from './sattern';

const specialChars = new CharClass('()[]{}<>,.!@#$%^&*;:\'"\\|/?`~');

export const space = new Or<any>(
  new Caten( new Repeat( new CharClass(' \n'), new Caten(), 1) ),
  new Caten( new Before( specialChars ) ),
  new Caten( new After( specialChars ) ),
);
