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

const privateSymbol = Symbol();

export type EnumTypeType = { [privateSymbol](): string[] };
export type EnumTypeValues<T extends EnumTypeType> = keyof ReturnType<T[typeof privateSymbol]>;

export function RuntimeEnum<T extends string>(...values: T[]): Record<T, number> & { [privateSymbol](): T[] } {
  let i = 0;
  
  return values.reduce(
    // @ts-ignore-next line TS is bad.
    (a: Record<T, number> & { [privateSymbol](): T[] }, c) => ((a[c] = i++), a),
    { [privateSymbol]() { return values } } as any,
  );
}

export function enumValues(Enum: EnumTypeType) {
  return Enum[privateSymbol]();
}
