# Report IA Force

## Visão Geral

Report IA Force é uma aplicação web full-stack projetada para gerar relatórios de vendas de campanhas a partir de dados consultados de uma API de CRM. A aplicação possui uma interface moderna com temas claro e escuro, permitindo que os usuários filtrem e visualizem dados de vendas com base em múltiplos critérios.

O backend atua como um proxy seguro para a API externa, enquanto o frontend oferece uma experiência de usuário rica e interativa para a construção de relatórios personalizados.

## Ideia Inicial

Criar uma aplicação web que irá gerar um relatório do resultado de vendas de campanhas. Com uma interface leve, bonita e moderna. 

A aplicação terá um tema dark e light com um seletor para o usuário escolher o tema. O tema padrão do sistema será o dark. 

A aplicação deverá realizar a consulta dos dados via API. Os dados de conexão da API vão ser salvos em um arquivo .env. A aplicação se chama Report IA Force.  

Na interface inicial, o usuário vai poder escolher como e de onde gerar o relatório. A primeira escolha deve ser qual o quadro, que já deve vir como opção padrão selecionada, a opção do quadro principal que é `IA Manutenção`. Essa será a fonte dos dados, depois ele pode escolher como quer gerar esses dados, se por data, por nome da campanha, fonte dos cartões ou etiqueta dos cartões. 

Se for por data, ele deve escolher com um datepicker a data e hora inicial e data e hora final da criação dos dados. 

Se for por campanha, ele pode escolher digitar o nome da campanha que será buscada ou selecionar um nome de campanha que já existe. 

Se ele escolher a opção de selecionar uma campanha que já existe, ao escolher essa opção, a aplicação irá realizar uma requisição na API do CRM que irá consultar todos os cartões do quadro selecionado e listar todos os nomes de campanhas diferentes para o usuário selecionar. 

Se ele escolher por fonte, ele deverá digitar o nome da fonte que deseja realizar a busca. 

Se ele selecionar etiquetas, ele deverá escolher quais etiquetas ele quer retornar os dados. Por padrão, o sistema deverá já deixar selecionadas duas etiquetas que são: `IA - Venda IA` e `IA - Venda Manual`, mas caso o usuário clique para selecionar mais etiquetas, ele deve poder selecionar qual o setor que deseja ver as etiquetas e deve ter a opção de todos os setores. Depois que selecionar o setor, a aplicação deverá exibir a lista de etiquetas que serão retornadas pela API.

 A aplicação deverá permitir que o usuário exclua as etiquetas que desejar clicando no X ao lado do nome. 
 
 O retorno da API nessa requisição de etiquetas retornará vários dados, como o nome, setor e cor, a cor que será exibida a etiqueta deverá ser a mesma que essa enviada pela API, para manter a mesma consistência visual do sistema no relatório. 
 
 O usuário poderá realizar uma combinação de filtros, como escolher uma data e uma ou mais etiquetas, ou então um nome de campanha e uma ou mais etiquetas, entre outras opções. A requisição que retorna todos os cards já com alguns Query Params de exemplo é a seguinte: 
 
 ```https://api.domain.com/v3/workspaces/{{workspaceID}}/cards?board={{Quadro_Manutenção_ID}}&tags={{tag_Venda_IA}},{{tag_Venda_Manual}}&created_at={"start_date" : "2025-07-31T00:00:00Z","end_date" : "2025-08-01T00:00:00Z"}```
 
Nesse exemplo de requisição temos algumas variáveis que são representadas entre chaves duplas. 
 
Então temos as variáveis: `workspaceID` que é o ID da conta do CRM onde iremos realizar essas consultas, `Quadro_Manutenção_ID` que é o ID do quadro que o usuário deve escolher obrigatoriamente para a criação do relatorio, `tag_Venda_IA` e `tag_Venda_Manual` que são os IDs das etiquetas que foram selecionadas pelo usuário e o parâmetro de data deve ser preenchido em created_at start_date sendo a data e hora inicial e o `end_date` sendo a data e hora final que o cliente escolheu. 
 
 Um outra requisição que pode ser necessária é a Get All Tags: 
 ```https://api.domain.com/v1/workspaces/{{workspaceID}}/tags``` 
 
 que lista todas as etiquetas de todos os setores. 
 
 Mas podemos usar os parâmetros para refinar e retornar somente as etiquetas de um setor específico usando o `sector` e passando o ID do setor. 
 
