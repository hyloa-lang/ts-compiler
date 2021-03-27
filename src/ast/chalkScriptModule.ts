import { SyntaxTreeNode, Pattern, Caten, Maybe, Repeat, Match } from '../sattern/index.js';
import { space } from '../astUtils.js';

import { Comment } from './comment.js';
import { Import } from './import.js';
import { Expressions } from './expressions.js';


export class ChalkScriptModule extends SyntaxTreeNode<ChalkScriptModule> {
  moduleDoc: Comment | null = null;
  imports!: Import[];
  defs!: Expressions;
  
  static constraintKeys: string[] = [];
  
  static rule: Pattern<ChalkScriptModule> = new Caten(
    new Maybe( new Caten( space, new Match( false, Comment, "moduleDoc" ) ) ),
    space,
    new Repeat(
      new Caten( new Match( true, Import, "imports" ), space ),
    ),
    new Match( true, Expressions, "defs", { moduleTop: true } ),
    space,
  );
}
