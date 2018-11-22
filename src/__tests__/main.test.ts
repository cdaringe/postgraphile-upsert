import { container, DbContext } from './fixture/db'
import { createPool } from './fixture/client'
import { createServer, Server } from 'http'
import { freeport } from './fixture/freeport'
import { PgMutationUpsertPlugin } from '../postgraphile-upsert'
import { Pool } from 'pg'
import { postgraphile } from 'postgraphile'
import ava, { TestInterface } from 'ava'
import bluebird from 'bluebird'
import nanographql = require('nanographql')

const fetch = require('node-fetch')

const test = ava as TestInterface<
  DbContext & {
    client: Pool
    server: Server
    serverPort: number
  }
>

test.beforeEach(async t => {
  await container.setup(t.context)
  await bluebird.delay(5000)
  t.context.client = await createPool(t.context.dbConfig)
  t.context.client.on('error', err => {})
  await t.context.client.query(`
create table bikes (
  id serial,
  weight real,
  make varchar,
  model varchar,
  primary key (id)
)
  `)
  const middleware = postgraphile(t.context.client, 'public', {
    graphiql: true,
    appendPlugins: [PgMutationUpsertPlugin]
  })
  const serverPort = await freeport()
  t.context.serverPort = serverPort
  t.context.server = createServer(middleware).listen(serverPort)
})

test.afterEach(async t => {
  t.context.client.end()
  t.context.server.close()
  await container.teardown(t.context)
})

const all = async t => {
  const query = nanographql`
    query {
      allBikes {
        edges {
          node {
            id
            make
            model
          }
        }
      }
    }
  `
  const res = await fetch(`http://localhost:${t.context.serverPort}/graphql`, {
    body: query(),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })
  return res.json()
}

const create = async t => {
  const query = nanographql`
    mutation {
      upsertBike(input: {
        bike: {
          weight: 25.6
          make: "kona"
          model: "cool-ie deluxe"
        }
      }) {
        clientMutationId
      }
    }
  `
  await fetch(`http://localhost:${t.context.serverPort}/graphql`, {
    body: query(),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })
}

test('test upsert crud', async t => {
  await create(t)
  const res = await all(t)
  t.is(res.data.allBikes.edges.length, 1)
  t.is(res.data.allBikes.edges[0].node.make, 'kona')
})
