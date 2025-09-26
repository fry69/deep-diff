/**
 * A modern TypeScript port of the legacy `deep-diff` package that computes
 * structural differences, applies patches, and reverses changes across nested
 * objects and arrays while preserving the original algorithm's quirks.
 *
 * @example
 * ```ts
 * import deepDiff from "@fry69/deep-diff";
 *
 * const left = { name: "Ada", tags: ["math", "logic"] };
 * const right = { name: "Ada", tags: ["math", "computing"] };
 *
 * const changes = deepDiff(left, right);
 * // => [{ kind: "A", path: ["tags"], index: 1, item: { kind: "E", rhs: "computing", lhs: "logic" } }]
 * ```
 *
 * @module deepDiff
 */
// deno-lint-ignore-file no-explicit-any

/**
 * Ordered list of keys and indices describing how to reach a nested value
 * within an object graph. Each entry represents a step in the traversal.
 */
export type Path = Array<any>;

/**
 * Discriminator shared by {@link Diff} variants.
 *
 * - `"N"` — a new value was added
 * - `"E"` — an existing value was edited
 * - `"A"` — an array slot changed
 * - `"D"` — a value was deleted
 */
export type Kind = "N" | "E" | "A" | "D";

/**
 * Diff node representing a newly added value.
 *
 * @typeParam RHS - The type of the right-hand side value.
 */
export interface DiffNew<RHS = any> {
  kind: "N";
  path?: Path;
  rhs: RHS;
}

/**
 * Diff node capturing a deletion from the left-hand structure.
 *
 * @typeParam LHS - The type of the removed value.
 */
export interface DiffDeleted<LHS = any> {
  kind: "D";
  path?: Path;
  lhs: LHS;
}

/**
 * Diff node representing a change where a value was replaced.
 *
 * @typeParam LHS - Type of the original value.
 * @typeParam RHS - Type of the new value.
 */
export interface DiffEdit<LHS = any, RHS = LHS> {
  kind: "E";
  path?: Path;
  lhs: LHS;
  rhs: RHS;
}

/**
 * Diff node describing a nested change inside an array.
 *
 * @typeParam LHS - Type of the previous item.
 * @typeParam RHS - Type of the new item.
 */
export interface DiffArray<LHS = any, RHS = LHS> {
  kind: "A";
  path?: Path;
  index: number;
  item: Diff<LHS, RHS>;
}

/**
 * Union of all change record shapes produced by {@link observableDiff} and
 * related helpers.
 *
 * @typeParam LHS - Type of the left-hand structure.
 * @typeParam RHS - Type of the right-hand structure.
 */
export type Diff<LHS = any, RHS = LHS> =
  | DiffNew<RHS>
  | DiffDeleted<LHS>
  | DiffEdit<LHS, RHS>
  | DiffArray<LHS, RHS>;

/**
 * Predicate-style filter invoked before traversing a key.
 *
 * @param path - Path accumulated for the parent node.
 * @param key - Candidate key or index about to be traversed.
 * @returns `true` to skip the key entirely.
 */
export type PreFilterFunction = (path: Path, key: any) => boolean;

/**
 * Object-form prefilter with optional normalization step.
 *
 * @typeParam LHS - Type of the left-hand structure.
 * @typeParam RHS - Type of the right-hand structure.
 */
export interface PreFilterObject<LHS = any, RHS = any> {
  /** Predicate-style skip function.
   * @param path - Path accumulated for the parent node.
   * @param key - Candidate key or index about to be traversed.
   */
  prefilter?: (path: Path, key: any) => boolean;
  /**
   * Optional hook that can return alternate values to compare before diffing
   * a specific key.
   *
   * @param currentPath - Path accumulated through the traversal.
   * @param key - Key or index currently being inspected.
   * @param lhs - Original value located at {@link currentPath}.
   * @param rhs - New value located at {@link currentPath}.
   * @returns A tuple of replacement values or `undefined` to use originals.
   */
  normalize?: (
    currentPath: Path,
    key: any,
    lhs: LHS,
    rhs: RHS,
  ) => [LHS, RHS] | undefined;
}

/**
 * Union of supported prefilter declarations accepted by diff helpers.
 */
