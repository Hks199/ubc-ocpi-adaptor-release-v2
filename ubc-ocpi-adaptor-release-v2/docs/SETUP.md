# Quick Start Guide - Running Docker

## Prerequisites

Make sure you have:
- Docker installed and running
- Docker Compose v2.0+ installed
- `.env` file configured (or use `.env.example`)

You can find the postman collection here - /postman/UBC_Postman_Collection.postman_collection.json

## Step-by-Step Instructions

### 1. Verify Docker is Running

```bash
docker --version
docker compose version
docker ps
```

### 2. Configure Environment (if not already done)

```bash
# If you don't have a .env file, copy from example
cp .env.example .env

# Edit .env with your values (optional - defaults are already set)
# nano .env  # or use your preferred editor

# IMPORTANT: Leave DATABASE_URL empty to use Docker database automatically
# The system will automatically use: postgresql://postgres:postgres@postgres:5432/ubc_ocpi_adaptor
```

### 3. Start All Services

```bash
# Build and start all services (app, postgres)
docker compose up -d

# View logs
docker compose logs -f app
```

### 4. Initialize Database

```bash
# Run database migrations
docker compose exec app npm run prisma:migrate
```

### 5. Verify Everything is Working

```bash
# Check health endpoint
curl http://localhost:6001/api/health

# Check root endpoint
curl http://localhost:6001/

# Check OCPI versions
curl http://localhost:6001/ocpi/versions
```

## Common Commands

### Start Services
```bash
docker compose up -d
```

### Stop Services
```bash
docker compose down
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app
docker compose logs -f postgres
```

### Restart Services
```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart app
```

### Check Service Status
```bash
docker compose ps
```

### Access Container Shell
```bash
# Access app container
docker compose exec app sh

# Access postgres container
docker compose exec postgres psql -U postgres -d ubc_ocpi_adaptor
```

### Rebuild After Code Changes
```bash
# Rebuild and restart
docker compose up -d --build

# Or rebuild specific service
docker compose build app
docker compose up -d app
```

### Clean Up (⚠️ Deletes all data)
```bash
# Stop and remove containers, networks, and volumes
docker compose down -v
```

## Service URLs

Once running, services are available at:

| Service | URL | Description |
|---------|-----|-------------|
| API | http://localhost:6001 | Main application |
| Health | http://localhost:6001/api/health | Health check |
| OCPI Versions | http://localhost:6001/ocpi/versions | OCPI versions |
| PostgreSQL | localhost:5432 | Database (if port exposed) |

## Troubleshooting

### Port Already in Use
```bash
# Check what's using port 6001
lsof -i :6001

# Kill the process or change PORT in .env
```

### Services Won't Start
```bash
# Check logs
docker compose logs app

# Check if containers are running
docker compose ps

# Restart everything
docker compose down
docker compose up -d
```

### Database Connection Issues
```bash
# Check if postgres is healthy
docker compose exec postgres pg_isready -U postgres

# Check database URL
docker compose exec app env | grep DATABASE_URL
```

### Need to Reset Everything
```bash
# Stop and remove everything (⚠️ deletes data)
docker compose down -v

# Start fresh
docker compose up -d
docker compose exec app npm run prisma:migrate
```

## Production Deployment

For production, use the production compose file:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Make sure to:
1. Set `NODE_ENV=production` in `.env`
2. Use strong secrets (generate with `openssl rand -base64 32`)
3. Configure proper `OCPI_HOST`
4. Set up proper logging (GCP, AWS, or Azure)

## Next Steps

- Read [docs/SETUP.md](./docs/SETUP.md) for detailed setup
- Read [docs/OCPI_FLOWS.md](./docs/OCPI_FLOWS.md) for OCPI flows
- Read [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) for issues

