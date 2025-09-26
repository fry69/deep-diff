// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertNotEquals, assertStrictEquals } from "@std/assert";
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
  if (diff4 && "lhs" in diff4[0]) {
    assertEquals(Number.isNaN((diff4[0] as any).lhs), true);
  }
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
  const result = deepDiffTS.observableDiff(
    lhs,
    rhs,
    (change) => changes.push(change),
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
    deepDiffTS.orderIndepHash(obj2),
  );

  // Different objects should have different hash
  const obj3 = { a: 1, b: 3 };
  assertNotEquals(
    deepDiffTS.orderIndepHash(obj1),
    deepDiffTS.orderIndepHash(obj3),
  );
});

Deno.test("isConflict function", () => {
  // The isConflict function should exist and return false (legacy compatibility)
  assertEquals(typeof deepDiffTS.isConflict, "function");
  assertEquals(deepDiffTS.isConflict(), false);
});

// Additional test cases found in legacy v1.0.2 test suite

Deno.test("Object.create(null) handling", () => {
  // Objects without prototype should work properly
  const lhs = Object.create(null);
  const rhs = { foo: undefined };

  const diff = deepDiffTS(lhs, rhs);
  assertEquals(Array.isArray(diff), true);
  assertEquals(diff?.length, 1);
  assertEquals(diff?.[0].kind, "N");
  assertEquals(diff?.[0].path, ["foo"]);
});

Deno.test("Math object comparison", () => {
  // Math object should be treated as special type
  const lhs = { key: Math };
  const rhs = { key: {} };

  const diff = deepDiffTS(lhs, rhs);
  assertEquals(Array.isArray(diff), true);
  assertEquals(diff?.length, 1);
  assertEquals(diff?.[0].kind, "E");
});

Deno.test("toString edge cases", () => {
  // When toString is not a function
  const lhs = {
    left: "yes",
    right: "no",
  };
  const rhs = {
    left: {
      toString: true, // toString is not a function
    },
    right: "no",
  };

  // Should not throw a TypeError
  const diff = deepDiffTS(lhs, rhs);
  assertEquals(diff?.length, 1);
  assertEquals(diff?.[0].kind, "E");
  assertEquals(diff?.[0].path, ["left"]);
});

Deno.test("Undefined property handling (issue #70)", () => {
  // Should detect difference with undefined property on lhs
  const diff1 = deepDiffTS({ foo: undefined }, {});
  assertEquals(Array.isArray(diff1), true);
  assertEquals(diff1?.length, 1);
  assertEquals(diff1?.[0].kind, "D");
  assertEquals(diff1?.[0].path, ["foo"]);
  assertEquals((diff1?.[0] as any).lhs, undefined);

  // Should detect difference with undefined property on rhs
  const diff2 = deepDiffTS({}, { foo: undefined });
  assertEquals(Array.isArray(diff2), true);
  assertEquals(diff2?.length, 1);
  assertEquals(diff2?.[0].kind, "N");
  assertEquals(diff2?.[0].path, ["foo"]);
  assertEquals((diff2?.[0] as any).rhs, undefined);

  // Should not detect difference with two undefined property values (issue #98)
  const diff3 = deepDiffTS({ foo: undefined }, { foo: undefined });
  assertEquals(diff3, undefined);
});

Deno.test("Regression test for issue #102 - null vs undefined", () => {
  // Should not throw a TypeError when comparing null to undefined
  const diff = deepDiffTS(null, undefined);
  assertEquals(Array.isArray(diff), true);
  assertEquals(diff?.length, 1);
  assertEquals(diff?.[0].kind, "D");
  assertEquals((diff?.[0] as any).lhs, null);
});

Deno.test("Regression test for issue #83 - null comparison", () => {
  // Should not detect difference when both properties are null
  const lhs = { date: null };
  const rhs = { date: null };
  const diff = deepDiffTS(lhs, rhs);
  assertEquals(diff, undefined);
});

