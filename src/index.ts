/** Constructor for an {@link APIInterface} subclass, callable with no arguments. */
export type APIInterfaceConstructor<T extends APIInterface = APIInterface> = new () => T;

/**
 * Serialize an array of {@link APIInterface} instances to plain JSON objects.
 *
 * Returns an empty array when given `null` or `undefined`. Any element that
 * lacks a `toJSON()` method is pushed through unchanged and an error is logged,
 * since that usually indicates a misconfigured `_childClassMap`.
 */
export function JSONify_array(list: APIInterface[] | undefined | null): unknown[] {
  if (list === undefined || list === null) {
    return [];
  }
  const results: unknown[] = [];
  for (const instance of list) {
    if (typeof instance.toJSON !== 'undefined') {
      results.push(instance.toJSON());
    } else {
      results.push(instance);
      console.error('Asked to serialize something which should implement APIInterface but does not. ' +
        'This may indicate an invalid _childClassMap.', instance);
    }
  }
  return results;
}

/**
 * Return a UUID string, using `crypto.randomUUID()` when available and
 * falling back to a (non-cryptographic) random string otherwise.
 */
export function getUUID(): string {
  if (crypto.randomUUID !== undefined) {
    return crypto.randomUUID();
  } else {
    return Math.random().toString(36) + Math.random().toString(36) + Math.random().toString(36);
  }
}

/**
 * Base class for objects that can be (de)serialized to and from JSON returned
 * by an API.
 *
 * Subclasses declare their plain data properties as fields. Properties whose
 * values are themselves `APIInterface` subclasses (or arrays of them) should be
 * registered in {@link _childClassMap} so they are recursively converted.
 */
export class APIInterface {
  /**
   * Maps property names to the `APIInterface` subclass constructor used to
   * deserialize them. The property itself may hold a single instance or an
   * array of them; either way the registered constructor is used per element.
   */
  _childClassMap?: Record<string, APIInterfaceConstructor>;
  /** Property names that should be omitted from {@link toJSON} output. */
  _ignoreProperties?: string[];
  /**
   * The instance that registered this one as a child, set during
   * {@link from_json}. `null` for a top-level instance (one populated directly
   * rather than as a child of another `APIInterface`).
   */
  _parent?: APIInterface | null;
  /** `true` until the instance has been populated via {@link from_json}. */
  _fresh: boolean;
  /** A per-instance unique id, useful as a stable key in UI lists. */
  _unique_id: string;

  constructor() {
    this._fresh = true;
    this._unique_id = getUUID();
  }

  /**
   * Populate this instance from a plain JSON object.
   *
   * Returns the input unchanged when `json` is `null`/`undefined`, otherwise
   * returns `this`. Properties listed in {@link _childClassMap} are recursively
   * converted into the appropriate `APIInterface` subclass, and each converted
   * child has its {@link _parent} set to this instance.
   */
  from_json(json: object | null | undefined): this | null | undefined {
    if (json === null || json === undefined) {
      return json;
    }
    this._parent = null;
    this._unique_id = getUUID();

    // This metacode doesn't know what properties a given object will have, so
    // index access goes through generic Record views of the instance and source.
    const self = this as unknown as Record<string, unknown>;
    const source = json as Record<string, unknown>;

    for (const propName of Object.keys(json)) {
      // Assume it's a basic object type
      self[propName] = source[propName];
      // Convert child classes
      if (this._childClassMap !== undefined && propName in this._childClassMap) {
        const childClass = this._childClassMap[propName];
        if (Array.isArray(self[propName])) {
          self[propName] = list_from_JSON(self[propName] as object[], childClass);
          for (const child of self[propName] as APIInterface[]) {
            if (child instanceof childClass) {
              child._parent = this;
            }
          }
        } else {
          self[propName] = new childClass().from_json(self[propName] as object);
          const child = self[propName];
          if (child instanceof childClass) {
            (child as APIInterface)._parent = this;
          }
        }
      }
    }
    this._fresh = false;
    return this;
  }

  /**
   * Serialize this instance to a plain JSON object.
   *
   * Properties beginning with `_` and those listed in {@link _ignoreProperties}
   * are skipped. Child classes registered in {@link _childClassMap} are
   * recursively serialized. Plain `''` values are emitted as `null`.
   *
   * Named `toJSON` so that `JSON.stringify()` picks it up automatically.
   */
  toJSON(): object {
    const result: Record<string, unknown> = {};
    const self = this as unknown as Record<string, unknown>;

    for (const propName of Object.keys(this)) {
      // Properties beginning with `_` are never serialized.
      if (propName.substring(0, 1) === '_') {
        continue;
      }
      // Skip properties on the ignore list.
      if (this._ignoreProperties?.includes(propName)) {
        continue;
      }

      // Convert child classes
      if (this._childClassMap !== undefined && propName in this._childClassMap) {
        if (Array.isArray(self[propName])) {
          result[propName] = JSONify_array(self[propName] as APIInterface[]);
        } else if (self[propName] == null) {
          result[propName] = null;
        } else {
          try {
            result[propName] = (self[propName] as APIInterface).toJSON();
          } catch {
            throw `${this.constructor.name}.${propName} does not extend APIInterface or implement a toJSON function`;
          }
        }
        // Convert other object properties
      } else {
        const value = self[propName];
        const valueObj = value as {value?: unknown};
        if (value && valueObj.value) {
          // Unwrap form-control style wrappers that carry their own `value`.
          result[propName] = valueObj.value;
        } else if (value === '') {
          // Emit empty strings as null.
          result[propName] = null;
        } else {
          result[propName] = value;
        }
      }
    }

    return result;
  }

}

/**
 * Deserialize an array of plain JSON objects into instances of `classType`.
 *
 * Returns an empty array when `sourceData` is `null`/`undefined`. The optional
 * `modifierCallback` is invoked with each populated instance, allowing extra
 * post-processing.
 *
 * @throws when `classType` does not extend {@link APIInterface}.
 */
export function list_from_JSON<T extends APIInterface>(
  sourceData: object[] | undefined | null,
  classType: APIInterfaceConstructor<T>,
  modifierCallback?: (instance: T) => void,
): T[] {
  if (sourceData === undefined || sourceData === null) {
    return [];
  }
  const result: T[] = [];
  for (const item of sourceData) {
    const instance = new classType();
    if (!instance['from_json']) {
      console.trace(`You have a bug in your code - one of your class definitions - ${classType} - doesn't extend APIInterface.`);
      throw `You have a bug in your code - one of your class definitions - ${classType} - doesn't extend APIInterface.`;
    }
    const populated = instance.from_json(item) as T;
    if (modifierCallback) {
      modifierCallback(populated);
    }
    result.push(populated);
  }
  return result;
}
