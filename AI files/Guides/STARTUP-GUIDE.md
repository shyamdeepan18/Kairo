# ERP Application Startup Guide

This document registers the required steps to "kickstart" and run the ERP application in your local development environment.

## 1. Prerequisites
Before starting the application, ensure you have the following installed and running:
- **Docker Desktop** (or Docker daemon)
- **Node.js** & **pnpm** (for package management)

## 2. Start the Backend Infrastructure
The backend relies on containerized databases (PostgreSQL and Redis). To start them, open a terminal, navigate to the ERP directory, and use Docker Compose:

```bash
cd /Users/shyam18/SEGA/ERP

# Start the databases in detached mode
docker compose -f docker-compose.dev.yml up -d
```
*(Note: Use `docker-compose.yml` instead if you want to run the entire stack including the API and Web containers via Docker).*

## 3. Run the Development Servers
With the database running, you can start the API and frontend web development servers using Turborepo:

```bash
cd /Users/shyam18/SEGA/ERP

# Install dependencies if you haven't already
pnpm install

# Start the development servers
pnpm run dev
```

