import { promisify } from "util";
import net from "net";

export const freeport = promisify(
  (cb: (error: Error | null, port: number) => void) => {
    const server = net.createServer();
    let port = 0;
    server.on("listening", function () {
      const addr = server.address();
      if (typeof addr === "string" || addr === null) {
        throw new Error("invalid");
      }
      port = addr.port;
      server.close();
    });
    server.on("close", function () {
      cb(null, port);
    });
    server.on("error", function (err) {
      cb(err, -1);
    });
    server.listen(0, "127.0.0.1");
  }
);
