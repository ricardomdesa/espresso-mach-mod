FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/sim .

# Binário estático, sem libc: scratch basta (o simulador não faz TLS de saída
# nem usa shell). Evita depender de um registry externo para a imagem base.
FROM scratch
COPY --from=build /out/sim /sim
EXPOSE 8080
ENTRYPOINT ["/sim"]
