# Histórico de Alterações do Projeto Report IA Force

Este documento detalha as etapas de configuração e desenvolvimento realizadas no projeto "Report IA Force" até o momento. Ele serve como um guia para retomar o trabalho ou para um novo desenvolvedor entender o estado atual do projeto.

## 1. Análise Inicial e Configuração do Backend

*   **Análise dos READMEs:** Foram lidos os arquivos `README.md` da raiz, `backend/README.md` e `frontend/README.md` para entender a visão geral do projeto e os requisitos iniciais.
*   **Configuração Inicial do Backend (`backend/`):**
    *   O arquivo `backend/package.json` foi verificado. As dependências `cors`, `dotenv`, `express`, `node-fetch` já estavam presentes.
    *   O arquivo `backend/index.js` foi refatorado para atuar como um proxy para a API da Hablla.
    *   **Funcionalidades Implementadas no Backend:**
        *   Rotas para `/api/cards`, `/api/tags`, `/api/sectors` para buscar dados da API da Hablla.
        *   Lógica de paginação implementada na função `fetchHabllaAPI` para garantir que todos os resultados sejam buscados.
        *   Tratamento de erros básico para requisições à API externa.
    *   **Depuração do Backend:**
        *   Adicionados `console.log` em `backend/index.js` para verificar o carregamento das variáveis de ambiente (`WORKSPACE_ID_HABLLA`, `API_TOKEN_HABLLA`) e para logar a URL exata das requisições feitas à API da Hablla.
        *   **Correção Importante:** Foi identificado e corrigido o problema onde o cabeçalho `Authorization` no backend estava enviando "Bearer " antes do token, quando a API da Hablla esperava apenas o token. O código foi ajustado para enviar somente o token.

## 2. Configuração e Desenvolvimento do Frontend

*   **Estrutura Inicial do Frontend (`frontend/`):**
    *   O diretório `frontend/` estava vazio, exceto pelo `README.md`.
    *   A estrutura de um projeto React com Vite e TypeScript foi criada manualmente (devido a restrições do ambiente CLI para `npm create vite`):
        *   `frontend/package.json` (com dependências básicas de React, Vite, TypeScript).
        *   `frontend/vite.config.ts`
        *   `frontend/tsconfig.json`
        *   `frontend/tsconfig.node.json`
        *   `frontend/index.html`
        *   `frontend/src/main.tsx`
        *   `frontend/src/App.tsx`
        *   `frontend/src/index.css`
        *   `frontend/src/App.css`
        *   `frontend/src/assets/react.svg`
*   **Configuração do Tailwind CSS:**
    *   Dependências `tailwindcss`, `postcss`, `autoprefixer` e `tailwindcss-animate` foram adicionadas ao `frontend/package.json`.
    *   Arquivos de configuração `frontend/tailwind.config.js` e `frontend/postcss.config.js` foram criados.
    *   Diretivas `@tailwind` foram adicionadas ao `frontend/src/index.css`.
*   **Configuração do shadcn/ui:**
    *   Dependências `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` e várias bibliotecas `@radix-ui/*` (como `react-select`, `react-slot`, `react-label`, `react-popover`, `react-day-picker`, `date-fns`) foram adicionadas ao `frontend/package.json`.
    *   O arquivo `frontend/src/lib/utils.ts` foi criado.
    *   O `frontend/tailwind.config.js` foi atualizado com as configurações de tema e plugins do `shadcn/ui`.
    *   As variáveis CSS para o tema (dark/light) foram adicionadas ao `frontend/src/index.css`.
*   **Criação de Componentes UI (`frontend/src/components/` e `frontend/src/components/ui/`):**
    *   `theme-provider.tsx` (para gerenciar o tema).
    *   `mode-toggle.tsx` (botão para alternar tema).
    *   `ui/button.tsx`
    *   `ui/input.tsx`
    *   `ui/card.tsx`
    *   `ui/label.tsx`
    *   `ui/select.tsx`
    *   `ui/date-picker.tsx`
    *   `ui/calendar.tsx`
    *   `ui/popover.tsx`
    *   `ui/alert.tsx`
    *   `ui/table.tsx`