Todas as requisições precisam de um header com um `Authorization` e o Token de autorização. Outra requisição que pode ser necessária é a Get All Sectors: 
 ```https://api.domain.com/v1/workspaces/{{workspaceID}}/sectors``` 
 
Os quadros que existem hoje são os seguintes: 
 
- `IA Manutenção`;
- `Assistência Técnica`;
- `DEMANDAS MARKETING`;
- `Inside Sales`;
- `Lojas`;
- `Projetos e Tarefas | Por Departamento`;
- `Televendas PF`;
- `Televendas PJ`;

O quadro principal deve ser o quadro `IA Manutenção` que já deve vir selecionado por padrão. Além desse deve ter a opção de outros 7 quadros, que estão listados acima, com os nomes e os ID, que ao selecionar o nome no frontend, o ID é enviado para o backend nas requisições da API. 
 
Quando for necessário realizar uma consulta via API para listar os campos durante a seleção do usuário, essa requisição deve ser o mais transparente possível para o usuário. Por exemplo, ele não deve precisar clicar em um botão para exibir o nome das etiquetas, mas poderá ser no próprio componente de select. Quando ele clicar para abrir a aplicação, já realizar uma requisição para pegar os nomes dos setores e exibi-los para o usuário, com um submenu. Quando ele passar o mouse em cima ou clicar no setor, outra requisição será feita para buscar as etiquetas daquele setor, ou, no caso do cliente selecionar a primeira opção, que será todos os setores, a aplicação irá exibir todas as etiquetas. 
 
Agora crie tudo que for necessário para essa aplicação funcionar, desde o backend até o frontend, criando as pastas separadas para isso, todas elas devem ficar na raiz do projeto que é essa pasta atual que é `report_ai_force`. 
 
Ao final, serão criados 3 arquivos Readme.md. Explicando o que é, como instalar e usar a aplicação, no frontend, no backend e um geral na raiz do projeto, com um resumo da aplicação, nesse readme geral será salva toda a ideia inicial para futuras referências.

Todas as requisições têm resultados paginados, limitados a 10 registros por página, então para realizar a leitura/análise dos dados é preciso realizar a leitura de todas as páginas quando tiverem mais de uma página.

---

### Requisição que irá retornar todos os cards

```https://api.domain.com/v3/workspaces/{{workspaceID}}/cards?board={{Quadro_Manutenção_ID}}&tags={{tag_Venda_IA}},{{tag_Venda_Manual}}&created_at={"start_date" : "2025-07-31T00:00:00Z","end_date" : "2025-08-01T00:00:00Z"}```

- Resultado da requisição que irá retornar todos os cards:

```json
{
    "results": [
        
        {
            "workspace": "workspaceID",
            "board": "Quadro_Manutenção_ID",
            "list": "List_ID",
            "persons": [
                "Person_ID"
            ],
            "custom_fields": [],
            "name": "Nome do Card",
            "std_name": "nome_do_card",
            "description": "Descrição do Card",
            "campaign": "Nome da Campanha",
            "source": "Nome da Fonte",
            "rating": 1,
            "user": "User_ID",
            "followers": [
                "Follower_ID"
            ],
            "previous_cards": [],
            "sector": "Sector_ID",
            "status": "in_attendance",
            "value": 0,
            "recurring_value": 0,
            "discount_value": 0,
            "additional_discount_value": 0,
            "shipping_value": 0,
            "taxes_value": 0,
            "moves": [
                {
                    "list": "List_ID",
                    "entry_date": "2025-07-31T14:32:43.460Z",
                    "exit_date": "2025-07-31T14:36:03.188Z"
                },
                {
                    "list": "List_ID",
                    "entry_date": "2025-07-31T14:36:03.188Z"
                }
            ],
            "products": [],
            "checklist": [],
            "created_at": "2025-07-31T13:43:35.939Z",
            "updated_at": "2025-07-31T16:48:26.372Z",
            "next_task": {
                "task": "Task_ID",
                "status": "pending",
                "type": "other",
                "start_date": "2025-08-07T03:00:00.000Z"
            },
            "id": "Card_ID",
            "workspace_id": "workspaceID",
            "board_id": "Quadro_Manutenção_ID",
            "list_id": "List_ID",
            "organization_id": null,
            "sector_id": "Sector_ID",
            "user_id": "User_ID",
            "tags": [
                {
                    "id": "Tag_ID",
                    "name": "Nome da Tag",
                    "std_name": "nome_da_tag",
                    "color": "Cor da Tag"
                }
            ]
        },
        {
            "workspace": "workspaceID",
            "board": "Quadro_Manutenção_ID",
            "list": "List_ID",
            "persons": [
                "Person_ID"
            ],
            "custom_fields": [],
            "name": "Nome do Card",
            "std_name": "nome_do_card",
            "description": "Descrição do Card",
            "campaign": "Nome da Campanha",
            "source": "Nome da Fonte",
            "rating": 1,
            "user": "User_ID",
            "followers": [
                "Follower_ID"
            ],
            "previous_cards": [],
            "sector": "Sector_ID",
            "status": "in_attendance",
            "value": 0,
            "recurring_value": 0,
            "discount_value": 0,
            "additional_discount_value": 0,
            "shipping_value": 0,
            "taxes_value": 0,
            "moves": [
                {
                    "list": "List_ID",
                    "entry_date": "2025-07-31T14:32:43.460Z",
                    "exit_date": "2025-07-31T14:36:03.188Z"
                },
                {
                    "list": "List_ID",
                    "entry_date": "2025-07-31T14:36:03.188Z"
                }
            ],
            "products": [],
            "checklist": [],
            "created_at": "2025-07-31T13:43:35.939Z",
            "updated_at": "2025-07-31T16:48:26.372Z",
            "next_task": {
                "task": "Task_ID",
                "status": "pending",
                "type": "other",
                "start_date": "2025-08-07T03:00:00.000Z"
            },
            "id": "Card_ID",
            "workspace_id": "workspaceID",
            "board_id": "Quadro_Manutenção_ID",
            "list_id": "List_ID",
            "organization_id": null,
            "sector_id": "Sector_ID",
            "user_id": "User_ID",
            "tags": [
                {
                    "id": "Tag_ID",
                    "name": "Nome da Tag",
                    "std_name": "nome_da_tag",
                    "color": "Cor da Tag"
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

### Requisição que irá retornar todos as etiquetas (Tags) 

```https://api.domain.com/v1/workspaces/{{workspaceID}}/tags```

