/**
 * WP-19D — tiny dependency-free JSON-Schema (draft-07 subset) validator.
 *
 * Supports exactly the keywords entity-profile-v1.0.schema.json uses:
 *   type, required, properties, additionalProperties:false, enum, const,
 *   items, pattern, minimum, maximum, allOf, if/then.
 * `format` is intentionally NOT enforced — matching the registry CI validator
 * (jsonschema with no format checker). The vendored schema is the single source
 * of truth; the registry CI (full jsonschema) is the authoritative backstop.
 *
 * No new dependency (the app has no ajv); honors the migration-discipline rule
 * "no new infrastructure".
 */

export interface SchemaError {
  path: string;
  message: string;
}

type Json = unknown;
type Schema = Record<string, Json>;

function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual((a as Record<string, Json>)[k], (b as Record<string, Json>)[k]));
  }
  return false;
}

function matchesType(type: string, data: Json): boolean {
  switch (type) {
    case "object":
      return data !== null && typeof data === "object" && !Array.isArray(data);
    case "array":
      return Array.isArray(data);
    case "string":
      return typeof data === "string";
    case "boolean":
      return typeof data === "boolean";
    case "integer":
      return typeof data === "number" && Number.isInteger(data);
    case "number":
      return typeof data === "number";
    case "null":
      return data === null;
    default:
      return true;
  }
}

export function validate(schema: Schema, data: Json, path = ""): SchemaError[] {
  const errors: SchemaError[] = [];

  if ("const" in schema && !deepEqual(data, schema.const)) {
    errors.push({ path: path || "(root)", message: `must equal ${JSON.stringify(schema.const)}` });
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((e) => deepEqual(e, data))) {
    errors.push({ path: path || "(root)", message: `must be one of ${JSON.stringify(schema.enum)}` });
  }

  if (typeof schema.type === "string" && !matchesType(schema.type, data)) {
    errors.push({ path: path || "(root)", message: `must be of type ${schema.type}` });
    return errors; // type mismatch: deeper checks would be noise
  }

  // object
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, Json>;
    const props = (schema.properties as Record<string, Schema> | undefined) ?? undefined;

    if (Array.isArray(schema.required)) {
      for (const req of schema.required as string[]) {
        if (!(req in obj)) errors.push({ path: `${path}/${req}`, message: "is required" });
      }
    }

    for (const key of Object.keys(obj)) {
      const childPath = `${path}/${key}`;
      if (props && key in props) {
        errors.push(...validate(props[key], obj[key], childPath));
      } else if (schema.additionalProperties === false) {
        errors.push({ path: childPath, message: "additional property is not allowed" });
      }
    }
  }

  // array
  if (Array.isArray(data) && schema.items) {
    const itemSchema = schema.items as Schema;
    data.forEach((item, i) => errors.push(...validate(itemSchema, item, `${path}/${i}`)));
  }

  // string constraints
  if (typeof data === "string" && typeof schema.pattern === "string") {
    if (!new RegExp(schema.pattern).test(data)) {
      errors.push({ path: path || "(root)", message: `must match pattern ${schema.pattern}` });
    }
  }

  // number constraints
  if (typeof data === "number") {
    if (typeof schema.minimum === "number" && data < schema.minimum) {
      errors.push({ path: path || "(root)", message: `must be >= ${schema.minimum}` });
    }
    if (typeof schema.maximum === "number" && data > schema.maximum) {
      errors.push({ path: path || "(root)", message: `must be <= ${schema.maximum}` });
    }
  }

  // allOf
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf as Schema[]) {
      errors.push(...validate(sub, data, path));
    }
  }

  // if / then  (entity-profile uses: if status==claimed_verified then require canonVersion)
  if (schema.if && typeof schema.if === "object") {
    const condOk = validate(schema.if as Schema, data, path).length === 0;
    if (condOk && schema.then && typeof schema.then === "object") {
      errors.push(...validate(schema.then as Schema, data, path));
    }
  }

  return errors;
}

export function isValid(schema: Schema, data: Json): boolean {
  return validate(schema, data).length === 0;
}