export type PreFilter<LHS = any, RHS = any> =
  | PreFilterFunction
  | PreFilterObject<LHS, RHS>;

/**
 * Array-like receiver that can collect diff results.
 *
 * @typeParam LHS - Type of the original structure.
 * @typeParam RHS - Type of the incoming structure.
 */
export interface Accumulator<LHS = any, RHS = any> {
  /** Collects a diff entry emitted by the traversal. */
  push(diff: Diff<LHS, RHS>): void;
  length: number;
}

/**
 * Callback invoked for each diff entry discovered by {@link observableDiff}.
 */
export type Observer<LHS = any, RHS = any> = (diff: Diff<LHS, RHS>) => void;

/**
 * Optional predicate that decides whether a change should be applied.
 *
 * @param target - The mutable structure receiving modifications.
 * @param source - The reference structure used as the source of truth.
 * @param change - The proposed diff entry.
 * @returns `true` to allow the change, `false` to skip it.
 */
export type Filter<LHS = any, RHS = any> = (
  target: LHS,
  source: RHS,
  change: Diff<LHS, RHS>,
) => boolean;

const validKinds: Kind[] = ["N", "E", "A", "D"];

/* -------------------------
   Utility functions
   ------------------------- */

function arrayRemove<T>(arr: T[], from: number, to?: number): T[] {
  // Behavior preserved from original:
  // remove items from `from` to `to` (inclusive), or just at `from` if `to` undefined.
  const start = from < 0 ? arr.length + from : from;
  const endInclusive = typeof to === "number" ? to : from;
  const rest = arr.slice(endInclusive + 1);
  arr.length = start;
  arr.push(...rest);
  return arr;
}

function realTypeOf(subject: any): string {
  const type = typeof subject;
  if (type !== "object") {
    return type;
  }
  if (subject === Math) {
    return "math";
  } else if (subject === null) {
    return "null";
  } else if (Array.isArray(subject)) {
    return "array";
  } else if (Object.prototype.toString.call(subject) === "[object Date]") {
    return "date";
  } else if (
    typeof subject?.toString === "function" &&
    /^\/.*\//.test(subject.toString())
  ) {
    // legacy quirk: treat objects whose toString returns /.../ as regexp
    return "regexp";
  }
  return "object";
}

// Java's String.hashCode equivalent from original.
function hashThisString(string: string): number {
  let hash = 0;
  if (string.length === 0) return hash;
  for (let i = 0; i < string.length; i++) {
    const char = string.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    // Convert to 32bit int
    hash |= 0;
  }
  return hash;
}

/**
 * Computes an order-independent hash for objects, arrays, and primitives using
 * the legacy algorithm. Useful for comparing collections where element order is
 * insignificant.
 *
 * @param object - Value to hash.
 * @returns A deterministic integer hash.
 */
export function getOrderIndependentHash(object: any): number {
  let accum = 0;
  const type = realTypeOf(object);
  if (type === "array") {
    (object as any[]).forEach((item: any) => {
      accum += getOrderIndependentHash(item);
    });
    const arrayString = `[type: array, hash: ${accum}]`;
    return accum + hashThisString(arrayString);
  }
  if (type === "object") {
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        const keyValueString = `[ type: object, key: ${key}, value hash: ${
          getOrderIndependentHash(
            object[key],
          )
        }]`;
        accum += hashThisString(keyValueString);
      }
    }
    return accum;
  }
  // primitives / other
  const stringToHash = `[ type: ${type} ; value: ${String(object)}]`;
  return accum + hashThisString(stringToHash);
}

/* -------------------------
   Diff factory helpers
   ------------------------- */

/**
 * Creates a "new" diff record representing an added value.
 *
 * @param path - Optional path where the value resides.
 * @param rhs - The value that was introduced.
 */
function makeDiffNew<RHS>(path: Path | undefined, rhs: RHS): DiffNew<RHS> {
  const d: DiffNew<RHS> = { kind: "N", rhs };
  if (path && path.length) d.path = path;
  return d;
}
/**
 * Creates a "deleted" diff record representing removal from the left-hand side.
 *
 * @param path - Optional path that identifies the removed value.
 * @param lhs - The value that was removed.
 */