- Resultado da requisição que irá retornar todas etiquetas:
```json
{
    "results": [
        {
            "name": "1º Tentativa",
            "std_name": "tag_1_tentativa",
            "color": "#1E3A8A",
            "workspace": "workspaceID",
            "sector": "Sector_ID",
            "created_at": "2025-07-10T20:09:05.558Z",
            "updated_at": "2025-07-10T20:09:05.558Z",
            "id": "Tag_ID",
            "workspace_id": "workspaceID",
            "sector_id": "Sector_ID"
        },
        {
            "name": "Acquabios",
            "std_name": "tag_acquabios",
            "color": "#164E63",
            "workspace": "workspaceID",
            "sector": "Sector_ID",
            "created_at": "2025-07-29T20:37:44.755Z",
            "updated_at": "2025-07-29T20:37:44.755Z",
            "id": "Tag_ID",
            "workspace_id": "workspaceID",
            "sector_id": "Sector_ID"
        },
        {
            "name": "Assistência",
            "std_name": "tag_assistencia",
            "color": "#701A75",
            "workspace": "workspaceID",
            "sector": "Sector_ID",
            "created_at": "2025-05-15T16:45:04.684Z",
            "updated_at": "2025-05-15T16:45:04.684Z",
            "id": "Tag_ID",
            "workspace_id": "workspaceID",
            "sector_id": "Sector_ID"
        },
        {
            "name": "Assistência Técnica",
            "std_name": "tag_assistencia_tecnica",
            "color": "#3F3F46",
            "workspace": "workspaceID",
            "sector": "Sector_ID",
            "created_at": "2025-04-08T15:18:27.350Z",
            "updated_at": "2025-04-08T15:18:27.350Z",
            "id": "Tag_ID",
            "workspace_id": "workspaceID",
            "sector_id": "Sector_ID"
        },
        {
            "name": "Bebedouro",
            "std_name": "tag_bebedouro",
            "color": "#164E63",
            "workspace": "workspaceID",
            "sector": "Sector_ID",
            "created_at": "2025-07-28T20:48:41.253Z",
            "updated_at": "2025-07-28T20:48:41.253Z",
            "id": "Tag_ID",
            "workspace_id": "workspaceID",
            "sector_id": "Sector_ID"
        },
        {
            "name": "Carga FC",
            "std_name": "tag_carga_fc",
            "color": "#312E81",
            "workspace": "workspaceID",
            "sector": "Sector_ID",
            "created_at": "2025-07-29T20:42:09.491Z",
            "updated_at": "2025-07-29T20:42:09.491Z",
            "id": "Tag_ID",
            "workspace_id": "workspaceID",
            "sector_id": "Sector_ID"
        },
        {
            "name": "Central",
            "std_name": "tag_central",
            "color": "#713F12",
            "workspace": "workspaceID",
            "sector": "Sector_ID",
            "created_at": "2025-05-15T16:46:21.213Z",
            "updated_at": "2025-05-15T16:46:21.213Z",
            "id": "Tag_ID",
            "workspace_id": "workspaceID",
            "sector_id": "Sector_ID"
        },
        {
            "name": "Central Filtrante - FC",
            "std_name": "tag_central_filtrante_fc",
            "color": "#7C2D12",
            "workspace": "workspaceID",
            "sector": "Sector_ID",
            "created_at": "2025-03-31T16:35:08.133Z",
            "updated_at": "2025-03-31T16:35:08.133Z",
            "id": "Tag_ID",
            "workspace_id": "workspaceID",
            "sector_id": "Sector_ID"
        },
        {
            "name": "Comercial",
            "std_name": "tag_comercial",
            "color": "#581C87",
            "workspace": "workspaceID",
            "sector": "Sector_ID",
            "created_at": "2025-07-28T20:48:16.189Z",
            "updated_at": "2025-07-28T20:48:16.189Z",
            "id": "Tag_ID",
            "workspace_id": "workspaceID",
            "sector_id": "Sector_ID"
        },
        {
            "name": "Digital",
            "std_name": "tag_digital",
            "color": "#14532D",
            "workspace": "workspaceID",
            "sector": "Sector_ID",
            "created_at": "2025-05-15T16:45:41.987Z",
            "updated_at": "2025-05-15T16:45:41.987Z",
            "id": "Tag_ID",
            "workspace_id": "workspaceID",
            "sector_id": "Sector_ID"
        }
    ],
    "count": 10,
    "totalItems": 66,
    "page": 1,
    "limit": 10,
    "totalPages": 7
}
```

### Requisição que irá retornar todos os setores

```https://api.domain.com/v1/workspaces/{{workspaceID}}/sectors```

- Resultado da requisição que irá retornar todos os setores:

