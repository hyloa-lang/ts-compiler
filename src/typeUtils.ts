export type Class<T> = new (...args: any) => T;

type ArrayExcludedKeys = 'splice' | 'push' | 'pop' | 'shift' | 'unshift' | 'map'
export type FixedLengthArray<T, L extends number, TObj = [T, ...Array<T>]> =
  Pick<TObj, Exclude<keyof TObj, ArrayExcludedKeys>>
  & {
    readonly length: L;
    [ I : number ] : T;
    [Symbol.iterator]: () => IterableIterator<T>;
    map: <O>(fn: (t: T, i: number) => O) => FixedLengthArray<O, L, TObj>;
  }
