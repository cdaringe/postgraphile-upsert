import { Build, Context, Plugin } from "graphile-build";
import type { Attribute, Constraint, PgTable } from "./types";
import {
  GraphQLFieldConfigMap,
  GraphQLObjectType,
  GraphQLScalarType,
} from "graphql";
import assert from "assert";

type Primitive = string | number | null;

export const PgMutationUpsertPlugin: Plugin = (builder) => {
  builder.hook("GraphQLObjectType:fields", (fields, build, context) => {
    const {
      extend,
      pgGetGqlInputTypeByTypeIdAndModifier,
      pgGetGqlTypeByTypeIdAndModifier,
      pgIntrospectionResultsByKind,
      pgOmit: omit,
    } = build;
    const {
      scope: { isRootMutation },
    } = context;
    if (!isRootMutation) return fields;
    const allUniqueConstraints = (
      pgIntrospectionResultsByKind.constraint as Constraint[]
    ).filter((con) => con.type === "u" || con.type === "p");
    const upsertFieldsByName = (pgIntrospectionResultsByKind.class as PgTable[])
      .filter(
        (table) =>
          !!table.namespace &&
          !!table.primaryKeyConstraint &&
          !omit(table, "upsert") &&
          table.isSelectable &&
          table.isInsertable &&
          table.isUpdatable
      )
      .reduce<GraphQLFieldConfigMap<unknown, unknown>>((fnsByName, table) => {
        const gqlTable = pgGetGqlTypeByTypeIdAndModifier(table.type.id, null);
        if (!gqlTable) return fnsByName;
        const gqlTableInput = pgGetGqlInputTypeByTypeIdAndModifier(
          table.type.id,
          null
        );
        if (!gqlTableInput) return fnsByName;
        const { fn, upsertFnName } = createUpsertField({
          allUniqueConstraints,
          table,
          build,
          context,
          gqlTable,
          gqlTableInput,
        });
        fnsByName[upsertFnName] = fn;
        return fnsByName;
      }, {});
    return extend(fields, upsertFieldsByName);
  });
};

const hasOwnProperty = (x: unknown, key: string) =>
  Object.prototype.hasOwnProperty.call(x, key);

