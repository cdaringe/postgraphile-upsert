# postgraphile-upsert-plugin

Add postgres `upsert` mutations to [postgraphile](https://www.graphile.org/postgraphile).

[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com) [![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release) [![Greenkeeper badge](https://badges.greenkeeper.io/cdaringe/postgraphile-upsert.svg)](https://greenkeeper.io/) [![CircleCI](https://circleci.com/gh/cdaringe/postgraphile-upsert.svg?style=svg)](https://circleci.com/gh/cdaringe/postgraphile-upsert)

## Getting Started

### Install

```bash
yarn add @fullstackio/postgraphile-upsert-plugin
```

### CLI

```bash
postgraphile --append-plugins @fullstackio/postgraphile-upsert-plugin:PgMutationUpsertPlugin
```

See [here](https://www.graphile.org/postgraphile/extending/#loading-additional-plugins) for
more information about loading plugins with PostGraphile.

### Library

```js
const express = require("express");
const { postgraphile } = require("postgraphile");
const {
  PgMutationUpsertPlugin
} = require("@fullstackio/postgraphile-upsert-plugin");

const app = express();

app.use(
  postgraphile(pgConfig, schema, {
    appendPlugins: [PgMutationUpsertPlugin]
  })
);

app.listen(5000);
```

## Usage

This plugin creates an addition operation to `upsert<Table>` using a `where` clause, which is any unique constraint on the table. Supports multi-column unique indexes.

## Example

```sql
create table bikes (
  id serial PRIMARY KEY,
  "serialNumber" varchar UNIQUE NOT NULL,
  weight real,
  make varchar,
  model varchar
)
```

An upsert would look like this:

```graphql
mutation {
  upsertBike(
    where: { serialNumber: "abc123" }
    input: {
      bike: {
        serialNumber: "abc123"
        weight: 25.6
        make: "kona"
        model: "cool-ie deluxe"
      }
    }
  ) {
    clientMutationId
  }
}
```

## Credits

- This is a fork of the TypeScript [postgraphile-upsert-plugin](https://github.com/cdaringe/postgraphile-upsert)
- Which itself is a fork of [the original upsert plugin](https://github.com/einarjegorov/graphile-upsert-plugin/blob/master/index.js)
