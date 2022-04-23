import { After, SyntaxTreeNode, And, Before, Chars, Pattern, Match, Maybe, Or, Repeat, Caten } from '../sattern/index.js';
import { space } from '../astUtils.js';

export class Expressions extends SyntaxTreeNode<Expressions> {
  moduleTop!: boolean;
  indent!: string;
  
  static constraintKeys: string[] = [ 'moduleTop' ];
  
  static rule: Pattern<Expressions> = new Repeat(
    
  );
}
