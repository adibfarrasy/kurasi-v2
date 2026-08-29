FROM rust:1.82-bookworm AS builder
WORKDIR /usr/src/kurasi
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m appuser
WORKDIR /app
COPY --from=builder /usr/src/kurasi/target/release/kurasi-backend /usr/local/bin/kurasi-backend
USER appuser
ENV PORT=8989
EXPOSE 8989
CMD ["kurasi-backend"]