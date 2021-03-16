import { AstNode, Pattern, Caten, Maybe, Repeat } from '../sattern';
import { space } from '../astUtils';

import { Comment } from './comment';
import { Import } from './import';
import { Expressions } from './expressions';


export class ChalkScriptModule extends AstNode<ChalkScriptModule> {
  moduleDoc: Comment | null = null;
  imports!: Import[];
  defs!: Expressions;
  
  static rule: Pattern<ChalkScriptModule> = new Caten(
    new Maybe( new Caten( space, new Match( Comment, "moduleDoc" ) ) ),
    space,
    new Repeat(
      new Caten( new Match( Import, "imports" ), space ),
    ),
    new Match(Expressions, "defs", { moduleTop: true }),
    space,
  );
}
