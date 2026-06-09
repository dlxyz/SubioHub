# =============================================================================
# SubioHub Multi-Stage Dockerfile
# =============================================================================
# Stage 1: Build Go backend
# Stage 2: Final minimal image
# =============================================================================

ARG GOLANG_IMAGE=golang:1.26.2-alpine
ARG ALPINE_IMAGE=alpine:3.20
ARG GOPROXY=https://goproxy.cn,direct
ARG GOSUMDB=sum.golang.google.cn

# -----------------------------------------------------------------------------
# Stage 1: Backend Builder
# -----------------------------------------------------------------------------
FROM ${GOLANG_IMAGE} AS backend-builder

# Build arguments for version info (set by CI)
ARG VERSION=docker
ARG COMMIT=docker
ARG DATE
ARG GOPROXY
ARG GOSUMDB

ENV GOPROXY=${GOPROXY}
ENV GOSUMDB=${GOSUMDB}

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app/backend

# Copy go mod files first (better caching)
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy backend source
COPY backend/ ./

# Build the binary as an API service. The public web app is released separately
# from `next-web` and routed in front of this container by reverse proxy.
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X main.Commit=${COMMIT} -X main.Date=${DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)} -X main.BuildType=release" \
    -o /app/subiohub \
    ./cmd/server

# -----------------------------------------------------------------------------
# Stage 2: Final Runtime Image
# -----------------------------------------------------------------------------
FROM ${ALPINE_IMAGE}

# Labels
LABEL maintainer="dlxyz <github.com/dlxyz>"
LABEL description="SubioHub - AI API Gateway Platform"
LABEL org.opencontainers.image.source="https://github.com/dlxyz/SubioHub"

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    curl \
    su-exec \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1000 subiohub && \
    adduser -u 1000 -G subiohub -s /bin/sh -D subiohub

# Set working directory
WORKDIR /app

# Copy binary from builder
COPY --from=backend-builder /app/subiohub /app/subiohub

# Create data directory
RUN mkdir -p /app/data && chown -R subiohub:subiohub /app

# Copy entrypoint script (fixes volume permissions then drops to subiohub)
COPY deploy/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expose port (can be overridden by SERVER_PORT env var)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -q -T 5 -O /dev/null http://localhost:${SERVER_PORT:-8080}/health || exit 1

# Run the application (entrypoint fixes /app/data ownership then execs as subiohub)
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/subiohub"]
