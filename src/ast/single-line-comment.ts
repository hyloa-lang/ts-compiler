import { After, SyntaxTreeNode, And, Before, Chars, Pattern, Match, Maybe, Or, Repeat, Caten, Text } from '../sattern/index.js';
import { space } from '../astUtils.js';

export class SingleLineComment extends SyntaxTreeNode<SingleLineComment> {
  static hidden = false;
  
  static constraintKeys: string[] = [];
  
  static rule: Pattern<SingleLineComment> = new Caten(
    new Text('//'),
    new After(new Chars('/', true)),
    new Repeat(new Chars('\n', true)),
    new Chars('\n'),
  );
}