*   **Refatoração da Página Principal (`frontend/src/App.tsx`):**
    *   O `App.tsx` foi refatorado para incluir a estrutura principal da interface: cabeçalho, seletor de tema, formulário de filtros e área de resultados.
    *   **Lógica de Filtro Dinâmico:** Implementada para mostrar/ocultar campos de filtro com base na seleção do usuário.
    *   **Exibição de Dados:** Os resultados do relatório agora são exibidos em uma tabela formatada.
    *   **Tratamento de Erros:** Mensagens de erro do backend são capturadas e exibidas na interface usando o componente `Alert`.
    *   **Gerenciamento de Estado:** Estados React foram adicionados para controlar os valores dos filtros (data de início, data de fim, campanha, fonte, etiquetas).
    *   **Formatação de Data:** O `DatePicker` foi ajustado para exibir e formatar datas no padrão brasileiro (dd/MM/yyyy) e para diferenciar "Data de Início" e "Data de Fim".
    *   **Correção `tags.map is not a function`:** Adicionada verificação `Array.isArray(tags)` antes de usar `.map()` para evitar erros quando os dados ainda não foram carregados ou estão em formato incorreto.
    *   **Correção do Seletor de Tema:** Ajustado o `theme-provider.tsx` para garantir que a classe `dark` seja aplicada corretamente ao elemento `html`.
    *   **Construção da URL de Requisição:** A função `handleGenerateReport` foi atualizada para construir a URL da API de cards com os parâmetros de filtro corretos, incluindo o formato JSON para `created_at`.

## 3. Refatoração da Interface e Melhorias de UX (04/08/2025)

*   **Correção de Bugs no Backend:**
    *   Resolvido erro `400 Bad Request` na rota `/api/cards` ao forçar o uso do `BOARD_ID_HABLLA` a partir do arquivo `.env`, garantindo que a requisição para a API da Hablla seja sempre válida.
*   **Melhorias na Interface de Filtros:**
    *   A lógica de filtros foi completamente refatorada, removendo o seletor "Filtrar por" e permitindo que o usuário combine múltiplos filtros (data, campanha, fonte, etiquetas) simultaneamente.
*   **Melhorias de Experiência do Usuário (UX):**
    *   **Indicador de Carregamento:** Adicionado um estado de `isLoading` que desativa o botão "Gerar Relatório" e exibe uma mensagem "Carregando dados..." com uma animação de pontos para dar feedback visual durante a busca na API.
    *   **Exibição de Resultados:** A tabela de resultados foi substituída por um card de resumo, que mostra o total de cards, uma lista de campanhas únicas e o período (data mais antiga e mais recente) dos dados retornados.
    *   **Validação de Filtros:** Adicionada validação para o filtro de data, que agora exibe um erro se o usuário não preencher tanto a data de início quanto a de fim.
*   **Implementação do Filtro de Tags Avançado:**
    *   O seletor de tags simples foi substituído por um componente `MultiSelectCombobox` mais robusto.
    *   Foram adicionados os componentes `Command`, `Badge` e `Dialog` do `shadcn/ui` como dependências.
    *   A biblioteca `cmdk` foi instalada para gerenciar a funcionalidade de busca.
    *   O novo componente inclui busca por nome, exibição das cores das tags e uma interface para seleção múltipla.

## 4. Expansão de Funcionalidades e Correções de Bugs (04/08/2025)