```json
{
    "results": [
        {
            "name": "1 - Televendas - PF",
            "std_name": "sec_1_televendas_pf",
            "description": "Televendas",
            "workspace": "workspaceID",
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
            "sla_config": "SLA_ID",
            "transfer_algorithm": "round_robin",
            "id": "Sector_ID",
            "workspace_id": "workspaceID",
            "sla_config_id": "SLA_ID",
            "office_hours_id": null
        },
        {
            "name": "2 - Pessoa Jurídica - PJ",
            "std_name": "sec_2_pessoa_juridica_pj",
            "description": "PJ",
            "workspace": "workspaceID",
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
            "id": "Sector_ID",
            "workspace_id": "workspaceID",
            "sla_config_id": null,
            "office_hours_id": null
        },
        {
            "name": "3 - Assistência Técnica",
            "std_name": "sec_3_assistencia_tecnica",
            "description": "Assistência Técnica",
            "workspace": "workspaceID",
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
            "id": "Sector_ID",
            "workspace_id": "workspaceID",
            "sla_config_id": null,
            "office_hours_id": null
        },
        {
            "name": "4 - Inside Sales",
            "std_name": "sec_4_inside_sales",
            "description": "Atendimento Comercial",
            "workspace": "workspaceID",
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
            "office_hours": "OfficeHours_ID",
            "sla_config": "SLA_ID",
            "id": "Sector_ID",
            "workspace_id": "workspaceID",
            "sla_config_id": "SLA_ID",
            "office_hours_id": "OfficeHours_ID"
        },
        {
            "name": "5 - Digital / Site / E-Commerce",
            "std_name": "sec_5_digital_site_ecommerce",
            "description": "Digital / Site / E-Commerce",
            "workspace": "workspaceID",
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
            "id": "Sector_ID",
            "workspace_id": "workspaceID",
            "sla_config_id": null,
            "office_hours_id": null
        },
        {
            "name": "6 - Lojas",
            "std_name": "sec_6_lojas",
            "description": "Lojas",
            "workspace": "workspaceID",
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
            "office_hours": "OfficeHours_ID",
            "id": "Sector_ID",
            "workspace_id": "workspaceID",
            "sla_config_id": null,
            "office_hours_id": "OfficeHours_ID"
        },
        {
            "name": "7 - Financeiro",
            "std_name": "sec_7_financeiro",
            "description": "Departamento Financeiro",
            "workspace": "workspaceID",
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
            "id": "Sector_ID",
            "workspace_id": "workspaceID",
            "sla_config_id": null,
            "office_hours_id": null
        },
        {
            "name": "8 - TI",
            "std_name": "sec_8_ti",
            "description": "TI",
            "workspace": "workspaceID",
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
            "id": "Sector_ID",
            "workspace_id": "workspaceID",
            "sla_config_id": null,
            "office_hours_id": null
        },
        {
            "name": "9 -Marketing",
            "std_name": "sec_9_marketing",
            "description": "Marketing",
            "workspace": "workspaceID",
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
            "id": "Sector_ID",
            "workspace_id": "workspaceID",
            "sla_config_id": null,
            "office_hours_id": null
        },
        {
            "name": "Projetos e Tarefas",
            "std_name": "sec_projetos_e_tarefas",
            "description": "Gerentes e Supervisores que possuem demandas a serem realizadas",
            "workspace": "workspaceID",
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
            "office_hours": "OfficeHours_ID",
            "id": "Sector_ID",
            "workspace_id": "workspaceID",
            "sla_config_id": null,
            "office_hours_id": "OfficeHours_ID"
        }
    ],
    "count": 10,
    "totalItems": 10,
    "page": 1,
    "limit": 10,
    "totalPages": 1
}
```

## Atualização de Requisitos:

A aplicação se conectará à API de uma ferramenta de Marketing Conversacional, que une Omnichannel, Integração e CRM. Todas as requisições serão feitas para essa plataforma.

## Requisitos da Interface:

*   A interface deve ser leve e moderna.
*   Deve ter um tema dark (padrão) e um tema light, com um seletor para alternar entre eles.
*   Utilizar Tailwind CSS.
*   Utilizar bibliotecas de componentes como shadcn/ui para agilizar o desenvolvimento e garantir um design de alta qualidade, especialmente para a criação de gráficos e cards para exibição dos relatórios.