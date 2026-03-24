#!/bin/bash

# Database initialization script
# This script runs database migrations
# If DATABASE_URL is not set, it will use the Docker database

set -e

echo "🚀 Initializing database..."

# Use Docker DB if DATABASE_URL is not set
if [ -z "$DATABASE_URL" ]; then
    echo "ℹ️  DATABASE_URL not set, using Docker database..."
    export DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD:-postgres}@postgres:5432/${POSTGRES_DB:-ubc_ocpi_adaptor}?sslmode=disable"
    echo "✅ Using Docker database: postgres:5432/${POSTGRES_DB:-ubc_ocpi_adaptor}"
else
    echo "✅ Using provided DATABASE_URL"
fi

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
until npx prisma db execute --stdin <<< "SELECT 1" > /dev/null 2>&1; do
    echo "   Database is unavailable - sleeping"
    sleep 2
done
echo "✅ Database is ready"

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Run migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "✅ Database initialization complete"

