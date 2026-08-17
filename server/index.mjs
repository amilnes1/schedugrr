import { resolve } from "node:path";
import { existsSync, copyFileSync } from "node:fs";
import { BoardStore } from "./board-store.mjs";
import { createOpenAgendaServer } from "./app.mjs";

const host = process.env.OPENAGENDA_HOST ?? process.env.OPENBOARD_HOST ?? "127.0.0.1";
const port = Number(process.env.OPENAGENDA_PORT ?? process.env.OPENBOARD_PORT ?? 8787);
const dataFile = resolve(process.env.OPENAGENDA_DATA_FILE ?? process.env.OPENBOARD_DATA_FILE ?? "data/openagenda.json");
const legacyDataFile = resolve("data/openboard.json");
if (!existsSync(dataFile) && existsSync(legacyDataFile)) copyFileSync(legacyDataFile, dataFile);

const store = new BoardStore(dataFile);
const server = createOpenAgendaServer(store);

server.listen(port, host, () => {
  console.log(`OpenAgenda API ready at http://${host}:${port}`);
  console.log(`Board data: ${dataFile}`);
});

function stop() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
