import { Parser, Symbol } from './sattern/index.js';
import { ChalkScriptModule, ChalkDocModule } from './ast/index.js';
import { Class } from './typeUtils.js';

const parser = new Parser<typeof ChalkDocModule | typeof ChalkScriptModule>(new Set([
  ChalkDocModule,
  ChalkScriptModule,
]));

export type ModuleSymbols = ChalkScriptModule | ChalkDocModule;

export class Module {
  moduleType: Symbol;
  ast: ModuleSymbols | null;
  
  importPaths: Set<string> = new Set();
  
  constructor(source: string, symbol: Class<ModuleSymbols>) {
    this.moduleType = symbol;
    this.ast = parser.parse(source, symbol);
    
    if (!this.ast) throw new Error('cannot parse');
    
    for (let importVar of this.ast.imports) {
      this.importPaths.add(importVar.path);
    }
  }
}
