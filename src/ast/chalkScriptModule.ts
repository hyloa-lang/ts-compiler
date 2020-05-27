import { AstNode, Expr, Match, Maybe, Repeat } from '../sattern';
import { space } from '../astUtils';

import { Comment } from './comment';
import { Import } from './import';
import { Expressions } from './expressions';


export class ChalkScriptModule extends AstNode<ChalkScriptModule> {
  moduleDoc: Comment | null = null;
  imports!: Import[];
  defs!: Expressions;
  
  static rule: Expr<ChalkScriptModule> = [
    new Maybe([ space, new Match(Comment, "moduleDoc") ]),
    space,
    new Repeat(
      [ new Match(Import, "imports"), space ],
    ),
    new Match(Expressions, "defs", { moduleTop: true }),
    space,
  ];
}
