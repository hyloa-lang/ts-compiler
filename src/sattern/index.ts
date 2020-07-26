import { AstNode } from './patterns';

export * from './patterns';
export { Parser, Table } from './parser';
export { AstNodeExtra, generateParserTables } from './table-generator';

export type ANode = AstNode<ANode>;

export type Symbol = typeof AstNode & (new(...args:any) => ANode);
