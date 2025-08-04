# Report IA Force

## Visão Geral

Report IA Force é uma aplicação web full-stack projetada para gerar relatórios de vendas de campanhas a partir de dados consultados de uma API de CRM (Hablla). A aplicação possui uma interface moderna com temas claro e escuro, permitindo que os usuários filtrem e visualizem dados de vendas com base em múltiplos critérios.

O backend atua como um proxy seguro para a API externa, enquanto o frontend oferece uma experiência de usuário rica e interativa para a construção de relatórios personalizados.

## Prompt Inicial

> Preciso criar uma aplicação web que irá gerar um relatorio do resultado de vendas de campanhas. A interface deve ser leve, bonita e moderna. A aplicação deve ter um tema dark e outro light e um seletor para o usuario escolher o tema, mas o tema padrão do sistema será o dark. Essa aplicação deverá realizar a consulta dos dados via API. Os dados de conexão da API devem estar em um arquivo .env para manter eles fora do codigo que será enviado ao final para github. A aplicação sechama Report IA Force.  Na interface inicial o usuario vai poder escolher como e de onde gerar o relatorio, a primeira escolha deve ser qual o quadro, que já deve vir como opção padrão selecionada a opção do quadro princial que é "IA Manutenção", essa será a fonte dos dados, depois ele pode escolher como quer gerar esses dados se por data, por nome da campanha, fonte dos cartões ou etiqueta dos cartões. Se for por data, ele deve escolher com um date picker a data e hora inicial e data e hora final da criação dos dados, se for por campanha ele pode escolher digitar o nome da campanha que será buscada ou selecionar uma nome de campanha que já existe, se ele escolher a opção de selecionar uma campanha que já existe ao escolher essa opção a aplicação irá realizar uma requisição na API do CRM que irá consultar todos os cartões do quadro selecionado e listar todos os nomes de campanhas diferentes para o usuario selecionar. Se ele escolher por fonte ele deverá digitar o nome da fonte que deseja realizar a busca. Se ele selecionar etiquetas ele deverá escolher quais etiquetas ele quer retornar os dados, por padrão o sistema deverá já deixar selecionada duas etiquetas que são: "IA - Venda IA" e "IA - Venda Manual", mas caso o usuario clique para selecionar mais etiquetas ele deve poder selecionar qual o setor que deseja ver as etiquetas e deve ter a opção de todos os setores, depois que selecionar o setor a aplicação deverá exibir a lista de etiquetas que serão retornadas pela API. A aplicação deve permitir que o usuario exclua as etiquetas que desejar clicando em um pequeno X ao lado do nome. O retorno da API nessa requisição de etiquetas traz varios dados, como o nome, setor e cor, a cor que será exibida a etiqueta deverá ser a mesma que essa enviada pela API, para manter a mesma consistencia visual do sistema no relatorio. O usuario pode realizar uma combinação de filtros, como escolher uma data e um ou mais etiquetas, ou então um nome de campanha e uma ou mais etiquetas, entre outras opções. A requisição que retorna todos os cards já com alguns Query Params de exemplo é a seguinte: "https://api.hablla.com/v3/workspaces/{{workspaceID_Hablla}}/cards?board={{Quadro_Manutenção_ID_Hablla}}&tags={{tag_Venda_IA}},{{tag_Venda_Manual}}&created_at={"start_date" : "2025-07-31T00:00:00Z","end_date" : "2025-08-01T00:00:00Z"}". Nesse exemplo de requisição temos algumas variaveis que são representadas entre chaves duplas. Então temos as variaveis: "workspaceID_Hablla" que é o ID da conta do CRM onde iremos realizar essas consultas, "Quadro_Manutenção_ID_Hablla" que é o ID do quadro que o usuario deve escolher obrigatoriamente para a criação do relatorio, "tag_Venda_IA" e "tag_Venda_Manual" que são os IDs das etiquetas que foram selecionadas pelo usuario e o paramtro de data deve ser preenchido em created_at start_date sendo a data e hora inicial e o "end_date" sendo a data e hora final que o cliente escolheu. Um outra requisição que pode ser necessaria é a Get All Tags "https://api.hablla.com/v1/workspaces/{{workspaceID_Hablla}}/tags" que lista todas as etiquetas de todos os setores. Mas podemos usar os parametros para refinar e retornar somente as etiquetas de um setor especifico usando o "sector" e passando o ID do setor. Todas as requisições precisam de um header com um "Authorization" e o Token de autorização. Outra requisição que pode ser necesaria é a Get All Sectors "https://api.hablla.com/v1/workspaces/{{workspaceID_Hablla}}/sectors". Os quadros que existem hoje são: "IA Manutenção" com ID "682251a6c5a42b757a5dbe79" esse deve ser o quadro que já vem selecionado por padrão, alem desse temos outros 7 quadros, vou lista os nomes deles e os ID, para que possa adicionar no codigo para que o usuario possa escolher se necessario outros quadros e estou relacionado com os IDs, porque eles que são usados nas requisicoes da API. "Assistência Técnica" com ID "681fd53d454440210d383433", "DEMANDAS MARKETING" com ID "682cbfd0b7a2255a8de33d90", "Inside Sales" com ID "67e69469e61a2499d84a4e65", "Lojas" com ID "6862f617232cdd6b69cfe545", "Projetos e Tarefas | Por Departamento" com ID "6825d919b5c101953b6b67be", "Televendas PF" com ID "67ed27b22f1b8a5a02c348c2" e por fim o "Televendas PJ" com ID "685c24cca0784d79c539af00". Quando for necessario realizar uma consulta via API para listar os campos durante a seleção do usuario, essa requisição deve ser o mais transparente possivel para o usuario, por exemplo ele não deve precisar clicar em um botão para exibir o nome das etiquetas, mas pode ser no proprio componente de select, quando ele clicar para abrir a aplicação já realizar uma requisição para pegar os nomes dos setores e exibi-los para o usuario, com um submenu e quando ele passar o mouse em cima ou clicar no setor outra requisição será feita para buscar as etiquesta daquele setor, ou no caso do cliente selecionar a primeira opção que será todos os setores a aplicação irá exibir todas as etiquetas. Agora crie tudo que for necessario para essa aplicação funcionar, desde o backend até o frontend, criando as pastas separadas para isso, todas elas devem ficar dentro da raiz do projeto que é essa pasta atual que é "report_ai_force". E ao final crie 3 arquivos Readme.md, explicando o que é e como instalar e usar a aplicação, um arquivo para o frontend, outro para o backend e um geral para todo o projeto, com um resumo da aplicação como um todo e nesse readme geral salve todo esse prompt inicial nele para futuras referencias.

