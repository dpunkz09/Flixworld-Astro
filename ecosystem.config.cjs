module.exports = {
  apps: [
    {
      name: "FlixworldAstro",
      cwd: "/var/www/flixworld.xyz/Flixworld-Astro",
      script: "node",
      args: "dist/server/entry.mjs", // Astro’s built server entry
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1200M",
      node_args: "--max-old-space-size=768 --disable-proto=throw",
      env: {
        NODE_ENV: "production",
        PORT: 3000, // give Astro a different port
      },
      time: true,
    },
  ],
};
