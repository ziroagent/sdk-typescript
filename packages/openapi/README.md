# @ziro-agent/openapi

Generate `defineTool` instances from an OpenAPI 3.x document.

**Current scope (v0.1):** `GET` operations with `operationId` and `query` parameters only. See [RFC 0010](../../rfcs/0010-openapi-tools.md) for the full v0.3 plan.

```ts
import { toolsFromOpenAPIUrl } from '@ziro-agent/openapi';

const tools = await toolsFromOpenAPIUrl('https://petstore.swagger.io/v2/swagger.json', {
  baseUrl: 'https://petstore.swagger.io/v2',
});
```
