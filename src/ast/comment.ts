import { AstNode, Expr, Match, Or } from '../pattern';

import { SinglelineComment } from './singlelineComment';
import { MultilineComment } from './multilineComment';


export class Comment extends AstNode<Comment> {
  comment: SinglelineComment|MultilineComment;
  
  static rule: Expr<Comment> = [
    new Or(
      [ new Match(SinglelineComment, "comment") ],
      [ new Match(MultilineComment, "comment") ],
    ),
  ];
}
