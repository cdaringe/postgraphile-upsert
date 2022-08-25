# postgraphile-upsert-plugin

Add postgres `upsert` mutations to [postgraphile](https://www.graphile.org/postgraphile).

[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release) [![CircleCI](https://circleci.com/gh/cdaringe/postgraphile-upsert.svg?style=svg)](https://circleci.com/gh/cdaringe/postgraphile-upsert)

## Getting Started

### Install

```bash
pnpm install --save postgraphile-upsert-plugin
```

### CLI

```bash
postgraphile --append-plugins postgraphile-upsert-plugin:PgMutationUpsertPlugin
```

See [here](https://www.graphile.org/postgraphile/extending/#loading-additional-plugins) for more information about loading plugins with PostGraphile.

### Library

```ts
import express from "express";
import { postgraphile } from "postgraphile";
import PgMutationUpsertPlugin from "postgraphile-upsert-plugin";

const app = express();

app.use(
  postgraphile(pgConfig, schema, {
    appendPlugins: [PgMutationUpsertPlugin],
  })
);

app.listen(5000);
```

## Usage

This plugin supports an optional `where` clause in your `upsert<Table>` mutation. Supports multi-column unique indexes.

## Example

```sql
create table bikes (
  id serial primary key,
  make varchar,
  model varchar
  serial_number varchar unique not null,
  weight real,
)
```

An upsert would look like this:

```graphql
mutation {
  upsertBike(
    where: { serial_number: "abc123" }
    input: {
      bike: {
        make: "kona"
        model: "kula deluxe"
        serial_number: "abc123"
        weight: 25.6
      }
    }
  ) {
    clientMutationId
  }
}
```

## Credits

- This is a typescript-ified knock off of [the original upsert plugin](https://github.com/einarjegorov/graphile-upsert-plugin/blob/master/index.js)
