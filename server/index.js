// Entry point: `npm start` (loads .env when present, see .env.example).

import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const server = createApp(config);
const port = await server.listen(config.port);

console.log(`Hombres Lobos Online escuchando en http://localhost:${port} (${config.nodeEnv})`);
if (config.corsOrigins.length > 0) console.log(`Orígenes permitidos: ${config.corsOrigins.join(', ')}`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
