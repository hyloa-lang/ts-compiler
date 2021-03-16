import { Parser, AstNode, Text, After, Pattern, Before, Equals, Or } from '..';

class TC0 extends AstNode<TC0> {
  static rule: Pattern<TC0> = [
    new Text('a'),
    new After([ new Text('a'), new Before([ new Text('aa') ]) ]),
    new Text('a'),
  ];
}

class TC1 extends AstNode<TC0> {
  static rule: Pattern<TC0> = [
    new Text('a'),
    new After([ new Text('a'), new Before([ new Text('ba') ]) ]),
    new Text('a'),
  ];
}

test('TC0 - TC2: isolated symbols, nested lookaheads', () => {
  const parser = new Parser(new Set([ TC0, TC1 ]));
  
  expect(TC0.extra.mustBeEr).toEqual(false);
  expect(TC1.extra.mustBeEr).toEqual(false);
  
  expect(TC0.extra.usedBy).toEqual(new Set());
  expect(TC1.extra.usedBy).toEqual(new Set());
  
  expect(TC0.extra.usedNonErNonLastSymbols).toEqual(new Set());
  expect(TC1.extra.usedNonErNonLastSymbols).toEqual(new Set());
  
  expect(parser.parse('aa', TC0)).not.toEqual(null);
  expect(parser.parse('aa', TC1)).toEqual(null);
  
  expect(parser.parse('ab', TC0)).toEqual(null);
  expect(parser.parse('ab', TC1)).toEqual(null);
});

let tmpFuckJs = new Equals(TC0);
class TC3 extends AstNode<TC3> {
  static rule: Pattern<TC3> = [ new Text('a'), tmpFuckJs, new Text('a') ];
}

class TC4 extends AstNode<TC3> {
  static rule: Pattern<TC4> = [ new Text('a'), new Equals(TC3), new Text('a') ];
}

tmpFuckJs.match = TC4;

class TC5 extends AstNode<TC5> {
  static rule: Pattern<TC5> = [ new Or([ new Text('a')], [ new Equals(TC5) ]) ];
}

class TC2 extends AstNode<TC2> {
  static rule: Pattern<TC2> = [ new Equals(TC5), new Equals(TC3) ];
}

test('TC2 - TC6', () => {
  const parser = new Parser(new Set([ TC0, TC1 ]));
  
  expect(TC2.extra.mustBeEr).toEqual(false);
  expect(TC2.extra.usedBy).toEqual(new Set());
  expect(TC2.extra.usedNonErNonLastSymbols).toEqual(new Set());
  
  expect(TC3.extra.mustBeEr).toEqual(false);
  expect(TC3.extra.usedBy).toEqual(new Set([ TC4, TC2 ]));
  expect(TC3.extra.usedNonErNonLastSymbols).toEqual(new Set([ TC0 ]));
  
  expect(TC5.extra.mustBeEr).toEqual(false);
  expect(TC5.extra.usedBy).toEqual(new Set([ TC2, TC5 ]));
  expect(TC5.extra.usedNonErNonLastSymbols).toEqual(new Set([]));
})

tmpFuckJs = new Equals(TC0);
class TC6 extends AstNode<TC3> {
  static rule: Pattern<TC6> = [ new Text('a'), tmpFuckJs, new Text('a') ];
}

let fuckJsTC8 = new Equals(TC0);
class TC7 extends AstNode<TC3> {
  static rule: Pattern<TC7> = [ new Text('a'), new Equals(TC6), new Text('a'), new After([ fuckJsTC8 ]) ];
}

tmpFuckJs.match = TC7;

class TC8 extends AstNode<TC5> {
  static rule: Pattern<TC8> = [ new Or([ new Text('a')], [ new Equals(TC6) ]) ];
}

fuckJsTC8.match = TC8;

test('TC6 - TC9', () => {
  expect(() => new Parser(new Set([ TC0, TC1 ]))).toThrow();
  
  expect(TC6.extra.mustBeEr).toEqual(false);
  expect(TC6.extra.usedBy).toEqual(new Set([ TC7 ]));
  expect(TC6.extra.usedNonErNonLastSymbols).toEqual(new Set([ TC7 ]));
  
  expect(TC7.extra.mustBeEr).toEqual(false);
  expect(TC7.extra.usedBy).toEqual(new Set([ TC6 ]));
  expect(TC7.extra.usedNonErNonLastSymbols).toEqual(new Set([ TC7 ]));
  
  expect(TC8.extra.mustBeEr).toEqual(true);
  expect(TC8.extra.usedBy).toEqual(new Set([ TC7 ]));
  expect(TC8.extra.usedNonErNonLastSymbols).toEqual(new Set());
})
