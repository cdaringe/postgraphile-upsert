import { Pool } from "pg";
import { DbContextDbConfig } from "./db"; // eslint-disable-line no-unused-vars

export async function createPool(config: DbContextDbConfig) {
  const client = new Pool({
    user: config.username,
    host: "localhost",
    ...config,
  });
  await client.connect();
  return client;
}