*   **Seleção de Quadros:** Adicionado um seletor no formulário para permitir que o usuário escolha em qual quadro a busca será realizada. "IA Manutenção" permanece como o valor padrão.
*   **Busca por Campanhas Vazias:** Implementada a funcionalidade de buscar cards com o campo de campanha vazio através de um checkbox. A lógica foi ajustada para realizar a filtragem no frontend, garantindo a precisão do resultado.
*   **Visualização de IDs de Cartão:** Adicionado um botão "Buscar IDs" que exibe os resultados da busca em uma tabela detalhada, incluindo o ID de cada cartão, para fácil localização no sistema da Hablla.
*   **Melhorias de Usabilidade e UX:**
    *   **Resultados Vazios:** A interface agora exibe uma mensagem clara ("Nenhum card encontrado...") quando uma busca não retorna resultados, em vez de mostrar um resumo com dados inválidos.
    *   **Limpar Filtro de Data:** Adicionado um botão "X" ao componente `DatePicker` para permitir que o usuário remova facilmente o filtro de data sem precisar recarregar a página.
*   **Correções de Bugs Críticos:**
    *   Resolvido o erro `Table is not defined` que impedia a renderização da lista de IDs.
    *   Corrigido o bug que causava o envio automático do formulário ao selecionar uma data.
    *   Ajustado o layout do `DatePicker` para que ele seja responsivo e não quebre em diferentes tamanhos de tela.
*   **Qualidade de Código:**
    *   Adicionada tipagem TypeScript completa ao componente `App.tsx` para os estados e dados da API, eliminando erros de tipo e aumentando a robustez do código.

## 5. Refinamento do Relatório de Campanha e Correções Finais (04/08/2025)

*   **Correção do Filtro de Tags:** O problema que impedia a seleção de etiquetas no componente `MultiSelectCombobox` foi finalmente resolvido.
*   **Pré-seleção de Tags:** Implementada a funcionalidade para que as etiquetas "IA - Venda IA", "IA - Venda Manual" e "IA - Venda Operaodr" já venham selecionadas por padrão ao carregar a página.
*   **Novo Relatório "Resumo da Campanha":**
    *   Adicionado um novo botão para gerar um relatório com métricas específicas de campanha.
    *   A lógica de cálculo para este relatório foi refinada para ser mais precisa:
        *   `Total de clientes:` Calculado com base no número de nomes de cartões únicos.
        *   `Total de telefones:` Calculado como o número total de cartões.
        *   `Total de Respostas pelo Hablla:` Calculado com base no histórico de movimentação do cartão (`moves`).
        *   `Venda IA` e `Venda Manual`: A contagem foi ajustada para seguir as regras de negócio específicas para cada métrica.
*   **Melhorias de Usabilidade no Relatório:**
    *   O campo "Dt. Envio" agora exibe uma única data se as datas de início e fim forem iguais.
    *   Adicionado um botão "Copiar" que permite ao usuário copiar facilmente todo o texto do resumo para a área de transferência.
*   **Correção de Bug Crítico:** Resolvido o erro `Select is not defined` causado por uma importação incorreta, que impedia a aplicação de carregar.

## 6. Introduzindo um novo tipo de relatório e refinando a experiência do usuário (10/08/2025)
 
- **Novo Relatório "Resumo da Campanha":**
    - Adiciona um botão para gerar um relatório com métricas detalhadas.
    - Implementa cálculos precisos para "Total de clientes" (nomes únicos), "Total de telefones" (total de cards) e "Total de 
Respostas" (baseado no histórico de `moves`).
    - Ajusta a contagem de "Venda IA" e "Venda Manual" para seguir as regras de negócio corretas.
    
- **Melhorias de Usabilidade:**
    - O seletor de tags agora funciona corretamente e pré-seleciona as tags padrão na inicialização.
    - O relatório de resumo agora possui um botão para copiar os resultados para a área de transferência.
    - A exibição da data do relatório foi simplificada para mostrar uma única data quando o intervalo é de um só dia.

- **Correções de Bugs:**
    - Resolve um erro crítico de importação (`Select is not defined`) que impedia a aplicação de carregar.

## 7. Atualizações realizadas no Commit 7
- Nome do botão "Resumo Campanha" foi atualizado para "Resumo Campanha IA"

- O relatorio foi atualizado e o layout foi complementado com icones do Lucide React

