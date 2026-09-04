# SDD-008 — Épico 8: Diário do Barista (registro de extrações)

- **Status:** Proposto — plano de implementação aprovado, código não iniciado (2026-09-04)
- **Épico:** 8 (Fase 2)
- **Pré-requisitos:** Épico 7 (App Android — SDD-007) implementado; histórico local funcionando com curva de temperatura
- **Plataforma alvo:** Android 10+ (API 29+); iOS acompanha sem código específico
- **Stack:** a existente do app (React 18, TypeScript, Capacitor 6, Tailwind 3.4, recharts) + `@capacitor/camera` + `@capacitor/filesystem`

---

## 1. Problema

Acertar espresso em porta-filtro não pressurizado é um processo de eliminação: cada variável (moagem, dose, distribuição, temperatura, tempo) muda o resultado, e a única forma de progredir é **mudar uma coisa por vez e registrar**. Hoje o app registra automaticamente o que a máquina mede — curva de temperatura, duração, médias — mas tudo que o barista sabe cai num único `textarea` de texto livre (`ExtractionRecord.notes`, editado em `HistoryScreen.tsx`).

Consequências práticas, observadas no uso real:

1. **Sem estrutura, não há comparação.** "Moagem 8, 18 g, azedo" e "18g / clique 8 / ácido" são o mesmo dado escrito de dois jeitos; nenhum dos dois pode ser filtrado, ordenado ou comparado.
2. **Sem fotos, o diagnóstico se perde.** Canalização, distribuição irregular e cor da crema são informação visual. Descrever em texto não recupera depois.
3. **Todo o input acontece no pior momento.** Ao fim da extração o barista está com a xícara na mão e o porta-filtro sujo; é quando o app pede que ele digite tudo. Na prática, ele não digita.
4. **O "o que eu ia mudar" evapora.** A decisão do próximo ajuste é tomada ao provar o café e cobrada no dia seguinte, na frente do moedor. Nada no app carrega essa nota de um shot para o próximo.

## 2. Objetivos

1. Substituir o campo de texto livre por um **registro estruturado** de preparo e avaliação, sem perder as anotações já existentes.
2. **Dividir o input em dois momentos** — preparo (antes da extração) e avaliação (depois de provar) — para que nada precise ser preenchido de uma vez só.
3. Suportar **fotos por shot**, marcadas por fase (puck nivelado, puck tampado, jato, xícara, fundo do puck), armazenadas em disco e não no store de chave-valor.
4. Registrar **cafés (grãos)** como entidade própria, com dias de descanso derivados da data de torra.
5. Tornar a regra "**uma variável por vez**" um efeito da interface, não uma disciplina do usuário: o preparo abre com os valores do shot anterior e marca sozinho o que foi alterado.
6. Carregar a nota "**mudar na próxima**" do shot anterior para o topo do preparo seguinte.
7. Manter tudo **100% local e offline**, sem backend e sem conta de usuário.
8. Não quebrar nada do fluxo atual: quem extrai sem preparar pelo app continua tendo o registro criado automaticamente.

**Não-objetivos (deste épico):**

- Sugestão automática de ajuste (heurística "azedo + rápido → moer mais fino"). Fica para SDD-009.
- Qualquer uso de IA/LLM sobre fotos ou histórico. Depende de massa de dado estruturado, que este épico é quem produz.
- Sincronização com nuvem, conta de usuário, compartilhamento ou feed social.
- Balança Bluetooth (dose e yield são digitados à mão).
- Refratômetro / TDS / percentual de extração.
- Publicação na Play Store.
- Métodos não-espresso (V60, prensa, Aeropress).

## 3. Contexto / Arquitetura Atual

O que já existe e será reaproveitado:

