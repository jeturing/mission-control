module.exports = {
  apps: [{
    name: 'mission-control',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 4000 -H 0.0.0.0',
    cwd: 'C:\\Users\\admin\\Downloads\\mission-control',
    exec_mode: 'fork',
    node_args: '--no-warnings',
    env: {
      NODE_ENV: 'production',
      PORT: '4000',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      OPENCLAW_GATEWAY_URL: 'wss://192.168.2.110:443',
      OPENCLAW_GATEWAY_TOKEN: '71e86ed6bef191f85f1a8d6a1eb7e7d8e4a8fbc5b719c09229cc798a61cc9e40',
      DATABASE_PATH: './mission-control.db',
      MODEL_DISCOVERY: 'remote',
      MISSION_CONTROL_URL: 'http://192.168.2.110:4000',
      ALLOW_DYNAMIC_AGENTS: 'true'
    },
    // PM2 settings
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    watch: false,
    max_memory_restart: '512M'
  }]
};
