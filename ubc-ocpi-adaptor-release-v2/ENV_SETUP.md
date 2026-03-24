# Environment Variables Setup Guide

This document explains all the environment variables needed for the UBC OCPI Adaptor.

## Required Variables

### Server Configuration

- **NODE_ENV**: Environment mode (`development`, `staging`, `production`)
- **PORT**: Server port (default: `3000`)

### Database (PostgreSQL)

- **DATABASE_URL**: PostgreSQL connection string
    - Format: `postgresql://[user]:[password]@[host]:[port]/[database]`
    - Example: `postgresql://postgres:password@localhost:5432/ubc_ocpi_adaptor`

### Redis Configuration

- **REDIS_HOST**: Redis server hostname (default: `localhost`)
- **REDIS_PORT**: Redis server port (default: `6379`)
- **REDIS_PASSWORD**: Redis password (optional, leave empty if no password)

### Authentication

- **JWT_SECRET**: Secret key for JWT token generation (REQUIRED in production)
    - Should be a strong random string (minimum 32 characters)
    - Generate with: `openssl rand -base64 32`
- **JWT_EXPIRES_IN**: JWT token expiration time (default: `24h`)
    - Examples: `1h`, `24h`, `7d`

### OCPI Configuration

- **OCPI_VERSION**: OCPI protocol version (default: `2.2.1`)
- **OCPI_PARTY_ID**: Your OCPI party identifier
    - Example: `ABC`, `XYZ123`
- **OCPI_COUNTRY_CODE**: ISO 3166-1 alpha-2 country code (default: `IN`)
    - Examples: `IN` (India), `US` (United States), `GB` (United Kingdom)

### CDS (Catalog Discover Service) Configuration

- **CDS_BASE_URL**: Base URL of the CDS API
    - Example: `https://cds.example.com` or `https://api.cds.example.com`
- **CDS_API_KEY**: API key for authenticating with CDS
    - Get this from your CDS provider

## Optional Variables

### Logging Configuration

- **LOG_LEVEL**: Logging level (default: `info`)
    - Options: `error`, `warn`, `info`, `debug`
- **CLOUD_PROVIDER**: Cloud provider for logging (default: `local`)
    - Options: `local`, `gcp`, `aws`, `azure`
    - Set to `local` for development (logs to console only)

### AWS CloudWatch (if CLOUD_PROVIDER=aws)

- **AWS_REGION**: AWS region (default: `us-east-1`)
- **AWS_ACCESS_KEY_ID**: AWS access key ID
- **AWS_SECRET_ACCESS_KEY**: AWS secret access key

### GCP (if CLOUD_PROVIDER=gcp)

- **GOOGLE_APPLICATION_CREDENTIALS**: Path to GCP service account JSON key file
    - Example: `/path/to/service-account-key.json`
    - The service account needs Cloud Logging API access

### Azure (if CLOUD_PROVIDER=azure)

- **AZURE_STORAGE_ACCOUNT_NAME**: Azure storage account name
- **AZURE_STORAGE_ACCOUNT_KEY**: Azure storage account key

## Example .env File

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://postgres:mypassword@localhost:5432/ubc_ocpi_adaptor

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=super-secret-key-minimum-32-characters-long-change-in-production
JWT_EXPIRES_IN=24h

# OCPI
OCPI_VERSION=2.2.1
OCPI_PARTY_ID=MYCOMPANY
OCPI_COUNTRY_CODE=IN

# CDS
CDS_BASE_URL=https://cds.example.com
CDS_API_KEY=your-actual-cds-api-key-here

# Logging
LOG_LEVEL=info
CLOUD_PROVIDER=local
```

## Setup Instructions

1. Copy the example file:

    ```bash
    cp .env.example .env
    ```

2. Edit `.env` and fill in your actual values:
    - Replace `DATABASE_URL` with your PostgreSQL connection string
    - Generate a secure `JWT_SECRET` (use `openssl rand -base64 32`)
    - Set your `OCPI_PARTY_ID` and `OCPI_COUNTRY_CODE`
    - Add your `CDS_BASE_URL` and `CDS_API_KEY`

3. For production:
    - Use strong, unique values for all secrets
    - Set `NODE_ENV=production`
    - Configure cloud logging if needed
    - Never commit `.env` to version control (it's in `.gitignore`)

## Security Notes

- **Never commit `.env` file to git** - it contains sensitive information
- Use different `JWT_SECRET` values for different environments
- Rotate secrets regularly in production
- Use environment-specific values (dev, staging, prod)
- Consider using a secrets management service (AWS Secrets Manager, Azure Key Vault, etc.) for production
