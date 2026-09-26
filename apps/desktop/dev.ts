const VITE_DEV_PORT = "5273";

const vite = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "npm:vite"],
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

await waitForServer(`http://127.0.0.1:${VITE_DEV_PORT}`);

const server = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", "server.ts"],
  env: { EXORDIUM_DEV: "1", VITE_DEV_PORT },
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

const shutdown = () => {
  try {
    vite.kill();
  } catch { /* already exited */ }
  try {
    server.kill();
  } catch { /* already exited */ }
};
Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

await server.status;
shutdown();

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Vite dev server at ${url} did not become ready in time`);
}