Deno.test("Array change application (issue #35)", () => {
  // Should be able to apply diffs between two top level arrays
  const lhs = ["a", "a", "a"];
  const rhs = ["a"];

  const differences = deepDiffTS(lhs, rhs);
  assertEquals(Array.isArray(differences), true);

  if (differences) {
    differences.forEach((change: Diff) => {
      deepDiffTS.applyChange(lhs, rhs, change);
    });
    assertEquals(lhs, ["a"]);
  }
});

Deno.test("Complex nested structures", () => {
  // Test more complex nested object/array combinations (issue #10 regression)
  const lhs = {
    id: "Release",
    phases: [{
      id: "Phase1",
      tasks: [{ id: "Task1" }, { id: "Task2" }],
    }, {
      id: "Phase2",
      tasks: [{ id: "Task3" }],
    }],
  };

  const rhs = {
    id: "Release",
    phases: [{
      id: "Phase2",
      tasks: [{ id: "Task3" }],
    }, {
      id: "Phase1",
      tasks: [{ id: "Task1" }, { id: "Task2" }],
    }],
  };

  const diff = deepDiffTS(lhs, rhs);
  assertEquals(Array.isArray(diff), true);
  assertEquals(diff?.length, 6); // Should detect all nested differences

  // Test that differences can be applied
  const target = JSON.parse(JSON.stringify(lhs)); // deep copy
  deepDiffTS.applyDiff(target, rhs);
  assertEquals(JSON.stringify(target), JSON.stringify(rhs));
});

Deno.test("Order independent hash comprehensive testing", () => {
  // Test that hash function gives different values for different objects
  const hash = deepDiffTS.orderIndepHash;

  // Different simple types should have different hashes
  assertNotEquals(hash(1), hash(-20));
  assertNotEquals(hash("foo"), hash(45));
  assertNotEquals(hash("pie"), hash("something else"));
  assertNotEquals(hash(1.3332), hash(1));
  assertNotEquals(hash(1), hash(null));
  assertNotEquals(hash(true), hash(2));
  assertNotEquals(hash(false), hash("flooog"));

  // Different complex types should have different hashes
  assertNotEquals(hash("some string"), hash({ key: "some string" }));
  assertNotEquals(hash(1), hash([1]));
  assertNotEquals(hash("string"), hash(["string"]));
  assertNotEquals(hash(true), hash({ key: true }));

  // Different arrays should have different hashes
  assertNotEquals(hash([1, 2, 3]), hash([1, 2]));
  assertNotEquals(hash([1, 4, 5, 6]), hash(["foo", 1, true, undefined]));
  assertNotEquals(hash([1, 4, 6]), hash([1, 4, 7]));
  assertNotEquals(hash([1, 3, 5]), hash(["1", "3", "5"]));

  // Different objects should have different hashes
  assertNotEquals(hash({ key: "value" }), hash({ other: "value" }));
  assertNotEquals(hash({ a: { b: "c" } }), hash({ a: "b" }));

  // Arrays and objects should have different hashes
  assertNotEquals(hash([1, true, "1"]), hash({ a: 1, b: true, c: "1" }));

  // Pathological cases should have different hashes
  assertNotEquals(hash(undefined), hash(null));
  assertNotEquals(hash(0), hash(undefined));
  assertNotEquals(hash(0), hash(null));
  assertNotEquals(hash(0), hash(false));
  assertNotEquals(hash(0), hash([]));
  assertNotEquals(hash(""), hash([]));
  assertNotEquals(hash(3.22), hash("3.22"));
  assertNotEquals(hash(true), hash("true"));
  assertNotEquals(hash(false), hash(0));
  assertNotEquals(hash([]), hash({}));
  assertNotEquals(hash({}), hash(undefined));
  assertNotEquals(hash([]), hash([0]));

  // Order independent - same hashes for same content in different order
  assertEquals(hash([1, 2, 3]), hash([3, 2, 1]));
  assertEquals(hash(["hi", true, 9.4]), hash([true, "hi", 9.4]));
  assertEquals(
    hash({ foo: "bar", foz: "baz" }),
    hash({ foz: "baz", foo: "bar" }),
  );

  // Complex nested structures should have same hash regardless of order
  const obj1 = {
    foo: "bar",
    faz: [1, "pie", { food: "yum" }],
  };
  const obj2 = {
    faz: ["pie", { food: "yum" }, 1],
    foo: "bar",
  };
  assertEquals(hash(obj1), hash(obj2));
});