- Adicionada uma função nova para realizar a normalizacao do texto que será recebido do banco de dados com o template de mensagem que estava perdendo a formatação.

- A função de copiar o resultado da campanha foi atualizado para retornar o novo formato do resumo e adicionado os emojis.

- Adicionado um botão de Webhook ao lado do botão de copiar na tela de resumo para que seja envidas as variaveis do resumo que foi gerado para um fluxo que envia essa mensagem pelo Telegram/WhatsApp.

## 8. Correçoes e ajustes (Commit 8)
- O tema light e dark estavam setados com as mesmas cores, fazendo com que ao clicar no botão de alterar tema nada ocorresse. As cores dos foram ajustadas para que o tema light tenha cores que façam sentido no arquivo index.css na pasta /frontend/src.

- Datapicker correcao visual e melhoria de usabilidade
    - A correção foi um ajuste no botão do X que remove a data que foi escolhida pelo usuario. O X estava em cima da data e com a cor branca, o que fazia que ficasse dificil de visualizar o botão e a data. Foi adicionado um padding-right de 1.75rem (28px) para que o X não fique em cima da data e foi alterada a cor para vermelho.
    - A melhoria de usabilidade foi um controle de estado de abertura do DatePicker. Quando o usuario escolher a data o DatePicker será fechado automaticamente.

- O botão de envio via webhook que estava com um emoji de foguete e o icone do lucide fora do botão.

- A biblioteca do lucide-react foi atualizada para a ultima versão.

- O nome do icone de barras do lucide foi corrido. (BarChartBig)

## 9. Próximos Passos e Instruções

### Pendências Atuais

*   Nenhuma pendência crítica. A aplicação está em um estado estável com as funcionalidades solicitadas implementadas.
*   Mas a proxíma melhoria prevista é adição de uma conexão com outro banco de dados para consulta das primeiras respostas dos clientes, para complementar o relatorio e avaliar quantos clicaram em cada um dos botoes (WhatsApp, Ligação, Não quero contato)

### Para o Próximo Agente/Sessão:

1.  **Verificar o Backend:**
    *   Certifique-se de que o arquivo `.env` no diretório `backend/` contém `WORKSPACE_ID_HABLLA` e `API_TOKEN_HABLLA` com os valores corretos.
    *   Inicie o servidor do backend (`cd backend && npm start`). Observe os logs no terminal para verificar se as variáveis de ambiente são carregadas e se as URLs das requisições à Hablla API estão corretas.
2.  **Verificar o Frontend:**
    *   Navegue até o diretório `frontend/`.
    *   Execute `npm install` para garantir que todas as dependências (incluindo as recém-adicionadas) estejam instaladas.
    *   Inicie o servidor de desenvolvimento do frontend (`npm run dev`).
    *   Acesse a aplicação no navegador (geralmente `http://localhost:5173`).
3.  **Testar Funcionalidades:**
    *   Verifique se o seletor de tema funciona.
    *   Teste os filtros de data, campanha, fonte e etiquetas.
    *   Tente gerar um relatório e observe os resultados na tabela e as mensagens de erro (se houver).
    *   O foco principal é garantir que a requisição de cards funcione corretamente com os filtros.

### Instruções para Enviar o Projeto para o GitHub:

