// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertStrictEquals, assertNotEquals } from "@std/assert";
import deepDiffTS, { type Diff } from "./deep-diff.ts";

Deno.test("Basic diff functionality", () => {
  const lhs = { a: 1, b: 2 };
  const rhs = { a: 1, b: 3, c: 4 };

  const diff = deepDiffTS(lhs, rhs);
  assertEquals(Array.isArray(diff), true);
  assertEquals(diff?.length, 2);

  if (diff) {
    // Check the edit diff
    const editDiff = diff.find((d) => d.kind === "E");
    assertEquals(editDiff?.kind, "E");
    assertEquals(editDiff?.path, ["b"]);
    if ("lhs" in editDiff!) assertEquals((editDiff as any).lhs, 2);
    if ("rhs" in editDiff!) assertEquals((editDiff as any).rhs, 3);

    // Check the new diff
    const newDiff = diff.find((d) => d.kind === "N");
    assertEquals(newDiff?.kind, "N");
    assertEquals(newDiff?.path, ["c"]);
    if ("rhs" in newDiff!) assertEquals((newDiff as any).rhs, 4);
  }
});

Deno.test("Array differences", () => {
  const lhs = [1, 2, 3];
  const rhs = [1, 2, 4, 5];

  const diff = deepDiffTS(lhs, rhs);
  assertEquals(Array.isArray(diff), true);
  assertEquals(diff?.length, 2);

  if (diff) {
    // Check array addition
    const arrayAdd = diff.find((d) => d.kind === "A");
    assertEquals(arrayAdd?.kind, "A");
    assertEquals("index" in arrayAdd! && arrayAdd.index, 3);
    assertEquals("item" in arrayAdd! && arrayAdd.item.kind, "N");

    // Check element edit
    const elementEdit = diff.find((d) => d.kind === "E");
    assertEquals(elementEdit?.kind, "E");
    assertEquals(elementEdit?.path, [2]);
  }
});

Deno.test("No differences return undefined", () => {
  const identical1 = { a: 1, b: 2 };
  const identical2 = { a: 1, b: 2 };

  const diff = deepDiffTS(identical1, identical2);
  assertEquals(diff, undefined);
});

Deno.test("Nested object differences", () => {
  const lhs = { a: { x: 1, y: 2 }, b: [1, 2] };
  const rhs = { a: { x: 1, y: 3 }, b: [1, 3] };

  const diff = deepDiffTS(lhs, rhs);
  assertEquals(Array.isArray(diff), true);
  assertEquals(diff?.length, 2);

  if (diff) {
    const nestedEdit = diff.find((d) => d.path?.[0] === "a");
    assertEquals(nestedEdit?.path, ["a", "y"]);
    if ("lhs" in nestedEdit!) assertEquals((nestedEdit as any).lhs, 2);
    if ("rhs" in nestedEdit!) assertEquals((nestedEdit as any).rhs, 3);
  }
});

Deno.test("Edge cases - primitives", () => {
  // Different types
  const diff1 = deepDiffTS(0, false);
  assertEquals(diff1?.length, 1);
  assertEquals(diff1?.[0].kind, "E");

  // null vs undefined
  const diff2 = deepDiffTS(null, undefined);
  assertEquals(diff2?.length, 1);
  assertEquals(diff2?.[0].kind, "D"); // null -> undefined is treated as delete

  // NaN handling
  const diff3 = deepDiffTS(NaN, NaN);
  assertEquals(diff3, undefined); // NaN should equal NaN

  const diff4 = deepDiffTS(NaN, 0);
  assertEquals(diff4?.length, 1);
  if (diff4 && "lhs" in diff4[0])
    assertEquals(Number.isNaN((diff4[0] as any).lhs), true);
});

Deno.test("Date differences", () => {
  const date1 = new Date("2023-01-01");
  const date2 = new Date("2023-01-02");
  const date3 = new Date("2023-01-01");

  // Different dates
  const diff1 = deepDiffTS(date1, date2);
  assertEquals(diff1?.length, 1);
  assertEquals(diff1?.[0].kind, "E");

  // Same dates
  const diff2 = deepDiffTS(date1, date3);
  assertEquals(diff2, undefined);
});

Deno.test("RegExp differences", () => {
  const regex1 = /abc/g;
  const regex2 = /def/i;
  const regex3 = /abc/g;

  // Different regexes
  const diff1 = deepDiffTS(regex1, regex2);
  assertEquals(diff1?.length, 1);
  assertEquals(diff1?.[0].kind, "E");

  // Same regexes
  const diff2 = deepDiffTS(regex1, regex3);
  assertEquals(diff2, undefined);
});

