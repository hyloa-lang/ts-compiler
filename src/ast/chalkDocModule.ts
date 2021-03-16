import { After, AstNode, And, Before, Chars, Pattern, Match, Maybe, Or, Repeat } from '../sattern';
import { space } from '../astUtils';

import { Import } from './import';


export class ChalkDocModule extends AstNode<ChalkDocModule> {
  imports!: Import[];
}
