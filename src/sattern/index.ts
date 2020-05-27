import { Class } from '../class';
import { AstNode } from './patterns';

export * from './patterns';

export { Parser } from './parser';

type ANode = AstNode<ANode>;

export type Symbol = Class<ANode>;
