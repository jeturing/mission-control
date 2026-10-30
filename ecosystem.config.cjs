module.exports = {
  apps: [{
    name: 'mission-control',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 4000 -H 0.0.0.0',
    cwd: '/home/andialbundy/repos/mission-control',
    exec_mode: 'fork',
    node_args: '--no-warnings',
    env: {
      NODE_ENV: 'production',
      PORT: '4000',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      OPENCLAW_GATEWAY_URL: 'ws://127.0.0.1:18799',
      DATABASE_PATH: './mission-control.db',
      MODEL_DISCOVERY: 'remote',
      MISSION_CONTROL_URL: 'http://172.20.0.1:4000',
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
