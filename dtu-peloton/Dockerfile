FROM rust:1.85-alpine AS builder

WORKDIR /src
COPY Cargo.toml Cargo.lock* ./
# Create dummy main to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src

COPY . .
RUN touch src/main.rs && cargo build --release

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=builder /src/target/release/dtu-peloton /usr/local/bin/dtu-peloton
EXPOSE 4201
ENV PORT=4201
ENTRYPOINT ["dtu-peloton"]
