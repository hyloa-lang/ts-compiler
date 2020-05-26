import { AstNode } from "./pattern";
import { ModulePath } from "./main";

export class Module {
  ast: AstNode<unknown>;
  
  importPaths: Set<string> = new Set();
  
  constructor(source: string, symbol: string) {
    // TODO
  }
}
