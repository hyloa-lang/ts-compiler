const valueTypeofs = [ 'number', 'boolean', 'string', 'undefined', 'symbol', 'function', 'bigint' ];

export function setEq(a: Set<any>, b: Set<any>) {
  if (a.size !== b.size) return false;
  
  for (const elemA of a) {
    let found = false;
    
    for (const elemB of b) {
      if (equals(elemA, elemB)) {
        found = true;
        
        break;
      }
    }
    
    if (!found) return false;
  }
  
  return true;
}

function equals(a: any, b: any): boolean {
  if (typeof a !== typeof b) return false;
  
  if (a === null) return b === null;
  
  if (valueTypeofs.includes(typeof a)) return a === b;
  
  if (a instanceof Set) {
    if (!(b instanceof Set)) return false;
    
    return setEq(a, b);
  }
  
  const aKeys = Object.keys(a);
  
  if (aKeys.length !== Object.keys(b).length) return false;
  
  for (const key of aKeys) {
    if (!(key in b) || !equals(a[key], b[key])) return false;
  }
  
  return true;
}

export class EqMap<K, V> {
  arr: [ K, V ][] = [];
  
  ret(key: K, value: V): V {
    const match = this.arr.find(e => equals(e[0], key));
    
    if (match) return match[1];
    
    this.arr.push([ key, value ]);
    
    return value;
  }
  
  set(key: K, value: V) {
    const match = this.arr.find(e => equals(e[0], key));
    
    match ? match[1] = value : this.arr.push([ key, value ]);
  }
}
