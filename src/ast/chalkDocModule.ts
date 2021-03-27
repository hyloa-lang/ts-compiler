import { After, SyntaxTreeNode, And, Before, Chars, Pattern, Match, Maybe, Or, Repeat, Caten } from '../sattern/index.js';
import { space } from '../astUtils.js';

import { Import } from './import.js';


export class ChalkDocModule extends SyntaxTreeNode<ChalkDocModule> {
  static constraintKeys: string[] = [];
  
  imports!: Import[];
  
  static rule: Pattern<ChalkDocModule> = new Caten(
    // TODO.
  );
}