function makeDiffDeleted<LHS>(
  path: Path | undefined,
  lhs: LHS,
): DiffDeleted<LHS> {
  const d: DiffDeleted<LHS> = { kind: "D", lhs };
  if (path && path.length) d.path = path;
  return d;
}
/**
 * Creates an "edit" diff record capturing a replacement.
 *
 * @param path - Optional path to the mutated value.
 * @param lhs - The original value.
 * @param rhs - The replacement value.
 */
function makeDiffEdit<LHS, RHS>(
  path: Path | undefined,
  lhs: LHS,
  rhs: RHS,
): DiffEdit<LHS, RHS> {
  const d: DiffEdit<LHS, RHS> = { kind: "E", lhs, rhs };
  if (path && path.length) d.path = path;
  return d;
}
/**
 * Creates an array diff record nesting another {@link Diff} entry.
 *
 * @param path - Optional path to the parent array.
 * @param index - Index within the array that changed.
 * @param item - The nested diff describing the array slot change.
 */
function makeDiffArray<LHS, RHS>(
  path: Path | undefined,
  index: number,
  item: Diff<LHS, RHS>,
): DiffArray<LHS, RHS> {
  const d: DiffArray<LHS, RHS> = { kind: "A", index, item };
  if (path && path.length) d.path = path;
  return d;
}

/* -------------------------
   Core recursive deep diff
   ------------------------- */

function deepDiffInner<LHS = any, RHS = LHS>(
  lhs: any,
  rhs: any,
  changes: Array<Diff<LHS, RHS>>,
  prefilter?: PreFilter<LHS, RHS>,
  path: Path = [],
  key?: any,
  stack: Array<{ lhs?: any; rhs?: any }> = [],
  orderIndependent = false,
): void {
  const currentPath = path.slice(0);
  if (typeof key !== "undefined" && key !== null) {
    // prefilter handling (function or object with prefilter & normalize) - preserve original behavior
    if (prefilter) {
      if (typeof prefilter === "function") {
        if ((prefilter as PreFilterFunction)(currentPath, key)) {
          return;
        }
      } else {
        const pObj = prefilter as PreFilterObject<LHS, RHS>;
        if (pObj.prefilter && pObj.prefilter(currentPath, key)) {
          return;
        }
        if (pObj.normalize) {
          const alt = pObj.normalize(currentPath, key, lhs, rhs);
          if (alt) {
            lhs = alt[0];
            rhs = alt[1];
          }
        }
      }
    }
    currentPath.push(key);
  }

  // regexes compared as strings in original
  if (realTypeOf(lhs) === "regexp" && realTypeOf(rhs) === "regexp") {
    lhs = lhs.toString();
    rhs = rhs.toString();
  }

  const ltype = typeof lhs;
  const rtype = typeof rhs;

  // legacy defined checks (uses property descriptor check from top of stack)
  const ldefined = ltype !== "undefined" ||
    (stack &&
      stack.length > 0 &&
      stack[stack.length - 1].lhs &&
      Object.getOwnPropertyDescriptor(
        stack[stack.length - 1].lhs,
        key as string | number,
      ));
  const rdefined = rtype !== "undefined" ||
    (stack &&
      stack.length > 0 &&
      stack[stack.length - 1].rhs &&
      Object.getOwnPropertyDescriptor(
        stack[stack.length - 1].rhs,
        key as string | number,
      ));

  if (!ldefined && rdefined) {
    changes.push(makeDiffNew(currentPath, rhs));
  } else if (!rdefined && ldefined) {
    changes.push(makeDiffDeleted(currentPath, lhs));
  } else if (realTypeOf(lhs) !== realTypeOf(rhs)) {
    changes.push(makeDiffEdit(currentPath, lhs, rhs));
  } else if (realTypeOf(lhs) === "date" && lhs - rhs !== 0) {
    // Date difference by numeric difference
    changes.push(makeDiffEdit(currentPath, lhs, rhs));
  } else if (ltype === "object" && lhs !== null && rhs !== null) {
    // cycle detection: check if lhs already in stack
    let other = false;
    for (let i = stack.length - 1; i > -1; --i) {
      if (stack[i].lhs === lhs) {
        other = true;
        break;
      }
    }
    if (!other) {
      stack.push({ lhs, rhs });
      if (Array.isArray(lhs)) {
        // order-independent mode sorts arrays in-place in original
        if (orderIndependent) {
          lhs.sort(
            (a: any, b: any) =>
              getOrderIndependentHash(a) - getOrderIndependentHash(b),
          );
          rhs.sort(
            (a: any, b: any) =>
              getOrderIndependentHash(a) - getOrderIndependentHash(b),
          );
        }

        let i = rhs.length - 1;
        let j = lhs.length - 1;

        while (i > j) {
          // RHS has extra elements -> New
          changes.push(
            makeDiffArray(currentPath, i, makeDiffNew(undefined, rhs[i--])),
          );
        }
        while (j > i) {
          // LHS has extra elements -> Deleted
          changes.push(
            makeDiffArray(currentPath, j, makeDiffDeleted(undefined, lhs[j--])),
          );
        }
        for (; i >= 0; --i) {
          deepDiffInner(
            lhs[i],
            rhs[i],
            changes,
            prefilter,
            currentPath,
            i,
            stack,
            orderIndependent,
          );
        }
      } else {
        const akeys = Object.keys(lhs);
        const pkeys = Object.keys(rhs);
        for (let i = 0; i < akeys.length; ++i) {
          const k = akeys[i];
          const otherIndex = pkeys.indexOf(k);
          if (otherIndex >= 0) {
            deepDiffInner(
              lhs[k],
              rhs[k],
              changes,
              prefilter,
              currentPath,
              k,
              stack,
              orderIndependent,
            );
            // null out matched key to prevent second-pass
            pkeys[otherIndex] = null as any;
          } else {
            deepDiffInner(
              lhs[k],
              undefined,
              changes,
              prefilter,
              currentPath,
              k,
              stack,
              orderIndependent,
            );
          }
        }
        for (let i = 0; i < pkeys.length; ++i) {
          const k = pkeys[i];
          if (k) {
            deepDiffInner(
              undefined,
              rhs[k],
              changes,
              prefilter,
              currentPath,
              k,
              stack,
              orderIndependent,
            );
          }
        }
      }
      // pop stack
      stack.length = stack.length - 1;
    } else if (lhs !== rhs) {
      // lhs contains a cycle here and it differs from rhs
      changes.push(makeDiffEdit(currentPath, lhs, rhs));
    }
  } else if (lhs !== rhs) {
    // primitive difference except NaN vs NaN is considered equal
    if (!(ltype === "number" && isNaN(lhs) && isNaN(rhs))) {
      changes.push(makeDiffEdit(currentPath, lhs, rhs));
    }
  }
}

