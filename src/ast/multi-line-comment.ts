import { After, SyntaxTreeNode, And, Before, Chars, Pattern, Match, Maybe, Or, Repeat, Caten, Text, Not } from '../sattern/index.js';
import { space } from '../astUtils.js';

const not3xSlash =
  new Repeat(
    new Caten(
      new Or(
        new Text( '' ),
        new Text( '/' ),
        new Text( '//' ),
      ),
      new Chars( '/', true ),
    ),
  )
;

export class MultiLineComment extends SyntaxTreeNode< MultiLineComment > {
  static hidden = false;
  
  static constraintKeys: string[] = [];
  
  static rule: Pattern< MultiLineComment > = new Caten(
    new Text( '///' ),
    not3xSlash,
    new Text( '///' ),
  );
}
