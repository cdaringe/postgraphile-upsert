import { container, DbContext } from './fixture/db' // eslint-disable-line no-unused-vars
import { createPool } from './fixture/client'
import { createServer, Server } from 'http' // eslint-disable-line no-unused-vars
import { freeport } from './fixture/freeport'
import { PgMutationUpsertPlugin } from '../postgraphile-upsert'
import { Pool } from 'pg' // eslint-disable-line no-unused-vars
import { postgraphile } from 'postgraphile'
import ava, { TestInterface } from 'ava' // eslint-disable-line no-unused-vars
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
  t.context.client.on('error', err => {}) // eslint-disable-line
  await t.context.client.query(`
create table bikes (
    id serial PRIMARY KEY,
    "serialNumber" varchar UNIQUE NOT NULL,
    weight real,
    make varchar,
    model varchar
  )`)
  await t.context.client.query(`
create table roles (
  id serial PRIMARY KEY,
  project varchar,
  title varchar,
  name varchar,
  rank integer,
  unique (project, title)
)
  `)

  await postgraphile(t.context.client, 'public', {
    appendPlugins: [PgMutationUpsertPlugin],
    exportGqlSchemaPath: './postgraphile.graphql'
  })

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

const exec = async (t, query) => {
  const res = await fetch(`http://localhost:${t.context.serverPort}/graphql`, {
    body: query(),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })
  return res.json()
}

test('test upsert crud', async t => {
  const all = async t => {
    const query = nanographql`
    query {
      allBikes(orderBy: SERIAL_NUMBER_ASC) {
        edges {
          node {
            id
            serialNumber
            make
            model
          }
        }
      }
    }
  `
    return exec(t, query)
  }

  const create1 = async t => {
    const query = nanographql`
    mutation {
      upsertBike(where: {
        serialNumber: "abc123"
      }, 
      input: {
        bike: {
          serialNumber: "abc123"
          weight: 25.6
          make: "kona"
          model: "cool-ie deluxe"
        }
      }) {
        clientMutationId
      }
    }
  `
    return exec(t, query)
  }

  const create2 = async t => {
    const query = nanographql`
    mutation {
      upsertBike(where: {
        serialNumber: "def456"
      }, 
      input: {
        bike: {
          serialNumber: "def456"
          weight: 25.6
          make: "honda"
          model: "unicorn"
        }
      }) {
        clientMutationId
      }
    }
  `
    return exec(t, query)
  }

  const update = async t => {
    const query = nanographql`
    mutation {
      upsertBike(where: {
        serialNumber: "abc123"
      }, 
      input: {
        bike: {
          serialNumber: "abc123"
          weight: 25.6
          make: "schwinn"
          model: "stingray"
        }
      }) {
        clientMutationId
      }
    }
  `
    return exec(t, query)
  }

  {
    await create1(t)
    const res = await all(t)
    t.is(res.data.allBikes.edges.length, 1)
    t.is(res.data.allBikes.edges[0].node.make, 'kona')
  }
  {
    await create2(t)
    const res = await all(t)
    t.is(res.data.allBikes.edges.length, 2)
    t.is(res.data.allBikes.edges[0].node.make, 'kona')
    t.is(res.data.allBikes.edges[1].node.make, 'honda')
  }
  {
    await create1(t)
    const res = await all(t)
    t.is(res.data.allBikes.edges.length, 2)
    t.is(res.data.allBikes.edges[0].node.make, 'kona')
    t.is(res.data.allBikes.edges[1].node.make, 'honda')
  }
  {
    await update(t)
    const res = await all(t)
    t.is(res.data.allBikes.edges.length, 2)
    t.is(res.data.allBikes.edges[0].node.make, 'schwinn')
    t.is(res.data.allBikes.edges[1].node.make, 'honda')
  }
})

test('test multi-column uniques', async t => {
  const all = async t => {
    const query = nanographql`
    query {
      allRoles(orderBy: RANK_ASC) {
        edges {
          node {
            id
            project
            title
            name
            rank
          }
        }
      }
    }
  `
    return exec(t, query)
  }

  const create1 = async t => {
    const query = nanographql`
    mutation {
      upsertRole(where: {
        project: "sales",
        title: "director"
      }, 
      input: {
        role: {
          project: "sales",
          title: "director",
          name: "jerry",
          rank: 1
        }
      }) {
        clientMutationId
      }
    }
  `
    return exec(t, query)
  }

  const create2 = async t => {
    const query = nanographql`
    mutation {
      upsertRole(where: {
        project: "sales",
        title: "agent"
      }, 
      input: {
        role: {
          project: "sales",
          title: "agent",
          name: "frank",
          rank: 2
        }
      }) {
        clientMutationId
      }
    }
  `
    return exec(t, query)
  }

  const update = async t => {
    const query = nanographql`
    mutation {
      upsertRole(where: {
        project: "sales",
        title: "director"
      }, 
      input: {
        role: {
          project: "sales",
          title: "director",
          name: "frank",
          rank: 1
        }
      }) {
        clientMutationId
      }
    }
  `
    return exec(t, query)
  }

  {
    const results = await create1(t)
    console.log('results: ', results)
    const res = await all(t)
    console.log('res: ', res)
    t.is(res.data.allRoles.edges.length, 1)
    t.is(res.data.allRoles.edges[0].node.project, 'sales')
    t.is(res.data.allRoles.edges[0].node.title, 'director')
    t.is(res.data.allRoles.edges[0].node.name, 'jerry')
  }

  {
    await create2(t)
    const res = await all(t)
    t.is(res.data.allRoles.edges.length, 2)
    t.is(res.data.allRoles.edges[1].node.project, 'sales')
    t.is(res.data.allRoles.edges[1].node.title, 'agent')
    t.is(res.data.allRoles.edges[1].node.name, 'frank')
  }

  {
    await update(t)
    const res = await all(t)
    t.is(res.data.allRoles.edges.length, 2)
    t.is(res.data.allRoles.edges[0].node.project, 'sales')
    t.is(res.data.allRoles.edges[0].node.title, 'director')
    t.is(res.data.allRoles.edges[0].node.name, 'frank')
    t.is(res.data.allRoles.edges[1].node.project, 'sales')
    t.is(res.data.allRoles.edges[1].node.title, 'agent')
    t.is(res.data.allRoles.edges[1].node.name, 'frank')
  }
})