| Peça | Arquivo | Papel neste épico |
|---|---|---|
| `ExtractionRecord` | `app/src/api/types.ts` | Registro por extração: `id`, `date`, `duration_s`, `profileName`, `tempAvg`, `pressAvg`, `tempTarget`, `samples[]`, `notes` |
| `useLocalHistory` | `app/src/hooks/useLocalHistory.ts` | Persistência em Capacitor Preferences (chave `philco_extraction_history`), com `add/update/remove/clear` e trim em 500 registros |
| Criação do registro | `app/src/screens/DashboardScreen.tsx` (~L155-190) | Ao sair do estado `extracting`, agrega os frames do WebSocket, reamostra a curva para ~120 pontos e chama `addHistoryRecord` |
| `HistoryScreen` | `app/src/screens/HistoryScreen.tsx` | Lista, expande, mostra `LiveChart` da curva e edita `notes` |
| `LiveChart` | `app/src/components/LiveChart.tsx` | Renderiza `ExtractionSample[]` — serve tanto ao vivo quanto no histórico |
| `profileStore` | `app/src/utils/profileStore.ts` | **Padrão de referência** para o novo `shotRepository`: módulo puro de storage, separado do hook de React |
| Rotas fora do guard | `app/src/App.tsx` (L39-45) | `/history`, `/profiles` e `/settings` já abrem com a máquina desligada — o diário herda isso |

Restrições herdadas que este épico não pode violar:

- **Offline-first.** O app abre e é útil sem a máquina ligada (`shellReady` em `App.tsx`).
- **Sem backend.** Nada sai do aparelho.
- **Preferences é `SharedPreferences` no Android** — um XML lido inteiro para a memória. É adequado para índices e configuração; é inadequado para blobs grandes e proibitivo para binários.

## 4. Requisitos

### Funcionais

**Preparo (antes da extração)**

- RF-01 — Criar um *rascunho* de shot com grão, moagem, dose (g), método de distribuição e fotos do puck, antes de extrair.
- RF-02 — Existe no máximo **um rascunho aberto por vez**. Tentar criar outro oferece continuar o existente ou descartá-lo.
- RF-03 — O rascunho aberto é visível no dashboard, resumido (`18,0 g · moagem 7 · Bourbon Amarelo`), com um toque para voltar a editá-lo.
- RF-04 — O rascunho sobrevive ao fechamento do app e ao desligamento da tela.
- RF-05 — O preparo abre pré-preenchido com os valores do último shot concluído; todo campo alterado entra em `changedFields`.
- RF-06 — O `nextChange` do último shot concluído aparece fixo no topo do preparo.
- RF-07 — Descartar um rascunho apaga também as fotos que ele já gravou em disco.

**Extração (automática)**

- RF-08 — Quando a extração inicia (estado `extracting` via WebSocket) e existe um rascunho aberto, os dados da máquina são anexados a ele.
- RF-09 — Sem rascunho aberto, o comportamento atual é preservado: um registro novo é criado ao fim, já em estado `pending_review`.
- RF-10 — Ao fim da extração, o registro vai para `pending_review`. **Nenhum modal, nenhuma navegação forçada** — apenas um contador no item "Histórico" da barra inferior.
- RF-11 — Um rascunho pode ser concluído sem extração pelo app ("concluir sem curva"), com o tempo digitado à mão e `source: 'manual'`.

**Avaliação (depois de provar)**

- RF-12 — Registrar yield (g), tempo até a primeira gota (s), notas de sabor (multi-seleção), canalização (sim/não), nota de 1 a 5, observações livres e a próxima mudança pretendida.
- RF-13 — Adicionar fotos marcadas por fase: `puckLevel`, `puckTamped`, `stream`, `cup`, `spentPuck`. Máximo de 6 por shot.
- RF-14 — Ratio (`yieldG / doseG`) e vazão (`yieldG / duration_s`) são **exibidos e nunca persistidos**.
- RF-15 — Ver a curva de temperatura da extração junto da avaliação, reutilizando `LiveChart`.
- RF-16 — Comparar o shot com o anterior (`parentShotId`): apenas os campos diferentes, lado a lado.

**Grãos**

