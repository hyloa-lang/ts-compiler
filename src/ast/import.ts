import { AstNode, Pattern, Match, Or, Text } from '../sattern';
import { space } from '../astUtils';

export class Import {
  value: ValueStruct;
  path: StringLiteral;
  
  static rule = [
    new Text('import'),
    space,
    new Match(ValueStruct, "value", { restricted: true }),
    space,
    new Text('from'),
    space,
    new Match(StringLiteral, "path", { singleQuotes: true }),
    space,
    new Text(";"),
  ],
}