/* -------------------------
   Observable and accumulate wrappers
   ------------------------- */

/**
 * Produces a list of {@link Diff} entries describing how `lhs` differs from
 * `rhs`. Optionally calls an {@link Observer} for each change as it is
 * discovered.
 *
 * @typeParam LHS - Type of the baseline structure.
 * @typeParam RHS - Type of the structure to compare against.
 * @param lhs - Baseline value treated as the source of truth.
 * @param rhs - Value being compared to the baseline.
 * @param observer - Optional callback invoked for each change.
 * @param prefilter - Optional prefilter to skip or normalize keys.
 * @param orderIndependent - When `true`, array order differences are ignored.
 * @returns Array of diff entries capturing the changes.
 */
export function observableDiff<LHS = any, RHS = LHS>(
  lhs: LHS,
  rhs: RHS,
  observer?: Observer<LHS, RHS>,
  prefilter?: PreFilter<LHS, RHS>,
  orderIndependent = false,
): Array<Diff<LHS, RHS>> {
  const changes: Array<Diff<LHS, RHS>> = [];
  deepDiffInner(
    lhs,
    rhs,
    changes,
    prefilter,
    [],
    undefined,
    [],
    orderIndependent,
  );
  if (observer) {
    for (let i = 0; i < changes.length; ++i) {
      observer(changes[i]);
    }
  }
  return changes;
}