- RF-17 — CRUD de grãos: nome, torrefação, origem, processo, nível de torra, data da torra, data de abertura, preço/kg, foto do pacote, observações, arquivado.
- RF-18 — Dias de descanso derivados de `roastDate` e exibidos junto ao grão no preparo e no histórico.
- RF-19 — Arquivar um grão o tira dos seletores sem apagar o histórico que o referencia.

**Histórico**

- RF-20 — Cada item da lista mostra grão, moagem, dose→yield, ratio, tempo, nota e miniatura, sem carregar a curva.
- RF-21 — Filtrar por grão e por estado (`pending_review`, `done`).
- RF-22 — Exportar todo o diário como um único JSON (fotos referenciadas por caminho relativo), para backup manual.

**Migração**

- RF-23 — Registros existentes (schema 1) são convertidos sem perda; o `notes` antigo é preservado literalmente e exibido como "anotação original".
- RF-24 — A chave original é mantida como backup e não é apagada pela migração.

### Não-funcionais

- RNF-01 — Abrir o histórico com 500 registros em menos de 300 ms, sem carregar curvas nem fotos.
- RNF-02 — Fotos comprimidas na captura: largura máxima 1280 px, qualidade 70, alvo ≤ 300 KB por arquivo.
- RNF-03 — Nenhum binário (nem base64) gravado em Preferences.
- RNF-04 — Toda a persistência acessível por um único módulo (`shotRepository`), para que a troca para SQLite seja localizada.
- RNF-05 — Telas de preparo e avaliação operáveis com uma das mãos e com o polegar sujo: alvos de toque ≥ 44 px, teclado numérico decimal nos campos de peso.
- RNF-06 — A migração é idempotente: rodar duas vezes não duplica nem perde dado.
- RNF-07 — Todo texto de interface em português, seguindo a paleta "Latte" já definida (SDD-007 D9).

## 5. Decisões de Design (ADR)

### D1 — Acoplar ao app existente, não criar um app novo

Foi considerado um app separado, dedicado ao diário. Rejeitado.

O registro **nasce da máquina**: `DashboardScreen` já cria o `ExtractionRecord` com a curva reamostrada no momento em que a extração termina. Num app separado, essa curva teria que ser exportada e importada à mão — e a curva é exatamente o dado que nenhum concorrente de diário de espresso tem. Somado a isso, a stack do app atual (React + Capacitor + Preferences + Tailwind + recharts) é a mesma que seria escolhida do zero, e `/history` já abre com a máquina desligada. Um app novo custaria a reescrita da parte difícil para ganhar apenas separação conceitual entre "controlar a máquina" e "registrar o café" — que na prática são o mesmo ato.

### D2 — Um registro com estados, não duas entidades

O rascunho de preparo e o registro de extração são o **mesmo objeto** em momentos diferentes do ciclo de vida, distinguidos por `log.status`:

```
draft ──(extraction_started)──▶ extracting ──(extraction_stopped)──▶ pending_review ──(avaliação salva)──▶ done
  │                                                                        ▲
  └──────────────(concluir sem curva)─────────────────────────────────────┘

(sem rascunho aberto) ──(extraction_stopped)──▶ pending_review
```

Modelar preparo como entidade separada exigiria uma regra de junção ("qual preparo pertence a qual extração") e um estado intermediário órfão quando a junção falha. Com um objeto só, a extração apenas preenche campos de um registro que já existe.

### D3 — No máximo um rascunho aberto

A máquina tem um porta-filtro. Permitir dois rascunhos abertos criaria a ambiguidade que D2 eliminou. A regra é validada na escrita (`shotRepository.openDraft()` recusa criar um segundo) e a interface oferece continuar ou descartar.

### D4 — Fotos no Filesystem; o registro guarda só o caminho

`Preferences` no Android é `SharedPreferences`: um XML carregado inteiro na memória a cada leitura. O histórico já é hoje um único valor JSON — 500 registros × ~120 amostras ≈ 1,5–2 MB. Uma foto em base64 nesse valor (mesmo comprimida, ~400 KB → ~530 KB em base64) inviabiliza o app em poucos shots.

