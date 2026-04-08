ZenStack GraphQL Builder
========================
Automatically generate a complete GraphQL CRUD API from your [ZenStack](https://zenstack.dev) schema. 
This builder supports fetching, filtering, ordering, relations, caching, custom directives, and security constraints out of the box.

[![npm version](https://img.shields.io/npm/v/zenstack-graphql-builder.svg)](https://www.npmjs.com/package/zenstack-graphql-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Features
--------

- **🚀 Complete CRUD**: Generates `findMany`, `findUnique`, `create`, `update`, `delete`, `upsert`, etc.
- **🛡️ Security Policies**: Limit query depths (mitigation for recursive/expensive queries).
- **📝 Custom Directives**: Expose your own directives (e.g. `@upperCase`) naturally using an extensible registry.
- **🔄 Relation Operations**: Build deep nested creates, updates, and filtering intuitively.

Installation
------------

```bash
npm install zenstack-graphql-builder
# or
yarn add zenstack-graphql-builder
```

Make sure you have `graphql` and `zenstack` installed.

Quick Start
-----------

### 1\. Define your ZenStack model

```zmodel
model User {
  id String @id @default(cuid())
  email String @unique
  name String?
  posts Post[]
}

model Post {
  id String @id @default(cuid())
  title String
  content String?
  published Boolean @default(false)
  author User @relation(fields: [authorId], references: [id])
  authorId String
}
```
### 2\. Generate the GraphQL schema and resolver

```typescript
import { ZenStackGraphQLBuilder } from 'zenstack-graphql-builder';
import { ZenStackClient } from '@zenstackhq/orm';
import schema from './zenstack/schema'; // your parsed ZenStack model

// Option 1: Using ZenStackClient instance
const client = new ZenStackClient(schema);
const builder = new ZenStackGraphQLBuilder(client, {
  options: {
    maxDepth: 10,
  }
});

// Option 2: Using schema directly
const builder = new ZenStackGraphQLBuilder(schema, {
  options: {
    maxDepth: 10,
  }
});

const graphqlSchema = builder.getSchema();
const rootValue = builder.getRootResolver();

// Use with any GraphQL server (express-graphql, Apollo, etc.)
```

### 3\. Use your GraphQL API

Query example:
```graphql
query {
  user_findMany(where: { email: { contains: "example.com" } }) {
    id
    email
    posts {
      title
    }
  }
}
```
Mutation example:
```graphql
mutation {
  post_create(
    data: {
      title: "Hello World"
      author: { connect: { email: "author@example.com" } }
    }
  ) {
    id
    title
  }
}
```
Configuration
-------------

The `ZenStackGraphQLBuilder` constructor accepts two parameters:

1. **clientOrSchema**: Either a `ZenStackClient` instance or a `SchemaDef` object (required)
2. **config**: Configuration object with the following properties:

| Property | Type | Description |
| --- | --- | --- |
| `options` | `ZenStackOptions` | Security and behavior options (see below). |
| `directives` | `Record<string, DirectiveHandler>` | Map of custom directive names to resolver functions. |
| `directiveDefinitions` | `GraphQLDirective[]` | Array of GraphQL directive definitions for custom directives. |
| `scalars` | `Record<string, GraphQLScalarType>` | Custom scalar type overrides. |

### `options` (Security Policy)

```typescript
interface ZenStackGraphQLBuilderOptions {
  maxDepth?: number;        // maximum nesting depth for queries (default: 9)
  throwOnError?: boolean;   // throw on security violations instead of silently clamping (default: false)
  useBigIntScalar?: boolean; // use BigInt scalar for Int fields to preserve large integers (default: false)
}
```

Custom Directives
-----------------

You can extend the generated schema with custom directives that transform data before it is returned to the client.

### 1\. Define a directive (optional, for schema introspection)

```typescript
import { GraphQLDirective, DirectiveLocation } from 'graphql';

const upperDirective = new GraphQLDirective({
  name: 'upper',
  locations: [DirectiveLocation.FIELD],
});
```
### 2\. Implement a directive handler

```typescript
const directives = {
  upper: async (value, args, vars, fieldName) => {
    // transform the resolved value
    return typeof value === 'string' ? value.toUpperCase() : value;
  },
};
```
### 3\. Pass both to the builder

```typescript
const builder = new ZenStackGraphQLBuilder(schema, {
  directives,
  directiveDefinitions: [upperDirective],
});
```
### 4\. Use the directive in your queries
```graphql
query {
  user_findMany {
    name @upper
  }
}
```
Directive handlers receive four arguments:

-   `value` -- the resolved field value

-   `args` -- arguments passed to the directive

-   `vars` -- GraphQL operation variables

-   `fieldName` -- the name of the field being processed

Security
--------

The library includes built‑in protections to prevent abusive queries:

-   Depth limiting -- prevents excessively nested queries (default max depth = 9)

-   Argument validation -- all arguments are passed through the security policy before reaching your database

You can configure these limits via the `options` object.

Type System
-----------

The generator automatically creates all necessary GraphQL types:

-   Model object types (e.g., `User`, `Post`)

-   Filter input types (`StringFilter`, `IntFilter`, `DateTimeFilter`, ...)

-   Relation filters (`UserPostsRelationFilter`, ...)

-   Ordering inputs (`UserOrderByInput`)

-   CRUD inputs (`UserCreateInput`, `UserUpdateInput`, `UserWhereUniqueInput`, ...)

-   Aggregation types (`UserCountAggregateOutput`, etc.)

-   Enums for your model's enum fields

All Prisma‑style filter operators are supported (e.g., `equals`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `contains`, `startsWith`, `endsWith`, `mode`, `between`).

Examples
--------

### Filtering
```graphql
query {
  post_findMany(
    where: {
      title: { contains: "GraphQL" }
      published: { equals: true }
      author: { email: { endsWith: "@company.com" } }
    }
  ) {
    id
    title
    author { name }
  }
}
```
### Pagination
```graphql
query {
  post_findMany(
    take: 10
    skip: 20
    orderBy: [{ createdAt: desc }]
    cursor: { id: "prev-cursor-id" }
  ) {
    id
    title
  }
}
```
### Aggregation

```graphql
query {
  post_aggregate(
    where: { published: { equals: true } }
  ) {
    _count: { _all: true, authorId: true }
    _avg: { id: true }
  }
}
```

Aggregation results are returned as a JSON scalar containing the computed values.

### Nested mutations

```graphql
mutation {
  user_update(
    where: { id: "user-1" }
    data: {
      posts: {
        create: [{ title: "New Post" }]
        delete: [{ id: "post-2" }]
      }
    }
  ) {
    id
    posts { title }
  }
}
```

License
-------

MIT
