import { After, SyntaxTreeNode, And, Before, Chars, Pattern, Match, Maybe, Or, Repeat, Caten, Text } from '../sattern/index.js';
import { space } from '../astUtils.js';

export class Ccl extends SyntaxTreeNode<Ccl> {
  static hidden = false;
  
  static constraintKeys: string[] = [];
  
  static rule: Pattern<Ccl> = new Caten(
    
  );
}
