import { Expr, Symbol } from '.';
import { assertNever } from '../typeUtils';


// Er = extended regular.
export class AstNodeExtra {
  mustBeEr = false;
  usedNonErNonLastSymbols = new Set<Symbol>();
  usedBy = new Set<Symbol>();
  visited = false;
}

export function computeAllAndUsedSymbols(
  allSymbols: Symbol[],
  symbol: Symbol,
  // Private params follow.
  expr: Expr<Symbol> = symbol.rule,
  isBana = false,
  isParentLast = true,
): void {
  if (symbol.extra.visited && expr === symbol.rule) return; // Already computed.
  
  if (expr === symbol.rule) {
    allSymbols.push(symbol);
    
    symbol.extra.visited = true;
  }
  
  for (let [ index, subexpr ] of expr.entries()) {
    const isLast = index + 1 === expr.length && isParentLast;
    
    switch (subexpr.kind) {
      case 'CharClass':
      case 'Text': return;
      case 'Before':
      case 'After':
      case 'Not': return computeAllAndUsedSymbols(allSymbols, symbol, subexpr.expr, true, isLast);
      case 'And': return subexpr.exprs.forEach((expr, i) => computeAllAndUsedSymbols(allSymbols, symbol, expr, isBana || i > 0, isLast));
      case 'Or': return subexpr.exprs.forEach(expr => computeAllAndUsedSymbols(allSymbols, symbol, expr, isBana, isLast));
      case 'Maybe': return computeAllAndUsedSymbols(allSymbols, symbol, subexpr.expr, isBana, isLast);
      case 'Repeat': {
        computeAllAndUsedSymbols(allSymbols, symbol, subexpr.repeat, isBana, false);
        return computeAllAndUsedSymbols(allSymbols, symbol, subexpr.delimiter, isBana, false);
      }
      case 'Equals':
      case 'EqualsArr': {
        if (subexpr.hasExpr()) {
          return computeAllAndUsedSymbols(allSymbols, symbol, subexpr.exprOrConstraints, isBana, isLast);
        }
        
        if (subexpr.match) {
          subexpr.match.extra.usedBy.add(symbol);

          isBana && (subexpr.match.extra.mustBeEr = true);
          isLast || symbol.extra.usedNonErNonLastSymbols.add(subexpr.match);
          
          computeAllAndUsedSymbols(allSymbols, subexpr.match);
        }
        
        return;
      }
      default: assertNever(subexpr);
    }
  }
}

function determineErSymbols(allSymbols: Symbol[]): void {
  const erSymbols = allSymbols.filter(symbol => symbol.extra.usedNonErNonLastSymbols.size === 0);
  
  for (let erSymbol of erSymbols) {
    for (let symbol of erSymbol.extra.usedBy) {
      symbol.extra.usedNonErNonLastSymbols.delete(erSymbol);
      
      symbol.extra.usedNonErNonLastSymbols.size === 0 && erSymbols.push(symbol);
    }
  }
}

function checkErSymbols(allSymbols: Symbol[]) {
  const nonErSymbols = allSymbols.filter(symbol => symbol.extra.usedNonErNonLastSymbols.size > 0);
  
  for (let symbol of nonErSymbols) {
    if (symbol.extra.visited) continue;
    
    if (symbol.extra.mustBeEr) {
      console.log(`Symbol ${symbol.name} is not extended regular, but has to be.`);
      
      throw symbol;
    }
    
    symbol.extra.visited = true;
    
    symbol.extra.usedBy.forEach(s => !s.extra.visited && nonErSymbols.push(s));
  }
}

export function generateParserTables(startingSymbols: Set<Symbol>) {
  const allSymbols: Symbol[] = [];
  
  for (let symbol of startingSymbols) {
    computeAllAndUsedSymbols(allSymbols, symbol);
  }
  
  determineErSymbols(allSymbols);
  checkErSymbols(allSymbols);
  
  
  
  createBackgroundFsa();
}
