import { AstNode, Expr, Match, Maybe, Repeat } from '../pattern';
import { space } from '../astUtils';

import { Comment } from './comment';
import { Import } from './import';
import { Expressions } from './expressions';


export class ChalkModule extends AstNode<ChalkModule> {
  moduleDoc: Comment | null = null;
  imports!: Import[];
  defs!: Expressions;
  
  static rule: Expr<ChalkModule> = [
    new Maybe([ space, new Match(Comment, "moduleDoc") ]),
    space,
    new Repeat(
      [ new Match(Import, "imports"), space ],
    ),
    new Match(Expressions, "defs", { moduleTop: true }),
    space,
  ];
}
