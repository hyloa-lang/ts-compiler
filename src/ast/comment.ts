import { AstNode, Pattern, Match, Or, Caten } from '../sattern';

import { SinglelineComment } from './singlelineComment';
import { MultilineComment } from './multilineComment';


export class Comment extends AstNode<Comment> {
  comment: SinglelineComment|MultilineComment;
  
  static rule: Pattern<Comment> = new Caten(
    new Or(
      new Caten( new Match(SinglelineComment, "comment") ),
      new Caten( new Match(MultilineComment, "comment") ),
    ),
  );
}
