# syntax=docker/dockerfile:1

FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/sim .

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/sim /sim
EXPOSE 8080
ENTRYPOINT ["/sim"]
