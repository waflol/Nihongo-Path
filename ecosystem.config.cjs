// pm2 config: run the built api + ui in the background.
// Build first (one app at a time to save RAM), then: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "api",
      cwd: "./apps/api",
      script: "pnpm",
      args: "dev",
      interpreter: "none", // pnpm is a binary, not a JS file for pm2 to run with node
      max_memory_restart: "800M",
      autorestart: true,
    },
    {
      name: "ui",
      cwd: "./apps/ui",
      script: "pnpm",
      args: "dev",
      interpreter: "none",
      max_memory_restart: "800M",
      autorestart: true,
    },
    {
      // Public tunnel to the UI (port 3001). Add `--url=<your-domain>.ngrok-free.app`
      // to args for a fixed URL; otherwise the URL changes on every restart.
      name: "ngrok",
      script: "ngrok",
      args: "http 3001 --log stdout",
      interpreter: "none",
      autorestart: true,
    },
  ],
};
