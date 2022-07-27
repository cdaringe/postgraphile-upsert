import { container, DbContext } from "./fixture/db";
import { createPool } from "./fixture/client";
import { createServer, Server } from "http";
import { freeport } from "./fixture/freeport";
import { PgMutationUpsertPlugin } from "../postgraphile-upsert";
import { Pool } from "pg";
import { postgraphile } from "postgraphile";
import ava, { TestFn, ExecutionContext } from "ava";
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

const test = ava as TestFn<TestContext>;

test.beforeEach(async (t) => {
  await container.setup(t.context);
  await Bluebird.delay(5000);
  t.context.client = await createPool(t.context.dbConfig);
  t.context.client.on("error", () => null);
  await t.context.client.query(`
    create table bikes (
      id serial,
      weight real,
      make varchar,
      model varchar,
      serial_number varchar,
      primary key (id),
      constraint serial_weight_unique unique (serial_number, weight)
    )
  `);
  await t.context.client.query(`
    create table roles (
      id serial primary key,
      project_name varchar,
      title varchar,
      name varchar,
      rank integer,
      unique (project_name, title)
    )
  `);
  await t.context.client.query(`COMMENT ON COLUMN roles.rank IS E'@omit updateOnConflict'`);
  await t.context.client.query(`
      create table no_primary_keys(
        name text
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
  container.teardown(t.context).catch(console.error);
  await t.context.middleware.release();
  await new Promise((res) => t.context.server.close(res));
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

const fetchMutationTypes = async (t: PluginExecutionContext) => {
  const query = nanographql`
    query {
      __type(name: "Mutation") {
        name
        fields {
          name
        }
      }
    }
  `;
  return execGqlOp(t, query);
};

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
          projectName
          title
          name
          rank
        }
      }
    }
  }`;
  return execGqlOp(t, query);
};

const create = async (
  t: PluginExecutionContext,
  extraProperties: { [key: string]: unknown } = {}
) => {
  const defaultRecordFields = {
    make: '"kona"',
    model: '"kula deluxe"',
    weight: 0.0,
  };
  const bikeQueryStr = Object.entries(
    Object.entries(extraProperties).reduce((record, [k, v]) => {
      return {
        ...record,
        [k]: v,
      };
    }, defaultRecordFields)
  )
    .map(([property, value]) => `${property}: ${value}`)
    .join("\n");
  const mutation = `mutation {
    upsertBike(input: {
      bike: {
        ${bikeQueryStr}
      }
    }) {
      clientMutationId
    }
  }`;
  return execGqlOp(t, nanographql(mutation));
};

test("ignores tables without primary keys", async (t) => {
  await create(t);
  const res = await fetchMutationTypes(t);
  const upsertMutations = new Set(
    res.data.__type.fields
      .map(({ name }) => name)
      .filter((name) => name.startsWith("upsert"))
  );
  t.assert(upsertMutations.size === 2);
  t.assert(upsertMutations.has("upsertBike"));
  t.assert(upsertMutations.has("upsertRole"));
});

test("upsert crud - match primary key constraint", async (t) => {
  await create(t); // test upsert without where clause
  const res = await fetchAllBikes(t);
  t.is(res.data.allBikes.edges.length, 1);
  t.is(res.data.allBikes.edges[0].node.make, "kona");
});

test("upsert crud - match unique constraint", async (t) => {
  await create(t, { serialNumber: '"123"' }); // test upsert without where clause
  const res = await fetchAllBikes(t);
  t.is(res.data.allBikes.edges.length, 1);
  t.is(res.data.allBikes.edges[0].node.make, "kona");
});

test("upsert crud - update on unique constraint", async (t) => {
  await create(t, { weight: 20, serialNumber: '"123"' }); // test upsert without where clause
  await create(t, {
    model: '"updated_model"',
    weight: 20,
    serialNumber: '"123"',
  }); // test upsert without where clause
  const res = await fetchAllBikes(t);
  t.is(res.data.allBikes.edges.length, 1);
  t.is(res.data.allBikes.edges[0].node.model, "updated_model");
});

test("ensure valid values are included (i.e. 0.0 for numerics)", async (t) => {
  await create(t, { serialNumber: '"123"' });
  const query = nanographql(`
    mutation {
      upsertBike(where: {
        weight: 0.0,
        serialNumber: "123"
      },
      input: {
        bike: {
          model: "kula deluxe v2"
          weight: 0.0,
          serialNumber: "123"
        }
      }) {
        clientMutationId
      }
    }
  `);

  await execGqlOp(t, query);
  const res = await fetchAllBikes(t);
  t.is(res.data.allBikes.edges.length, 1);
  t.is(res.data.allBikes.edges[0].node.model, "kula deluxe v2");
});

test("Includes where clause values if ommitted from input", async (t) => {
  await create(t, { serialNumber: '"123"' });

  // Hit unique key with weight/serialNumber, but omit from input entry
  const query = nanographql(`
    mutation {
      upsertBike(where: {
        weight: 0.0,
        serialNumber: "123"
      },
      input: {
        bike: {
          model: "kula deluxe v2"
        }
      }) {
        clientMutationId
      }
    }
  `);

  await execGqlOp(t, query);
  const res = await fetchAllBikes(t);
  t.is(res.data.allBikes.edges.length, 1);
  t.is(res.data.allBikes.edges[0].node.model, "kula deluxe v2");
});

test("throws an error if input values differ from where clause values", async (t) => {
  try {
    await create(t, { serialNumber: '"123"' });
    const query = nanographql(`
      mutation {
        upsertBike(where: {
          weight: 0.0,
          serialNumber: "123"
        },
        input: {
          bike: {
            model: "kula deluxe v2"
            weight: 0.0,
            serialNumber: "1234"
          }
        }) {
          clientMutationId
        }
      }
    `);

    await execGqlOp(t, query);
    t.fail("Mutation should fail if values differ");
  } catch (e: unknown) {
    t.truthy(
      (e instanceof Error ? e.message : `${e}`).includes(
        "Value passed in the input for serialNumber does not match the where clause value."
      )
    );
  }
});

test("upsert where clause", async (t) => {
  const upsertDirector = async ({
    projectName = "sales",
    title = "director",
    name = "jerry",
    rank = 1,
  }: {
    projectName?: string;
    title?: string;
    name?: string;
    rank?: number;
  }) => {
    const query = nanographql(`
      mutation {
        upsertRole(ignore: {rank: false}, where: {
          projectName: "sales",
          title: "director"
        },
        input: {
          role: {
            projectName: "${projectName}",
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
    t.is(res.data.allRoles.edges[0].node.projectName, "sales");
    t.is(res.data.allRoles.edges[0].node.title, "director");
    t.is(res.data.allRoles.edges[0].node.name, "jerry");
  }

  {
    // update director
    await upsertDirector({ name: "frank", rank: 2 });
    const res = await fetchAllRoles(t);
    t.is(res.data.allRoles.edges[0].node.projectName, "sales");
    t.is(res.data.allRoles.edges[0].node.title, "director");
    t.is(res.data.allRoles.edges[0].node.name, "frank");
    t.is(res.data.allRoles.edges[0].node.rank, 2);

    // assert only one record
    t.is(res.data.allRoles.edges.length, 1);
  }
});

test("upsert where clause omit onConflictUpdate", async (t) => {
  const upsertDirector = async ({
    projectName = "sales",
    title = "director",
    name = "jerry",
    rank = 1,
  }: {
    projectName?: string;
    title?: string;
    name?: string;
    rank?: number;
  }) => {
    const query = nanographql(`
      mutation {
        upsertRole(ignore: {name: true}, where: {
          projectName: "sales",
          title: "director"
        },
        input: {
          role: {
            projectName: "${projectName}",
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
    t.is(res.data.allRoles.edges[0].node.projectName, "sales");
    t.is(res.data.allRoles.edges[0].node.title, "director");
    t.is(res.data.allRoles.edges[0].node.name, "jerry");
  }

  {
    // update director
    await upsertDirector({ name: "frank", rank: 2 });
    const res = await fetchAllRoles(t);
    t.is(res.data.allRoles.edges[0].node.projectName, "sales");
    t.is(res.data.allRoles.edges[0].node.title, "director");
    t.is(res.data.allRoles.edges[0].node.name, "jerry");
    t.is(res.data.allRoles.edges[0].node.rank, 1); // rank is unchanged because it is @omit updateOnConflict

    // assert only one record
    t.is(res.data.allRoles.edges.length, 1);
  }
});