function createUpsertField({
  allUniqueConstraints,
  build,
  context,
  gqlTable,
  gqlTableInput,
  table,
}: {
  allUniqueConstraints: Constraint[];
  build: Build;
  context: Context<GraphQLFieldConfigMap<unknown, unknown>>;
  gqlTable: GraphQLObjectType;
  gqlTableInput: GraphQLObjectType;
  table: PgTable;
}) {
  const {
    gql2pg,
    graphql: {
      GraphQLObjectType,
      GraphQLInputObjectType,
      GraphQLNonNull,
      GraphQLString,
    },
    inflection,
    newWithHooks,
    parseResolveInfo,
    pgGetGqlInputTypeByTypeIdAndModifier,
    pgIntrospectionResultsByKind,
    pgQueryFromResolveData: queryFromResolveData,
    pgSql: sql,
    pgViaTemporaryTable: viaTemporaryTable,
    pgField,
    pgOmit: omit,
  } = build;
  const { fieldWithHooks } = context;
  const tableTypeName = inflection.tableType(table);
  const uniqueConstraints = allUniqueConstraints.filter(
    (con) => con.classId === table.id
  );
  const attributes = pgIntrospectionResultsByKind.attribute
    .filter((attr) => attr.classId === table.id)
    .sort((a, b) => a.num - b.num);

  /**
   * The upsert's WhereType needs to be a combination of TableCondition
   * but with the constraints of a uniqueConstraint
   * so find the query generator for an allTable query
   * but filter by the uniqueConstraints above
   *
   * See also:
   * PgRowByUniqueConstraint
   * PgConnectionArgCondition
   * PgAllRows
   */

  // For each unique constraint we gather all of the fields into an
  // InputType. Technically, we probably want to have **each**
  // uniqueConstraint create it's own type and then union these, but
  // YOLO
  const gqlInputTypesByFieldName = uniqueConstraints.reduce<
    Record<string, { type: GraphQLScalarType }>
  >((acc, constraint) => {
    const keys = constraint.keyAttributeNums.map((num) =>
      attributes.find((attr) => attr.num === num)
    );
    if (keys.some((key) => omit(key, "read"))) {
      return acc;
    } else if (!keys.every((_) => _)) {
      throw new Error("Consistency error: could not find an attribute!");
    }
    keys.forEach((key) => {
      const fieldName = inflection.camelCase(key.name);
      const InputType = pgGetGqlInputTypeByTypeIdAndModifier(
        key.typeId,
        key.typeModifier
      );
      if (!InputType) {
        throw new Error(
          `Could not find input type for key '${key.name}' on type '${tableTypeName}'`
        );
      }
      acc[fieldName] = { type: InputType };
    });
    return acc;
  }, {});

  // Unique Where conditions
  const WhereType = newWithHooks(
    GraphQLInputObjectType,
    {
      name: `Upsert${tableTypeName}Where`,
      description: `Where conditions for the upsert \`${tableTypeName}\` mutation.`,
      fields: gqlInputTypesByFieldName,
    },
    {
      isPgCreateInputType: false,
      pgInflection: table,
    }
  );

  // Standard input type that 'create' uses
  const InputType = newWithHooks(
    GraphQLInputObjectType,
    {
      name: `Upsert${tableTypeName}Input`,
      description: `All input for the upsert \`${tableTypeName}\` mutation.`,
      fields: {
        clientMutationId: {
          description:
            "An arbitrary string value with no semantic meaning. Will be included in the payload verbatim. May be used to track mutations by the client.",
          type: GraphQLString,
        },
        ...(gqlTableInput
          ? {
              [inflection.tableFieldName(table)]: {
                description: `The \`${tableTypeName}\` to be upserted by this mutation.`,
                type: new GraphQLNonNull(gqlTableInput),
              },
            }
          : null),
      },
    },
    {
      isPgCreateInputType: false,
      pgInflection: table,
    }
  );

  // Standard payload type that 'create' uses
  const PayloadType = newWithHooks(
    GraphQLObjectType,
    {
      name: `Upsert${tableTypeName}Payload`,
      description: `The output of our upsert \`${tableTypeName}\` mutation.`,
      fields: ({ fieldWithHooks }) => {
        const tableName = inflection.tableFieldName(table);
        return {
          clientMutationId: {
            description:
              "The exact same `clientMutationId` that was provided in the mutation input, unchanged and unused. May be used by a client to track mutations.",
            type: GraphQLString,
          },
          [tableName]: pgField(build, fieldWithHooks, tableName, {
            description: `The \`${tableTypeName}\` that was upserted by this mutation.`,
            type: gqlTable,
          }),
        };
      },
    },
    {
      isMutationPayload: true,
      isPgCreatePayloadType: false,
      pgIntrospection: table,
    }
  );
  const upsertFnName = `upsert${tableTypeName}`;
  return {
    upsertFnName,
    fn: fieldWithHooks(
      upsertFnName,
      (context) => {
        const { getDataFromParsedResolveInfoFragment } = context;
        return {
          description: `Upserts a single \`${tableTypeName}\`.`,
          type: PayloadType,
          args: {
            where: {
              type: WhereType,
            },
            input: {
              type: new GraphQLNonNull(InputType),
            },
          },
          async resolve(
            _data,
            { where: whereRaw, input },
            { pgClient },
            resolveInfo
          ) {
            const where: Record<string, Primitive> = whereRaw;
            const parsedResolveInfoFragment = parseResolveInfo(resolveInfo);
            const resolveData = getDataFromParsedResolveInfoFragment(
              parsedResolveInfoFragment,
              PayloadType
            );
            const insertedRowAlias = sql.identifier(Symbol());
            const query = queryFromResolveData(
              insertedRowAlias,
              insertedRowAlias,
              resolveData,
              {}
            );

            const sqlColumns: { names: string[] }[] = [];
            const conflictOnlyColumns: { names: string[] }[] = [];
            const sqlValues: unknown[] = [];
            const inputData: Record<string, unknown> =
              input[inflection.tableFieldName(table)];

            // Find the unique constraints
            const uniqueConstraints = allUniqueConstraints.filter(
              (con) => con.classId === table.id
            );

            // Store attributes (columns) for easy access
            const attributes: Attribute[] =
              pgIntrospectionResultsByKind.attribute.filter(
                (attr) => attr.classId === table.id
              );

            // Figure out which columns the unique constraints belong to
            const columnsByConstraintName = uniqueConstraints.reduce<{
              [key: string]: Set<Attribute>;
            }>(
              (acc, constraint) => ({
                ...acc,
                [constraint.name]: new Set(
                  constraint.keyAttributeNums.map((num) => {
                    const match = attributes.find((attr) => attr.num === num);
                    assert(match, `no attribute found for ${num}`);
                    return match;
                  })
                ),
              }),
              {}
            );

            // Depending on whether a where clause was passed, we want to determine which
            // constraint to use in the upsert ON CONFLICT cause.
            // If where clause: Check for the first constraint that the where clause provides all matching unique columns
            // If no where clause: Check for the first constraint that our upsert columns provides all matching unique columns
            //     or default to primary key constraint (existing functionality).
            const primaryKeyConstraint = uniqueConstraints.find(
              (con) => con.type === "p"
            );
            const inputDataKeys = new Set(Object.keys(inputData));
            const matchingConstraint = where
              ? Object.entries(columnsByConstraintName).find(([, columns]) =>
                  [...columns].every(
                    (col) => inflection.camelCase(col.name) in where
                  )
                )
              : Object.entries(columnsByConstraintName).find(([, columns]) =>
                  [...columns].every((col) =>
                    inputDataKeys.has(inflection.camelCase(col.name))
                  )
                ) ??
                Object.entries(columnsByConstraintName).find(
                  ([key]) => key === primaryKeyConstraint?.name
                );

            if (!matchingConstraint) {
              throw new Error(
                `Unable to determine upsert unique constraint for given upserted columns: ${[
                  ...inputDataKeys,
                ].join(", ")}`
              );
            }
            assert(table.namespace, "expected table namespace");

            const [constraintName] = matchingConstraint;
            const columnNamesSkippingUpdate = new Set<string>();

            // Loop thru columns and "SQLify" them
            attributes.forEach((attr) => {
              // where clause should override unknown "input" for the matching column to be a true upsert
              let hasWhereClauseValue = false;
              let whereClauseValue: Primitive | undefined;
              if (
                where &&
                hasOwnProperty(where, inflection.camelCase(attr.name))
              ) {
                whereClauseValue = where[inflection.camelCase(attr.name)];
                hasWhereClauseValue = true;
              }

              if (omit(attr, "updateOnConflict")) {
                columnNamesSkippingUpdate.add(attr.name);
              }

              // Do we have a value for the field in input?
              const fieldName = inflection.column(attr);
              if (hasOwnProperty(inputData, fieldName)) {
                const val = inputData[fieldName];

                // The user passed a where clause condition value that does not match the upsert input value for the same property
                if (hasWhereClauseValue && whereClauseValue !== val) {
                  throw new Error(
                    `Value passed in the input for ${fieldName} does not match the where clause value.`
                  );
                }

                sqlColumns.push(sql.identifier(attr.name));
                sqlValues.push(gql2pg(val, attr.type, attr.typeModifier));
              } else if (hasWhereClauseValue) {
                // If it was ommitted in the input, we should add it
                sqlColumns.push(sql.identifier(attr.name));
                sqlValues.push(
                  gql2pg(whereClauseValue, attr.type, attr.typeModifier)
                );
              }
            });

            // Construct a array in case we need to do an update on conflict
            const conflictUpdateArray = conflictOnlyColumns
              .concat(sqlColumns)
              .filter((col) => !columnNamesSkippingUpdate.has(col.names[0]))
              .map(
                (col) =>
                  sql.query`${sql.identifier(
                    col.names[0]
                  )} = excluded.${sql.identifier(col.names[0])}`
              );

            // SQL query for upsert mutations
            // see: http://www.postgresqltutorial.com/postgresql-upsert/
            const conflictAction =
              conflictUpdateArray.length === 0
                ? sql.fragment`do nothing`
                : sql.fragment`on constraint ${sql.identifier(constraintName)}
            do update set ${sql.join(conflictUpdateArray, ", ")}`;
            const mutationQuery = sql.query`
                  insert into ${sql.identifier(
                    table.namespace.name,
                    table.name
                  )}
                  ${
                    sqlColumns.length
                      ? sql.fragment`(${sql.join(sqlColumns, ", ")})
                      values (${sql.join(sqlValues, ", ")})
                      on conflict ${conflictAction}`
                      : sql.fragment`default values`
                  } returning *`;
            const rows = await viaTemporaryTable(
              pgClient,
              sql.identifier(table.namespace.name, table.name),
              mutationQuery,
              insertedRowAlias,
              query
            );
            return {
              clientMutationId: input.clientMutationId,
              data: rows[0],
            };
          },
        };
      },
      {
        pgFieldIntrospection: table,
        isPgCreateMutationField: false,
      }
    ),
  };
}
