
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
                    "ativa": boolean,"cliente_id": string,"convenio_id": string,"id": string,"matricula": string,"matricula_normalizada": string | null,"orgao": string | null,"vinculo_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativa"?: boolean,"cliente_id": string,"convenio_id": string,"id"?: string,"matricula": string,"matricula_normalizada"?: never,"orgao"?: string | null,"vinculo_id": string
                  }
                  Update: {
                    "ativa"?: boolean,"cliente_id"?: string,"convenio_id"?: string,"id"?: string,"matricula"?: string,"matricula_normalizada"?: never,"orgao"?: string | null,"vinculo_id"?: string
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
                    "analfabeto": boolean | null,"atualizado_em": string,"bairro": string | null,"celular": string,"cep": string | null,"cidade": string | null,"complemento": string | null,"conjuge_cpf": string | null,"conjuge_nome": string | null,"cpf": string,"criado_em": string,"criado_por": string | null,"data_nascimento": string | null,"email": string | null,"escolaridade": string | null,"estado_civil": string | null,"id": string,"logradouro": string | null,"nome": string,"nome_mae": string | null,"nome_pai": string | null,"numero": string | null,"pep": boolean | null,"pis": string | null,"rg": string | null,"rg_orgao": string | null,"uf": string | null,"whatsapp": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analfabeto"?: boolean | null,"atualizado_em"?: string,"bairro"?: string | null,"celular": string,"cep"?: string | null,"cidade"?: string | null,"complemento"?: string | null,"conjuge_cpf"?: string | null,"conjuge_nome"?: string | null,"cpf": string,"criado_em"?: string,"criado_por"?: string | null,"data_nascimento"?: string | null,"email"?: string | null,"escolaridade"?: string | null,"estado_civil"?: string | null,"id"?: string,"logradouro"?: string | null,"nome": string,"nome_mae"?: string | null,"nome_pai"?: string | null,"numero"?: string | null,"pep"?: boolean | null,"pis"?: string | null,"rg"?: string | null,"rg_orgao"?: string | null,"uf"?: string | null,"whatsapp": string
                  }
                  Update: {
                    "analfabeto"?: boolean | null,"atualizado_em"?: string,"bairro"?: string | null,"celular"?: string,"cep"?: string | null,"cidade"?: string | null,"complemento"?: string | null,"conjuge_cpf"?: string | null,"conjuge_nome"?: string | null,"cpf"?: string,"criado_em"?: string,"criado_por"?: string | null,"data_nascimento"?: string | null,"email"?: string | null,"escolaridade"?: string | null,"estado_civil"?: string | null,"id"?: string,"logradouro"?: string | null,"nome"?: string,"nome_mae"?: string | null,"nome_pai"?: string | null,"numero"?: string | null,"pep"?: boolean | null,"pis"?: string | null,"rg"?: string | null,"rg_orgao"?: string | null,"uf"?: string | null,"whatsapp"?: string
                  }
                  Relationships: [
                    
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
                    "ade_descricao": string | null,"ade_modo": string,"ade_regex": string | null,"ativo": boolean,"averbadora": string | null,"campos_obrigatorios": (string)[],"criado_em": string,"dia_corte": number | null,"dia_vencimento": number | null,"dias_prejuizo": number,"ente": string | null,"id": string,"layout_remessa": Json | null,"layout_retorno": Json | null,"margem_percentual": number | null,"modelo_contrato": string | null,"nome": string,"prazo_max": number | null,"prazo_min": number | null,"uf": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ade_descricao"?: string | null,"ade_modo"?: string,"ade_regex"?: string | null,"ativo"?: boolean,"averbadora"?: string | null,"campos_obrigatorios"?: (string)[],"criado_em"?: string,"dia_corte"?: number | null,"dia_vencimento"?: number | null,"dias_prejuizo"?: number,"ente"?: string | null,"id"?: string,"layout_remessa"?: Json | null,"layout_retorno"?: Json | null,"margem_percentual"?: number | null,"modelo_contrato"?: string | null,"nome": string,"prazo_max"?: number | null,"prazo_min"?: number | null,"uf"?: string | null
                  }
                  Update: {
                    "ade_descricao"?: string | null,"ade_modo"?: string,"ade_regex"?: string | null,"ativo"?: boolean,"averbadora"?: string | null,"campos_obrigatorios"?: (string)[],"criado_em"?: string,"dia_corte"?: number | null,"dia_vencimento"?: number | null,"dias_prejuizo"?: number,"ente"?: string | null,"id"?: string,"layout_remessa"?: Json | null,"layout_retorno"?: Json | null,"margem_percentual"?: number | null,"modelo_contrato"?: string | null,"nome"?: string,"prazo_max"?: number | null,"prazo_min"?: number | null,"uf"?: string | null
                  }
                  Relationships: [
                    
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
            [_ in never]: never
          }
          Functions: {
            "_campos_permitidos":
{ Args: { "p_tipo": string }; Returns: (string)[]
                           },
"_cliente_por_cpf_matricula":
{ Args: { "p_cpf": string,"p_matricula": string }; Returns: string
                           },
"_exigir_parceiro":
{ Args: { "p_permissao": string }; Returns: string
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
"_resultado_simulacao":
{ Args: { "p_entrada": string,"p_gravar": boolean,"p_linha": Omit<Database["public"]['Tables']["tabela_linhas"]['Row'], Database["public"]['Tables']["tabela_linhas"]['ComputedFields']>,"p_parcela": number,"p_valor": number }; Returns: {
              "base_comissao": Database["public"]['Enums']["base_comissao"],"fator": number,"linha_id": string,"parcela": number,"percentual_comissao": number,"simulacao_id": string,"valor": number,"valor_mensalidade": number
            }[]
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
"cadastrar_cliente":
{ Args: { "p_dados": Json }; Returns: string
                           },
"catalogo_campos_cliente":
{ Args: Record<PropertyKey, never>; Returns: {
              "chave": string,"rotulo": string
            }[]
                           },
"cliente_do_caminho":
{ Args: { "p_nome": string }; Returns: string
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
"faixa_anos":
{ Args: { "p_max": number,"p_min": number }; Returns: unknown
                           },
"faixa_centavos":
{ Args: { "p_max": number,"p_min": number }; Returns: unknown
                           },
"linha_foi_usada":
{ Args: { "p_linha_id": string }; Returns: boolean
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
"recusar_alteracao":
{ Args: { "p_id": string,"p_motivo": string }; Returns: undefined
                           },
"registrar_acesso":
{ Args: { "p_acao": string,"p_detalhe"?: Json }; Returns: undefined
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
            "base_comissao": "liquido"|"bruto","perfil_acesso": "administrador"|"gerente"|"financeiro"|"operador"|"consulta"|"parceiro","tipo_contrato": "novo"|"refinanciamento"|"compra"
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
            "base_comissao": ["liquido", "bruto"],"perfil_acesso": ["administrador", "gerente", "financeiro", "operador", "consulta", "parceiro"],"tipo_contrato": ["novo", "refinanciamento", "compra"]
          }
        }
} as const
