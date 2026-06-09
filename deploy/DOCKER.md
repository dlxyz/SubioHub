# SubioHub Docker Images

SubioHub is now released as two Docker images for a complete AI gateway and model relay stack:
- `guoziji/subiohub`: API service and admin backend
- `guoziji/subiohub-next-web`: public Next.js web app for SSR, SEO, i18n, and news pages

The stack is not limited to account auth or subscription resale. It also supports unified upstream API key / OAuth integration, OpenAI-compatible model relay, channel routing, quota control, and operations management.

## Quick Start

```bash
git clone https://github.com/dlxyz/SubioHub.git
cd subiohub/deploy
cp .env.example .env
docker compose -f docker-compose.local.yml up -d
```

## Docker Compose

```yaml
services:
  web:
    image: caddy:2-alpine
    ports:
      - "8080:80"
    depends_on:
      - next-web
      - subiohub

  next-web:
    image: guoziji/subiohub-next-web:latest
    environment:
      - NEXT_PUBLIC_SITE_URL=https://your-domain.example
      - NEXT_SERVER_API_ORIGIN=http://subiohub:8080

  subiohub:
    image: guoziji/subiohub:latest
    environment:
      - SERVER_FRONTEND_URL=https://your-domain.example
      - DATABASE_HOST=postgres
      - REDIS_HOST=redis
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:18-alpine
    environment:
      - POSTGRES_USER=subiohub
      - POSTGRES_PASSWORD=change-me
      - POSTGRES_DB=subiohub

  redis:
    image: redis:8-alpine
```

Recommended files:
- `deploy/docker-compose.local.yml`: local directory storage, easy migration
- `deploy/docker-compose.yml`: named volumes
- `deploy/Caddyfile`: reverse proxy routing `web -> next-web/subiohub`
- `deploy/.env.example`: required environment variables template

## Key Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SITE_URL` | Public canonical URL for SSR metadata, sitemap, and public web links |
| `NEXT_SERVER_API_ORIGIN` | Internal backend origin used by `next-web` in Docker |
| `NEXT_PUBLIC_API_URL` | Optional browser API base URL; leave empty for same-origin |
| `SERVER_FRONTEND_URL` | Public site URL used by backend-generated external links |
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `REDIS_URL` | Redis connection string | Yes | - |

- `linux/amd64`
- `linux/arm64`

## Tags

- `latest` - Latest stable release
- `x.y.z` - Specific version
- `x.y` - Latest patch of minor version
- `x` - Latest minor of major version

## Links

- [GitHub Repository](https://github.com/dlxyz/SubioHub)
- [Documentation](https://github.com/dlxyz/SubioHub#readme)