Fotos são gravadas por `@capacitor/filesystem` em `Directory.Data`, sob `shots/<shotId>/<uuid>.jpg`. O registro guarda `{ path, kind }`. Apagar um shot apaga o diretório. Um varredor de órfãos roda no boot e remove diretórios sem registro correspondente (falha de app entre gravar a foto e salvar o registro).

### D5 — Storage particionado: um índice leve + um shard por shot

A estrutura atual (uma chave com a lista inteira) obriga a carregar todas as curvas para desenhar a lista. Com os campos do diário e as miniaturas, isso piora. Nova organização:

| Chave | Conteúdo | Tamanho estimado |
|---|---|---|
| `philco.shots.index` | `ShotIndexEntry[]` — só o que a lista exibe | ~200 B/shot → ~100 KB em 500 shots |
| `philco.shot.<id>` | `ShotRecord` completo, com `samples` e `log` | ~4 KB/shot |
| `philco.shots.draft` | `id` do rascunho aberto, ou ausente | desprezível |
| `philco.beans` | `Bean[]` | pequeno |
| `philco.schema` | `"2"` | — |
| `philco_extraction_history` | **backup intocado** do schema 1 | ~2 MB |

O índice é a fonte da lista e dos filtros; o shard só é lido ao abrir um shot. Gatilho para migrar a SQLite (fora deste épico): o índice passar de ~1 MB ou a lista ficar perceptivelmente lenta.

### D6 — `changedFields` é derivado da interface, não digitado

A tela de preparo abre com os valores do último shot `done`. Ao salvar, compara o formulário com esses valores iniciais e grava a lista de campos diferentes. O usuário não declara o que mudou; ele produz a declaração ao usar a tela. É isso que torna "uma variável por vez" verificável — se `changedFields.length > 1`, a interface avisa (sem bloquear: às vezes trocar de grão e de moagem junto é intencional).

### D7 — O que a máquina mede fica fora de `log`

`samples`, `duration_s`, `tempAvg`, `pressAvg`, `tempTarget` continuam no nível raiz do registro. Tudo que o humano digita fica dentro de `log`. A fronteira importa para saber no que confiar quando os dois discordarem, e para a fase de IA, que precisa distinguir medição de percepção.

### D8 — A avaliação nunca bloqueia

Ao fim da extração o barista está ocupado. Modal, navegação automática ou campo obrigatório nesse instante é o mecanismo pelo qual apps de diário são desinstalados. O sinal é passivo: um contador no item "Histórico" da barra inferior e um destaque no card. O registro fica utilizável para sempre em `pending_review`.

### D9 — Ratio e vazão são derivados, nunca persistidos

Persistir ratio cria divergência assim que a dose é corrigida. São funções puras em `utils/derived.ts`, calculadas na renderização.

### D10 — Moagem é `string`, não número

Cada moedor tem sua escala (cliques, números, micron, marcações arbitrárias), e o moedor pode ser trocado. Guardar `"7"`, `"7.5"` ou `"12 cliques"` como texto evita uma conversão que não existe. O stepper de mais/menos opera sobre o valor quando ele é numérico e cai para campo de texto quando não é.

### D11 — Sem IA nesta fase

A heurística clássica (azedo + rápido → mais fino; amargo + lento → mais grosso) é determinística, explicável e de custo zero — mas só tem valor sobre dado estruturado, que este épico é quem passa a produzir. Entra em SDD-009 como baseline, antes de qualquer LLM.

## 6. Estrutura de Código

