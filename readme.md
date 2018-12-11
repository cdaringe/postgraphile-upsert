# postgraphile-upsert-plugin

add postgres `upsert` mutations to [postgraphile](https://www.graphile.org/postgraphile)

[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com) [![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release) [![Greenkeeper badge](https://badges.greenkeeper.io/cdaringe/postgraphile-upsert.svg)](https://greenkeeper.io/)

## install

`yarn add postgraphile-upsert`

## usage

```ts
import { PgMutationUpsertPlugin } from 'postgraphile-upsert'

postgraphile(pgClient, 'yourSchema', {
  appendPlugins: [PgMutationUpsertPlugin as any]
})
```

fire open `PostGraphiQL` and look for `mutation { upsert<ModelName> { ... } }`

this is a typescript-ified knock off of [the original upsert plugin](https://github.com/einarjegorov/graphile-upsert-plugin/blob/master/index.js)