/**
 * Legacy accumulator-style API that either populates a provided accumulator or
 * returns the collected {@link Diff} entries.
 *
 * @typeParam LHS - Type of the baseline structure.
 * @typeParam RHS - Type of the structure to compare against.
 * @param lhs - Baseline value treated as the source of truth.
 * @param rhs - Value being compared to the baseline.
 * @param prefilter - Optional prefilter to skip or normalize keys.
 * @param accum - Optional accumulator that receives each diff entry.
 * @returns The accumulator when provided, otherwise the array of diffs or
 * `undefined` when no changes exist.
 */
export function accumulateDiff<LHS = any, RHS = LHS>(
  lhs: LHS,
  rhs: RHS,
  prefilter?: PreFilter<LHS, RHS>,
  accum?: Accumulator<LHS, RHS>,
): Array<Diff<LHS, RHS>> | Accumulator<LHS, RHS> | undefined {
  const observer: Observer<LHS, RHS> | undefined = accum
    ? (difference) => {
      if (difference) accum.push(difference);
    }
    : undefined;

  const changes = observableDiff(lhs, rhs, observer, prefilter);
  return accum ? accum : changes.length ? changes : undefined;
}

/**
 * Variant of {@link observableDiff} that reuses a provided array of changes and
 * treats arrays as order-independent.
 *
 * @typeParam LHS - Type of the baseline structure.
 * @typeParam RHS - Type of the structure to compare against.
 * @param lhs - Baseline value treated as the source of truth.
 * @param rhs - Value being compared to the baseline.
 * @param changes - Mutable array collecting diff entries.
 * @param prefilter - Optional prefilter to skip or normalize keys.
 * @param path - Internal traversal path (mostly for recursion).
 * @param key - Key or index currently being inspected.
 * @param stack - Shared stack used for cycle detection.
 */
export function orderIndependentDeepDiff<LHS = any, RHS = LHS>(
  lhs: LHS,
  rhs: RHS,
  changes: Array<Diff<LHS, RHS>>,
  prefilter?: PreFilter<LHS, RHS>,
  path?: Path,
  key?: any,
  stack?: any[],
): void {
  // Wrapper that sets orderIndependent = true for the internal recursion.
  deepDiffInner(
    lhs,
    rhs,
    changes,
    prefilter,
    path ?? [],
    key,
    stack ?? [],
    true,
  );
}

/**
 * Convenience wrapper around {@link observableDiff} that ignores element order
 * inside arrays.
 *
 * @typeParam LHS - Type of the baseline structure.
 * @typeParam RHS - Type of the structure to compare against.
 * @param lhs - Baseline value treated as the source of truth.
 * @param rhs - Value being compared to the baseline.
 * @param prefilter - Optional prefilter to skip or normalize keys.
 * @param accum - Optional accumulator that receives each diff entry.
 * @returns The accumulator when provided, otherwise the array of diffs or
 * `undefined` when no changes exist.
 */
export function accumulateOrderIndependentDiff<LHS = any, RHS = LHS>(
  lhs: LHS,
  rhs: RHS,
  prefilter?: PreFilter<LHS, RHS>,
  accum?: Accumulator<LHS, RHS>,
): Array<Diff<LHS, RHS>> | Accumulator<LHS, RHS> | undefined {
  const observer: Observer<LHS, RHS> | undefined = accum
    ? (difference) => {
      if (difference) accum.push(difference);
    }
    : undefined;
  const changes = observableDiff(lhs, rhs, observer, prefilter, true);
  return accum ? accum : changes.length ? changes : undefined;
}

/* -------------------------
   Apply / revert changes
   ------------------------- */

function applyArrayChange(arr: any[], index: number, change: Diff) {
  // Behavior preserved from original
  if (change.path && change.path.length) {
    let it: any = arr[index];
    const u = change.path.length - 1;
    for (let i = 0; i < u; i++) {
      it = it[change.path[i]];
    }
    const lastKey = change.path[u];
    switch (change.kind) {
      case "A":
        applyArrayChange(
          it[change.path[u]],
          (change as DiffArray).index,
          (change as DiffArray).item,
        );
        break;
      case "D":
        delete it[lastKey];
        break;
      case "E":
      case "N": // - change.rhs exists on E and N
        it[lastKey] = (change as any).rhs;
        break;
    }
  } else {
    switch (change.kind) {
      case "A":
        applyArrayChange(
          arr[index],
          (change as DiffArray).index,
          (change as DiffArray).item,
        );
        break;
      case "D":
        arr = arrayRemove(arr, index);
        break;
      case "E":
      case "N": //
        arr[index] = (change as any).rhs;
        break;
    }
  }
  return arr;
}