### Arquivos

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| editar | `app/src/api/types.ts` | `ShotLog`, `ShotPhoto`, `ShotStatus`, `TasteTag`, `Bean`, `ShotIndexEntry`, `ShotRecord` |
| novo | `app/src/utils/shotRepository.ts` | Storage puro: índice, shards, rascunho, migração. Espelha o padrão de `profileStore.ts` |
| novo | `app/src/utils/photoStore.ts` | Captura (Camera), gravação/leitura/remoção (Filesystem), varredura de órfãos |
| novo | `app/src/utils/beanStore.ts` | CRUD de grãos, `restDays()` |
| novo | `app/src/utils/derived.ts` | `ratio()`, `flowRate()`, `diffShots()`, `restDays()` |
| novo | `app/src/hooks/useShots.ts` | Hook sobre o repositório (substitui `useLocalHistory`) |
| novo | `app/src/hooks/useDraft.ts` | Rascunho aberto: ler, criar, atualizar, descartar, concluir |
| novo | `app/src/screens/PrepScreen.tsx` | Formulário de preparo |
| novo | `app/src/screens/ShotDetailScreen.tsx` | Avaliação, fotos, curva, diff com o shot anterior |
| novo | `app/src/screens/BeansScreen.tsx` | Lista e edição de grãos |
| novo | `app/src/components/PhotoPicker.tsx` | Grade de fotos por `kind`, captura e remoção |
| novo | `app/src/components/TasteTags.tsx` | Chips de sabor multi-seleção |
| novo | `app/src/components/GrindStepper.tsx` | Stepper de moagem mostrando `anterior → atual` |
| novo | `app/src/components/ShotCard.tsx` | Item do histórico |
| novo | `app/src/components/DraftChip.tsx` | Resumo do rascunho aberto no dashboard |
| editar | `app/src/screens/HistoryScreen.tsx` | Passa a listar pelo índice, com filtros e badge de pendentes |
| editar | `app/src/screens/DashboardScreen.tsx` | Anexa a extração ao rascunho aberto; exibe `DraftChip` |
| editar | `app/src/components/BottomNav.tsx` | Contador de `pending_review` sobre o ícone de Histórico |
| editar | `app/src/App.tsx` | Rotas `/prep`, `/shots/:id`, `/beans` |
| remover | `app/src/hooks/useLocalHistory.ts` | Substituído por `useShots` (remover só ao fim da Fase 1) |

Dependências novas: `@capacitor/camera`, `@capacitor/filesystem`.

A barra inferior continua com cinco itens. "Grãos" **não** entra nela — é alcançado pelo cabeçalho do Histórico.

### Contrato TypeScript

```ts
// ---------- registro ----------

export type ShotStatus = 'draft' | 'extracting' | 'pending_review' | 'done'

export type PhotoKind = 'puckLevel' | 'puckTamped' | 'stream' | 'cup' | 'spentPuck'

export type TasteTag =
  | 'sour' | 'bitter' | 'astringent' | 'balanced'
  | 'watery' | 'sweet' | 'fruity' | 'burnt'

export interface ShotPhoto {
  /** Caminho relativo em Directory.Data: shots/<shotId>/<uuid>.jpg */
  path: string
  kind: PhotoKind
  takenAt: string
}

export interface ShotLog {
  status: ShotStatus

  // --- preparo (antes da extração) ---
  beanId?: string
  /** Texto: cada moedor tem escala própria (D10). */
  grindSetting?: string
  doseG?: number
  distribution?: 'none' | 'wdt' | 'tap'
  /** Shot que serviu de base; alimenta o diff (RF-16). */
  parentShotId?: string
  /** Derivado da tela de preparo, não digitado (D6). */
  changedFields?: string[]

  // --- avaliação (depois de provar) ---
  yieldG?: number
  firstDropS?: number
  taste?: TasteTag[]
  channeling?: boolean
  /** 1 a 5. */
  rating?: number
  notes?: string
  /** Aparece no topo do preparo seguinte (RF-06). */
  nextChange?: string

  photos?: ShotPhoto[]

  // --- migração ---
  /** `notes` do schema 1, preservado literalmente (RF-23). */
  legacyNotes?: string
}

/** Estende o ExtractionRecord atual; nenhum campo existente muda de tipo. */
export interface ShotRecord extends ExtractionRecord {
  schema: 2
  source: 'machine' | 'manual'
  log: ShotLog
}

/** O que a lista precisa. Nunca contém `samples` nem fotos. */
export interface ShotIndexEntry {
  id: string
  date: string
  status: ShotStatus
  profileName: string
  duration_s: number
  beanId?: string
  grindSetting?: string
  doseG?: number
  yieldG?: number
  rating?: number
  hasCurve: boolean
  thumbPath?: string
}

// ---------- grão ----------

export interface Bean {
  id: string
  name: string
  roaster?: string
  origin?: string
  process?: string
  roastLevel?: 'light' | 'medium' | 'dark'
  /** ISO date; base do cálculo de dias de descanso (RF-18). */
  roastDate?: string
  openedDate?: string
  pricePerKg?: number
  photoPath?: string
  notes?: string
  archived: boolean
}
```

