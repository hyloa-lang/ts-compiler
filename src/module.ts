import { Parser, Symbol } from './sattern';
import { ChalkScriptModule, ChalkDocModule } from './ast';
import { Class } from './typeUtils';

const parser = new Parser(new Set([
  
]));

export type ModuleSymbols = ChalkScriptModule | ChalkDocModule;

export class Module {
  moduleType: Symbol;
  ast: ModuleSymbols;
  
  importPaths: Set<string> = new Set();
  
  constructor(source: string, symbol: Class<ModuleSymbols>) {
    this.moduleType = symbol;
    this.ast = parser.parse(source, symbol);
    
    for (let importVar of this.ast.imports) {
      this.importPaths.add(importVar.path);
    }
  }
}