/**
 * Applies a single {@link Diff} entry to a mutable target structure.
 *
 * @typeParam Target - Type of the structure being mutated.
 * @param target - Object or array receiving the change.
 * @param source - Either the source structure or the diff entry (legacy
 * overload).
 * @param change - Specific diff entry to apply. Optional when `source` already
 * contains a diff record.
 */
export function applyChange<Target = any>(
  target: Target,
  source: any,
  change?: Diff,
): void {
  // Legacy allowed applyChange(target, change) by passing change as 'source' if change undefined and source.kind valid.
  if (
    typeof change === "undefined" &&
    source &&
    (validKinds as string[]).indexOf((source as any).kind) >= 0
  ) {
    change = source as Diff;
  }

  if (target && change && change.kind) {
    let it: any = target as any;
    let i = -1;
    const path = change.path ?? [];
    const last = path.length > 0 ? path.length - 1 : 0;
    while (++i < last) {
      if (typeof it[path[i]] === "undefined") {
        it[path[i]] =
          typeof path[i + 1] !== "undefined" && typeof path[i + 1] === "number"
            ? []
            : {};
      }
      it = it[path[i]];
    }

    switch (change.kind) {
      case "A":
        if (change.path && typeof it[change.path[i]] === "undefined") {
          it[change.path[i]] = [];
        }
        applyArrayChange(
          change.path ? it[change.path[i]] : it,
          (change as DiffArray).index,
          (change as DiffArray).item,
        );
        break;
      case "D":
        delete it[change.path ? change.path[i] : undefined];
        break;
      case "E":
      case "N": //
        it[change.path ? change.path[i] : undefined] = (change as any).rhs;
        break;
    }
  }
}

function revertArrayChange(arr: any[], index: number, change: Diff) {
  if (change.path && change.path.length) {
    let it: any = arr[index];
    const u = change.path.length - 1;
    for (let i = 0; i < u; i++) {
      it = it[change.path[i]];
    }
    const lastKey = change.path[u];
    switch (change.kind) {
      case "A":
        revertArrayChange(
          it[change.path[u]],
          (change as DiffArray).index,
          (change as DiffArray).item,
        );
        break;
      case "D":
        // restore deleted //
        it[lastKey] = (change as any).lhs;
        break;
      case "E": //
        it[lastKey] = (change as any).lhs;
        break;
      case "N":
        delete it[lastKey];
        break;
    }
  } else {
    switch (change.kind) {
      case "A":
        revertArrayChange(
          arr[index],
          (change as DiffArray).index,
          (change as DiffArray).item,
        );
        break;
      case "D": //
        arr[index] = (change as any).lhs;
        break;
      case "E": //
        arr[index] = (change as any).lhs;
        break;
      case "N":
        arr = arrayRemove(arr, index);
        break;
    }
  }
  return arr;
}

/**
 * Reverts a {@link Diff} entry that was previously applied to a target.
 *
 * @typeParam Target - Type of the structure being mutated.
 * @param target - Object or array receiving the reversal.
 * @param source - Original structure containing reference values.
 * @param change - Diff entry describing the prior mutation.
 */
export function revertChange<Target = any>(
  target: Target,
  source: any,
  change: Diff,
): void {
  if (target && source && change && change.kind) {
    let it: any = target as any;
    const path = change.path ?? [];
    const u = path.length - 1;
    for (let i = 0; i < u; i++) {
      if (typeof it[path[i]] === "undefined") {
        it[path[i]] = {};
      }
      it = it[path[i]];
    }
    switch (change.kind) {
      case "A":
        revertArrayChange(
          it[change.path![u]],
          (change as DiffArray).index,
          (change as DiffArray).item,
        );
        break;
      case "D":
        // restore deleted
        it[change.path![u]] = (change as any).lhs;
        break;
      case "E":
        it[change.path![u]] = (change as any).lhs;
        break;
      case "N":
        delete it[change.path![u]];
        break;
    }
  }
}

/* -------------------------
   High-level applyDiff
   ------------------------- */

