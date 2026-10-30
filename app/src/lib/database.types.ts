
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "agentes": {
                  Row: {
                    "ativo": boolean,"celular": string | null,"id": string,"nome": string,"parceiro_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"celular"?: string | null,"id"?: string,"nome": string,"parceiro_id": string
                  }
                  Update: {
                    "ativo"?: boolean,"celular"?: string | null,"id"?: string,"nome"?: string,"parceiro_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agentes_parceiro_id_fkey"
      columns: ["parceiro_id"]
isOneToOne: false
      referencedRelation: "parceiros"
      referencedColumns: ["id"]
    }
                  ]
                },"auditoria": {
                  Row: {
                    "acao": string,"antes": Json | null,"depois": Json | null,"detalhe": Json | null,"em": string,"id": number,"registro_id": string | null,"tabela": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": string,"antes"?: Json | null,"depois"?: Json | null,"detalhe"?: Json | null,"em"?: string,"id"?: never,"registro_id"?: string | null,"tabela"?: string | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "acao"?: string,"antes"?: Json | null,"depois"?: Json | null,"detalhe"?: Json | null,"em"?: string,"id"?: never,"registro_id"?: string | null,"tabela"?: string | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"bancos": {
                  Row: {
                    "ativo": boolean,"codigo": string,"id": string,"nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"codigo": string,"id"?: string,"nome": string
                  }
                  Update: {
                    "ativo"?: boolean,"codigo"?: string,"id"?: string,"nome"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cliente_alteracoes_pendentes": {
                  Row: {
                    "cliente_id": string,"criado_em": string,"criado_por": string | null,"decidido_em": string | null,"decidido_por": string | null,"id": string,"motivo": string | null,"parceiro_id": string,"proposta": NonNullable<Json>,"status": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id": string,"criado_em"?: string,"criado_por"?: string | null,"decidido_em"?: string | null,"decidido_por"?: string | null,"id"?: string,"motivo"?: string | null,"parceiro_id": string,"proposta": NonNullable<Json>,"status"?: string,"tipo": string
                  }
                  Update: {
                    "cliente_id"?: string,"criado_em"?: string,"criado_por"?: string | null,"decidido_em"?: string | null,"decidido_por"?: string | null,"id"?: string,"motivo"?: string | null,"parceiro_id"?: string,"proposta"?: NonNullable<Json>,"status"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cliente_alteracoes_pendentes_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cliente_alteracoes_pendentes_parceiro_id_fkey"
      columns: ["parceiro_id"]
isOneToOne: false
      referencedRelation: "parceiros"
      referencedColumns: ["id"]
    }
                  ]
                },"cliente_beneficiarios": {
                  Row: {
                    "cliente_id": string,"cpf": string | null,"id": string,"nome": string,"parentesco": string | null,"percentual": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id": string,"cpf"?: string | null,"id"?: string,"nome": string,"parentesco"?: string | null,"percentual"?: number | null
                  }
                  Update: {
                    "cliente_id"?: string,"cpf"?: string | null,"id"?: string,"nome"?: string,"parentesco"?: string | null,"percentual"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cliente_beneficiarios_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    }
                  ]
                },"cliente_contas": {
                  Row: {
                    "agencia": string,"banco_id": string,"chave_pix": string | null,"cliente_id": string,"conta": string,"id": string,"principal": boolean,"tipo_chave_pix": string | null,"tipo_conta": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agencia": string,"banco_id": string,"chave_pix"?: string | null,"cliente_id": string,"conta": string,"id"?: string,"principal"?: boolean,"tipo_chave_pix"?: string | null,"tipo_conta": string
                  }
                  Update: {
                    "agencia"?: string,"banco_id"?: string,"chave_pix"?: string | null,"cliente_id"?: string,"conta"?: string,"id"?: string,"principal"?: boolean,"tipo_chave_pix"?: string | null,"tipo_conta"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cliente_contas_banco_id_fkey"
      columns: ["banco_id"]
isOneToOne: false
      referencedRelation: "bancos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cliente_contas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    }
                  ]
                },"cliente_documentos": {
                  Row: {
                    "caminho": string,"cliente_id": string,"enviado_em": string,"enviado_por": string | null,"id": string,"nome_arquivo": string | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caminho": string,"cliente_id": string,"enviado_em"?: string,"enviado_por"?: string | null,"id"?: string,"nome_arquivo"?: string | null,"tipo": string
                  }
                  Update: {
                    "caminho"?: string,"cliente_id"?: string,"enviado_em"?: string,"enviado_por"?: string | null,"id"?: string,"nome_arquivo"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cliente_documentos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    }
                  ]
                },"cliente_historico": {
                  Row: {
                    "antes": Json | null,"campo": string,"cliente_id": string,"depois": Json | null,"em": string,"id": number,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "antes"?: Json | null,"campo": string,"cliente_id": string,"depois"?: Json | null,"em"?: string,"id"?: never,"usuario_id"?: string | null
                  }
                  Update: {
                    "antes"?: Json | null,"campo"?: string,"cliente_id"?: string,"depois"?: Json | null,"em"?: string,"id"?: never,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cliente_historico_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    }
                  ]
                },"cliente_matriculas": {
                  Row: {
                    "ativa": boolean,"cliente_id": string,"convenio_id": string,"id": string,"importacao_id": string | null,"matricula": string,"matricula_normalizada": string | null,"orgao": string | null,"vinculo_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativa"?: boolean,"cliente_id": string,"convenio_id": string,"id"?: string,"importacao_id"?: string | null,"matricula": string,"matricula_normalizada"?: never,"orgao"?: string | null,"vinculo_id": string
                  }
                  Update: {
                    "ativa"?: boolean,"cliente_id"?: string,"convenio_id"?: string,"id"?: string,"importacao_id"?: string | null,"matricula"?: string,"matricula_normalizada"?: never,"orgao"?: string | null,"vinculo_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cliente_matriculas_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cliente_matriculas_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cliente_matriculas_importacao_id_fkey"
      columns: ["importacao_id"]
isOneToOne: false
      referencedRelation: "importacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cliente_matriculas_vinculo_id_fkey"
      columns: ["vinculo_id"]
isOneToOne: false
      referencedRelation: "convenio_vinculos"
      referencedColumns: ["id"]
    }
                  ]
                },"cliente_parceiros": {
                  Row: {
                    "cliente_id": string,"criado_em": string,"parceiro_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id": string,"criado_em"?: string,"parceiro_id": string
                  }
                  Update: {
                    "cliente_id"?: string,"criado_em"?: string,"parceiro_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cliente_parceiros_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cliente_parceiros_parceiro_id_fkey"
      columns: ["parceiro_id"]
isOneToOne: false
      referencedRelation: "parceiros"
      referencedColumns: ["id"]
    }
                  ]
                },"clientes": {
                  Row: {
                    "analfabeto": boolean | null,"atualizado_em": string,"bairro": string | null,"celular": string,"cep": string | null,"cidade": string | null,"complemento": string | null,"conjuge_cpf": string | null,"conjuge_nome": string | null,"cpf": string,"criado_em": string,"criado_por": string | null,"data_nascimento": string | null,"email": string | null,"escolaridade": string | null,"estado_civil": string | null,"id": string,"importacao_id": string | null,"logradouro": string | null,"nome": string,"nome_mae": string | null,"nome_pai": string | null,"numero": string | null,"pep": boolean | null,"pis": string | null,"rg": string | null,"rg_orgao": string | null,"uf": string | null,"whatsapp": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analfabeto"?: boolean | null,"atualizado_em"?: string,"bairro"?: string | null,"celular": string,"cep"?: string | null,"cidade"?: string | null,"complemento"?: string | null,"conjuge_cpf"?: string | null,"conjuge_nome"?: string | null,"cpf": string,"criado_em"?: string,"criado_por"?: string | null,"data_nascimento"?: string | null,"email"?: string | null,"escolaridade"?: string | null,"estado_civil"?: string | null,"id"?: string,"importacao_id"?: string | null,"logradouro"?: string | null,"nome": string,"nome_mae"?: string | null,"nome_pai"?: string | null,"numero"?: string | null,"pep"?: boolean | null,"pis"?: string | null,"rg"?: string | null,"rg_orgao"?: string | null,"uf"?: string | null,"whatsapp": string
                  }
                  Update: {
                    "analfabeto"?: boolean | null,"atualizado_em"?: string,"bairro"?: string | null,"celular"?: string,"cep"?: string | null,"cidade"?: string | null,"complemento"?: string | null,"conjuge_cpf"?: string | null,"conjuge_nome"?: string | null,"cpf"?: string,"criado_em"?: string,"criado_por"?: string | null,"data_nascimento"?: string | null,"email"?: string | null,"escolaridade"?: string | null,"estado_civil"?: string | null,"id"?: string,"importacao_id"?: string | null,"logradouro"?: string | null,"nome"?: string,"nome_mae"?: string | null,"nome_pai"?: string | null,"numero"?: string | null,"pep"?: boolean | null,"pis"?: string | null,"rg"?: string | null,"rg_orgao"?: string | null,"uf"?: string | null,"whatsapp"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clientes_importacao_id_fkey"
      columns: ["importacao_id"]
isOneToOne: false
      referencedRelation: "importacoes"
      referencedColumns: ["id"]
    }
                  ]
                },"configuracoes": {
                  Row: {
                    "chave": string,"descricao": string | null,"valor": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"descricao"?: string | null,"valor": NonNullable<Json>
                  }
                  Update: {
                    "chave"?: string,"descricao"?: string | null,"valor"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"contrato_assinatura_evidencias": {
                  Row: {
                    "assinatura_id": string,"criado_em": string,"dados": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "assinatura_id": string,"criado_em"?: string,"dados": NonNullable<Json>
                  }
                  Update: {
                    "assinatura_id"?: string,"criado_em"?: string,"dados"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_assinatura_evidencias_assinatura_id_fkey"
      columns: ["assinatura_id"]
isOneToOne: true
      referencedRelation: "contrato_assinaturas"
      referencedColumns: ["id"]
    }
                  ]
                },"contrato_assinaturas": {
                  Row: {
                    "assinado_em": string | null,"assinantes": Json | null,"cancelado_em": string | null,"conferido_em": string | null,"conferido_por": string | null,"contrato_id": string,"criado_em": string,"enviado_em": string | null,"enviado_por": string | null,"erro": string | null,"id": string,"modelo_id": string | null,"pdf_assinado_caminho": string | null,"pdf_caminho": string | null,"prazo": string | null,"situacao": string,"valores": NonNullable<Json>,"zapsign_token": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assinado_em"?: string | null,"assinantes"?: Json | null,"cancelado_em"?: string | null,"conferido_em"?: string | null,"conferido_por"?: string | null,"contrato_id": string,"criado_em"?: string,"enviado_em"?: string | null,"enviado_por"?: string | null,"erro"?: string | null,"id"?: string,"modelo_id"?: string | null,"pdf_assinado_caminho"?: string | null,"pdf_caminho"?: string | null,"prazo"?: string | null,"situacao": string,"valores": NonNullable<Json>,"zapsign_token"?: string | null
                  }
                  Update: {
                    "assinado_em"?: string | null,"assinantes"?: Json | null,"cancelado_em"?: string | null,"conferido_em"?: string | null,"conferido_por"?: string | null,"contrato_id"?: string,"criado_em"?: string,"enviado_em"?: string | null,"enviado_por"?: string | null,"erro"?: string | null,"id"?: string,"modelo_id"?: string | null,"pdf_assinado_caminho"?: string | null,"pdf_caminho"?: string | null,"prazo"?: string | null,"situacao"?: string,"valores"?: NonNullable<Json>,"zapsign_token"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_assinaturas_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_assinaturas_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    },{
      foreignKeyName: "contrato_assinaturas_modelo_id_fkey"
      columns: ["modelo_id"]
isOneToOne: false
      referencedRelation: "contrato_modelos"
      referencedColumns: ["id"]
    }
                  ]
                },"contrato_averbacoes": {
                  Row: {
                    "ade": string,"contrato_id": string,"convenio_id": string,"criado_em": string,"criado_por": string | null,"id": string,"importacao_id": string | null,"matricula_id": string,"migrada_para": string | null,"situacao": Database["public"]['Enums']["situacao_averbacao"],"valor_averbado": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ade": string,"contrato_id": string,"convenio_id": string,"criado_em"?: string,"criado_por"?: string | null,"id"?: string,"importacao_id"?: string | null,"matricula_id": string,"migrada_para"?: string | null,"situacao": Database["public"]['Enums']["situacao_averbacao"],"valor_averbado": number
                  }
                  Update: {
                    "ade"?: string,"contrato_id"?: string,"convenio_id"?: string,"criado_em"?: string,"criado_por"?: string | null,"id"?: string,"importacao_id"?: string | null,"matricula_id"?: string,"migrada_para"?: string | null,"situacao"?: Database["public"]['Enums']["situacao_averbacao"],"valor_averbado"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_averbacoes_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_averbacoes_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    },{
      foreignKeyName: "contrato_averbacoes_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_averbacoes_importacao_id_fkey"
      columns: ["importacao_id"]
isOneToOne: false
      referencedRelation: "importacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_averbacoes_matricula_id_fkey"
      columns: ["matricula_id"]
isOneToOne: false
      referencedRelation: "cliente_matriculas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_averbacoes_migrada_para_fkey"
      columns: ["migrada_para"]
isOneToOne: false
      referencedRelation: "contrato_averbacoes"
      referencedColumns: ["id"]
    }
                  ]
                },"contrato_comissao_regra": {
                  Row: {
                    "base": Database["public"]['Enums']["base_comissao"],"contrato_id": string,"percentual": number
                  }
                  ComputedFields: never
                  Insert: {
                    "base": Database["public"]['Enums']["base_comissao"],"contrato_id": string,"percentual": number
                  }
                  Update: {
                    "base"?: Database["public"]['Enums']["base_comissao"],"contrato_id"?: string,"percentual"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_comissao_regra_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: true
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_comissao_regra_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: true
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    }
                  ]
                },"contrato_descontos": {
                  Row: {
                    "contrato_id": string,"id": string,"tipo_desconto_id": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "contrato_id": string,"id"?: string,"tipo_desconto_id": string,"valor": number
                  }
                  Update: {
                    "contrato_id"?: string,"id"?: string,"tipo_desconto_id"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_descontos_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_descontos_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    },{
      foreignKeyName: "contrato_descontos_tipo_desconto_id_fkey"
      columns: ["tipo_desconto_id"]
isOneToOne: false
      referencedRelation: "convenio_tipos_desconto"
      referencedColumns: ["id"]
    }
                  ]
                },"contrato_dividas_externas": {
                  Row: {
                    "contrato_id": string,"credor": string,"favorecido": string | null,"id": string,"numero_contrato_externo": string | null,"observacao": string | null,"saldo": number
                  }
                  ComputedFields: never
                  Insert: {
                    "contrato_id": string,"credor": string,"favorecido"?: string | null,"id"?: string,"numero_contrato_externo"?: string | null,"observacao"?: string | null,"saldo": number
                  }
                  Update: {
                    "contrato_id"?: string,"credor"?: string,"favorecido"?: string | null,"id"?: string,"numero_contrato_externo"?: string | null,"observacao"?: string | null,"saldo"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_dividas_externas_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_dividas_externas_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    }
                  ]
                },"contrato_eventos": {
                  Row: {
                    "contrato_id": string,"de": Database["public"]['Enums']["fase_contrato"] | null,"em": string,"id": number,"motivo": string | null,"para": Database["public"]['Enums']["fase_contrato"] | null,"situacao_de": Database["public"]['Enums']["situacao_contrato"] | null,"situacao_para": Database["public"]['Enums']["situacao_contrato"] | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "contrato_id": string,"de"?: Database["public"]['Enums']["fase_contrato"] | null,"em"?: string,"id"?: never,"motivo"?: string | null,"para"?: Database["public"]['Enums']["fase_contrato"] | null,"situacao_de"?: Database["public"]['Enums']["situacao_contrato"] | null,"situacao_para"?: Database["public"]['Enums']["situacao_contrato"] | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "contrato_id"?: string,"de"?: Database["public"]['Enums']["fase_contrato"] | null,"em"?: string,"id"?: never,"motivo"?: string | null,"para"?: Database["public"]['Enums']["fase_contrato"] | null,"situacao_de"?: Database["public"]['Enums']["situacao_contrato"] | null,"situacao_para"?: Database["public"]['Enums']["situacao_contrato"] | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_eventos_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_eventos_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    }
                  ]
                },"contrato_modelos": {
                  Row: {
                    "ativo": boolean,"convenio_id": string,"criado_em": string,"criado_por": string | null,"id": string,"teste": boolean,"texto": string,"versao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"convenio_id": string,"criado_em"?: string,"criado_por"?: string | null,"id"?: string,"teste"?: boolean,"texto": string,"versao": number
                  }
                  Update: {
                    "ativo"?: boolean,"convenio_id"?: string,"criado_em"?: string,"criado_por"?: string | null,"id"?: string,"teste"?: boolean,"texto"?: string,"versao"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_modelos_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    }
                  ]
                },"contrato_quitacoes": {
                  Row: {
                    "contrato_id": string,"contrato_quitado_id": string,"fonte": string,"id": string,"observacao": string | null,"reservado": boolean,"saldo_devedor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "contrato_id": string,"contrato_quitado_id": string,"fonte": string,"id"?: string,"observacao"?: string | null,"reservado"?: boolean,"saldo_devedor": number
                  }
                  Update: {
                    "contrato_id"?: string,"contrato_quitado_id"?: string,"fonte"?: string,"id"?: string,"observacao"?: string | null,"reservado"?: boolean,"saldo_devedor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_quitacoes_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_quitacoes_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    },{
      foreignKeyName: "contrato_quitacoes_contrato_quitado_id_fkey"
      columns: ["contrato_quitado_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_quitacoes_contrato_quitado_id_fkey"
      columns: ["contrato_quitado_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    }
                  ]
                },"contrato_versoes": {
                  Row: {
                    "contrato_id": string,"criado_em": string,"criado_por": string | null,"dados": NonNullable<Json>,"id": string,"motivo": string | null,"versao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "contrato_id": string,"criado_em"?: string,"criado_por"?: string | null,"dados": NonNullable<Json>,"id"?: string,"motivo"?: string | null,"versao": number
                  }
                  Update: {
                    "contrato_id"?: string,"criado_em"?: string,"criado_por"?: string | null,"dados"?: NonNullable<Json>,"id"?: string,"motivo"?: string | null,"versao"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_versoes_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_versoes_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    }
                  ]
                },"contrato_versoes_comissao": {
                  Row: {
                    "base": Database["public"]['Enums']["base_comissao"],"contrato_id": string,"percentual": number,"versao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "base": Database["public"]['Enums']["base_comissao"],"contrato_id": string,"percentual": number,"versao": number
                  }
                  Update: {
                    "base"?: Database["public"]['Enums']["base_comissao"],"contrato_id"?: string,"percentual"?: number,"versao"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "contrato_versoes_comissao_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contrato_versoes_comissao_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    }
                  ]
                },"contratos": {
                  Row: {
                    "agente_id": string | null,"cliente_id": string,"convenio_id": string,"criado_em": string,"criado_por": string | null,"data_liberacao": string | null,"fase": Database["public"]['Enums']["fase_contrato"],"fase_desde": string,"fase_retorno": Database["public"]['Enums']["fase_contrato"] | null,"fator": number,"id": string,"importacao_id": string | null,"legado": boolean,"legado_importado_em": string | null,"legado_importado_por": string | null,"linha_tabela_id": string | null,"matricula_id": string,"mensalidade_proposta": number | null,"numero": number,"numero_legado": string | null,"origem_id": string | null,"parceiro_id": string | null,"prazo": number,"primeiro_vencimento": string | null,"quitados_legado": string | null,"situacao": Database["public"]['Enums']["situacao_contrato"],"tipo": Database["public"]['Enums']["tipo_contrato"],"total_descontos": number,"total_dividas_externas": number,"total_quitado": number,"valor_bruto": number,"valor_liquido": number | null,"valor_mensalidade_tabela": number | null,"valor_parcela": number,"valores_travados_em": string | null,"versao": number,"vinculo_id": string,"_dados_do_contrato": Json | null
                  }
                  ComputedFields: "_dados_do_contrato"
                  Insert: {
                    "agente_id"?: string | null,"cliente_id": string,"convenio_id": string,"criado_em"?: string,"criado_por"?: string | null,"data_liberacao"?: string | null,"fase": Database["public"]['Enums']["fase_contrato"],"fase_desde"?: string,"fase_retorno"?: Database["public"]['Enums']["fase_contrato"] | null,"fator": number,"id"?: string,"importacao_id"?: string | null,"legado"?: boolean,"legado_importado_em"?: string | null,"legado_importado_por"?: string | null,"linha_tabela_id"?: string | null,"matricula_id": string,"mensalidade_proposta"?: number | null,"numero"?: number,"numero_legado"?: string | null,"origem_id"?: string | null,"parceiro_id"?: string | null,"prazo": number,"primeiro_vencimento"?: string | null,"quitados_legado"?: string | null,"situacao"?: Database["public"]['Enums']["situacao_contrato"],"tipo": Database["public"]['Enums']["tipo_contrato"],"total_descontos"?: number,"total_dividas_externas"?: number,"total_quitado"?: number,"valor_bruto": number,"valor_liquido"?: never,"valor_mensalidade_tabela"?: number | null,"valor_parcela": number,"valores_travados_em"?: string | null,"versao"?: number,"vinculo_id": string
                  }
                  Update: {
                    "agente_id"?: string | null,"cliente_id"?: string,"convenio_id"?: string,"criado_em"?: string,"criado_por"?: string | null,"data_liberacao"?: string | null,"fase"?: Database["public"]['Enums']["fase_contrato"],"fase_desde"?: string,"fase_retorno"?: Database["public"]['Enums']["fase_contrato"] | null,"fator"?: number,"id"?: string,"importacao_id"?: string | null,"legado"?: boolean,"legado_importado_em"?: string | null,"legado_importado_por"?: string | null,"linha_tabela_id"?: string | null,"matricula_id"?: string,"mensalidade_proposta"?: number | null,"numero"?: number,"numero_legado"?: string | null,"origem_id"?: string | null,"parceiro_id"?: string | null,"prazo"?: number,"primeiro_vencimento"?: string | null,"quitados_legado"?: string | null,"situacao"?: Database["public"]['Enums']["situacao_contrato"],"tipo"?: Database["public"]['Enums']["tipo_contrato"],"total_descontos"?: number,"total_dividas_externas"?: number,"total_quitado"?: number,"valor_bruto"?: number,"valor_liquido"?: never,"valor_mensalidade_tabela"?: number | null,"valor_parcela"?: number,"valores_travados_em"?: string | null,"versao"?: number,"vinculo_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contratos_agente_id_fkey"
      columns: ["agente_id"]
isOneToOne: false
      referencedRelation: "agentes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_importacao_id_fkey"
      columns: ["importacao_id"]
isOneToOne: false
      referencedRelation: "importacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_linha_tabela_id_fkey"
      columns: ["linha_tabela_id"]
isOneToOne: false
      referencedRelation: "tabela_linhas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_matricula_id_fkey"
      columns: ["matricula_id"]
isOneToOne: false
      referencedRelation: "cliente_matriculas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_origem_id_fkey"
      columns: ["origem_id"]
isOneToOne: false
      referencedRelation: "origens"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_parceiro_id_fkey"
      columns: ["parceiro_id"]
isOneToOne: false
      referencedRelation: "parceiros"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contratos_vinculo_id_fkey"
      columns: ["vinculo_id"]
isOneToOne: false
      referencedRelation: "convenio_vinculos"
      referencedColumns: ["id"]
    }
                  ]
                },"convenio_assinantes": {
                  Row: {
                    "ativo": boolean,"celular": string | null,"convenio_id": string,"email": string | null,"id": string,"nome": string,"ordem": number,"papel": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"celular"?: string | null,"convenio_id": string,"email"?: string | null,"id"?: string,"nome": string,"ordem"?: number,"papel": string
                  }
                  Update: {
                    "ativo"?: boolean,"celular"?: string | null,"convenio_id"?: string,"email"?: string | null,"id"?: string,"nome"?: string,"ordem"?: number,"papel"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "convenio_assinantes_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    }
                  ]
                },"convenio_tipos_desconto": {
                  Row: {
                    "ativo": boolean,"convenio_id": string,"forma": string,"id": string,"nome": string,"valor_padrao": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"convenio_id": string,"forma": string,"id"?: string,"nome": string,"valor_padrao"?: number | null
                  }
                  Update: {
                    "ativo"?: boolean,"convenio_id"?: string,"forma"?: string,"id"?: string,"nome"?: string,"valor_padrao"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "convenio_tipos_desconto_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    }
                  ]
                },"convenio_vinculos": {
                  Row: {
                    "ativo": boolean,"convenio_id": string,"id": string,"nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"convenio_id": string,"id"?: string,"nome": string
                  }
                  Update: {
                    "ativo"?: boolean,"convenio_id"?: string,"id"?: string,"nome"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "convenio_vinculos_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    }
                  ]
                },"convenios": {
                  Row: {
                    "ade_descricao": string | null,"ade_modo": string,"ade_regex": string | null,"assinatura_codigo": boolean,"assinatura_documento": boolean,"assinatura_email": boolean,"assinatura_prazo_dias": number,"assinatura_selfie": boolean,"assinatura_whatsapp": boolean,"ativo": boolean,"averbadora": string | null,"campos_obrigatorios": (string)[],"criado_em": string,"dia_corte": number | null,"dia_vencimento": number | null,"dias_prejuizo": number,"ente": string | null,"id": string,"layout_remessa": Json | null,"layout_retorno": Json | null,"margem_percentual": number | null,"nome": string,"prazo_max": number | null,"prazo_min": number | null,"uf": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ade_descricao"?: string | null,"ade_modo"?: string,"ade_regex"?: string | null,"assinatura_codigo"?: boolean,"assinatura_documento"?: boolean,"assinatura_email"?: boolean,"assinatura_prazo_dias"?: number,"assinatura_selfie"?: boolean,"assinatura_whatsapp"?: boolean,"ativo"?: boolean,"averbadora"?: string | null,"campos_obrigatorios"?: (string)[],"criado_em"?: string,"dia_corte"?: number | null,"dia_vencimento"?: number | null,"dias_prejuizo"?: number,"ente"?: string | null,"id"?: string,"layout_remessa"?: Json | null,"layout_retorno"?: Json | null,"margem_percentual"?: number | null,"nome": string,"prazo_max"?: number | null,"prazo_min"?: number | null,"uf"?: string | null
                  }
                  Update: {
                    "ade_descricao"?: string | null,"ade_modo"?: string,"ade_regex"?: string | null,"assinatura_codigo"?: boolean,"assinatura_documento"?: boolean,"assinatura_email"?: boolean,"assinatura_prazo_dias"?: number,"assinatura_selfie"?: boolean,"assinatura_whatsapp"?: boolean,"ativo"?: boolean,"averbadora"?: string | null,"campos_obrigatorios"?: (string)[],"criado_em"?: string,"dia_corte"?: number | null,"dia_vencimento"?: number | null,"dias_prejuizo"?: number,"ente"?: string | null,"id"?: string,"layout_remessa"?: Json | null,"layout_retorno"?: Json | null,"margem_percentual"?: number | null,"nome"?: string,"prazo_max"?: number | null,"prazo_min"?: number | null,"uf"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"fase_transicoes": {
                  Row: {
                    "de": Database["public"]['Enums']["fase_contrato"],"para": Database["public"]['Enums']["fase_contrato"],"permissao": string
                  }
                  ComputedFields: never
                  Insert: {
                    "de": Database["public"]['Enums']["fase_contrato"],"para": Database["public"]['Enums']["fase_contrato"],"permissao": string
                  }
                  Update: {
                    "de"?: Database["public"]['Enums']["fase_contrato"],"para"?: Database["public"]['Enums']["fase_contrato"],"permissao"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fase_transicoes_permissao_fkey"
      columns: ["permissao"]
isOneToOne: false
      referencedRelation: "permissoes"
      referencedColumns: ["chave"]
    }
                  ]
                },"importacoes": {
                  Row: {
                    "arquivo_caminho": string | null,"arquivo_nome": string,"concluida_em": string | null,"criado_em": string,"data_posicao": string,"desfeita_em": string | null,"desfeita_por": string | null,"erros": Json | null,"hash": string,"id": string,"resumo": Json | null,"situacao": string,"ultimo_lote_em": string | null,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "arquivo_caminho"?: string | null,"arquivo_nome": string,"concluida_em"?: string | null,"criado_em"?: string,"data_posicao": string,"desfeita_em"?: string | null,"desfeita_por"?: string | null,"erros"?: Json | null,"hash": string,"id"?: string,"resumo"?: Json | null,"situacao"?: string,"ultimo_lote_em"?: string | null,"usuario_id"?: string | null
                  }
                  Update: {
                    "arquivo_caminho"?: string | null,"arquivo_nome"?: string,"concluida_em"?: string | null,"criado_em"?: string,"data_posicao"?: string,"desfeita_em"?: string | null,"desfeita_por"?: string | null,"erros"?: Json | null,"hash"?: string,"id"?: string,"resumo"?: Json | null,"situacao"?: string,"ultimo_lote_em"?: string | null,"usuario_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"mensalidade_averbacoes": {
                  Row: {
                    "ade": string,"contrato_origem_id": string | null,"convenio_id": string,"criado_em": string,"criado_por": string | null,"id": string,"importacao_id": string | null,"matricula_id": string,"mensalidade_id": string | null,"migrada_para": string | null,"situacao": Database["public"]['Enums']["situacao_averbacao"],"valor_averbado": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ade": string,"contrato_origem_id"?: string | null,"convenio_id": string,"criado_em"?: string,"criado_por"?: string | null,"id"?: string,"importacao_id"?: string | null,"matricula_id": string,"mensalidade_id"?: string | null,"migrada_para"?: string | null,"situacao": Database["public"]['Enums']["situacao_averbacao"],"valor_averbado": number
                  }
                  Update: {
                    "ade"?: string,"contrato_origem_id"?: string | null,"convenio_id"?: string,"criado_em"?: string,"criado_por"?: string | null,"id"?: string,"importacao_id"?: string | null,"matricula_id"?: string,"mensalidade_id"?: string | null,"migrada_para"?: string | null,"situacao"?: Database["public"]['Enums']["situacao_averbacao"],"valor_averbado"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "mensalidade_averbacoes_contrato_origem_id_fkey"
      columns: ["contrato_origem_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensalidade_averbacoes_contrato_origem_id_fkey"
      columns: ["contrato_origem_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    },{
      foreignKeyName: "mensalidade_averbacoes_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensalidade_averbacoes_importacao_id_fkey"
      columns: ["importacao_id"]
isOneToOne: false
      referencedRelation: "importacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensalidade_averbacoes_matricula_id_fkey"
      columns: ["matricula_id"]
isOneToOne: false
      referencedRelation: "cliente_matriculas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensalidade_averbacoes_mensalidade_id_fkey"
      columns: ["mensalidade_id"]
isOneToOne: false
      referencedRelation: "mensalidades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensalidade_averbacoes_migrada_para_fkey"
      columns: ["migrada_para"]
isOneToOne: false
      referencedRelation: "mensalidade_averbacoes"
      referencedColumns: ["id"]
    }
                  ]
                },"mensalidade_parcelas": {
                  Row: {
                    "competencia": string,"id": string,"mensalidade_id": string,"status": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "competencia": string,"id"?: string,"mensalidade_id": string,"status"?: string,"valor": number
                  }
                  Update: {
                    "competencia"?: string,"id"?: string,"mensalidade_id"?: string,"status"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "mensalidade_parcelas_mensalidade_id_fkey"
      columns: ["mensalidade_id"]
isOneToOne: false
      referencedRelation: "mensalidades"
      referencedColumns: ["id"]
    }
                  ]
                },"mensalidade_valores": {
                  Row: {
                    "averbacao_id": string | null,"contrato_origem_id": string | null,"criado_em": string,"id": string,"mensalidade_id": string,"tipo": string,"valor": number,"vigente_desde": string
                  }
                  ComputedFields: never
                  Insert: {
                    "averbacao_id"?: string | null,"contrato_origem_id"?: string | null,"criado_em"?: string,"id"?: string,"mensalidade_id": string,"tipo": string,"valor": number,"vigente_desde": string
                  }
                  Update: {
                    "averbacao_id"?: string | null,"contrato_origem_id"?: string | null,"criado_em"?: string,"id"?: string,"mensalidade_id"?: string,"tipo"?: string,"valor"?: number,"vigente_desde"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mensalidade_valores_averbacao_id_fkey"
      columns: ["averbacao_id"]
isOneToOne: false
      referencedRelation: "mensalidade_averbacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensalidade_valores_contrato_origem_id_fkey"
      columns: ["contrato_origem_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensalidade_valores_contrato_origem_id_fkey"
      columns: ["contrato_origem_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    },{
      foreignKeyName: "mensalidade_valores_mensalidade_id_fkey"
      columns: ["mensalidade_id"]
isOneToOne: false
      referencedRelation: "mensalidades"
      referencedColumns: ["id"]
    }
                  ]
                },"mensalidades": {
                  Row: {
                    "cancelada_em": string | null,"criado_em": string,"id": string,"importacao_id": string | null,"matricula_id": string,"motivo_cancelamento": string | null,"requerimento_documento_id": string | null,"situacao": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelada_em"?: string | null,"criado_em"?: string,"id"?: string,"importacao_id"?: string | null,"matricula_id": string,"motivo_cancelamento"?: string | null,"requerimento_documento_id"?: string | null,"situacao"?: string
                  }
                  Update: {
                    "cancelada_em"?: string | null,"criado_em"?: string,"id"?: string,"importacao_id"?: string | null,"matricula_id"?: string,"motivo_cancelamento"?: string | null,"requerimento_documento_id"?: string | null,"situacao"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mensalidades_importacao_id_fkey"
      columns: ["importacao_id"]
isOneToOne: false
      referencedRelation: "importacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensalidades_matricula_id_fkey"
      columns: ["matricula_id"]
isOneToOne: false
      referencedRelation: "cliente_matriculas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mensalidades_requerimento_documento_id_fkey"
      columns: ["requerimento_documento_id"]
isOneToOne: false
      referencedRelation: "cliente_documentos"
      referencedColumns: ["id"]
    }
                  ]
                },"origens": {
                  Row: {
                    "ativo": boolean,"id": string,"nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"id"?: string,"nome": string
                  }
                  Update: {
                    "ativo"?: boolean,"id"?: string,"nome"?: string
                  }
                  Relationships: [
                    
                  ]
                },"parceiro_contas": {
                  Row: {
                    "agencia": string,"banco_id": string,"chave_pix": string | null,"conta": string,"id": string,"parceiro_id": string,"principal": boolean,"tipo_chave_pix": string | null,"tipo_conta": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agencia": string,"banco_id": string,"chave_pix"?: string | null,"conta": string,"id"?: string,"parceiro_id": string,"principal"?: boolean,"tipo_chave_pix"?: string | null,"tipo_conta": string
                  }
                  Update: {
                    "agencia"?: string,"banco_id"?: string,"chave_pix"?: string | null,"conta"?: string,"id"?: string,"parceiro_id"?: string,"principal"?: boolean,"tipo_chave_pix"?: string | null,"tipo_conta"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "parceiro_contas_banco_id_fkey"
      columns: ["banco_id"]
isOneToOne: false
      referencedRelation: "bancos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parceiro_contas_parceiro_id_fkey"
      columns: ["parceiro_id"]
isOneToOne: false
      referencedRelation: "parceiros"
      referencedColumns: ["id"]
    }
                  ]
                },"parceiros": {
                  Row: {
                    "ativo": boolean,"celular": string,"criado_em": string,"documento": string,"email": string | null,"id": string,"nome": string,"recebe_mensalidades": boolean,"tipo_pessoa": string,"whatsapp": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"celular": string,"criado_em"?: string,"documento": string,"email"?: string | null,"id"?: string,"nome": string,"recebe_mensalidades"?: boolean,"tipo_pessoa": string,"whatsapp": string
                  }
                  Update: {
                    "ativo"?: boolean,"celular"?: string,"criado_em"?: string,"documento"?: string,"email"?: string | null,"id"?: string,"nome"?: string,"recebe_mensalidades"?: boolean,"tipo_pessoa"?: string,"whatsapp"?: string
                  }
                  Relationships: [
                    
                  ]
                },"parcela_pagamentos": {
                  Row: {
                    "averbacao_id": string | null,"competencia_desconto": string,"criado_em": string,"id": string,"origem": string,"parcela_id": string,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "averbacao_id"?: string | null,"competencia_desconto": string,"criado_em"?: string,"id"?: string,"origem"?: string,"parcela_id": string,"valor": number
                  }
                  Update: {
                    "averbacao_id"?: string | null,"competencia_desconto"?: string,"criado_em"?: string,"id"?: string,"origem"?: string,"parcela_id"?: string,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "parcela_pagamentos_averbacao_id_fkey"
      columns: ["averbacao_id"]
isOneToOne: false
      referencedRelation: "contrato_averbacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parcela_pagamentos_parcela_id_fkey"
      columns: ["parcela_id"]
isOneToOne: false
      referencedRelation: "parcelas"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parcela_pagamentos_parcela_id_fkey"
      columns: ["parcela_id"]
isOneToOne: false
      referencedRelation: "v_parcelas_saldo"
      referencedColumns: ["parcela_id"]
    }
                  ]
                },"parcelas": {
                  Row: {
                    "averbacao_id": string | null,"competencia": string,"contrato_id": string,"id": string,"numero": number,"status": string,"valor": number,"vencimento": string
                  }
                  ComputedFields: never
                  Insert: {
                    "averbacao_id"?: string | null,"competencia": string,"contrato_id": string,"id"?: string,"numero": number,"status"?: string,"valor": number,"vencimento": string
                  }
                  Update: {
                    "averbacao_id"?: string | null,"competencia"?: string,"contrato_id"?: string,"id"?: string,"numero"?: number,"status"?: string,"valor"?: number,"vencimento"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "parcelas_averbacao_id_fkey"
      columns: ["averbacao_id"]
isOneToOne: false
      referencedRelation: "contrato_averbacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parcelas_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parcelas_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    }
                  ]
                },"pendencias_averbadora": {
                  Row: {
                    "averbacao_id": string | null,"contrato_id": string | null,"criado_em": string,"id": string,"mensalidade_averbacao_id": string | null,"motivo": string,"resolvida_em": string | null,"resolvida_por": string | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "averbacao_id"?: string | null,"contrato_id"?: string | null,"criado_em"?: string,"id"?: string,"mensalidade_averbacao_id"?: string | null,"motivo": string,"resolvida_em"?: string | null,"resolvida_por"?: string | null,"tipo": string
                  }
                  Update: {
                    "averbacao_id"?: string | null,"contrato_id"?: string | null,"criado_em"?: string,"id"?: string,"mensalidade_averbacao_id"?: string | null,"motivo"?: string,"resolvida_em"?: string | null,"resolvida_por"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pendencias_averbadora_averbacao_id_fkey"
      columns: ["averbacao_id"]
isOneToOne: false
      referencedRelation: "contrato_averbacoes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pendencias_averbadora_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "contratos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pendencias_averbadora_contrato_id_fkey"
      columns: ["contrato_id"]
isOneToOne: false
      referencedRelation: "v_candidatos_prejuizo"
      referencedColumns: ["contrato_id"]
    },{
      foreignKeyName: "pendencias_averbadora_mensalidade_averbacao_id_fkey"
      columns: ["mensalidade_averbacao_id"]
isOneToOne: false
      referencedRelation: "mensalidade_averbacoes"
      referencedColumns: ["id"]
    }
                  ]
                },"perfil_permissoes": {
                  Row: {
                    "perfil": Database["public"]['Enums']["perfil_acesso"],"permissao": string
                  }
                  ComputedFields: never
                  Insert: {
                    "perfil": Database["public"]['Enums']["perfil_acesso"],"permissao": string
                  }
                  Update: {
                    "perfil"?: Database["public"]['Enums']["perfil_acesso"],"permissao"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "perfil_permissoes_permissao_fkey"
      columns: ["permissao"]
isOneToOne: false
      referencedRelation: "permissoes"
      referencedColumns: ["chave"]
    }
                  ]
                },"permissoes": {
                  Row: {
                    "chave": string,"descricao": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chave": string,"descricao": string
                  }
                  Update: {
                    "chave"?: string,"descricao"?: string
                  }
                  Relationships: [
                    
                  ]
                },"simulacoes": {
                  Row: {
                    "criado_em": string,"criado_por": string | null,"entrada": string,"id": string,"linha_id": string,"parcela": number,"valor": number
                  }
                  ComputedFields: never
                  Insert: {
                    "criado_em"?: string,"criado_por"?: string | null,"entrada": string,"id"?: string,"linha_id": string,"parcela": number,"valor": number
                  }
                  Update: {
                    "criado_em"?: string,"criado_por"?: string | null,"entrada"?: string,"id"?: string,"linha_id"?: string,"parcela"?: number,"valor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "simulacoes_linha_id_fkey"
      columns: ["linha_id"]
isOneToOne: false
      referencedRelation: "tabela_linhas"
      referencedColumns: ["id"]
    }
                  ]
                },"tabela_linha_comissoes": {
                  Row: {
                    "base": Database["public"]['Enums']["base_comissao"],"linha_id": string,"percentual": number
                  }
                  ComputedFields: never
                  Insert: {
                    "base": Database["public"]['Enums']["base_comissao"],"linha_id": string,"percentual": number
                  }
                  Update: {
                    "base"?: Database["public"]['Enums']["base_comissao"],"linha_id"?: string,"percentual"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "tabela_linha_comissoes_linha_id_fkey"
      columns: ["linha_id"]
isOneToOne: true
      referencedRelation: "tabela_linhas"
      referencedColumns: ["id"]
    }
                  ]
                },"tabela_linhas": {
                  Row: {
                    "convenio_id": string,"faixa_idade": unknown,"faixa_valor": unknown,"fator": number,"id": string,"prazo": number,"tabela_id": string,"tipo": Database["public"]['Enums']["tipo_contrato"],"valor_mensalidade": number | null,"vigencia": unknown,"vinculo_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "convenio_id": string,"faixa_idade"?: unknown,"faixa_valor"?: unknown,"fator": number,"id"?: string,"prazo": number,"tabela_id": string,"tipo": Database["public"]['Enums']["tipo_contrato"],"valor_mensalidade"?: number | null,"vigencia": unknown,"vinculo_id": string
                  }
                  Update: {
                    "convenio_id"?: string,"faixa_idade"?: unknown,"faixa_valor"?: unknown,"fator"?: number,"id"?: string,"prazo"?: number,"tabela_id"?: string,"tipo"?: Database["public"]['Enums']["tipo_contrato"],"valor_mensalidade"?: number | null,"vigencia"?: unknown,"vinculo_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tabela_linhas_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tabela_linhas_tabela_id_fkey"
      columns: ["tabela_id"]
isOneToOne: false
      referencedRelation: "tabelas_calculo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tabela_linhas_vinculo_id_fkey"
      columns: ["vinculo_id"]
isOneToOne: false
      referencedRelation: "convenio_vinculos"
      referencedColumns: ["id"]
    }
                  ]
                },"tabelas_calculo": {
                  Row: {
                    "convenio_id": string,"criado_em": string,"id": string,"nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "convenio_id": string,"criado_em"?: string,"id"?: string,"nome": string
                  }
                  Update: {
                    "convenio_id"?: string,"criado_em"?: string,"id"?: string,"nome"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tabelas_calculo_convenio_id_fkey"
      columns: ["convenio_id"]
isOneToOne: false
      referencedRelation: "convenios"
      referencedColumns: ["id"]
    }
                  ]
                },"usuarios": {
                  Row: {
                    "ativo": boolean,"criado_em": string,"email": string,"id": string,"nome": string,"parceiro_id": string | null,"perfil": Database["public"]['Enums']["perfil_acesso"]
                  }
                  ComputedFields: never
                  Insert: {
                    "ativo"?: boolean,"criado_em"?: string,"email": string,"id": string,"nome": string,"parceiro_id"?: string | null,"perfil": Database["public"]['Enums']["perfil_acesso"]
                  }
                  Update: {
                    "ativo"?: boolean,"criado_em"?: string,"email"?: string,"id"?: string,"nome"?: string,"parceiro_id"?: string | null,"perfil"?: Database["public"]['Enums']["perfil_acesso"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "usuarios_parceiro_fk"
      columns: ["parceiro_id"]
isOneToOne: false
      referencedRelation: "parceiros"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_candidatos_prejuizo": {
                  Row: {
                    "cliente": string,"contrato_id": string,"convenio": string,"dias_atraso": number | null,"numero": number
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_parcelas_saldo": {
                  Row: {
                    "pago": number | null,"parcela_id": string,"saldo": number | null,"valor": number
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "_aplicar_satelites":
{ Args: { "p_contrato_id": string,"p_dados": Json }; Returns: undefined
                           },
"_apos_nova_averbacao":
{ Args: { "p_antiga": string,"p_contrato_id": string,"p_nova": string }; Returns: undefined
                           },
"_assinatura_atualizar":
{ Args: { "p_evidencias": Json,"p_pdf_assinado_caminho": string,"p_situacao": string,"p_zapsign_token": string }; Returns: string
                           },
"_assinatura_falhou":
{ Args: { "p_erro": string,"p_id": string }; Returns: undefined
                           },
"_assinatura_registrar_envio":
{ Args: { "p_assinantes": Json,"p_id": string,"p_pdf_caminho": string,"p_zapsign_token": string }; Returns: undefined
                           },
"_calcular_contrato":
{ Args: { "p_dados": Json,"p_gravar": boolean }; Returns: Json
                           },
"_campos_permitidos":
{ Args: { "p_tipo": string }; Returns: (string)[]
                           },
"_cliente_por_cpf_matricula":
{ Args: { "p_cpf": string,"p_matricula": string }; Returns: string
                           },
"_contrato_para_averbacao":
{ Args: { "p_id": string }; Returns: {
              "agente_id": string | null,
"cliente_id": string,
"convenio_id": string,
"criado_em": string,
"criado_por": string | null,
"data_liberacao": string | null,
"fase": Database["public"]['Enums']["fase_contrato"],
"fase_desde": string,
"fase_retorno": Database["public"]['Enums']["fase_contrato"] | null,
"fator": number,
"id": string,
"importacao_id": string | null,
"legado": boolean,
"legado_importado_em": string | null,
"legado_importado_por": string | null,
"linha_tabela_id": string | null,
"matricula_id": string,
"mensalidade_proposta": number | null,
"numero": number,
"numero_legado": string | null,
"origem_id": string | null,
"parceiro_id": string | null,
"prazo": number,
"primeiro_vencimento": string | null,
"quitados_legado": string | null,
"situacao": Database["public"]['Enums']["situacao_contrato"],
"tipo": Database["public"]['Enums']["tipo_contrato"],
"total_descontos": number,
"total_dividas_externas": number,
"total_quitado": number,
"valor_bruto": number,
"valor_liquido": number | null,
"valor_mensalidade_tabela": number | null,
"valor_parcela": number,
"valores_travados_em": string | null,
"versao": number,
"vinculo_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "contratos"
        isOneToOne: true
        isSetofReturn: false
      } },
"_criar_contrato":
{ Args: { "p_dados": Json,"p_fase": Database["public"]['Enums']["fase_contrato"],"p_gravar": boolean,"p_parceiro_id": string }; Returns: string
                           },
"_dados_do_contrato":
{ Args: { "k": Omit<Database["public"]['Tables']["contratos"]['Row'], Database["public"]['Tables']["contratos"]['ComputedFields']> }; Returns: Json
                           },
"_dinheiro":
{ Args: { "p": string }; Returns: number
                           },
"_exigir_cliente_para_contrato":
{ Args: { "p_cliente_id": string }; Returns: undefined
                           },
"_exigir_parceiro":
{ Args: { "p_permissao": string }; Returns: string
                           },
"_fmt_celular":
{ Args: { "p": string }; Returns: string
                           },
"_fmt_cpf":
{ Args: { "p": string }; Returns: string
                           },
"_fmt_data":
{ Args: { "p": string }; Returns: string
                           },
"_fmt_data_extenso":
{ Args: { "p": string }; Returns: string
                           },
"_fmt_dinheiro":
{ Args: { "p": number }; Returns: string
                           },
"_gravar_comissao":
{ Args: { "p_calc": Json,"p_contrato_id": string }; Returns: undefined
                           },
"_gravar_versao":
{ Args: { "p_contrato_id": string,"p_motivo": string }; Returns: undefined
                           },
"_imp_aba":
{ Args: { "p_chave": string }; Returns: string
                           },
"_imp_chave":
{ Args: { "p": string }; Returns: string
                           },
"_imp_clientes":
{ Args: { "ctx": Json,"g": Json }; Returns: Json
                           },
"_imp_competencia":
{ Args: { "p": string,"p_campo": string }; Returns: string
                           },
"_imp_contratos":
{ Args: { "ctx": Json,"g": Json }; Returns: Json
                           },
"_imp_convenio":
{ Args: { "p_nome": string }; Returns: string
                           },
"_imp_cpf":
{ Args: { "p": string }; Returns: string
                           },
"_imp_data":
{ Args: { "p": string,"p_campo": string }; Returns: string
                           },
"_imp_falhou":
{ Args: { "g": Json,"p_saida": Json }; Returns: Json
                           },
"_imp_inteiro":
{ Args: { "p": string,"p_campo": string }; Returns: number
                           },
"_imp_item":
{ Args: { "p_aba": string,"p_linha": number,"p_mensagem": string,"p_tipo": string }; Returns: Json
                           },
"_imp_mensalidades":
{ Args: { "ctx": Json,"g": Json }; Returns: Json
                           },
"_imp_minha_em_andamento":
{ Args: { "p_id": string }; Returns: undefined
                           },
"_imp_obrigatorio":
{ Args: { "p": string,"p_mensagem": string }; Returns: string
                           },
"_imp_ordem_aba":
{ Args: { "p_aba": string }; Returns: number
                           },
"_imp_parcelas":
{ Args: { "ctx": Json,"g": Json }; Returns: Json
                           },
"_imp_processar":
{ Args: { "p_dados": Json,"p_importacao_id": string }; Returns: Json
                           },
"_imp_resultado":
{ Args: { "p_saida": Json }; Returns: Json
                           },
"_imp_situacao":
{ Args: { "p": string }; Returns: Database["public"]['Enums']["situacao_contrato"]
                           },
"_linhas_candidatas":
{ Args: { "p_convenio_id": string,"p_data": string,"p_data_nascimento": string,"p_prazo": number,"p_tipo": Database["public"]['Enums']["tipo_contrato"],"p_vinculo_id": string }; Returns: {
              "convenio_id": string,
"faixa_idade": unknown,
"faixa_valor": unknown,
"fator": number,
"id": string,
"prazo": number,
"tabela_id": string,
"tipo": Database["public"]['Enums']["tipo_contrato"],
"valor_mensalidade": number | null,
"vigencia": unknown,
"vinculo_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "tabela_linhas"
        isOneToOne: false
        isSetofReturn: true
      } },
"_mensalidade_na_liberacao":
{ Args: { "k": Omit<Database["public"]['Tables']["contratos"]['Row'], Database["public"]['Tables']["contratos"]['ComputedFields']>,"p_competencia": string }; Returns: undefined
                           },
"_modelo_validar":
{ Args: { "p_texto": string }; Returns: undefined
                           },
"_pedir_cancelamento_averbacoes":
{ Args: { "p_contrato_id": string,"p_motivo": string }; Returns: undefined
                           },
"_registrar_acesso":
{ Args: { "p_acao": string,"p_detalhe": Json }; Returns: undefined
                           },
"_registrar_mudanca":
{ Args: { "p_contrato": Omit<Database["public"]['Tables']["contratos"]['Row'], Database["public"]['Tables']["contratos"]['ComputedFields']>,"p_motivo": string,"p_para": Database["public"]['Enums']["fase_contrato"],"p_situacao": Database["public"]['Enums']["situacao_contrato"] }; Returns: undefined
                           },
"_resultado_simulacao":
{ Args: { "p_entrada": string,"p_gravar": boolean,"p_linha": Omit<Database["public"]['Tables']["tabela_linhas"]['Row'], Database["public"]['Tables']["tabela_linhas"]['ComputedFields']>,"p_parcela": number,"p_valor": number }; Returns: {
              "base_comissao": Database["public"]['Enums']["base_comissao"],"fator": number,"linha_id": string,"parcela": number,"percentual_comissao": number,"simulacao_id": string,"valor": number,"valor_mensalidade": number
            }[]
                           },
"_validar_ade":
{ Args: { "p_ade": string,"p_confirmacao": string,"p_convenio_id": string }; Returns: string
                           },
"_valor_mensalidade_em":
{ Args: { "p_competencia": string,"p_mensalidade_id": string }; Returns: number
                           },
"app_equipe_pode":
{ Args: { "p_permissao": string }; Returns: boolean
                           },
"app_exigir":
{ Args: { "p_permissao": string }; Returns: undefined
                           },
"app_parceiro_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"app_perfil":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["perfil_acesso"]
                           },
"app_pode":
{ Args: { "p_permissao": string }; Returns: boolean
                           },
"aprovar_alteracao":
{ Args: { "p_id": string }; Returns: undefined
                           },
"aprovar_pre_digitacao":
{ Args: { "p_id": string }; Returns: Json
                           },
"assinatura_preparar":
{ Args: { "p_contrato_id": string }; Returns: Json
                           },
"assinaturas_vencer":
{ Args: { "p_hoje": string }; Returns: number
                           },
"cadastrar_cliente":
{ Args: { "p_dados": Json }; Returns: string
                           },
"cancelar_mensalidade":
{ Args: { "p_documento_id": string,"p_mensalidade_id": string,"p_motivo": string }; Returns: undefined
                           },
"cancelar_pre_digitacao":
{ Args: { "p_id": string,"p_motivo": string }; Returns: undefined
                           },
"catalogo_campos_cliente":
{ Args: Record<PropertyKey, never>; Returns: {
              "chave": string,"rotulo": string
            }[]
                           },
"cliente_do_caminho":
{ Args: { "p_nome": string }; Returns: string
                           },
"config_bool":
{ Args: { "p_chave": string }; Returns: boolean
                           },
"confirmar_aprovacao":
{ Args: { "p_id": string }; Returns: undefined
                           },
"contrato_dados_documento":
{ Args: { "p_contrato_id": string,"p_data"?: string }; Returns: Json
                           },
"contrato_visivel":
{ Args: { "p_contrato_id": string }; Returns: boolean
                           },
"cpf_valido":
{ Args: { "p": string }; Returns: boolean
                           },
"criar_linha_tabela":
{ Args: { "p_fator": number,"p_fim": string,"p_idade_max": number,"p_idade_min": number,"p_inicio": string,"p_percentual": number,"p_prazo": number,"p_tabela_id": string,"p_tipo": Database["public"]['Enums']["tipo_contrato"],"p_valor_max": number,"p_valor_mensalidade": number,"p_valor_min": number,"p_vinculo_id": string }; Returns: string
                           },
"definir_conta_principal":
{ Args: { "p_conta_id": string }; Returns: undefined
                           },
"definir_conta_principal_cliente":
{ Args: { "p_conta_id": string }; Returns: undefined
                           },
"desativar_usuario":
{ Args: { "p_id": string }; Returns: undefined
                           },
"desfazer_importacao":
{ Args: { "p_id": string }; Returns: undefined
                           },
"devolver_pre_digitacao":
{ Args: { "p_id": string,"p_motivo": string }; Returns: undefined
                           },
"digitar_contrato":
{ Args: { "p_dados": Json }; Returns: string
                           },
"editar_contrato":
{ Args: { "p_dados": Json,"p_id": string,"p_motivo": string }; Returns: undefined
                           },
"encerrar_contrato":
{ Args: { "p_id": string,"p_motivo": string,"p_tipo": string }; Returns: undefined
                           },
"faixa_anos":
{ Args: { "p_max": number,"p_min": number }; Returns: unknown
                           },
"faixa_centavos":
{ Args: { "p_max": number,"p_min": number }; Returns: unknown
                           },
"gerar_mensalidades_competencia":
{ Args: { "p_competencia": string }; Returns: number
                           },
"importacao_concluir":
{ Args: { "p_erros": Json,"p_importacao_id": string,"p_resumo": Json }; Returns: undefined
                           },
"importacao_conferir":
{ Args: { "p_dados": Json,"p_hash"?: string }; Returns: Json
                           },
"importacao_gravar_lote":
{ Args: { "p_dados": Json,"p_importacao_id": string }; Returns: Json
                           },
"importacao_iniciar":
{ Args: { "p_arquivo_caminho": string,"p_arquivo_nome": string,"p_hash": string,"p_posicao": string }; Returns: string
                           },
"liberar_credito":
{ Args: { "p_data"?: string,"p_id": string }; Returns: undefined
                           },
"linha_foi_usada":
{ Args: { "p_linha_id": string }; Returns: boolean
                           },
"linhas_usadas":
{ Args: { "p_linha_ids": (string)[] }; Returns: string[]
                           },
"mensalidade_vigente":
{ Args: { "p_matricula_id": string }; Returns: number
                           },
"migrar_matricula":
{ Args: { "p_confirmacao": string,"p_contrato_id": string,"p_nova_matricula_id": string,"p_novo_ade": string,"p_valor_averbado": number }; Returns: undefined
                           },
"modelo_campos":
{ Args: Record<PropertyKey, never>; Returns: {
              "chave": string,"exemplo": string,"rotulo": string
            }[]
                           },
"mover_contrato":
{ Args: { "p_id": string,"p_motivo"?: string,"p_para": Database["public"]['Enums']["fase_contrato"] }; Returns: undefined
                           },
"normalizar_cpf":
{ Args: { "p": string }; Returns: string
                           },
"o_que_falta":
{ Args: { "p_cliente_id": string,"p_convenio_id": string }; Returns: {
              "chave": string,"rotulo": string
            }[]
                           },
"parceiro_adotar_cliente":
{ Args: { "p_cpf": string,"p_matricula": string }; Returns: string
                           },
"parceiro_buscar_cliente":
{ Args: { "p_cpf": string,"p_matricula": string }; Returns: {
              "analfabeto": boolean,"bairro": string,"celular": string,"cep": string,"cidade": string,"cliente_id": string,"complemento": string,"conjuge_nome": string,"data_nascimento": string,"email": string,"escolaridade": string,"estado_civil": string,"logradouro": string,"matriculas": Json,"nome": string,"nome_mae": string,"nome_pai": string,"numero": string,"pep": boolean,"pis": string,"rg": string,"rg_orgao": string,"uf": string,"whatsapp": string
            }[]
                           },
"parceiro_cadastrar_cliente":
{ Args: { "p_dados": Json }; Returns: string
                           },
"parceiro_propor_alteracao":
{ Args: { "p_cliente_id": string,"p_proposta": Json,"p_tipo": string }; Returns: string
                           },
"parceiro_ve_cliente":
{ Args: { "p_cliente_id": string }; Returns: boolean
                           },
"pre_digitar_contrato":
{ Args: { "p_dados": Json }; Returns: string
                           },
"primeira_competencia":
{ Args: { "p_convenio_id": string,"p_data": string }; Returns: string
                           },
"reaverbar":
{ Args: { "p_confirmacao"?: string,"p_contrato_id": string,"p_novo_ade": string }; Returns: undefined
                           },
"recalcular_atrasos":
{ Args: { "p_hoje"?: string }; Returns: undefined
                           },
"recusar_alteracao":
{ Args: { "p_id": string,"p_motivo": string }; Returns: undefined
                           },
"registrar_acesso":
{ Args: { "p_acao": string,"p_detalhe"?: Json }; Returns: undefined
                           },
"registrar_ade":
{ Args: { "p_ade": string,"p_confirmacao"?: string,"p_contrato_id": string }; Returns: undefined
                           },
"registrar_ade_mensalidade":
{ Args: { "p_ade": string,"p_confirmacao"?: string,"p_contrato_id": string }; Returns: undefined
                           },
"resolver_pendencia":
{ Args: { "p_id": string }; Returns: undefined
                           },
"salvar_modelo_contrato":
{ Args: { "p_convenio_id": string,"p_teste": boolean,"p_texto": string }; Returns: number
                           },
"simular_por_parcela":
{ Args: { "p_convenio_id": string,"p_data"?: string,"p_data_nascimento"?: string,"p_gravar"?: boolean,"p_parcela": number,"p_prazo": number,"p_tipo": Database["public"]['Enums']["tipo_contrato"],"p_vinculo_id": string }; Returns: {
              "base_comissao": Database["public"]['Enums']["base_comissao"],"fator": number,"linha_id": string,"parcela": number,"percentual_comissao": number,"simulacao_id": string,"valor": number,"valor_mensalidade": number
            }[]
                           },
"simular_por_valor":
{ Args: { "p_convenio_id": string,"p_data"?: string,"p_data_nascimento"?: string,"p_gravar"?: boolean,"p_prazo": number,"p_tipo": Database["public"]['Enums']["tipo_contrato"],"p_valor": number,"p_vinculo_id": string }; Returns: {
              "base_comissao": Database["public"]['Enums']["base_comissao"],"fator": number,"linha_id": string,"parcela": number,"percentual_comissao": number,"simulacao_id": string,"valor": number,"valor_mensalidade": number
            }[]
                           },
"so_digitos":
{ Args: { "p": string }; Returns: string
                           }
          }
          Enums: {
            "base_comissao": "liquido"|"bruto","fase_contrato": "pre_digitacao"|"digitado"|"em_validacao"|"pendente"|"em_averbacao"|"averbado"|"aguardando_assinatura"|"aguardando_pagamento"|"credito_liberado"|"recusado"|"cancelado","perfil_acesso": "administrador"|"gerente"|"financeiro"|"operador"|"consulta"|"parceiro","situacao_averbacao": "proposta"|"ativa"|"substituida"|"migrada"|"cancelamento_pendente"|"cancelada","situacao_contrato": "em_andamento"|"ativo"|"em_atraso"|"quitado"|"renovado"|"cancelado"|"prejuizo","tipo_contrato": "novo"|"refinanciamento"|"compra"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "base_comissao": ["liquido", "bruto"],"fase_contrato": ["pre_digitacao", "digitado", "em_validacao", "pendente", "em_averbacao", "averbado", "aguardando_assinatura", "aguardando_pagamento", "credito_liberado", "recusado", "cancelado"],"perfil_acesso": ["administrador", "gerente", "financeiro", "operador", "consulta", "parceiro"],"situacao_averbacao": ["proposta", "ativa", "substituida", "migrada", "cancelamento_pendente", "cancelada"],"situacao_contrato": ["em_andamento", "ativo", "em_atraso", "quitado", "renovado", "cancelado", "prejuizo"],"tipo_contrato": ["novo", "refinanciamento", "compra"]
          }
        }
} as const
