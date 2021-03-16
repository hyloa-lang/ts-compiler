export type Class<T> = (new (...args: any) => T);

export function assertNever(_: never): never { throw "Fuck you TypeScript" }
