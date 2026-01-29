module.exports = {
  apps: [
    {
      name: 'callqr-backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 9001
      },
      
      // Development environment
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      
      // Production environment
      env_production: {
        NODE_ENV: 'production',
        PORT: 9001
      },
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Process management
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      
      // Advanced options
      node_args: '--max-old-space-size=1024',
      
      // Health monitoring
      min_uptime: '10s',
      max_restarts: 10,
      
      // Graceful shutdown
      kill_timeout: 5000,
      
      // Source map support for better error traces
      source_map_support: true,
      
      // Merge logs from all instances
      merge_logs: true,
      
      // Time zone
      time: true
    }
  ],
  
  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'root',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo/callqr-backend.git',
      path: '/home/deploy/callqr-backend',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production'
    }
  }
};