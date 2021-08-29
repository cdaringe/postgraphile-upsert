import { container, DbContext } from "./fixture/db"; // eslint-disable-line no-unused-vars
import { createPool } from "./fixture/client";
import { createServer, Server } from "http"; // eslint-disable-line no-unused-vars
import { freeport } from "./fixture/freeport";
import { PgMutationUpsertPlugin } from "../postgraphile-upsert";
import { Pool } from "pg"; // eslint-disable-line no-unused-vars
import { postgraphile } from "postgraphile";
import ava, { TestInterface, ExecutionContext } from "ava"; // eslint-disable-line no-unused-vars
import nanographql = require("nanographql");
import Bluebird = require("bluebird");
import fetch from "node-fetch";

type TestContext = DbContext & {
  client: Pool;
  server: Server;
  serverPort: number;
  middleware: ReturnType<typeof postgraphile>;
};

type PluginExecutionContext = ExecutionContext<TestContext>;

const test = ava as TestInterface<TestContext>;

test.beforeEach(async (t) => {
  await container.setup(t.context);
  await Bluebird.delay(5000);
  t.context.client = await createPool(t.context.dbConfig);
  t.context.client.on("error", (err) => {}); // eslint-disable-line
  await t.context.client.query(`
    create table bikes (
      id serial,
      weight real,
      make varchar,
      model varchar,
      primary key (id)
    )
  `);
  await t.context.client.query(`
    create table roles (
      id serial primary key,
      project varchar,
      title varchar,
      name varchar,
      rank integer,
      unique (project, title)
    )
  `);
  const middleware = postgraphile(t.context.client, "public", {
    graphiql: true,
    appendPlugins: [PgMutationUpsertPlugin],
    exportGqlSchemaPath: "./postgraphile.graphql",
  });
  t.context.middleware = middleware;
  const serverPort = await freeport();
  t.context.serverPort = serverPort;
  t.context.server = createServer(middleware).listen(serverPort);
});

test.afterEach(async (t) => {
  t.context.client.on("error", () => null);
  await t.context.middleware.release();
  await new Promise((res) => t.context.server.close(res));
  await container.teardown(t.context);
});

const execGqlOp = (t: PluginExecutionContext, query: () => string) =>
  fetch(`http://localhost:${t.context.serverPort}/graphql`, {
    body: query(),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`op failed: ${res.statusText}\n\n${text}`);
    }
    const json = await res.json();
    if (json.errors) throw new Error(JSON.stringify(json.errors));
    return json;
  });

const fetchAllBikes = async (t: PluginExecutionContext) => {
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
  `;
  return execGqlOp(t, query);
};

const fetchAllRoles = async (t: PluginExecutionContext) => {
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
  }`;
  return execGqlOp(t, query);
};

const create = async (t: PluginExecutionContext) =>
  execGqlOp(
    t,
    nanographql`
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
  );

test("upsert crud", async (t) => {
  await create(t);
  const res = await fetchAllBikes(t);
  t.is(res.data.allBikes.edges.length, 1);
  t.is(res.data.allBikes.edges[0].node.make, "kona");
});

test("upsert where clause", async (t) => {
  const upsertDirector = async ({
    project = "sales",
    title = "director",
    name = "jerry",
    rank = 1,
  }: {
    project?: string;
    title?: string;
    name?: string;
    rank?: number;
  }) => {
    const query = nanographql(`
      mutation {
        upsertRole(where: {
          project: "sales",
          title: "director"
        }, 
        input: {
          role: {
            project: "${project}",
            title: "${title}",
            name: "${name}",
            rank: ${rank}
          }
        }) {
          clientMutationId
        }
      }
    `);
    return execGqlOp(t, query);
  };
  {
    // add director
    await upsertDirector({ name: "jerry" });
    const res = await fetchAllRoles(t);
    t.is(res.data.allRoles.edges.length, 1);
    t.is(res.data.allRoles.edges[0].node.project, "sales");
    t.is(res.data.allRoles.edges[0].node.title, "director");
    t.is(res.data.allRoles.edges[0].node.name, "jerry");
  }

  {
    // update director
    await upsertDirector({ name: "frank", rank: 2 });
    const res = await fetchAllRoles(t);
    t.is(res.data.allRoles.edges[0].node.project, "sales");
    t.is(res.data.allRoles.edges[0].node.title, "director");
    t.is(res.data.allRoles.edges[0].node.name, "frank");
    t.is(res.data.allRoles.edges[0].node.rank, 2);

    // assert only one record
    t.is(res.data.allRoles.edges.length, 1);
  }
});
