import { After, AstNode, And, Before, CharClass, Pattern, Match, Maybe, Or, Repeat } from '../sattern';
import { space } from '../astUtils';

export class Expressions extends AstNode<Expressions> {
  moduleTop: boolean;
  indent: string;
}
