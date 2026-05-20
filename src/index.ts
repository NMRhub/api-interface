/**
 * Serialize an array of {@link APIInterface} instances to plain JSON objects.
 *
 * Returns an empty array when given `null` or `undefined`.
 */
export function JSONify_array(list: APIInterface[] | undefined | null) {
  if (list === undefined || list === null) {
    return [];
  }
  const results = [];
  for (const instance of list) {
    results.push(instance.to_json());
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
   * deserialize them. Values may be single instances or arrays.
   */
  _childClassMap?: {};
  /** Property names that should be omitted from {@link to_json} output. */
  _ignoreProperties?: string[];
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
   * Returns `undefined` when `json` is `null`/`undefined`, otherwise returns
   * `this`. Properties listed in {@link _childClassMap} are recursively
   * converted into the appropriate `APIInterface` subclass.
   */
  from_json(json: object | null | undefined): undefined | APIInterface {
    if (json === null || json === undefined) {
      return undefined;
    }
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
        const childClass = (this._childClassMap as Record<string, new () => APIInterface>)[propName];
        if (Array.isArray(self[propName])) {
          self[propName] = list_from_JSON(self[propName] as object[], childClass);
        } else {
          self[propName] = new childClass().from_json(self[propName] as object);
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
   * recursively serialized.
   */
  to_json(): object {
    const result: Record<string, unknown> = {};
    const self = this as unknown as Record<string, unknown>;

    for (const propName of Object.keys(this)) {
      // Convert child classes
      if (this._childClassMap !== undefined && propName in this._childClassMap) {
        if (Array.isArray(self[propName])) {
          result[propName] = JSONify_array(self[propName] as APIInterface[]);
        } else {
          if (self[propName] == null) {
            result[propName] = null;
          } else {
            result[propName] = (self[propName] as APIInterface).to_json();
          }
        }
        // Convert other object properties, skipping ones on the ignore list
      } else {
        if (propName.substring(0, 1) !== '_' && (!this._ignoreProperties?.includes(propName))) {
          const value = self[propName];
          const valueObj = value as {value?: unknown};
          if (value && valueObj.value) {
            result[propName] = valueObj.value;
          } else {
            result[propName] = value;
          }
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
export function list_from_JSON(sourceData: object[] | undefined | null,
                               classType: new () => APIInterface,
                               modifierCallback: Function | undefined = undefined) {
  if (sourceData === undefined || sourceData === null) {
    return [];
  }
  const result: object[] = [];
  for (const item of sourceData) {
    const instance = new classType();
    if (!instance['from_json']) {
      console.trace(`You have a bug in your code - one of your class definitions - ${classType} - doesn't extend APIInterface.`);
      throw `You have a bug in your code - one of your class definitions - ${classType} - doesn't extend APIInterface.`;
    }
    const populated = instance.from_json(item) as APIInterface;
    if (modifierCallback) {
      modifierCallback(populated);
    }
    result.push(populated);
  }
  return result;
}
