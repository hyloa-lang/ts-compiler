import { SyntaxTreeNode, Pattern, Match, Or, Caten } from '../sattern/index.js';

import { SingleLineComment } from './single-line-comment.js';
import { MultiLineComment } from './multi-line-comment.js';

export class Comment extends SyntaxTreeNode<Comment> {
  comment!: SingleLineComment|MultiLineComment;
  
  static constraintKeys = [];
  
  static rule: Pattern<Comment> = new Caten(
    new Or(
      new Caten( new Match( false, SingleLineComment, "comment" ) ),
      new Caten( new Match( false, MultiLineComment, "comment" ) ),
    ),
  );
}