Para criar um novo repositório no GitHub e enviar este projeto (frontend e backend juntos), siga estes passos no seu terminal, a partir da raiz do projeto (`C:\src\MF\report_ai_force\`):

1.  **Inicializar um novo repositório Git local:**
    ```bash
    git init
    ```

2.  **Adicionar todos os arquivos ao stage:**
    ```bash
    git add .
    ```

3.  **Fazer o primeiro commit:**
    ```bash
    git commit -m "Initial commit: Setup backend and frontend structure with basic features"
    ```

4.  **Criar um novo repositório no GitHub:**
    *   Vá para [github.com](https://github.com) e faça login.
    *   Clique no botão `+` no canto superior direito e selecione `New repository`.
    *   Dê um nome ao seu repositório (ex: `report-ia-force`).
    *   Escolha se ele será `Public` ou `Private`.
    *   **NÃO** marque as opções para adicionar `README`, `.gitignore` ou `license` (já temos esses arquivos).
    *   Clique em `Create repository`.

5.  **Conectar seu repositório local ao repositório remoto no GitHub:**
    *   Após criar o repositório no GitHub, você verá uma página com instruções. Copie a linha que começa com `git remote add origin ...`. Será algo parecido com:
        ```bash
        git remote add origin https://github.com/SEU_USUARIO/report-ia-force.git
        ```
    *   Cole e execute essa linha no seu terminal.

6.  **Enviar o código para o GitHub:**
    ```bash
    git push -u origin master
    # Ou, se o branch padrão do GitHub for 'main':
    # git push -u origin main
    ```
    (Verifique qual branch o GitHub sugere na página do seu novo repositório, geralmente é `main` hoje em dia).

Após esses passos, todo o seu código (backend e frontend) estará no repositório do GitHub.


## 10. Atualização de Lógica de Negócio (14/01/2026)

- **Correção no cálculo de mensagens não recebidas:**
    - A lógica para identificar mensagens não recebidas (`notReceivedMsg`) foi atualizada para ser mais robusta.
    - Agora busca diretamente pelo ID da coluna "Tentativa de contato [IA]" (`6852ca77894e7f357ac3ca09`).
    - Verifica se o status do cartão é 'lost' (perdido).
    - Verifica a presença da TAG específica "IA - Mgs não enviada" (ID `689214de8385d506466c22ff`), ao invés de buscar por motivos de perda/fechamento que não são retornados pela API.

## 11. Melhoria no Filtro de Campanhas (14/01/2026)

- **Novo componente MultiSelectCampaign:**
    - Substituído o campo de input simples de Campanha por um novo componente de seleção múltipla (`MultiSelectCampaign`).
    - O novo componente permite:
        - Selecionar múltiplas campanhas de uma lista pré-definida.
        - Buscar campanhas por nome, data ou mês.
        - Adicionar manualmente novas campanhas que não estão na lista (função "Creatable").
    - A lista de campanhas é alimentada pela constante `campaignsData` no arquivo `App.tsx`.
- **Lógica de Filtro:**
    - A filtragem de campanhas agora suporta múltiplas seleções, filtrando os resultados localmente para garantir que todos os cartões correspondentes a qualquer uma das campanhas selecionadas sejam exibidos.

## 12. Otimização de Performance na Busca (14/01/2026)

- **Envio de Campanha como Query Parameter:**
    - A função `performSearch` no frontend foi otimizada para enviar o nome da campanha como um parâmetro de busca para a API da Hablla quando apenas uma campanha está selecionada. Isso reduz drasticamente a quantidade de dados processados e páginas consultadas.
    - O filtro exato permanece no frontend para garantir a precisão, já que a API retorna resultados por semelhança.
- **Melhoria no Backend:**
    - A função `fetchHabllaAPI` no backend foi atualizada para lidar corretamente com arrays em `queryParams`, permitindo maior flexibilidade em futuras expansões.

## 13. Persistência de Dados e Cache de Relatórios (03/02/2026)

- **Integração com SQLite no Backend:**
    - Implementada a biblioteca `sqlite3` para armazenamento local de resumos de campanhas.
    - Criada a tabela `campaign_summaries` para cachear os cálculos de "Resumo Campanha IA".
    - A lógica de negócio para o cálculo do resumo foi migrada do frontend para o backend (`calculateSummary`), garantindo consistência e centralização das regras.
- **Estratégia de Cache "Cache-First":**
    - Ao gerar o "Resumo Campanha IA", o sistema agora verifica primeiro se os dados já existem no banco local.
    - Se existirem, os dados são retornados instantaneamente, melhorando significativamente a velocidade da aplicação.
    - Se não existirem, o backend realiza a consulta na API da Hablla, salva no banco e retorna os resultados.
- **Funcionalidade de Atualização (Refresh):**
    - Adicionado um botão de "Atualizar Campanha" (ícone `RotateCcw`) na interface de resumo.
    - Este botão força o backend a ignorar o cache, realizar uma nova consulta à API da Hablla e atualizar o registro no banco de dados SQLite.
- **Melhorias na Interface (UX):**
    - O cabeçalho do resumo agora exibe a data e hora da "Última atualização" dos dados salvos no banco.
    - Adicionados `tooltips` e títulos aos botões de ação (Copiar, Webhook, Atualizar) para melhor clareza.
- **Qualidade e Build:**
    - Corrigidos erros de TypeScript relacionados a variáveis não utilizadas (`defaultsSet`).
    - Adicionada a dependência `sqlite` para facilitar o uso de `async/await` com o banco de dados.

## 14. Estabilidade e Agregação de Campanhas (03/02/2026)

- **Resiliência de Conexão (Backend):**
    - Implementado um mecanismo de *retry* (3 tentativas) na comunicação com a API da Hablla.
    - Isso resolve falhas de rede intermitentes (como `socket hang up` ou `ECONNRESET`) que ocorriam durante atualizações em lote, garantindo maior estabilidade no processo de extração de dados.
- **Atualização em Lote (Frontend):**
    - Adicionado o botão "Atualizar Todas as Campanhas" (`RefreshCw`) na interface principal.
    - Permite que o usuário atualize o cache de todas as campanhas cadastradas (`campaignsData`) com um único clique.
    - Ao final, exibe um relatório detalhado informando o número de sucessos e listando nominalmente as campanhas que falharam, facilitando a correção manual.
- **Agregação de Múltiplas Campanhas:**
    - O relatório "Resumo Campanha IA" agora suporta a seleção de múltiplas campanhas simultaneamente.
    - **Lógica de Agregação:** O backend processa cada campanha individualmente (buscando do cache ou da API) e, em seguida, unifica os resultados.
    - Os valores absolutos (Total de Clientes, Telefones, Vendas, Custos) são somados, enquanto as taxas e porcentagens (Conversão, Resposta, Ticket Médio) são recalculadas com base nos totais consolidados, oferecendo uma visão analítica precisa do grupo de campanhas selecionado.
- **Refatoração de Endpoints:**
    - Os endpoints `/api/campaign-summary` e `/refresh` foram atualizados para aceitar listas de campanhas separadas por vírgula, viabilizando a funcionalidade de agregação.

## 15. Responsividade e Layout Dinâmico (11/02/2026)

- **Sidebar Adaptável:**
    - Refatoração da `Sidebar` para utilizar posicionamento `sticky` em desktops, garantindo que o menu acompanhe a rolagem sem sobrepor o conteúdo.
    - Implementação de comportamento "drawer" (menu lateral deslizante) para dispositivos móveis, controlado por um estado global e um overlay de fundo.
- **Layout Fluído e Dinâmico:**
    - Reestruturação do componente `App.tsx` para utilizar uma arquitetura de layout flexível que se ajusta automaticamente à presença ou ausência da sidebar.
    - Uso de `min-w-0` e `overflow-hidden` para garantir que gráficos e tabelas (especialmente no Dashboard) não quebrem o layout em telas menores.
- **Interface Mobile-First:**
    - Adicionado um cabeçalho fixo para dispositivos móveis com botão de menu ("hambúrguer") para facilitar a navegação em telas pequenas.
    - O `Dashboard` agora detecta o clique no menu e sincroniza a abertura da sidebar através de callbacks.
    - Ajustes de padding e tamanhos de fonte responsivos em toda a aplicação para melhor legibilidade no mobile.
- **Gestão de Menus na Sidebar:**
    - Adicionada a propriedade `enabled` ao array `menuItems` para facilitar a ativação/desativação de funcionalidades.
    - Menus inativos (Vendas, Produtos, Clientes, etc.) agora aparecem com estilo visual desabilitado (`opacity-50` e `cursor-not-allowed`) e têm seus cliques bloqueados.

## 16. Correções de Sintaxe e Estabilidade do Build (11/02/2026)

- **Correção de Erro de Sintaxe JSX:**
    - Resolvido o erro `Unterminated JSX contents` no arquivo `App.tsx` que impedia a aplicação de carregar. Foram adicionadas as tags de fechamento faltantes (`</main>` e `</div>`).
- **Resolução de Erros de Compilação (TypeScript):**
    - Corrigido erro de tipagem no componente `Checkbox` onde a propriedade `displayName` do `CheckboxPrimitive` não era reconhecida pelo TypeScript.
    - Removidas diversas variáveis e importações não utilizadas em múltiplos componentes (`Dashboard`, `Sidebar`, `ModeToggle`, `Calendar`, `MultiSelectCampaign`, `MultiSelectCombobox`) para satisfazer as regras de linting do `tsconfig.json` (`noUnusedLocals`).
- **Verificação de Build:**
    - O comando `npm run build` no frontend agora completa com sucesso, garantindo a integridade do código e permitindo a execução correta da aplicação.

## 17. Centralização de Dados e Melhorias no Dashboard (11/02/2026)

- **Compartilhamento de Dados:**
    - A constante `campaignsData` foi movida para um arquivo centralizado em `frontend/src/lib/campaigns.ts`, permitindo que tanto a tela de Relatórios quanto o Dashboard utilizem a mesma fonte de dados.
- **Refinamento de Filtros no Dashboard:**
    - Adicionado suporte para desconsiderar automaticamente campanhas marcadas como "Não enviado".
    - Implementado um sub-filtro de mês para o modo "Campanhas Individuais", permitindo filtrar as campanhas exibidas por um mês específico ou ver "Todas" (padrão).
- **Evolução de Vendas Cronológica:**
    - O gráfico de "Evolução de Vendas" foi ajustado para exibir um ponto para cada campanha selecionada.
    - Os dados agora são ordenados cronologicamente seguindo a lógica do mês e do número do disparo (ex: "D01-Jan" vem antes de "D02-Jan"), proporcionando uma visão real da evolução dos disparos.
- **Formatação de Moeda e Dados:**
    - Todos os valores de receita (`revenue`) e ticket médio no Dashboard agora são exibidos no formato de moeda brasileiro (R$) com duas casas decimais.
    - Melhorada a lógica de agrupamento para garantir que a ordem original das campanhas seja preservada ao consolidar os dados.

## 18. Correções de Referência e Interfaces (11/02/2026)

- **Restauração de Constantes:**
    - Corrigido o erro `ReferenceError: boards is not defined` no `App.tsx` através da restauração da constante `boards` que havia sido removida acidentalmente durante uma refatoração.
- **Ajuste de Tipagem:**
    - Corrigidas as interfaces `ReportCard` e `CampaignSummary` no `App.tsx` para garantir que todas as propriedades necessárias para a renderização da interface (como `id`, `name`, `tags`, etc.) estejam presentes, resolvendo falhas de carregamento da aplicação.

## 19. Ajuste de Cores da Sidebar (11/02/2026)

- **Compatibilidade de Temas:**
    - Substituídas as cores estáticas (como `text-zinc-200` e `text-zinc-600`) por variáveis semânticas do Tailwind (`text-foreground`, `text-muted-foreground`, `bg-accent`).
    - Isso corrige o problema de leitura no tema claro, onde os textos permaneciam brancos, e garante que a sidebar se adapte automaticamente às cores do tema ativo (Light/Dark mode).

## 20. Sistema de Notificações (11/02/2026)
    
- **Gestão Global de Notificações:**
    - Implementado um estado global de notificações no `App.tsx` com suporte a diferentes tipos (`info`, `success`, `warning`, `error`).
    - Criada a funcionalidade `addNotification` para permitir o disparo de alertas em qualquer parte da aplicação.
- **Notificação de Atualização:**
    - Ao finalizar o processo de "Atualizar Todas as Campanhas", o sistema agora gera automaticamente uma notificação detalhando o número de campanhas atualizadas e eventuais falhas.
- **Interface de Notificações (Sino):**
    - O ícone de sino no Dashboard foi transformado em um `Popover` interativo que exibe a lista de notificações recentes.
    - Adicionado um contador visual (badge) para notificações não lidas.
    - Implementada a funcionalidade de "Marcar como lidas" ao abrir o menu e "Limpar tudo" para remover o histórico.
    - O sistema foi desenhado de forma extensível, permitindo que futuras funcionalidades (como alertas de erro de API ou finalização de relatórios longos) utilizem a mesma infraestrutura.

## 21. Refatoração de Interface e Correção de Notificações (24/02/2026)

- **Criação do Componente Header:**
    - Extração de toda a lógica e UI do cabeçalho da aplicação que antes residia internamente no componente `Dashboard` para um componente global reutilizável `<Header />` (`frontend/src/components/header.tsx`).
    - A atualização permite que diferentes páginas (como a tela de Dashboard e a tela de Relatórios) compartilhem o mesmo cabeçalho, mantendo uniformidade no título, exibição de data atual e menu lateral (Mobile).
- **Adequação do Sistema de Notificações:**
    - Toda a lógica de exibição, listagem, limpeza ou gerenciamento de leitura (`markAllAsRead`, `clearNotifications`) pertinente ao sino de notificações agora compõe o novo componente `Header`.
    - Correção do Bug de Feedback (`addNotification`) em campanhas atualizadas unicamente. Agora o sistema dispara uma notificação visível com a mensagem "Os dados de {NomeDaCampanha} foram atualizados com sucesso" assim que a ação do botão "Atualizar Campanha" for completada com êxito na tela de Relatórios.
    - Melhoria no formato de timestamp no componente visual de notificações (`header.tsx`): convertida a exibição exclusiva de horário (`17:46:52`) para incluir nativamente a data corrente em formato curto e conciso junto a hora (`24/02/26, 17:46`).

## 22. Aperfeiçoamentos Visuais no Dashboard e Documentação (24/02/2026)

- **Métricas Expandidas no Gráfico:**
    - Adicionado suporte as variáveis de `conversionSalesClients` (Conversão Vendas) e `conversionSalesResponses` (Conversão IA) no agrupamento de relatórios.
    - Implementação de um `CustomTooltip` customizado escuro no gráfico "Evolução de Vendas" de forma a reler as taxas percentuais ativas e listar ativamente 3 métricas vitais abaixo do balão sempre que o usuário realizar hover em linhas: `Receita`, `Conversão Vendas` e `Conversão IA`.
- **Dinâmica Visual de Cartões Estatísticos (StatsCard):**
    - Configuração progressiva na variação de cor e flecha baseada em resultados (`trend`). Quando se existe uma variação negativa contra o mês anterior a flecha muda do tom verde para vermelho com sentido para baixo (`ArrowDownRight`), atuando como um alerta visual intuitivo.
    - Otimizada a visibilidade de labels estáticas abaixo da métricas onde caso o "Modo de Filtro" exija a apresentação isolada ou abrangente em "Todas" o `StatsCard` omite indicativos de percentuais comparativos do trend limitando-se unicamente ao indicativo "no período".
- **Refatoração Estrutural de Documentação:**
    - Desassociação e generalização sistêmica: Arquivos como `.env` e todo o teor referencial do `README.md` raiz, antes estritamente fixados com nomes relativos à conta *Hablla*, foram transpostos e renomeados a adotarem nomes lógicos da aplicação genéricos (`WORKSPACE_ID`). 
    - O `README.md` global foi completamente formatado removendo longos JSONs crús do manual e ajustando queries de exemplos.
- **Base de Dados Fictícia:** Nova campanha incorporada listada em `src/lib/campaigns.ts` como "HB NÃO ATENDE JAN 2026.01".