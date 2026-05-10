# @ziro-agent/openapi

Generate `defineTool` instances from an OpenAPI 3.x document ([RFC 0010](../../rfcs/0010-openapi-tools.md)).

## Supported slice

- Operations with **`operationId`** on each verb you emit.
- **GET**, **POST**, **PUT**, **PATCH**, **DELETE**, **HEAD** (lowercase keys under `paths`).
- **Path-level `parameters`** merged into each operation; operation parameters **override** path parameters on the same `in` + `name`.
- **Query** + **path** `{param}` substitution.
- **`application/json`** bodies with **`type: object`** (inline or **`#/components/schemas/...`** via **`$ref`**).
- **`requestBody: { $ref: '#/components/requestBodies/...' }`** resolved against `components.requestBodies`.
- **`bearerToken`** → `Authorization: Bearer …`
- Non–safe verbs set **`mutates: true`** (RFC C1).

Not supported yet: `allOf` / `oneOf`, **multipart**, OAuth flows, external `$ref` URLs.

```ts
import { toolsFromOpenAPISpec } from '@ziro-agent/openapi';

const tools = toolsFromOpenAPISpec(spec, {
  baseUrl: 'https://api.example.com',
  bearerToken: process.env.API_TOKEN,
});
```

```ts
import { toolsFromOpenAPIUrl } from '@ziro-agent/openapi';

const tools = await toolsFromOpenAPIUrl('https://example.com/openapi.json', {
  baseUrl: 'https://api.example.com',
});
```