/**
 * Computes and immediately applies differences from `source` onto `target`.
 *
 * @typeParam Target - Type of the structure being mutated.
 * @typeParam Source - Type of the structure providing new values.
 * @param target - Object or array receiving the changes.
 * @param source - Structure containing the desired end state.
 * @param filter - Optional predicate that decides which changes to apply.
 */
export function applyDiff<Target = any, Source = any>(
  target: Target,
  source: Source,
  filter?: Filter<Target, Source>,
): void {
  if (target && source) {
    const onChange = (change: Diff) => {
      if (!filter || filter(target, source, change)) {
        applyChange(target, source, change);
      }
    };
    observableDiff(
      target as any,
      source as any,
      onChange as Observer<any, any>,
      undefined,
    );
  }
}

/* -------------------------
   Exported function (default) which mirrors legacy accumulateDiff function object.
   We attach properties to the function object for the other helpers (diff/orderIndependentDiff etc).
   ------------------------- */

/**
 * Callable interface for the default export that mimics the original
 * `deep-diff` function object, including attached helper utilities.
 */
export interface DeepDiffMain {
  <LHS = any, RHS = LHS>(lhs: LHS, rhs: RHS, prefilter?: PreFilter<LHS, RHS>):
    | Array<Diff<LHS, RHS>>
    | undefined;
  <LHS = any, RHS = LHS>(
    lhs: LHS,
    rhs: RHS,
    prefilter?: PreFilter<LHS, RHS>,
    acc?: Accumulator<LHS, RHS>,
  ): Accumulator<LHS, RHS>;
  // attached properties:
  diff: typeof accumulateDiff;
  orderIndependentDiff: typeof accumulateOrderIndependentDiff;
  observableDiff: typeof observableDiff;
  orderIndependentObservableDiff: typeof orderIndependentDeepDiff;
  orderIndepHash: typeof getOrderIndependentHash;
  applyDiff: typeof applyDiff;
  applyChange: typeof applyChange;
  revertChange: typeof revertChange;
  isConflict: () => boolean;
  DeepDiff?: any; // legacy alias
}

/**
 * Default export implementation that behaves like the classic `deep-diff`
 * function while exposing helper APIs as properties.
 */
const deepDiffMain = (function createMain(): any {
  const fn = function deepDiffWrapper<LHS = any, RHS = LHS>(
    lhs: LHS,
    rhs: RHS,
    prefilter?: PreFilter<LHS, RHS>,
    acc?: Accumulator<LHS, RHS>,
  ): Array<Diff<LHS, RHS>> | Accumulator<LHS, RHS> | undefined {
    return accumulateDiff(lhs, rhs, prefilter, acc);
  };

  // Attach helpers as properties to mimic legacy module's API
  Object.defineProperties(fn, {
    diff: { value: accumulateDiff, enumerable: true },
    orderIndependentDiff: {
      value: accumulateOrderIndependentDiff,
      enumerable: true,
    },
    observableDiff: { value: observableDiff, enumerable: true },
    orderIndependentObservableDiff: {
      value: orderIndependentDeepDiff,
      enumerable: true,
    },
    orderIndepHash: { value: getOrderIndependentHash, enumerable: true },
    applyDiff: { value: applyDiff, enumerable: true },
    applyChange: { value: applyChange, enumerable: true },
    revertChange: { value: revertChange, enumerable: true },
    isConflict: {
      value: function () {
        // legacy checked for global $conflict variable
        // keep same behavior (uses globalThis)
        return typeof (globalThis as any).$conflict !== "undefined";
      },
      enumerable: true,
    },
  });

  // legacy alias DeepDiff
  (fn as any).DeepDiff = fn;

  return fn;
})() as DeepDiffMain;

// Named exports for convenience & modern usage
export default deepDiffMain as DeepDiffMain;
export {
  accumulateDiff as diff,
  accumulateOrderIndependentDiff as orderIndependentDiff,
  getOrderIndependentHash as orderIndepHash,
  makeDiffArray,
  makeDiffDeleted,
  makeDiffEdit,
  makeDiffNew,
  observableDiff as observableDiffFn,
  orderIndependentDeepDiff as orderIndependentObservableDiff,
};
