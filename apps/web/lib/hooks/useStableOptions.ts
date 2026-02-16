import { useRef } from "react";

type AnyFn = (...args: unknown[]) => unknown;
type OptionKey = string | symbol;

type FunctionEntry = {
  current: AnyFn;
  proxy: AnyFn;
};

type StableState<T> = {
  raw: T;
  stable: T;
  functionEntries: Map<OptionKey, FunctionEntry>;
};

function isObjectLike(value: unknown): value is Record<OptionKey, unknown> {
  return typeof value === "object" && value !== null;
}

function deepEqualIgnoringFunctions(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === "function" && typeof b === "function") return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualIgnoringFunctions(a[i], b[i])) return false;
    }
    return true;
  }

  if (a instanceof Date || b instanceof Date) {
    if (!(a instanceof Date) || !(b instanceof Date)) return false;
    return a.getTime() === b.getTime();
  }

  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map)) return false;
    if (a.size !== b.size) return false;
    for (const [key, valueA] of a.entries()) {
      if (!b.has(key)) return false;
      if (!deepEqualIgnoringFunctions(valueA, b.get(key))) return false;
    }
    return true;
  }

  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set)) return false;
    if (a.size !== b.size) return false;
    for (const value of a.values()) {
      if (!b.has(value)) return false;
    }
    return true;
  }

  if (!isObjectLike(a) || !isObjectLike(b)) {
    return false;
  }

  const keysA = Reflect.ownKeys(a);
  const keysB = Reflect.ownKeys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqualIgnoringFunctions(a[key], b[key])) return false;
  }

  return true;
}

function syncFunctionEntries(
  options: unknown,
  functionEntries: Map<OptionKey, FunctionEntry>,
): void {
  if (!isObjectLike(options)) {
    functionEntries.clear();
    return;
  }

  const keys = Reflect.ownKeys(options) as OptionKey[];
  const keySet = new Set(keys);

  for (const existingKey of Array.from(functionEntries.keys())) {
    const nextValue = options[existingKey];
    if (!keySet.has(existingKey) || typeof nextValue !== "function") {
      functionEntries.delete(existingKey);
    }
  }

  for (const key of keys) {
    const nextValue = options[key];
    if (typeof nextValue !== "function") continue;

    const existing = functionEntries.get(key);
    if (existing) {
      existing.current = nextValue as AnyFn;
      continue;
    }

    const entry: FunctionEntry = {
      current: nextValue as AnyFn,
      proxy: (...args: unknown[]) => entry.current(...args),
    };
    functionEntries.set(key, entry);
  }
}

function withStableFunctions<T>(
  options: T,
  functionEntries: Map<OptionKey, FunctionEntry>,
): T {
  if (!isObjectLike(options)) {
    return options;
  }

  const copy = Array.isArray(options)
    ? [...options]
    : { ...options };
  const keys = Reflect.ownKeys(copy) as OptionKey[];

  for (const key of keys) {
    const value = (copy as Record<OptionKey, unknown>)[key];
    if (typeof value !== "function") continue;
    const entry = functionEntries.get(key);
    if (entry) {
      (copy as Record<OptionKey, unknown>)[key] = entry.proxy;
    }
  }

  return copy as T;
}

export function useStableOptions<T>(options: T): T {
  const stateRef = useRef<StableState<T> | null>(null);

  if (stateRef.current === null) {
    const functionEntries = new Map<OptionKey, FunctionEntry>();
    syncFunctionEntries(options, functionEntries);
    stateRef.current = {
      raw: options,
      stable: withStableFunctions(options, functionEntries),
      functionEntries,
    };
    return stateRef.current.stable;
  }

  const state = stateRef.current;
  syncFunctionEntries(options, state.functionEntries);

  if (deepEqualIgnoringFunctions(state.raw, options)) {
    state.raw = options;
    return state.stable;
  }

  state.raw = options;
  state.stable = withStableFunctions(options, state.functionEntries);
  return state.stable;
}