### API do repositório

```ts
// utils/shotRepository.ts — módulo puro, sem React
export async function migrate(): Promise<{ migrated: number }>   // idempotente
export async function getIndex(): Promise<ShotIndexEntry[]>
export async function getShot(id: string): Promise<ShotRecord | null>
export async function saveShot(shot: ShotRecord): Promise<void>  // grava shard + reindexa
export async function removeShot(id: string): Promise<void>      // apaga shard, índice e fotos
export async function exportAll(): Promise<string>               // JSON (RF-22)

// rascunho (D3)
export async function getDraft(): Promise<ShotRecord | null>
export async function openDraft(seed: Partial<ShotLog>): Promise<ShotRecord>  // erro se já houver
export async function discardDraft(): Promise<void>              // apaga fotos junto (RF-07)
export async function bindExtraction(machineData: MachineShotData): Promise<ShotRecord>
```

`bindExtraction` é o único ponto de junção entre máquina e diário: recebe o que `DashboardScreen` hoje passa para `addHistoryRecord`, anexa ao rascunho aberto se existir, e cria um registro novo em `pending_review` se não existir (RF-09).

### Fluxo de telas

```
Extrair (/)                    Histórico (/history)
  ├─ DraftChip ──▶ /prep         ├─ filtros: grão · pendentes
  │                              ├─ ShotCard ──▶ /shots/:id
  └─ curva ao vivo               └─ cabeçalho ──▶ /beans

/prep                          /shots/:id                    /beans
  grão · moagem · dose           curva · diff com o pai        lista de grãos
  distribuição · fotos           yield · primeira gota          editar / arquivar
  "da última vez: ..."           sabor · nota · canalização
  ▶ Pronto pra extrair           fotos · próxima mudança
  ▶ Concluir sem curva           ▶ Salvar avaliação
```

### Migração (schema 1 → 2)

Idempotente e não destrutiva. Executada uma vez no boot do app, antes da primeira renderização do histórico.

1. Ler `philco.schema`. Se for `"2"`, sair.
2. Ler `philco_extraction_history`. Se ausente, gravar `philco.schema = "2"` e sair.
3. Para cada registro antigo, gravar o shard `philco.shot.<id>` com:
   - todos os campos originais preservados;
   - `schema: 2`, `source: 'machine'`;
   - `log: { status: 'done', legacyNotes: <notes original> }`.
4. Gravar `philco.shots.index` derivado dos shards.
5. Gravar `philco.schema = "2"`.
6. **Não apagar** `philco_extraction_history` (RF-24). Serve de backup e de rede de segurança para meses de calibração.

A ordem importa: shards primeiro, índice depois, marca de schema por último. Uma falha no meio deixa o app no schema 1, e a migração roda de novo na próxima abertura.

## 7. Testes

Não há infraestrutura de teste no app hoje. Este épico introduz `vitest` para os módulos puros — sem testar componentes, o que exigiria ambiente de DOM e não paga o custo agora.