Deno.test("Order independent diff comprehensive testing", () => {
  // Simple arrays in different order should be equal
  const diff1 = deepDiffTS.orderIndependentDiff([1, 2, 3], [1, 3, 2]);
  assertEquals(diff1, undefined);

  // Arrays with repeated elements should work
  const diff2 = deepDiffTS.orderIndependentDiff([1, 1, 2], [1, 2, 1]);
  assertEquals(diff2, undefined);

  // Complex objects with arrays in different order should be equal
  const obj1 = {
    foo: "bar",
    faz: [1, "pie", { food: "yum" }],
  };
  const obj2 = {
    faz: ["pie", { food: "yum" }, 1],
    foo: "bar",
  };
  const diff3 = deepDiffTS.orderIndependentDiff(obj1, obj2);
  assertEquals(diff3, undefined);

  // Non-equal arrays should still show differences
  const diff4 = deepDiffTS.orderIndependentDiff([1, 2, 3], [2, 2, 3]);
  assertNotEquals(diff4, undefined);
  assertEquals(Array.isArray(diff4), true);
});

Deno.test("observableDiff with change application (issue #115)", () => {
  // Test observableDiff can apply changes during observation
  const thing1 = "this";
  const thing2 = "that";
  const thing3 = "other";
  const thing4 = "another";

  const oldArray = [thing1, thing2, thing3, thing4];
  const newArray = [thing1, thing2];
  const targetArray = [...oldArray]; // copy

  deepDiffTS.observableDiff(oldArray, newArray, (change: Diff) => {
    deepDiffTS.applyChange(targetArray, newArray, change);
  });

  assertEquals(targetArray, newArray);
});

Deno.test("undefined vs undefined comparison (issue #111)", () => {
  // Comparing undefined to undefined should return undefined (no differences)
  const diff = deepDiffTS(undefined, undefined);
  assertEquals(diff, undefined);
});

Deno.test("Different object types comparison", () => {
  // Test comparing different types of keyless objects
  const comparandTuples: [string, any][] = [
    ["an array", { key: [] }],
    ["an object", { key: {} }],
    ["a date", { key: new Date() }],
    ["a null", { key: null }],
    ["a regexp literal", { key: /a/ }],
    ["Math", { key: Math }],
  ];

  comparandTuples.forEach(([lhsName, lhsObj]) => {
    comparandTuples.forEach(([rhsName, rhsObj]) => {
      if (lhsName === rhsName) return;

      const diff = deepDiffTS(lhsObj, rhsObj);
      assertEquals(
        Array.isArray(diff),
        true,
        `Comparing ${lhsName} to ${rhsName} should show differences`,
      );
      assertEquals(diff?.length, 1);
      assertEquals(diff?.[0].kind, "E");
    });
  });
});

Deno.test("Regex comparison edge cases", () => {
  // Should properly compare regex instances with different flags
  const lhs = /foo/;
  const rhs = /foo/i;

  const diff = deepDiffTS(lhs, rhs);
  assertEquals(diff?.length, 1);
  assertEquals(diff?.[0].kind, "E");
  assertEquals(diff?.[0].path, undefined); // top-level comparison
  assertEquals((diff?.[0] as any).lhs, "/foo/");
  assertEquals((diff?.[0] as any).rhs, "/foo/i");
});

Deno.test("Array with nested objects (issue #124)", () => {
  // Test array containing objects with changes
  const left = { key: [{ A: 0, B: 1 }, { A: 2, B: 3 }] };
  const right = { key: [{ A: 9, B: 1 }, { A: 2, B: 3 }] };

  const differences = deepDiffTS(left, right);
  assertEquals(Array.isArray(differences), true);
  assertEquals(differences?.length, 1);
  assertEquals(differences?.[0].kind, "E");
  assertEquals(differences?.[0].path, ["key", 0, "A"]);
  assertEquals((differences?.[0] as any).lhs, 0);
  assertEquals((differences?.[0] as any).rhs, 9);
});
