# @jonwedell/api-interface

A tiny, dependency-free base class for (de)serializing API objects to and from
JSON. It recursively converts nested child classes, so a single
`from_json()` / `to_json()` call handles an entire object tree.

## Installation

```bash
npm install @jonwedell/api-interface
```

## Exports

| Name             | Description                                                        |
|------------------|--------------------------------------------------------------------|
| `APIInterface`   | Base class providing `from_json()` and `to_json()`.                |
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
console.log(alice?.to_json()); // { name: 'Alice', email: 'alice@example.com' }
```

### Nested child classes

Register nested `APIInterface` subclasses in `_childClassMap`. The property may
hold a single instance or an array — both are converted recursively. The map is
typically assigned in the constructor.

```ts
class Address extends APIInterface {
  street = '';
  city = '';
}

class Company extends APIInterface {
  name = '';
  headquarters?: Address;
  employees: Person[] = [];

  constructor() {
    super();
    this._childClassMap = { headquarters: Address, employees: Person };
  }
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

## API notes

- **`_unique_id`** — every instance gets a unique id on construction and again
  on `from_json()`. It is handy as a stable key in UI lists (e.g. Angular
  `trackBy`).
- **`_fresh`** — `true` until the instance has been populated via
  `from_json()`.
- **`_ignoreProperties`** — a list of property names to omit from `to_json()`
  output.
- Properties whose names begin with `_` are never included in `to_json()`
  output.
- If a property value is a wrapper object with its own `value` field,
  `to_json()` emits that inner `value` (convenient for form-control style
  wrappers).

## License

MIT © Jon Wedell