Todas as requisições tem resultados paginados, limitados a 10 registros por pagina, então para realizar a leitura/analise dos dados é preciso realizar a leitura de todas as paginas quando tiverem mais de uma pagina.
---

Requisição que irá retornar todos os cards
"https://api.hablla.com/v3/workspaces/{{workspaceID_Hablla}}/cards?board={{Quadro_Manutenção_ID_Hablla}}&tags={{tag_Venda_IA}},{{tag_Venda_Manual}}&created_at={"start_date" : "2025-07-31T00:00:00Z","end_date" : "2025-08-01T00:00:00Z"}"

Resultado da requisição que irá retornar todos os cards:
---

{
    "results": [
        
        {
            "workspace": "67e44bc7d729e2b2eab770dd",
            "board": "682251a6c5a42b757a5dbe79",
            "list": "6824f25ba10f0696039b3459",
            "persons": [
                "688b730722b80f3890c47cb3"
            ],
            "custom_fields": [],
            "name": "JOSE Maria",
            "std_name": "jose_maria",
            "description": "Sequencia: 31878\nData do Agendamento: 2025-08-09\nPeriodo: M\nCodigo da Venda: 108",
            "campaign": "HB VENC NÃO ATENDE 01.01 A 31.07.2025.03",
            "source": "Whatsapp",
            "rating": 1,
            "user": "681ceb148a7cb31c4b5e53ca",
            "followers": [
                "682790d6fa59863bdc7eb675"
            ],
            "previous_cards": [],
            "sector": "681c98f3485e133f2e01922c",
            "status": "in_attendance",
            "value": 0,
            "recurring_value": 0,
            "discount_value": 0,
            "additional_discount_value": 0,
            "shipping_value": 0,
            "taxes_value": 0,
            "moves": [
                {
                    "list": "6824f24ccb0e13b88d43e8e6",
                    "entry_date": "2025-07-31T14:32:43.460Z",
                    "exit_date": "2025-07-31T14:36:03.188Z"
                },
                {
                    "list": "6824f25ba10f0696039b3459",
                    "entry_date": "2025-07-31T14:36:03.188Z"
                }
            ],
            "products": [],
            "checklist": [],
            "created_at": "2025-07-31T13:43:35.939Z",
            "updated_at": "2025-07-31T16:48:26.372Z",
            "next_task": {
                "task": "688b9e5a7bad4fa63d9215a9",
                "status": "pending",
                "type": "other",
                "start_date": "2025-08-07T03:00:00.000Z"
            },
            "id": "688b730701558a2791aaf28a",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "board_id": "682251a6c5a42b757a5dbe79",
            "list_id": "6824f25ba10f0696039b3459",
            "organization_id": null,
            "sector_id": "681c98f3485e133f2e01922c",
            "user_id": "681ceb148a7cb31c4b5e53ca",
            "tags": [
                {
                    "id": "68249a3684abcef8ed1d4ab9",
                    "name": "IA - Venda IA",
                    "std_name": "tag_ia_venda_ia",
                    "color": "#14532D"
                }
            ]
        },
        {
            "workspace": "67e44bc7d729e2b2eab770dd",
            "board": "682251a6c5a42b757a5dbe79",
            "list": "6824f25ba10f0696039b3459",
            "persons": [
                "688b730722b80f3890c47cb3"
            ],
            "custom_fields": [],
            "name": "Maria Rose",
            "std_name": "maria_rose",
            "description": "Sequencia: 31879\nData do Agendamento: 2025-08-11\nPeriodo: M\nCodigo da Venda: 110",
            "campaign": "HB VENC NÃO ATENDE 01.01 A 31.07.2025.03",
            "source": "Whatsapp",
            "rating": 1,
            "user": "681ceb148a7cb31c4b5e53ca",
            "followers": [
                "682790d6fa59863bdc7eb675"
            ],
            "previous_cards": [],
            "sector": "681c98f3485e133f2e01922c",
            "status": "in_attendance",
            "value": 0,
            "recurring_value": 0,
            "discount_value": 0,
            "additional_discount_value": 0,
            "shipping_value": 0,
            "taxes_value": 0,
            "moves": [
                {
                    "list": "6824f24ccb0e13b88d43e8e6",
                    "entry_date": "2025-07-31T14:32:43.460Z",
                    "exit_date": "2025-07-31T14:36:03.188Z"
                },
                {
                    "list": "6824f25ba10f0696039b3459",
                    "entry_date": "2025-07-31T14:36:03.188Z"
                }
            ],
            "products": [],
            "checklist": [],
            "created_at": "2025-07-31T13:43:35.939Z",
            "updated_at": "2025-07-31T16:48:26.372Z",
            "next_task": {
                "task": "688b9e5a7bad4fa63d9347b0",
                "status": "pending",
                "type": "other",
                "start_date": "2025-08-07T03:00:00.000Z"
            },
            "id": "688b730701558a2791aaf28a",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "board_id": "682251a6c5a42b757a5dbe79",
            "list_id": "6824f25ba10f0696039b3459",
            "organization_id": null,
            "sector_id": "681c98f3485e133f2e01922c",
            "user_id": "681ceb148a7cb31c4b5e53ca",
            "tags": [
                {
                    "id": "68249a3684abcef8ed1d4ab9",
                    "name": "IA - Venda IA",
                    "std_name": "tag_ia_venda_ia",
                    "color": "#14532D"
                }
            ]
        }
    ],
    "count": 2,
    "totalItems": 2,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "totalValue": 0,
    "totalRecurringValue": 0,
    "averageValue": 0,
    "minValue": 0,
    "maxValue": 0,
    "averageRecurringValue": 0,
    "minRecurringValue": 0,
    "maxRecurringValue": 0
}

