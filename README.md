# deep-diff

A modern TypeScript/Deno implementation of the deep object difference algorithm,
providing utilities for determining structural differences between objects and
applying those differences.

This is a complete rewrite of the original
[deep-diff](https://github.com/flitbit/diff) library, modernized for TypeScript
and Deno while maintaining full compatibility with the legacy API.

## Features

- 🔍 **Deep comparison** - Find structural differences between objects
- 👀 **Observable differences** - React to changes as they're discovered
- 🔄 **Apply changes** - Transform objects by applying differences
- 🎯 **Selective application** - Apply only specific changes with filters
- 📊 **Order-independent comparison** - Compare arrays regardless of element
  order
- 🔒 **Type-safe** - Full TypeScript support with comprehensive type definitions
- 🚀 **Modern runtime** - Built for Deno with ES modules

## Installation

### Deno

```typescript
import deepDiff from "jsr:@fry69/deep-diff";
```

### Node.js (via JSR)

```bash
npx jsr add @fry69/deep-diff
```

```typescript
import deepDiff from "@fry69/deep-diff";
```

## Quick Start

### Basic Usage

```typescript
import deepDiff from "jsr:@fry69/deep-diff";

const oldObj = {
  name: "John",
  age: 30,
  hobbies: ["reading", "gaming"],
};

const newObj = {
  name: "John",
  age: 31,
  hobbies: ["reading", "gaming", "cooking"],
  city: "New York",
};

// Find differences
const differences = deepDiff(oldObj, newObj);
console.log(differences);
/*
[
  { kind: "E", path: ["age"], lhs: 30, rhs: 31 },
  { kind: "A", path: ["hobbies"], index: 2, item: { kind: "N", rhs: "cooking" } },
  { kind: "N", path: ["city"], rhs: "New York" }
]
*/
```

### Applying Changes

```typescript
import deepDiff from "jsr:@fry69/deep-diff";

const source = { name: "Alice", score: 100 };
const target = { name: "Alice", score: 95, level: 1 };

// Apply all differences from target to source
deepDiff.applyDiff(source, target);
console.log(source); // { name: "Alice", score: 95, level: 1 }

// Or apply individual changes
const changes = deepDiff(source, target);
changes?.forEach((change) => {
  deepDiff.applyChange(source, target, change);
});
```

## API Reference

### Main Functions

#### `deepDiff(lhs, rhs, prefilter?, accumulator?)`

Compare two objects and return their differences.

- `lhs` - Left-hand side object (original)
- `rhs` - Right-hand side object (comparison)
- `prefilter` - Optional function to filter which properties to compare
- `accumulator` - Optional array to collect differences

Returns an array of differences or `undefined` if objects are identical.

#### `deepDiff.observableDiff(lhs, rhs, observer?, prefilter?)`

Compare objects and call observer function for each difference found.

#### `deepDiff.applyChange(target, source, change)`

Apply a single change to the target object.

#### `deepDiff.applyDiff(target, source, filter?)`

Apply all differences from source to target, optionally filtered.

#### `deepDiff.orderIndependentDiff(lhs, rhs, prefilter?)`

Compare objects treating arrays as order-independent sets.

### Difference Types

Each difference has a `kind` property indicating the type of change:

- **`N`** (New) - A property was added
- **`D`** (Deleted) - A property was removed
- **`E`** (Edited) - A property value changed
- **`A`** (Array) - An array element changed

### Advanced Usage

#### Filtering Changes

```typescript
// Only compare specific properties
const prefilter = (path: any[], key: any) => key !== "timestamp";
const diff = deepDiff(obj1, obj2, prefilter);

// Apply only certain types of changes
const filter = (target, source, change) => change.kind !== "D"; // Skip deletions
deepDiff.applyDiff(target, source, filter);
```

#### Order-Independent Array Comparison

```typescript
const arr1 = [{ id: 1 }, { id: 2 }, { id: 3 }];
const arr2 = [{ id: 3 }, { id: 1 }, { id: 2 }]; // Same elements, different order

const normalDiff = deepDiff(arr1, arr2); // Shows differences
const orderIndepDiff = deepDiff.orderIndependentDiff(arr1, arr2); // undefined (no differences)
```

## Migration from Legacy deep-diff

This implementation maintains full API compatibility with the original deep-diff
library. Simply replace your import and the code should work identically:

```typescript
// Before
const diff = require("deep-diff");

// After
import deepDiff from "jsr:@fry69/deep-diff";
const diff = deepDiff; // Full compatibility
```

## License

MIT

## History

This is a modern TypeScript rewrite of the original
[deep-diff](https://github.com/flitbit/diff) library by Phillip Clark. The
original algorithm and behavior have been faithfully preserved while adding
TypeScript support and modernizing the codebase for current JavaScript runtimes.
