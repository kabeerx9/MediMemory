import { buildApp } from "./app";
import { startDefaultWhoopScheduler } from "./whoop/scheduler";

const fastify = buildApp();

fastify.listen({ port: 3000 }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log("Server running on port 3000");
  startDefaultWhoopScheduler();
});
