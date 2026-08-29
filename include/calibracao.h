#pragma once

// Calibração do sensor de temperatura (MAX6675 + termopar tipo K).
// valor_calibrado = valor_bruto * TEMP_CAL_GAIN + TEMP_CAL_OFFSET
//
// Valores iniciais neutros. Ajustar contra um termômetro de referência depois
// da montagem: medir a caldeira em regime, comparar com o valor exibido e
// corrigir o offset (erro constante) e, se necessário, o ganho (erro que cresce
// com a temperatura). Registrar os valores finais em docs/sdd/002-sensor-temperatura.md.
#define TEMP_CAL_OFFSET 0.0f
#define TEMP_CAL_GAIN 1.0f
