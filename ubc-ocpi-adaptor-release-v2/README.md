# UBC OCPI Adaptor

An EMSP (eMobility Service Provider) OCPI server that integrates with CPO (Charge Point Operator) systems via OCPI 2.2.1 protocol and provides UBC (Unified Bharat e-Charge) Beckn protocol integration for EV charging discovery and transactions.

## What is this?

This repository implements a complete OCPI 2.2.1 EMSP server that:
- Receives and manages charging locations, tariffs, sessions, and CDRs from CPOs
- Provides OCPI-compliant APIs for CPO integration
- Integrates with UBC/Beckn protocol for EV charging discovery
- Offers administrative APIs for managing OCPI connections and data synchronization

## Who is it for?

- **CPOs (Charge Point Operators)**: Integrate with EMSPs using OCPI 2.2.1
- **EMSPs (eMobility Service Providers)**: Manage charging infrastructure and sessions
- **Developers**: Build EV charging applications with OCPI and Beckn protocols
- **System Integrators**: Deploy and customize OCPI adapters

## Quick Start

### Prerequisites

- **Docker** >= 24.0.0
- **Docker Compose** v2.0.0+
- **8GB RAM** recommended

### 5-Minute Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd ubc-ocpi-adaptor

# 2. Configure environment
cp .env.example .env
# Edit .env with your configuration

# 3. Start services
docker compose up -d

# 4. Initialize database
docker compose exec app npm run prisma:migrate

# 5. Verify installation
curl http://localhost:6001/api/health
```

**That's it!** Your OCPI adaptor is now running.

👉 **For detailed setup instructions, see [QUICK_START.md](./QUICK_START.md) or [docs/SETUP.md](./docs/SETUP.md)**

## Service URLs

After starting, services are available at:

| Service | URL | Description |
|---------|-----|-------------|
| API | http://localhost:6001 | Main application API |
| Health Check | http://localhost:6001/api/health | Health check endpoint |
| OCPI Versions | http://localhost:6001/ocpi/versions | OCPI versions endpoint |
| PostgreSQL | localhost:5432 | Database (if port exposed) |

## Smoke Tests

Run these commands to verify everything is working:

```bash
# 1. Health check
curl http://localhost:6001/api/health

# 2. Root endpoint
curl http://localhost:6001/

# 3. OCPI versions
curl http://localhost:6001/ocpi/versions
```

## Documentation

- **[QUICK_START.md](./QUICK_START.md)** - Quick setup guide (start here)
- **[docs/SETUP.md](./docs/SETUP.md)** - Detailed setup guide with troubleshooting
- **[docs/OCPI_FLOWS.md](./docs/OCPI_FLOWS.md)** - OCPI protocol flows and examples
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - System architecture and design
- **[docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** - Common issues and solutions

## Features

### OCPI 2.2.1 EMSP Implementation

- ✅ **Versions** - Version discovery and endpoint listing
- ✅ **Credentials** - Partner registration and token exchange
- ✅ **Locations** - Charging location management (with EVSEs and connectors)
- ✅ **Tariffs** - Pricing and tariff management
- ✅ **Sessions** - Charging session lifecycle management
- ✅ **CDRs** - Charge Detail Records for billing
- ✅ **Tokens** - Token authorization and whitelist management
- ✅ **Commands** - Start/Stop session commands

### UBC/Beckn Integration

- ✅ **Select** - Location discovery
- ✅ **Init** - Session initialization
- ✅ **Confirm** - Session confirmation
- ✅ **Track** - Real-time session tracking
- ✅ **Update** - Session updates

### Additional Features

- ✅ **Admin API** - RESTful APIs for managing OCPI connections
- ✅ **Request Logging** - Comprehensive OCPI request/response logging
- ✅ **Multi-cloud Logging** - Support for GCP, AWS CloudWatch, Azure Monitor
- ✅ **PostgreSQL Database** - Robust data persistence with Prisma ORM

## Project Structure

```
ubc-ocpi-adaptor/
├── docs/                    # Documentation
│   ├── SETUP.md            # Setup guide
├── scripts/                 # Utility scripts
│   ├── init-db.sh          # Database initialization
│   └── healthcheck.sh      # Health check script
├── src/                     # Source code
│   ├── ocpi/               # OCPI implementation
│   ├── ubc/                # UBC/Beckn integration
│   ├── admin/              # Admin APIs
│   ├── services/           # Business logic
│   └── db-services/        # Database services
├── prisma/                  # Database schema
├── docker-compose.yml       # Docker Compose configuration
└── Dockerfile              # Docker image definition
```

## Development

### Running in Development Mode

```bash
# Start dependencies
docker compose up -d postgres

# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev
```

### Available Scripts

```bash
npm run build          # Build TypeScript
npm start              # Start production server
npm run dev            # Start development server (hot reload)
npm test               # Run tests
npm run lint           # Lint code
npm run prisma:studio  # Open Prisma Studio
```

## Configuration

Key environment variables (see `.env.example` for full list):

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT secret key (generate with `openssl rand -base64 32`)
- `OCPI_HOST` - OCPI host URL
- `CDS_BASE_URL` - Catalog Discover Service API URL (optional)
- `EV_CHARGING_UBC_BPP_CLIENT_HOST` - BPP client host for Beckn callbacks

## API Endpoints

### OCPI Endpoints (EMSP Receiver)

- `GET /ocpi/versions` - OCPI versions
- `GET /ocpi/2.2.1` - Version details
- `POST /ocpi/2.2.1/credentials` - Credential exchange
- `PUT /ocpi/2.2.1/locations/{country_code}/{party_id}/{location_id}` - Location updates
- `PUT /ocpi/2.2.1/sessions/{country_code}/{party_id}/{session_id}` - Session updates
- `POST /ocpi/2.2.1/cdrs/{country_code}/{party_id}` - CDR submission
- And more... (see [OCPI_FLOWS.md](./docs/OCPI_FLOWS.md))

### Admin Endpoints

- `POST /api/admin/auth/login` - Admin login
- `GET /api/admin/locations` - List locations
- `POST /api/admin/locations/fetch` - Fetch locations from CPO
- `POST /api/admin/commands/start` - Start charging session
- `POST /api/admin/commands/stop` - Stop charging session
- And more...

### Health Check

- `GET /api/health` - Health check endpoint

## Docker Deployment

### Development

```bash
docker compose up -d
```

### Production

```bash
# Set NODE_ENV=production in .env
docker compose build
docker compose up -d
```

## Troubleshooting

Having issues? Check out:

1. **[TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** - Common issues and solutions
2. **Application logs**: `docker compose logs -f app`
3. **Database logs**: `docker compose logs -f postgres`

## Support

- 📖 Read the [documentation](./docs/)
- 🐛 Check [GitHub issues](https://github.com/your-repo/issues)
- 💬 Contact the development team

## License

ISC

---

**Ready to get started?** → [docs/SETUP.md](./docs/SETUP.md)
