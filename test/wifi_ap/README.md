# Teste de Wi-Fi AP (bancada)

Sketch isolado para validar o rádio Wi-Fi do ESP32-C3 Super Mini em modo AP,
antes de integrar ao firmware principal (Fase 2). Não faz parte do firmware MVP.

## O que ele faz

1. Sobe em modo AP com SSID `Philco-Setup` (rede aberta, sem senha).
2. IP fixo `192.168.4.1` (padrão do ESP32 em modo AP).
3. Sobe um servidor HTTP na porta 80 com uma página de status.
4. Loga no Serial o estado do AP, clientes conectados e heap livre.

## Como testar

```bash
# Compilar e gravar
pio run -e wifi-ap-test -t upload

# Acompanhar o log (Serial via USB CDC nativo)
pio device monitor -e wifi-ap-test
```

No celular:

1. Conectar na rede Wi-Fi `Philco-Setup` (sem senha).
2. Abrir `http://192.168.4.1` no navegador.
3. Esperado: página com "Modo AP funcionando" e heap livre.

No Serial, esperado:

```
=== Teste Wi-Fi AP ===
AP iniciado. SSID: Philco-Setup
IP do AP: 192.168.4.1
MAC do AP: ...
Servidor HTTP na porta 80 (http://192.168.4.1)
Clientes conectados: 1   <- quando o celular conectar
```

## Critérios de aceite do teste

- [x] AP aparece como `Philco-Setup` na lista de redes do celular
- [x] Celular conecta sem senha
- [x] Serial mostra cliente conectado (`Clientes conectados: 1`)
- [ ] `http://192.168.4.1` responde com a página de status (em debug — GET chega no servidor, resposta ainda não renderiza no browser)
- [ ] Sem crash/reboot loop (heap estável)

## Observações

- O env `wifi-ap-test` usa `src_filter = +<../test/wifi_ap>` porque `src_dir`
  é opção global do PlatformIO (não funciona por-env). O firmware principal
  (`esp32-c3-super-mini`) não é afetado.
- Este teste valida só o modo AP. O fluxo completo de provisionamento
  (AP → receber credencial → STA + mDNS) será coberto pelo SDD-005.