**Automatizados (`vitest`, `app/src/**/*.test.ts`)**

| Alvo | Casos |
|---|---|
| `shotRepository.migrate` | schema 1 com N registros → N shards + índice; roda duas vezes sem duplicar; `notes` vira `legacyNotes`; chave antiga intacta; store vazio |
| `shotRepository` rascunho | `openDraft` recusa segundo rascunho; `discardDraft` limpa a chave; `bindExtraction` com e sem rascunho aberto |
| `shotRepository` índice | `saveShot` reindexa; `removeShot` some do índice; ordenação por data desc |
| `derived` | `ratio` com dose zero/ausente; `flowRate`; `diffShots` ignora campos ausentes nos dois lados |
| `beanStore.restDays` | data futura, mesmo dia, ausente, fuso |

`Preferences` e `Filesystem` são injetados/mockados; nenhum teste toca o dispositivo.

**Manuais no dispositivo (checklist de aceite)**

1. Preparar um shot, matar o app, reabrir → rascunho intacto no dashboard.
2. Preparar, extrair de verdade → a curva chega ao mesmo registro; estado `pending_review`; contador na barra inferior.
3. Extrair **sem** preparar → registro criado como antes.
4. Preparar, extrair pelo botão físico da máquina, "concluir sem curva" → `source: 'manual'`, tempo digitado.
5. Tirar 4 fotos num shot, apagar o shot → diretório `shots/<id>/` some.
6. Descartar rascunho com fotos → arquivos apagados.
7. Instalar sobre a versão anterior com histórico real → migração sem perda, `legacyNotes` visível.
8. 500 registros sintéticos → histórico abre em < 300 ms (RNF-01).
9. Negar a permissão de câmera → o app continua utilizável, com aviso claro no `PhotoPicker`.

## 8. Riscos e Mitigações

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| R1 | Perda dos meses de histórico de calibração na migração | Alto | Migração idempotente, escrita em ordem segura, chave original preservada (RF-24), export JSON antes de subir a versão |
| R2 | `SharedPreferences` degradar com o crescimento | Médio | Índice separado dos shards (D5); nenhum binário no store (D4); gatilho de SQLite documentado |
| R3 | Fotos órfãs consumindo disco | Médio | Varredura no boot compara `shots/*` com o índice e remove o que sobra |
| R4 | Corrida entre iniciar a extração e salvar o rascunho | Médio | `bindExtraction` é chamado no **fim** da extração, não no início; o rascunho é lido nesse instante |
| R5 | Permissões de câmera/mídia no Android 13+ | Médio | `@capacitor/camera` com permissões declaradas no manifesto; degradar para "sem foto" em vez de travar |
| R6 | Excesso de campos matar o hábito de registrar | Alto | Só grão, moagem e dose são de fato preenchidos no preparo; todo o resto é opcional; nada bloqueia (D8) |
| R7 | Fotos estourarem o armazenamento do aparelho | Baixo | Compressão na captura (RNF-02), máximo de 6 por shot, tela de Ajustes mostra o espaço ocupado |
| R8 | Regressão no fluxo de extração atual | Alto | Fase 1 não altera interface; `bindExtraction` mantém o caminho sem rascunho idêntico ao de hoje |

## 9. Plano de Implementação

Cada fase é entregável e testável sozinha. As fases 1 e 2 são o núcleo; da 4 em diante é incremento.

**Fase 1 — Fundação de storage (sem mudança visível)**
1. Estender `api/types.ts` com os contratos de §6.
2. Instalar `@capacitor/camera` e `@capacitor/filesystem`; declarar permissões no manifesto Android.
3. Escrever `shotRepository.ts`: índice, shards, rascunho, export.
4. Escrever `migrate()` e chamá-la no boot, antes da primeira renderização do histórico.
5. Escrever `photoStore.ts` (captura, gravação, remoção, varredura de órfãos) e `derived.ts`.
6. Trocar `useLocalHistory` por `useShots` em `HistoryScreen` e `DashboardScreen`, **sem alterar a interface**.
7. Testes de migração e repositório.
*Aceite: o app se comporta exatamente como antes; o histórico existente aparece intacto; os dados já estão no schema 2.*

