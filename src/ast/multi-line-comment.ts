import { After, SyntaxTreeNode, And, Before, Chars, Pattern, Match, Maybe, Or, Repeat, Caten, Text, Not } from '../sattern/index.js';
import { space } from '../astUtils.js';

export class MultiLineComment extends SyntaxTreeNode<MultiLineComment> {
  static hidden = false;
  
  static constraintKeys: string[] = [];
  
  static rule: Pattern<MultiLineComment> = new Caten(
    new Text('///'),
    new Repeat(new Not(new Text('///'))),
    new Text('///'),
  );
}
