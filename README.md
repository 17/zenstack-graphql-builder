ZenStack GraphQL Builder
========================

Automatically generate a complete GraphQL CRUD API from your [ZenStack](https://zenstack.dev/) schema. This library builds a fully typed GraphQL schema and resolver map that mirrors Prisma's CRUD operations, including support for relations, filtering, sorting, pagination, aggregations, and custom directives.

Features
--------

-   🔄 Full CRUD -- Generates `Query` and `Mutation` fields for all models: `findUnique`, `findFirst`, `findMany`, `create`, `update`, `delete`, `upsert`, `aggregate`, `groupBy`, `exists`, and more.

-   🔗 Relations -- Automatically resolves nested relations and provides filter/order arguments for to-many fields.

-   🎛 Rich Filtering -- Creates `WhereInput` types with field‑specific filters (`equals`, `contains`, `gt`, `in`, `between`, ...) and relation filters (`every`/`some`/`none`).

-   📊 Aggregations -- Supports `count`, `avg`, `sum`, `min`, `max` aggregates and groupBy queries.

-   🧩 Custom Scalars -- Includes `DateTime`, `Json`, `BigInt`, `Bytes`, `Decimal`, and a safe `JSONInt` scalar that prevents 53‑bit precision loss.

-   🛡 Security Limits -- Enforce maximum `take`/`limit` values and query depth to protect your server.

-   🧪 Directives -- Define and apply custom directives (e.g., `@upperCase`) to transform field values after resolution.

Installation
------------

```bash
npm install zenstack-graphql-builder graphql
```

Make sure `graphql` is installed as a peer dependency.

Quick Start
-----------

### 1\. Define your ZenStack schema

```zmodel
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  posts     Post[]
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
}
```

### 2\. Build the GraphQL schema and resolvers

```typescript
import { ZenStackGraphQLBuilder } from 'zenstack-graphql-builder';
import { schema as zenSchema } from './path-to-your-zenstack-schema';

const builder = new ZenStackGraphQLBuilder({
  schema: zenSchema,
  options: {
    maxTake: 100,
    maxDepth: 10
  },
  directives,
  directiveDefinitions,
  // optionally filter which CRUD operations to generate
  operations: ['findMany', 'create', 'update', 'delete'],
});

const schema = builder.getSchema();
const rootValue = builder.getRootResolver();

// Now you can use `schema` and `rootValue` with any GraphQL server (e.g., express-graphql, Apollo Server)
```

### 3\. Use in your GraphQL server

Example with `express-graphql`:

```typescript
import express from 'express';
import { createHandler } from 'graphql-http/lib/use/express';
import { ZenStackClient } from '@zenstackhq/orm';
import { SqliteDialect } from '@zenstackhq/orm/dialects/sqlite';

const db = new ZenStackClient(schema, {
  dialect: new SqliteDialect({
    database: new SQLite('./test.db'),
  }),
});

const app = express();

app.use(
  '/graphql',
  createHandler({
    schema,
    rootValue,
    context: {
      client: db,                 // the ZenStack Client
      options: { maxTake: 50 },   // per‑request security overrides
    }
  })
);

app.listen(4000);
```

API Reference
-------------

### `ZenStackGraphQLBuilder` constructor

```typescript
new ZenStackGraphQLBuilder({
  schema: ZenSchemaDef;
  options?: BuilderOptions;
  directives?: Record<string, DirectiveHandler>;
  directiveDefinitions?: GraphQLDirective[];
  operations?: string[];
  scalars?: Record<string, GraphQLScalarType>;
});
```
#### Parameters

| Param | Type | Description |
| --- | --- | --- |
| `schema` | `ZenSchemaDef` | The ZenStack schema definition object (usually exported from your `.zmodel` compilation). |
| `options` | `BuilderOptions` | Configuration for security and scalar handling (see below). |
| `directives` | `Record<string, DirectiveHandler>` | A map of directive names to resolver functions. Each function receives `(value, args, variableValues, fieldName)` and should return the transformed value (can be async). |
| `directiveDefinitions` | `GraphQLDirective[]` | Array of `GraphQLDirective` instances for schema introspection (e.g., for GraphQL playground to show the directives). |
| `operations` | `string[]` | List of CRUD operations to include. Defaults to all operations (see `AllCrudOperations` in the code). |
| `scalars` | `Record<string, GraphQLScalarType>` | Override or add custom scalar implementations. |

#### `BuilderOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxTake` | `number` | `100` | Maximum allowed value for `take`/`limit` arguments. |
| `maxDepth` | `number` | `9` | Maximum allowed depth of nested selections. |
| `throwOnError` | `boolean` | `false` | If `true`, throws an error when security limits are exceeded; otherwise silently caps the value. |
| `useJSONIntScalar` | `boolean` | `false` | If `true`, uses a custom `JSONInt` scalar for `Int` fields, which safely serialises BigInt values that exceed 53 bits as strings. |

### Methods

#### `getSchema(): GraphQLSchema`

Returns the generated GraphQL schema.

#### `getRootResolver(): Record<string, Function>`

Returns an object containing resolver functions for all generated Query and Mutation fields. Each resolver accepts `(args, context, info)` and:

-   Validates arguments against security limits.

-   Parses the GraphQL selection set into a Prisma `select` object and a transformation plan.

-   Calls the corresponding Prisma client method (using `context.client[model][operation]`).

-   Applies any directives to the result before returning.

Custom Directives
-----------------

To add a custom directive, you need to:

1.  Define the directive in your schema (if you want it to appear in introspection) and pass it via `directiveDefinitions`.

2.  Provide an implementation in the `directives` map.

Example:

```typescript
// directive definition
import { GraphQLDirective, DirectiveLocation } from 'graphql';

const maskDirective = new GraphQLDirective({
  name: 'mask',
  locations: [DirectiveLocation.FIELD],
  args: {
    start: { type: GraphQLInt },
    end: { type: GraphQLInt },
  },
});

// handler
const directives = {
  mask: async (value, args) => {
    if (typeof value !== 'string') return value;
    const start = args.start ?? 0;
    const end = args.end ?? value.length;
    return '*'.repeat(start) + value.slice(start, end);
  },
};

// pass to builder
new ZenStackGraphQLBuilder({
  schema,
  directives,
  directiveDefinitions: [maskDirective],
});
```
Now you can use `@mask` in your GraphQL queries:

```graphql

query {
  user_findMany {
    email @mask(start: 2, end: 5)
  }
}
```
Security Limits
---------------

The builder automatically enforces:

-   Maximum `take`/`limit` -- Prevents clients from requesting too many records at once.

-   Maximum query depth -- Protects against deeply nested queries that could overload the database.

You can configure these globally via `options` and override them per request via `context.options`.

Custom Scalars
--------------

The builder includes several common scalars out of the box:

| Scalar | Description |
| --- | --- |
| `DateTime` | ISO‑8601 date/time strings. |
| `Json` | Arbitrary JSON values. |
| `BigInt` | BigInt values (serialized as strings). |
| `Bytes` | Base64‑encoded binary data. |
| `Decimal` | High‑precision decimal numbers (using `decimal.js`). |
| `JSONInt` | A 53‑bit safe integer scalar (falls back to string for larger values). |

You can override any scalar by passing a custom `GraphQLScalarType` in the `scalars` option.

License
-------

MIT