import { SyntaxTreeNode } from './patterns.js';

export * from './patterns.js';
export { Parser } from './parser.js';
export { generateParserTables } from './table-builder.js';

export type SNode = SyntaxTreeNode<SNode>;

export type Symbol = (new(...args:any) => SNode) & typeof SyntaxTreeNode;

// TODO Chalk should have no for loop, just recursion & forEach.
