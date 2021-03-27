import { After, SyntaxTreeNode, And, Before, Chars, Pattern, Match, Maybe, Or, Repeat, Caten } from '../sattern/index.js';
import { space, letters } from '../astUtils.js';

export class Identifier extends SyntaxTreeNode<Identifier> {
  static hidden = false;
  
  static constraintKeys: string[] = [];
  
  static rule: Pattern<Identifier> = new Caten(
    letters,
  );
}
