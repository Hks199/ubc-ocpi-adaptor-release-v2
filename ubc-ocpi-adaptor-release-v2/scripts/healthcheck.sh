#!/bin/bash

# Health check script
# Checks the health of the application and its dependencies

set -e

HEALTHY=true

# Check application health endpoint
echo "🔍 Checking application health..."
if curl -f http://localhost:${PORT:-6001}/api/health > /dev/null 2>&1; then
    echo "✅ Application is healthy"
else
    echo "❌ Application health check failed"
    HEALTHY=false
fi

# Check database connection
echo "🔍 Checking database connection..."
if npx prisma db execute --stdin <<< "SELECT 1" > /dev/null 2>&1; then
    echo "✅ Database connection is healthy"
else
    echo "❌ Database connection check failed"
    HEALTHY=false
fi

# Check Redis connection (if REDIS_HOST is set)
if [ -n "$REDIS_HOST" ]; then
    echo "🔍 Checking Redis connection..."
    if node -e "
        const Redis = require('ioredis');
        const redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            retryStrategy: () => null,
            maxRetriesPerRequest: 1,
            connectTimeout: 2000
        });
        redis.ping().then(() => {
            console.log('✅ Redis connection is healthy');
            process.exit(0);
        }).catch(() => {
            console.log('❌ Redis connection check failed');
            process.exit(1);
        });
    " 2>/dev/null; then
        echo "✅ Redis connection is healthy"
    else
        echo "❌ Redis connection check failed"
        HEALTHY=false
    fi
fi

# Exit with appropriate code
if [ "$HEALTHY" = true ]; then
    echo "✅ All health checks passed"
    exit 0
else
    echo "❌ Some health checks failed"
    exit 1
fi

