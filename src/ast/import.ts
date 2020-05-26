import { AstNode, Expr, Match, Or } from '../pattern';
import { space } from '../astUtils';

export class Import {
  value: ValueStruct;
  path: StringLiteral;
  
  static rule = [
    Text('import'),
    space,
    Match(ValueStruct, This.value, { restricted: true }),
    space,
    Text('from'),
    space,
    Match(StringLiteral, This.path, { singleQuotes: true }),
    space,
    Text(";"),
  ],
}
