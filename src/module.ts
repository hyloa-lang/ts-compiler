import { AstNode, Parser, Symbol } from './sattern';
import { ChalkScriptModule, ChalkDocModule } from './ast';
import { ModulePath } from "./main";
import { Class } from './class';

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
