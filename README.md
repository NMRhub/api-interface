# @jonwedell/api-interface

A tiny, dependency-free base class for (de)serializing API objects to and from
JSON. It recursively converts nested child classes, so a single
`from_json()` / `toJSON()` call handles an entire object tree.

## Installation

```bash
npm install @jonwedell/api-interface
```

## Exports

| Name             | Description                                                        |
|------------------|--------------------------------------------------------------------|
| `APIInterface`   | Base class providing `from_json()` and `toJSON()`.                 |
| `list_from_JSON` | Deserialize an array of JSON objects into `APIInterface` instances. |
| `JSONify_array`  | Serialize an array of `APIInterface` instances to plain objects.    |
| `getUUID`        | Return a UUID string (`crypto.randomUUID()` with a fallback).       |

## Usage

Extend `APIInterface` and declare your data properties as fields. Plain
properties are copied verbatim; no extra wiring is needed.

```ts
import { APIInterface, list_from_JSON } from '@jonwedell/api-interface';

class Person extends APIInterface {
  name = '';
  email = '';
}

const alice = new Person().from_json({ name: 'Alice', email: 'alice@example.com' });
console.log(alice?.toJSON()); // { name: 'Alice', email: 'alice@example.com' }
```

### Nested child classes

Register nested `APIInterface` subclasses in `_childClassMap`. The property may
hold a single instance or an array — both are converted recursively. Declare the
map as a class field initializer; there is no need to write a constructor for it.

```ts
class Address extends APIInterface {
  street = '';
  city = '';
}

class Company extends APIInterface {
  _childClassMap = { headquarters: Address, employees: Person };

  name = '';
  headquarters?: Address;
  employees: Person[] = [];
}

const company = new Company().from_json({
  name: 'Acme',
  headquarters: { street: '1 Main St', city: 'Springfield' },
  employees: [{ name: 'Alice', email: 'alice@example.com' }],
});
// company.headquarters is an Address instance,
// company.employees is an array of Person instances.
```

### Deserializing arrays directly

```ts
const people = list_from_JSON(
  [{ name: 'Alice' }, { name: 'Bob' }],
  Person,
);
// people is Person[]
```

`list_from_JSON` accepts an optional third argument, a callback invoked with
each populated instance for post-processing.

### Customizing deserialization

A subclass can override `from_json()` to run extra logic after the base class
has populated the instance. Call `super.from_json(json)` first, then derive any
computed fields from the populated result:

```ts
class Category extends APIInterface {
  _childClassMap = { subcategories: Subcategory };

  subcategories: Subcategory[] = [];
  _allSubcategoryIds: number[] = [];

  from_json(json: object | null | undefined): this | null | undefined {
    const populated = super.from_json(json);
    if (populated) {
      populated._allSubcategoryIds = populated.subcategories.flatMap(
        (s) => s._allSubcategoryIds,
      );
    }
    return populated;
  }
}
```

`from_json()` has a `this`-polymorphic return type, so `super.from_json()`
returns the subclass instance directly — no cast is needed to reach
`populated.subcategories`. It returns the input unchanged (`null` or
`undefined`) when given `null`/`undefined`, so guard the result before touching
it.

## API notes

- The serializer is named `toJSON()`, so `JSON.stringify(instance)` produces the
  same output as calling `instance.toJSON()` directly.
- **`_unique_id`** — every instance gets a unique id on construction and again
  on `from_json()`. It is handy as a stable key in UI lists (e.g. Angular
  `trackBy`).
- **`_fresh`** — `true` until the instance has been populated via
  `from_json()`.
- **`_parent`** — set during `from_json()` on every child registered in a
  `_childClassMap`, pointing back at the instance that owns it. It is `null`
  for a top-level instance. Like all `_`-prefixed properties it is never
  serialized.
- **`_ignoreProperties`** — a list of property names to omit from `toJSON()`
  output. Declare it as a class field, the same way as `_childClassMap`
  (e.g. `_ignoreProperties = ['unique_sequence'];`).
- Properties whose names begin with `_` are never included in `toJSON()`
  output.
- If a property value is a wrapper object with its own `value` field,
  `toJSON()` emits that inner `value` (convenient for form-control style
  wrappers).
- Empty-string property values are serialized as `null`.

## License

MIT © UConn Health