**Fase 2 — Preparo e ciclo de vida**
8. `useDraft`, `PrepScreen`, `GrindStepper`, rota `/prep`.
9. `DraftChip` no dashboard.
10. `bindExtraction` ligado ao fim da extração em `DashboardScreen`.
11. "Concluir sem curva" (RF-11).
12. Contador de `pending_review` na `BottomNav`.
*Aceite: itens 1 a 4 do checklist manual passam.*

**Fase 3 — Avaliação e fotos**
13. `PhotoPicker`, `TasteTags`.
14. `ShotDetailScreen` com curva (`LiveChart` reaproveitado), avaliação e fotos.
15. `HistoryScreen` reescrito sobre o índice, com `ShotCard` e miniatura.
16. `legacyNotes` exibido como "anotação original".
*Aceite: itens 5 a 7 do checklist passam; um shot completo é registrável de ponta a ponta.*

**Fase 4 — Grãos**
17. `beanStore`, `BeansScreen`, seletor no preparo, dias de descanso.
18. Filtro por grão no histórico.

**Fase 5 — Linhagem**
19. `parentShotId` preenchido pelo "clonar último" no preparo.
20. `changedFields` derivado (D6), com aviso de mais de uma variável alterada.
21. Diff com o shot anterior em `ShotDetailScreen`.
22. `nextChange` carregado para o topo do preparo.

**Fase 6 — Acabamento**
23. Busca e filtros no histórico; export JSON na tela de Ajustes.
24. Espaço ocupado por fotos em Ajustes; varredura de órfãos manual.

## 10. Critérios de Aceite (resumo)

- [ ] Histórico existente migrado sem perda; `notes` antigo visível como "anotação original"; chave `philco_extraction_history` preservada.
- [ ] Um rascunho de preparo é criado antes da extração, sobrevive ao fechamento do app e aparece no dashboard.
- [ ] Só existe um rascunho aberto por vez.
- [ ] A extração feita pelo app anexa curva e tempos ao rascunho aberto; sem rascunho, o registro é criado como antes.
- [ ] Ao fim da extração nada bloqueia a tela; o pendente aparece como contador em Histórico.
- [ ] Um rascunho pode ser concluído sem curva, com tempo digitado.
- [ ] Fotos por fase são gravadas em `Directory.Data`, nunca em Preferences, e somem quando o shot ou o rascunho é apagado.
- [ ] Grãos com dias de descanso derivados; arquivar não afeta o histórico.
- [ ] Ratio e vazão exibidos e não persistidos.
- [ ] `changedFields` derivado da interface, com aviso quando passa de um.
- [ ] `nextChange` do shot anterior aparece no topo do preparo seguinte.
- [ ] Histórico com 500 registros abre em menos de 300 ms.
- [ ] Export JSON completo disponível em Ajustes.
- [ ] Build TypeScript limpo; `vitest` verde.

## 11. Deferred (fora deste épico)

- **SDD-009 — Sugestão de ajuste:** heurística determinística sobre sabor + parâmetros + curva, como baseline explicável antes de qualquer modelo.
- **IA sobre fotos:** diagnóstico de canalização e distribuição a partir de `puckLevel` / `stream` / `spentPuck`. Depende da massa de dado que este épico passa a produzir.
- **SQLite:** troca de `Preferences` por `@capacitor-community/sqlite`, localizada em `shotRepository`. Gatilho: índice > 1 MB ou lista perceptivelmente lenta.
- **Balança Bluetooth:** dose e yield automáticos.
- **Detecção automática da primeira gota** a partir da bomba/pressão no firmware.
- **Sincronização, conta de usuário, compartilhamento.**
- **TDS / refratômetro / percentual de extração.**
- **Métodos não-espresso.**
