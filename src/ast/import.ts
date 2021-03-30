import { SyntaxTreeNode, Pattern, Match, Or, Text, Caten, Repeat, Chars, Maybe } from '../sattern/index.js';
import { space, letters, numLet } from '../astUtils.js';
import { Identifier } from './identifier.js';

export class Import extends SyntaxTreeNode<Import> {
  value!: Identifier; // TODO destructuring
  path!: string;
  
  static constraintKeys: string[] = [];
  
  static rule: Pattern<Import> = new Caten(
    new Text('import'),
    space,
    
    new Match(
      false,
      'path',
      new Caten(
        // IMPROVEMENT - do not allow a file name ending with a hyphen.
        // Alternatively, only allow lowercase characters and hyphen in file,
        // and uppercase all characters that follow a hype.
        new Repeat(
          new Caten( letters, new Repeat( Chars.or(numLet, new Chars('-') ) ) ),
          new Chars( '/' ),
        ),
        new Maybe( new Chars( '/' ) )
      ),
    ),
    
    new Maybe(
      new Caten(
        space,
        new Text( 'as' ),
        space,
        
        new Match( false, Identifier, 'value' ),
        space,
      ),
    ),
    new Text( ";" ),
  );
}
