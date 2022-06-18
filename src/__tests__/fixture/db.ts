import { freeport } from "./freeport";
import Docker from "dockerode";
import execa from "execa";
// import type { ExecutionContext } from "ava";

const DB_IMAGE = "postgres:11-alpine";

export interface DbContextDbConfig {
  port: number;
  username: "postgres";
  password: "postgres";
  database: "postgres";
}

export interface DbContext {
  dbContainer: Docker.Container;
  dbConfig: DbContextDbConfig;
}

const containers = new Set();
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export async function imageExists(imageName: string) {
  try {
    await execa("docker", ["image", "inspect", imageName]);
    return true;
  } catch (err) {
    // @TODO this is fragile, but dockerode is being a PIA
    return false;
  }
}

const isStatusCodeError = (x: unknown): x is { statusCode: number } =>
  !!x && Number.isFinite((x as { statusCode: number }).statusCode);

export async function purgeContainer(container: Docker.Container) {
  try {
    await container.kill();
  } finally {
    await containers.delete(container);
    try {
      await container.remove({ force: true });
    } catch (err: unknown) {
      const statusCode = isStatusCodeError(err) ? err.statusCode : 0;
      // if 404, we probably used the --rm flag on container launch. it's all good.
      if (!(statusCode === 404 || statusCode === 409)) {
        throw err; // eslint-disable-line
      }
    }
  }
}

export const container = {
  async setup(ctx: DbContext) {
    const port = await freeport();
    if (!(await imageExists(DB_IMAGE))) {
      await execa("docker", ["pull", DB_IMAGE]);
    }
    const container = await docker.createContainer({
      Image: DB_IMAGE,
      ExposedPorts: {
        "5432/tcp": {},
      },
      Env: ["POSTGRES_PASSWORD=postgres"],
      HostConfig: {
        AutoRemove: true,
        PortBindings: { "5432/tcp": [{ HostPort: port.toString() }] },
      },
      Cmd: ["-c", "log_statement=all"],
    });
    await container.start();
    containers.add(container);
    ctx.dbContainer = container;
    const dbConfig: Partial<DbContextDbConfig> = {
      port,
      username: "postgres",
      password: "postgres",
      database: "postgres",
    };
    ctx.dbConfig = dbConfig as DbContextDbConfig;
  },
  async teardown(ctx: DbContext) {
    const container = ctx.dbContainer;
    if (container) await purgeContainer(container);
  },
};
