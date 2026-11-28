import { createApi, readConfig } from './bootstrap';

async function main() {
  const config = readConfig();
  const { app } = await createApi(config);
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
}
void main().catch(() => { console.error('API startup failed'); process.exitCode = 1; });