Deno.test("API methods exist and work", () => {
  // Check that all expected methods exist
  assertEquals(typeof deepDiffTS, "function");
  assertEquals(typeof deepDiffTS.diff, "function");
  assertEquals(typeof deepDiffTS.observableDiff, "function");
  assertEquals(typeof deepDiffTS.orderIndependentDiff, "function");
  assertEquals(typeof deepDiffTS.applyChange, "function");
  assertEquals(typeof deepDiffTS.revertChange, "function");
  assertEquals(typeof deepDiffTS.applyDiff, "function");
  assertEquals(typeof deepDiffTS.orderIndepHash, "function");
  assertEquals(typeof deepDiffTS.isConflict, "function");
});

Deno.test("observableDiff method", () => {
  const lhs = { a: 1, b: 2 };
  const rhs = { a: 1, b: 3, c: 4 };

  const changes: Diff[] = [];
  const result = deepDiffTS.observableDiff(lhs, rhs, (change) =>
    changes.push(change)
  );

  assertEquals(Array.isArray(result), true);
  assertEquals(result.length, 2);
  assertEquals(changes.length, 2);
  assertEquals(changes, result);
});

Deno.test("orderIndependentDiff method", () => {
  const lhs = [{ a: 1 }, { b: 2 }];
  const rhs = [{ b: 2 }, { a: 1 }]; // Same elements, different order

  const normalDiff = deepDiffTS(lhs, rhs);
  const orderIndepDiff = deepDiffTS.orderIndependentDiff(lhs, rhs);

  assertNotEquals(normalDiff, undefined); // Normal diff should show differences
  assertEquals(orderIndepDiff, undefined); // Order-independent should be equal
});

Deno.test("applyChange and revertChange methods", () => {
  const target = { a: 1, b: 2 };
  const change: Diff = { kind: "E", path: ["b"], lhs: 2, rhs: 3 };

  // Apply change
  deepDiffTS.applyChange(target, null, change);
  assertEquals(target.b, 3);

  // Revert change (need to pass a valid source object)
  deepDiffTS.revertChange(target, {}, change);
  assertEquals(target.b, 2);
});
Deno.test("applyDiff method", () => {
  const target = { a: 1, b: 2 };
  const source = { a: 1, b: 3, c: 4 };

  deepDiffTS.applyDiff(target, source);
  assertEquals(target, source);
});

Deno.test("accumulator pattern", () => {
  const lhs = { a: 1, b: 2 };
  const rhs = { a: 1, b: 3, c: 4 };

  const accumulator: Diff[] = [];
  const result = deepDiffTS(lhs, rhs, undefined, accumulator);

  assertStrictEquals(result, accumulator);
  assertEquals(accumulator.length, 2);
});

Deno.test("prefilter support", () => {
  const lhs = { a: 1, b: 2, c: 3 };
  const rhs = { a: 1, b: 3, c: 4 };

  // Filter out changes to property 'c'
  const prefilter = (_path: any[], key: any) => key === "c";

  const diff = deepDiffTS(lhs, rhs, prefilter);
  assertEquals(diff?.length, 1);
  assertEquals(diff?.[0].path, ["b"]);
});

Deno.test("circular reference handling", () => {
  const circular1: any = { a: 1 };
  circular1.self = circular1;
  const circular2: any = { a: 2 };
  circular2.self = circular2;

  // Should not cause infinite recursion
  const diff = deepDiffTS(circular1, circular2);
  assertEquals(Array.isArray(diff), true);
  assertEquals(diff?.length, 2); // One for 'a' property, one for 'self' property
});

Deno.test("orderIndepHash function", () => {
  const obj1 = { a: 1, b: 2 };
  const obj2 = { b: 2, a: 1 }; // Same keys, different order

  // Objects with same content should have same hash
  assertEquals(
    deepDiffTS.orderIndepHash(obj1),
    deepDiffTS.orderIndepHash(obj2)
  );

  // Different objects should have different hash
  const obj3 = { a: 1, b: 3 };
  assertNotEquals(
    deepDiffTS.orderIndepHash(obj1),
    deepDiffTS.orderIndepHash(obj3)
  );
});

Deno.test("isConflict function", () => {
  // The isConflict function should exist and return false (legacy compatibility)
  assertEquals(typeof deepDiffTS.isConflict, "function");
  assertEquals(deepDiffTS.isConflict(), false);
});
