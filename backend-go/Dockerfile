FROM docker.io/library/golang:1.23-bookworm AS build
WORKDIR /src
COPY go.mod ./
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/xulyvfm-backend .

FROM docker.io/library/ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates gdal-bin \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 app
COPY --from=build /out/xulyvfm-backend /usr/local/bin/xulyvfm-backend
USER app
WORKDIR /home/app
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/xulyvfm-backend"]
