import { Plugin } from 'graphile-build' // eslint-disable-line no-unused-vars

export interface Options {
  pgExtendedTypes: boolean
  pgInflection: any
}

const PgMutationUpsertPlugin: Plugin = builder => {
  builder.hook('GraphQLObjectType:fields', (fields, build, context) => {
    const {
      extend,
      gql2pg,
      graphql: {
        GraphQLObjectType,
        GraphQLInputObjectType,
        GraphQLNonNull,
        GraphQLString
      },
      inflection,
      pgOmit: omit,
      newWithHooks,
      parseResolveInfo,
      pgGetGqlInputTypeByTypeIdAndModifier,
      pgGetGqlTypeByTypeIdAndModifier,
      pgIntrospectionResultsByKind,
      pgQueryFromResolveData: queryFromResolveData,
      pgSql: sql,
      pgViaTemporaryTable: viaTemporaryTable,
      pgField
    } = build
    const {
      scope: { isRootMutation },
      fieldWithHooks
    } = context
    if (!isRootMutation) return fields
    return extend(
      fields,
      pgIntrospectionResultsByKind.class
        .filter((table: any) => !!table.namespace)
        .filter((table: any) => !omit(table, 'upsert'))
        .filter((table: any) => table.isSelectable)
        .filter((table: any) => table.isInsertable)
        .filter((table: any) => table.isUpdatable)
        .reduce((memo: any, table: any) => {
          const Table = pgGetGqlTypeByTypeIdAndModifier(table.type.id, null)
          if (!Table) return memo
          const TableInput = pgGetGqlInputTypeByTypeIdAndModifier(
            table.type.id,
            null
          )
          if (!TableInput) return memo
          const tableTypeName = inflection.tableType(table)
          // Standard input type that 'create' uses
          const InputType = newWithHooks(
            GraphQLInputObjectType,
            {
              name: `Upsert${tableTypeName}Input`,
              description: `All input for the upsert \`${tableTypeName}\` mutation.`,
              fields: {
                clientMutationId: {
                  description:
                    'An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client.',
                  type: GraphQLString
                },
                ...(TableInput
                  ? {
                      [inflection.tableFieldName(table)]: {
                        description: `The \`${tableTypeName}\` to be upserted by this mutation.`,
                        type: new GraphQLNonNull(TableInput)
                      }
                    }
                  : null)
              }
            },
            {
              isPgCreateInputType: false,
              pgInflection: table
            }
          )

          // Standard payload type that 'create' uses
          const PayloadType = newWithHooks(
            GraphQLObjectType,
            {
              name: `Upsert${tableTypeName}Payload`,
              description: `The output of our upsert \`${tableTypeName}\` mutation.`,
              fields: ({ fieldWithHooks }) => {
                const tableName = inflection.tableFieldName(table)
                return {
                  clientMutationId: {
                    description:
                      'The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations.',
                    type: GraphQLString
                  },
                  [tableName]: pgField(build, fieldWithHooks, tableName, {
                    description: `The \`${tableTypeName}\` that was upserted by this mutation.`,
                    type: Table
                  })
                }
              }
            },
            {
              isMutationPayload: true,
              isPgCreatePayloadType: false,
              pgIntrospection: table
            }
          )

          // Create upsert fields from each introspected table
          const fieldName = `upsert${tableTypeName}`

          memo[fieldName] = fieldWithHooks(
            fieldName,
            context => {
              const { getDataFromParsedResolveInfoFragment } = context
              return {
                description: `Upserts a single \`${tableTypeName}\`.`,
                type: PayloadType,
                args: {
                  input: {
                    type: new GraphQLNonNull(InputType)
                  }
                },
                async resolve (data, { input }, { pgClient }, resolveInfo) {
                  const parsedResolveInfoFragment = parseResolveInfo(
                    resolveInfo
                  )
                  const resolveData = getDataFromParsedResolveInfoFragment(
                    parsedResolveInfoFragment,
                    PayloadType
                  )
                  const insertedRowAlias = sql.identifier(Symbol()) // eslint-disable-line
                  const query = queryFromResolveData(
                    insertedRowAlias,
                    insertedRowAlias,
                    resolveData,
                    {}
                  )

                  const sqlColumns: any[] = []
                  const sqlValues: any[] = []
                  const inputData: any[] =
                    input[inflection.tableFieldName(table)]

                  // Store attributes (columns) for easy access
                  const attributes = pgIntrospectionResultsByKind.attribute.filter(
                    attr => attr.classId === table.id
                  )

                  // Figure out the pkey constraint
                  const primaryKeyConstraint = pgIntrospectionResultsByKind.constraint
                    .filter(con => con.classId === table.id)
                    .filter(con => con.type === 'p')[0]

                  // Figure out to which column that pkey constraint belongs to
                  const primaryKeys =
                    primaryKeyConstraint &&
                    primaryKeyConstraint.keyAttributeNums.map(
                      num => attributes.filter(attr => attr.num === num)[0]
                    )

                  // Loop thru columns and "SQLify" them
                  attributes.forEach(attr => {
                    const fieldName = inflection.column(attr)
                    const val = inputData[fieldName]
                    if (
                      Object.prototype.hasOwnProperty.call(inputData, fieldName)
                    ) {
                      sqlColumns.push(sql.identifier(attr.name))
                      sqlValues.push(gql2pg(val, attr.type, attr.typeModifier))
                    }
                  })

                  // Construct a array in case we need to do an update on conflict
                  const conflictUpdateArray = sqlColumns.map(
                    col =>
                      sql.query`${sql.identifier(
                        col.names[0]
                      )} = excluded.${sql.identifier(col.names[0])}`
                  )
                  const sqlPrimaryKeys: any[] = []
                  primaryKeys.forEach(p => {
                    sqlPrimaryKeys.push(sql.identifier(p.name))
                  })
                  // SQL query for upsert mutations
                  const mutationQuery = sql.query`
                        insert into ${sql.identifier(
                          table.namespace.name,
                          table.name
                        )} ${
                    sqlColumns.length
                      ? sql.fragment`(
                            ${sql.join(sqlColumns, ', ')}
                          ) values(${sql.join(sqlValues, ', ')})
                          on conflict (${sql.join(
                            sqlPrimaryKeys,
                            ', '
                          )}) do update
                          set ${sql.join(conflictUpdateArray, ', ')}`
                      : sql.fragment`default values`
                  } returning *`

                  const rows = await viaTemporaryTable(
                    pgClient,
                    sql.identifier(table.namespace.name, table.name),
                    mutationQuery,
                    insertedRowAlias,
                    query
                  )
                  return {
                    clientMutationId: input.clientMutationId,
                    data: rows[0]
                  }
                }
              }
            },
            {
              pgFieldIntrospection: table,
              isPgCreateMutationField: false
            }
          )
          return memo
        }, {})
    )
  })
}

export { PgMutationUpsertPlugin }