```
Requisição que irá retornar todos as etiquetas (Tags) 
"https://api.hablla.com/v1/workspaces/{{workspaceID_Hablla}}/tags"


Resultado da requisição que irá retornar todas etiquetas:
```
{
    "results": [
        {
            "name": "1º Tentativa",
            "std_name": "tag_1_tentativa",
            "color": "#1E3A8A",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "sector": "681c99235cf759fd86fa7418",
            "created_at": "2025-07-10T20:09:05.558Z",
            "updated_at": "2025-07-10T20:09:05.558Z",
            "id": "68701de12e6caf525ce955e6",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sector_id": "681c99235cf759fd86fa7418"
        },
        {
            "name": "Acquabios",
            "std_name": "tag_acquabios",
            "color": "#164E63",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "sector": "67eac8cd51ad3f9f350ac8bf",
            "created_at": "2025-07-29T20:37:44.755Z",
            "updated_at": "2025-07-29T20:37:44.755Z",
            "id": "688931181a3efe07f0c459a2",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sector_id": "67eac8cd51ad3f9f350ac8bf"
        },
        {
            "name": "Assistência",
            "std_name": "tag_assistencia",
            "color": "#701A75",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "sector": "67eac940a9cd2238e8a63b27",
            "created_at": "2025-05-15T16:45:04.684Z",
            "updated_at": "2025-05-15T16:45:04.684Z",
            "id": "68261a1048ac10dfabc31a0b",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sector_id": "67eac940a9cd2238e8a63b27"
        },
        {
            "name": "Assistência Técnica",
            "std_name": "tag_assistencia_tecnica",
            "color": "#3F3F46",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "sector": "67eac8cd51ad3f9f350ac8bf",
            "created_at": "2025-04-08T15:18:27.350Z",
            "updated_at": "2025-04-08T15:18:27.350Z",
            "id": "67f53e434461d67942a4f1dc",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sector_id": "67eac8cd51ad3f9f350ac8bf"
        },
        {
            "name": "Bebedouro",
            "std_name": "tag_bebedouro",
            "color": "#164E63",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "sector": "681c99235cf759fd86fa7418",
            "created_at": "2025-07-28T20:48:41.253Z",
            "updated_at": "2025-07-28T20:48:41.253Z",
            "id": "6887e229e07a0e26a3bcce28",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sector_id": "681c99235cf759fd86fa7418"
        },
        {
            "name": "Carga FC",
            "std_name": "tag_carga_fc",
            "color": "#312E81",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "sector": "67eac8cd51ad3f9f350ac8bf",
            "created_at": "2025-07-29T20:42:09.491Z",
            "updated_at": "2025-07-29T20:42:09.491Z",
            "id": "68893221dcfab2ad89220b34",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sector_id": "67eac8cd51ad3f9f350ac8bf"
        },
        {
            "name": "Central",
            "std_name": "tag_central",
            "color": "#713F12",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "sector": "67eac940a9cd2238e8a63b27",
            "created_at": "2025-05-15T16:46:21.213Z",
            "updated_at": "2025-05-15T16:46:21.213Z",
            "id": "68261a5d3a2da115725a25e5",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sector_id": "67eac940a9cd2238e8a63b27"
        },
        {
            "name": "Central Filtrante - FC",
            "std_name": "tag_central_filtrante_fc",
            "color": "#7C2D12",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "sector": "67e546d91c797f3123a9d167",
            "created_at": "2025-03-31T16:35:08.133Z",
            "updated_at": "2025-03-31T16:35:08.133Z",
            "id": "67eac43c51ad3f9f350aa6c6",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sector_id": "67e546d91c797f3123a9d167"
        },
        {
            "name": "Comercial",
            "std_name": "tag_comercial",
            "color": "#581C87",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "sector": "681c99235cf759fd86fa7418",
            "created_at": "2025-07-28T20:48:16.189Z",
            "updated_at": "2025-07-28T20:48:16.189Z",
            "id": "6887e2108fd0da00f009cf58",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sector_id": "681c99235cf759fd86fa7418"
        },
        {
            "name": "Digital",
            "std_name": "tag_digital",
            "color": "#14532D",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "sector": "67eac940a9cd2238e8a63b27",
            "created_at": "2025-05-15T16:45:41.987Z",
            "updated_at": "2025-05-15T16:45:41.987Z",
            "id": "68261a356e7e0859b33da462",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sector_id": "67eac940a9cd2238e8a63b27"
        }
    ],
    "count": 10,
    "totalItems": 66,
    "page": 1,
    "limit": 10,
    "totalPages": 7
}
```


 Requisição que irá retornar todos os setores
 "https://api.hablla.com/v1/workspaces/{{workspaceID_Hablla}}/sectors"

Resultado da requisição que irá retornar todos os setores:
---
```
{
    "results": [
        {
            "name": "1 - Televendas - PF",
            "std_name": "sec_1_televendas_pf",
            "description": "Televendas",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "color": "#4C1D95",
            "online_transfer": true,
            "available_transfer": true,
            "available_take": true,
            "keep_owner": false,
            "has_close_reason": true,
            "has_archive_reason": true,
            "has_user_transfer": true,
            "has_user_name": true,
            "mark_messages_as_read": false,
            "has_transfer_reason": true,
            "created_at": "2025-03-31T16:54:37.075Z",
            "updated_at": "2025-07-23T14:36:07.205Z",
            "sla_config": "681e110f417e1e4ff50561cc",
            "transfer_algorithm": "round_robin",
            "id": "67eac8cd51ad3f9f350ac8bf",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sla_config_id": "681e110f417e1e4ff50561cc",
            "office_hours_id": null
        },
        {
            "name": "2 - Pessoa Jurídica - PJ",
            "std_name": "sec_2_pessoa_juridica_pj",
            "description": "PJ",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "color": "#312E81",
            "online_transfer": false,
            "available_transfer": false,
            "available_take": true,
            "keep_owner": false,
            "has_close_reason": true,
            "has_archive_reason": true,
            "has_user_transfer": true,
            "has_user_name": true,
            "mark_messages_as_read": false,
            "has_transfer_reason": true,
            "created_at": "2025-05-08T11:44:11.674Z",
            "updated_at": "2025-07-23T14:36:02.162Z",
            "transfer_algorithm": null,
            "id": "681c990b5cf759fd86fa735e",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sla_config_id": null,
            "office_hours_id": null
        },
        {
            "name": "3 - Assistência Técnica",
            "std_name": "sec_3_assistencia_tecnica",
            "description": "Assistência Técnica",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "color": "#701A75",
            "online_transfer": false,
            "available_transfer": false,
            "available_take": true,
            "keep_owner": false,
            "has_close_reason": true,
            "has_archive_reason": true,
            "has_user_transfer": true,
            "has_user_name": true,
            "mark_messages_as_read": false,
            "has_transfer_reason": true,
            "created_at": "2025-05-08T11:42:19.640Z",
            "updated_at": "2025-07-23T14:32:04.721Z",
            "transfer_algorithm": null,
            "id": "681c989bb89a8cf337ac1868",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sla_config_id": null,
            "office_hours_id": null
        },
        {
            "name": "4 - Inside Sales",
            "std_name": "sec_4_inside_sales",
            "description": "Atendimento Comercial",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "color": "#164E63",
            "online_transfer": true,
            "available_transfer": true,
            "available_take": true,
            "keep_owner": false,
            "has_close_reason": true,
            "has_archive_reason": true,
            "has_user_transfer": true,
            "has_user_name": true,
            "mark_messages_as_read": false,
            "has_transfer_reason": true,
            "created_at": "2025-03-27T12:38:49.554Z",
            "updated_at": "2025-08-01T14:48:35.684Z",
            "transfer_algorithm": "round_robin",
            "office_hours": "68239dc9a1f4e7ccbe0c33a4",
            "sla_config": "67eac811a9cd2238e8a63367",
            "id": "67e546d91c797f3123a9d167",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sla_config_id": "67eac811a9cd2238e8a63367",
            "office_hours_id": "68239dc9a1f4e7ccbe0c33a4"
        },
        {
            "name": "5 - Digital / Site / E-Commerce",
            "std_name": "sec_5_digital_site_ecommerce",
            "description": "Digital / Site / E-Commerce",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "color": "#164E63",
            "online_transfer": false,
            "available_transfer": false,
            "available_take": true,
            "keep_owner": false,
            "has_close_reason": true,
            "has_archive_reason": true,
            "has_user_transfer": true,
            "has_user_name": true,
            "mark_messages_as_read": false,
            "has_transfer_reason": true,
            "created_at": "2025-05-08T11:45:05.777Z",
            "updated_at": "2025-07-23T14:32:46.833Z",
            "transfer_algorithm": null,
            "id": "681c9941046cf838ac984282",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sla_config_id": null,
            "office_hours_id": null
        },
        {
            "name": "6 - Lojas",
            "std_name": "sec_6_lojas",
            "description": "Lojas",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "color": "#1E3A8A",
            "online_transfer": true,
            "available_transfer": true,
            "available_take": true,
            "keep_owner": false,
            "has_close_reason": true,
            "has_archive_reason": true,
            "has_user_transfer": true,
            "has_user_name": true,
            "mark_messages_as_read": false,
            "has_transfer_reason": true,
            "created_at": "2025-05-08T11:44:35.332Z",
            "updated_at": "2025-07-31T13:43:14.019Z",
            "transfer_algorithm": "round_robin",
            "office_hours": "686bd95104d6bc3b2e920f30",
            "id": "681c99235cf759fd86fa7418",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sla_config_id": null,
            "office_hours_id": "686bd95104d6bc3b2e920f30"
        },
        {
            "name": "7 - Financeiro",
            "std_name": "sec_7_financeiro",
            "description": "Departamento Financeiro",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "color": "#831843",
            "online_transfer": false,
            "available_transfer": false,
            "available_take": true,
            "keep_owner": false,
            "has_close_reason": true,
            "has_archive_reason": true,
            "has_user_transfer": true,
            "has_user_name": true,
            "mark_messages_as_read": false,
            "has_transfer_reason": false,
            "created_at": "2025-05-15T13:08:16.461Z",
            "updated_at": "2025-07-23T14:34:50.578Z",
            "transfer_algorithm": null,
            "id": "6825e7403a2da115725886a0",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sla_config_id": null,
            "office_hours_id": null
        },
        {
            "name": "8 - TI",
            "std_name": "sec_8_ti",
            "description": "TI",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "color": "#3F3F46",
            "online_transfer": false,
            "available_transfer": false,
            "available_take": true,
            "keep_owner": false,
            "has_close_reason": true,
            "has_archive_reason": true,
            "has_user_transfer": true,
            "has_user_name": false,
            "mark_messages_as_read": false,
            "has_transfer_reason": false,
            "created_at": "2025-05-08T11:43:47.141Z",
            "updated_at": "2025-07-23T14:35:17.596Z",
            "transfer_algorithm": "round_robin",
            "id": "681c98f3485e133f2e01922c",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sla_config_id": null,
            "office_hours_id": null
        },
        {
            "name": "9 -Marketing",
            "std_name": "sec_9_marketing",
            "description": "Marketing",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "color": "#312E81",
            "online_transfer": false,
            "available_transfer": false,
            "available_take": true,
            "keep_owner": false,
            "has_close_reason": true,
            "has_archive_reason": true,
            "has_user_transfer": true,
            "has_user_name": true,
            "mark_messages_as_read": false,
            "has_transfer_reason": true,
            "created_at": "2025-05-08T11:43:21.686Z",
            "updated_at": "2025-07-23T14:31:36.205Z",
            "transfer_algorithm": null,
            "id": "681c98d93dfbfa55a9083972",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sla_config_id": null,
            "office_hours_id": null
        },
        {
            "name": "Projetos e Tarefas",
            "std_name": "sec_projetos_e_tarefas",
            "description": "Gerentes e Supervisores que possuem demandas a serem realizadas",
            "workspace": "67e44bc7d729e2b2eab770dd",
            "color": "#3F3F46",
            "online_transfer": false,
            "available_transfer": false,
            "available_take": true,
            "keep_owner": false,
            "has_close_reason": true,
            "has_archive_reason": true,
            "has_user_transfer": true,
            "has_user_name": true,
            "mark_messages_as_read": false,
            "has_transfer_reason": true,
            "created_at": "2025-03-31T16:56:32.583Z",
            "updated_at": "2025-07-23T14:36:25.190Z",
            "transfer_algorithm": null,
            "office_hours": "67eac98ab0bd67bc269eb43f",
            "id": "67eac940a9cd2238e8a63b27",
            "workspace_id": "67e44bc7d729e2b2eab770dd",
            "sla_config_id": null,
            "office_hours_id": "67eac98ab0bd67bc269eb43f"
        }
    ],
    "count": 10,
    "totalItems": 10,
    "page": 1,
    "limit": 10,
    "totalPages": 1
}
```

---
**Atualização de Requisitos:**

A aplicação se conectará à API da Hablla uma ferramenta de Marketing Conversacional, que une Omnichannel, Integração e CRM. Todas as requisições serão feitas para essa plataforma.

**Requisitos da Interface:**

*   A interface deve ser leve, bonita e moderna.
*   Deve ter um tema dark (padrão) e um tema light, com um seletor para alternar entre eles.
*   Utilizar preferencialmente Tailwind CSS.
*   Considerar o uso de bibliotecas de componentes como shadcn/ui para agilizar o desenvolvimento e garantir um design de alta qualidade, especialmente para a criação de gráficos e cards para exibição dos relatórios.
