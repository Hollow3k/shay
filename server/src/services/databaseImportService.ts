import Database from 'better-sqlite3';
import { Client } from 'pg';
import { createConnection, type RowDataPacket } from 'mysql2/promise';

type DatabaseDialect = 'postgresql' | 'mysql' | 'sqlite';

type ImportedColumn = {
  id: string;
  name: string;
  dataType: 'varchar' | 'int' | 'bigint' | 'bool' | 'date' | 'timestamp' | 'text';
  fieldType: 'none' | 'primary' | 'candidate' | 'unique';
  nullable: boolean;
};

type ImportedNode = {
  id: string;
  type: 'table';
  position: {
    x: number;
    y: number;
  };
  data: {
    tableName: string;
    columns: ImportedColumn[];
    handles: {
      source: { enabled: boolean; position: 'right' | 'left' | 'top' | 'bottom' };
      target: { enabled: boolean; position: 'right' | 'left' | 'top' | 'bottom' };
    };
  };
};

type ImportedEdge = {
  id: string;
  source: string;
  target: string;
  type: 'deletable';
  label: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  data: {
    foreignKey: {
      tableNodeId: string;
      tableName: string;
      columnId: string;
      columnName: string;
    };
  };
};

type CanvasPayload = {
  version: number;
  savedAt: string;
  flow: {
    nodes: ImportedNode[];
    edges: ImportedEdge[];
  };
  llmSchema: {
    tables: Array<{
      id: string;
      name: string;
      columns: ImportedColumn[];
      nodePosition: {
        x: number;
        y: number;
      };
    }>;
    relationships: Array<{
      edgeId: string;
      fromTable: string | null;
      toTable: string | null;
      fromNodeId: string;
      toNodeId: string;
      fromHandle?: string | null;
      toHandle?: string | null;
      label?: string | null;
    }>;
    comments: Array<{
      nodeId: string;
      text: string;
      nodePosition: {
        x: number;
        y: number;
      };
    }>;
  };
};

type TableRow = {
  table_schema: string;
  table_name: string;
};

type ColumnRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  ordinal_position: number;
};

type PrimaryKeyRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  ordinal_position: number;
};

type UniqueConstraintRow = {
  table_schema: string;
  table_name: string;
  constraint_name: string;
  column_name: string;
  ordinal_position: number;
};

type ForeignKeyRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  referenced_schema: string;
  referenced_table: string;
  referenced_column: string;
  constraint_name: string;
  ordinal_position: number;
};

type ImportedTable = {
  id: string;
  schema: string;
  name: string;
  columns: ImportedColumn[];
  position: {
    x: number;
    y: number;
  };
};

type DatabaseImportResponse = {
  summaryText: string;
  importedCanvas: CanvasPayload;
};

export type DatabaseImportRequestBody = {
  connectionString: string;
  dialect: DatabaseDialect;
  projectId?: string;
  schema?: string;
};

type Catalog = {
  tables: TableRow[];
  columns: ColumnRow[];
  primaryKeys: PrimaryKeyRow[];
  uniques: UniqueConstraintRow[];
  foreignKeys: ForeignKeyRow[];
};

const SUPPORTED_DIALECTS: DatabaseDialect[] = ['postgresql', 'mysql', 'sqlite'];

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const normalizeType = (dataType: string): ImportedColumn['dataType'] => {
  const normalized = dataType.toLowerCase();

  if (
    normalized.includes('int') ||
    normalized === 'smallserial' ||
    normalized === 'serial' ||
    normalized === 'bigserial'
  ) {
    return normalized.includes('big') ? 'bigint' : 'int';
  }

  if (normalized === 'boolean' || normalized === 'bool') {
    return 'bool';
  }

  if (normalized.startsWith('tinyint(1)') || normalized === 'bit') {
    return 'bool';
  }

  if (normalized === 'date') {
    return 'date';
  }

  if (normalized.includes('timestamp') || normalized.includes('date time')) {
    return 'timestamp';
  }

  if (normalized.includes('text') || normalized === 'json' || normalized === 'jsonb') {
    return 'text';
  }

  return 'varchar';
};

const toIdentifier = (value: string): string => {
  return value.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'item';
};

const buildTableKey = (schema: string, table: string): string => {
  return `${schema}.${table}`;
};

const buildBlankHandles = () => ({
  source: { enabled: true, position: 'right' as const },
  target: { enabled: true, position: 'left' as const },
});

const quoteSqliteLiteral = (value: string): string => {
  return `'${value.replace(/'/g, "''")}'`;
};

const getDatabaseNameFromUri = (connectionString: string): string => {
  try {
    const url = new URL(connectionString.trim());
    return decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
  } catch {
    return '';
  }
};

const fetchPostgresCatalog = async (connectionString: string, schemaFilter?: string): Promise<Catalog> => {
  const client = new Client({ connectionString, statement_timeout: 10000 });

  await client.connect();

  try {
    const schemaParams: string[] = [];
    const schemaValues: string[] = [];

    if (schemaFilter?.trim()) {
      schemaValues.push(schemaFilter.trim());
      schemaParams.push(`$${schemaValues.length}`);
    }

    const schemaPredicate = schemaParams.length ? `and table_schema = ${schemaParams[0]}` : '';

    const tablesQuery = `
      select table_schema, table_name
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_schema not in ('pg_catalog', 'information_schema')
        ${schemaPredicate}
      order by table_schema, table_name
    `;

    const columnsQuery = `
      select table_schema, table_name, column_name, data_type, is_nullable, ordinal_position
      from information_schema.columns
      where table_schema not in ('pg_catalog', 'information_schema')
        ${schemaPredicate}
      order by table_schema, table_name, ordinal_position
    `;

    const primaryKeysQuery = `
      select kcu.table_schema, kcu.table_name, kcu.column_name, kcu.ordinal_position
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
       and tc.table_name = kcu.table_name
      where tc.constraint_type = 'PRIMARY KEY'
        ${schemaPredicate ? `and tc.table_schema = ${schemaParams[0]}` : ''}
      order by kcu.table_schema, kcu.table_name, kcu.ordinal_position
    `;

    const uniqueQuery = `
      select kcu.table_schema, kcu.table_name, tc.constraint_name, kcu.column_name, kcu.ordinal_position
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
       and tc.table_name = kcu.table_name
      where tc.constraint_type = 'UNIQUE'
        ${schemaPredicate ? `and tc.table_schema = ${schemaParams[0]}` : ''}
      order by kcu.table_schema, kcu.table_name, tc.constraint_name, kcu.ordinal_position
    `;

    const foreignKeysQuery = `
      select
        tc.table_schema,
        tc.table_name,
        kcu.column_name,
        ccu.table_schema as referenced_schema,
        ccu.table_name as referenced_table,
        ccu.column_name as referenced_column,
        tc.constraint_name,
        kcu.ordinal_position
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
       and tc.table_name = kcu.table_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY'
        ${schemaPredicate ? `and tc.table_schema = ${schemaParams[0]}` : ''}
      order by tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position
    `;

    const [tablesResult, columnsResult, primaryKeysResult, uniqueResult, foreignKeysResult] = await Promise.all([
      client.query<TableRow>(schemaValues.length ? { text: tablesQuery, values: schemaValues } : tablesQuery),
      client.query<ColumnRow>(schemaValues.length ? { text: columnsQuery, values: schemaValues } : columnsQuery),
      client.query<PrimaryKeyRow>(schemaValues.length ? { text: primaryKeysQuery, values: schemaValues } : primaryKeysQuery),
      client.query<UniqueConstraintRow>(schemaValues.length ? { text: uniqueQuery, values: schemaValues } : uniqueQuery),
      client.query<ForeignKeyRow>(schemaValues.length ? { text: foreignKeysQuery, values: schemaValues } : foreignKeysQuery),
    ]);

    return {
      tables: tablesResult.rows,
      columns: columnsResult.rows,
      primaryKeys: primaryKeysResult.rows,
      uniques: uniqueResult.rows,
      foreignKeys: foreignKeysResult.rows,
    };
  } finally {
    await client.end();
  }
};

const fetchMySqlCatalog = async (connectionString: string, schemaFilter?: string): Promise<Catalog> => {
  const connection = await createConnection(connectionString);

  try {
    const databaseName = schemaFilter?.trim() || getDatabaseNameFromUri(connectionString);

    if (!databaseName) {
      throw new Error('MySQL connection string must include a database name or schema override.');
    }

    const [tablesRows] = await connection.query<RowDataPacket[]>(
      `
        select table_schema, table_name
        from information_schema.tables
        where table_type = 'BASE TABLE'
          and table_schema = ?
        order by table_name
      `,
      [databaseName],
    );

    const [columnsRows] = await connection.query<RowDataPacket[]>(
      `
        select table_schema, table_name, column_name, data_type, is_nullable, ordinal_position
        from information_schema.columns
        where table_schema = ?
        order by table_name, ordinal_position
      `,
      [databaseName],
    );

    const [primaryKeysRows] = await connection.query<RowDataPacket[]>(
      `
        select kcu.table_schema, kcu.table_name, kcu.column_name, kcu.ordinal_position
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
         and tc.table_schema = kcu.table_schema
         and tc.table_name = kcu.table_name
        where tc.constraint_type = 'PRIMARY KEY'
          and tc.table_schema = ?
        order by kcu.table_name, kcu.ordinal_position
      `,
      [databaseName],
    );

    const [uniqueRows] = await connection.query<RowDataPacket[]>(
      `
        select kcu.table_schema, kcu.table_name, tc.constraint_name, kcu.column_name, kcu.ordinal_position
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
         and tc.table_schema = kcu.table_schema
         and tc.table_name = kcu.table_name
        where tc.constraint_type = 'UNIQUE'
          and tc.table_schema = ?
        order by kcu.table_name, tc.constraint_name, kcu.ordinal_position
      `,
      [databaseName],
    );

    const [foreignKeysRows] = await connection.query<RowDataPacket[]>(
      `
        select
          tc.table_schema,
          tc.table_name,
          kcu.column_name,
          ccu.table_schema as referenced_schema,
          ccu.table_name as referenced_table,
          ccu.column_name as referenced_column,
          tc.constraint_name,
          kcu.ordinal_position
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
         and tc.table_schema = kcu.table_schema
         and tc.table_name = kcu.table_name
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = tc.constraint_name
        where tc.constraint_type = 'FOREIGN KEY'
          and tc.table_schema = ?
        order by tc.table_name, tc.constraint_name, kcu.ordinal_position
      `,
      [databaseName],
    );

    return {
      tables: tablesRows as TableRow[],
      columns: columnsRows as ColumnRow[],
      primaryKeys: primaryKeysRows as PrimaryKeyRow[],
      uniques: uniqueRows as UniqueConstraintRow[],
      foreignKeys: foreignKeysRows as ForeignKeyRow[],
    };
  } finally {
    await connection.end();
  }
};

const fetchSqliteCatalog = async (connectionString: string, schemaFilter?: string): Promise<Catalog> => {
  const filePath = (() => {
    const trimmed = connectionString.trim();

    if (trimmed.startsWith('sqlite://') || trimmed.startsWith('file://')) {
      try {
        const url = new URL(trimmed);
        return decodeURIComponent(url.pathname.replace(/^\//, ''));
      } catch {
        return '';
      }
    }

    return trimmed;
  })();

  if (!filePath) {
    throw new Error('SQLite connection string must point to a database file path.');
  }

  if (schemaFilter?.trim() && schemaFilter.trim() !== 'main') {
    throw new Error('SQLite import only supports the main schema.');
  }

  const database = new Database(filePath, { readonly: true, fileMustExist: true });

  try {
    const tableRows = database
      .prepare(`select 'main' as table_schema, name as table_name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name`)
      .all() as TableRow[];

    const columns: ColumnRow[] = [];
    const primaryKeys: PrimaryKeyRow[] = [];
    const uniques: UniqueConstraintRow[] = [];
    const foreignKeys: ForeignKeyRow[] = [];

    for (const table of tableRows) {
      const tableNameLiteral = quoteSqliteLiteral(table.table_name);
      const tableInfo = database.prepare(`pragma table_info(${tableNameLiteral})`).all() as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>;

      for (const column of tableInfo) {
        columns.push({
          table_schema: table.table_schema,
          table_name: table.table_name,
          column_name: column.name,
          data_type: column.type || 'text',
          is_nullable: column.notnull === 0 ? 'YES' : 'NO',
          ordinal_position: column.cid + 1,
        });

        if (column.pk > 0) {
          primaryKeys.push({
            table_schema: table.table_schema,
            table_name: table.table_name,
            column_name: column.name,
            ordinal_position: column.pk,
          });
        }
      }

      const indexRows = database.prepare(`pragma index_list(${tableNameLiteral})`).all() as Array<{
        seq: number;
        name: string;
        unique: number;
        origin: string;
        partial: number;
      }>;

      for (const indexRow of indexRows.filter((index) => index.unique === 1 && index.origin !== 'pk')) {
        const indexNameLiteral = quoteSqliteLiteral(indexRow.name);
        const indexInfo = database.prepare(`pragma index_info(${indexNameLiteral})`).all() as Array<{
          seqno: number;
          cid: number;
          name: string;
        }>;

        for (const indexColumn of indexInfo) {
          uniques.push({
            table_schema: table.table_schema,
            table_name: table.table_name,
            constraint_name: indexRow.name,
            column_name: indexColumn.name,
            ordinal_position: indexColumn.seqno + 1,
          });
        }
      }

      const foreignKeyRows = database.prepare(`pragma foreign_key_list(${tableNameLiteral})`).all() as Array<{
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
        match: string;
      }>;

      for (const foreignKeyRow of foreignKeyRows) {
        foreignKeys.push({
          table_schema: table.table_schema,
          table_name: table.table_name,
          column_name: foreignKeyRow.from,
          referenced_schema: 'main',
          referenced_table: foreignKeyRow.table,
          referenced_column: foreignKeyRow.to,
          constraint_name: `fk_${table.table_name}_${foreignKeyRow.id}`,
          ordinal_position: foreignKeyRow.seq + 1,
        });
      }
    }

    return {
      tables: tableRows,
      columns,
      primaryKeys,
      uniques,
      foreignKeys,
    };
  } finally {
    database.close();
  }
};

const fetchCatalog = async (
  dialect: DatabaseDialect,
  connectionString: string,
  schemaFilter?: string,
): Promise<Catalog> => {
  if (dialect === 'postgresql') {
    return fetchPostgresCatalog(connectionString, schemaFilter);
  }

  if (dialect === 'mysql') {
    return fetchMySqlCatalog(connectionString, schemaFilter);
  }

  return fetchSqliteCatalog(connectionString, schemaFilter);
};

const buildImportedTables = (catalog: Awaited<ReturnType<typeof fetchCatalog>>) => {
  const primaryKeySet = new Set(
    catalog.primaryKeys.map((item) => buildTableKey(item.table_schema, item.table_name) + `:${item.column_name}`),
  );

  const uniqueSet = new Set(
    catalog.uniques
      .filter((item) => item.ordinal_position === 1)
      .map((item) => buildTableKey(item.table_schema, item.table_name) + `:${item.column_name}`),
  );

  const columnsByTable = new Map<string, ColumnRow[]>();
  for (const column of catalog.columns) {
    const key = buildTableKey(column.table_schema, column.table_name);
    const existing = columnsByTable.get(key) ?? [];
    existing.push(column);
    columnsByTable.set(key, existing);
  }

  const tables: ImportedTable[] = catalog.tables.map((table, index) => {
    const key = buildTableKey(table.table_schema, table.table_name);
    const columns = (columnsByTable.get(key) ?? [])
      .sort((left, right) => left.ordinal_position - right.ordinal_position)
      .map((column) => {
        const fieldType: ImportedColumn['fieldType'] = primaryKeySet.has(`${key}:${column.column_name}`)
          ? 'primary'
          : uniqueSet.has(`${key}:${column.column_name}`)
            ? 'unique'
            : 'none';

        return {
          id: `${toIdentifier(table.table_name)}_${toIdentifier(column.column_name)}`,
          name: column.column_name,
          dataType: normalizeType(column.data_type),
          fieldType,
          nullable: column.is_nullable === 'YES',
        };
      });

    return {
      id: `${toIdentifier(table.table_schema)}_${toIdentifier(table.table_name)}`,
      schema: table.table_schema,
      name: table.table_name,
      columns,
      position: {
        x: 120 + (index % 3) * 320,
        y: 120 + Math.floor(index / 3) * 240,
      },
    };
  });

  return tables;
};

const buildCanvasPayload = (
  tables: ImportedTable[],
  foreignKeys: ForeignKeyRow[],
): CanvasPayload => {
  const tableNameById = new Map<string, string>();
  const tableByKey = new Map<string, ImportedTable>();

  for (const table of tables) {
    tableNameById.set(table.id, table.name);
    tableByKey.set(buildTableKey(table.schema, table.name), table);
  }

  const nodes: ImportedNode[] = tables.map((table) => ({
    id: table.id,
    type: 'table',
    position: table.position,
    data: {
      tableName: table.name,
      columns: table.columns,
      handles: buildBlankHandles(),
    },
  }));

  const edges = foreignKeys
    .map((foreignKey): ImportedEdge | null => {
      const sourceTable = tableByKey.get(buildTableKey(foreignKey.table_schema, foreignKey.table_name));
      const targetTable = tableByKey.get(buildTableKey(foreignKey.referenced_schema, foreignKey.referenced_table));

      if (!sourceTable || !targetTable) {
        return null;
      }

      const sourceColumn = sourceTable.columns.find((column) => column.name === foreignKey.column_name);

      if (!sourceColumn) {
        return null;
      }

      const edgeId = `${sourceTable.id}_${sourceColumn.id}_${targetTable.id}`;

      return {
        id: edgeId,
        source: sourceTable.id,
        target: targetTable.id,
        type: 'deletable' as const,
        label: `${sourceTable.name}.${sourceColumn.name}`,
        sourceHandle: null,
        targetHandle: null,
        data: {
          foreignKey: {
            tableNodeId: sourceTable.id,
            tableName: sourceTable.name,
            columnId: sourceColumn.id,
            columnName: sourceColumn.name,
          },
        },
      } as ImportedEdge;
    })
    .filter((edge): edge is ImportedEdge => edge !== null) as ImportedEdge[];

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    flow: {
      nodes,
      edges,
    },
    llmSchema: {
      tables: tables.map((table) => ({
        id: table.id,
        name: table.name,
        columns: table.columns,
        nodePosition: table.position,
      })),
      relationships: foreignKeys
        .map((foreignKey) => {
          const sourceTable = tableByKey.get(buildTableKey(foreignKey.table_schema, foreignKey.table_name));
          const targetTable = tableByKey.get(buildTableKey(foreignKey.referenced_schema, foreignKey.referenced_table));

          if (!sourceTable || !targetTable) {
            return null;
          }

          const sourceColumn = sourceTable.columns.find((column) => column.name === foreignKey.column_name);

          if (!sourceColumn) {
            return null;
          }

          return {
            edgeId: `${sourceTable.id}_${sourceColumn.id}_${targetTable.id}`,
            fromTable: sourceTable.name,
            toTable: targetTable.name,
            fromNodeId: sourceTable.id,
            toNodeId: targetTable.id,
            fromHandle: null,
            toHandle: null,
            label: `${sourceTable.name}.${sourceColumn.name}`,
          };
        })
        .filter((relationship): relationship is NonNullable<typeof relationship> => relationship !== null),
      comments: [],
    },
  };
};

export const importDatabaseSchema = async (
  input: DatabaseImportRequestBody,
): Promise<DatabaseImportResponse> => {
  const dialect = input.dialect ?? 'postgresql';

  if (!SUPPORTED_DIALECTS.includes(dialect)) {
    throw new Error(`Unsupported database dialect: ${dialect}. Supported dialects: postgresql, mysql, sqlite.`);
  }

  if (!input.connectionString.trim()) {
    throw new Error('Connection string is required.');
  }

  let url: URL;
  try {
    url = new URL(input.connectionString.trim());
  } catch {
    if (dialect === 'sqlite') {
      url = new URL(`file://${input.connectionString.trim()}`);
    } else {
      throw new Error('Invalid connection string. Expected a valid database connection URI.');
    }
  }

  if (dialect === 'postgresql' && url.protocol !== 'postgresql:' && url.protocol !== 'postgres:' && url.protocol !== 'postgresql+ssl:') {
    throw new Error('Only PostgreSQL connection strings are supported for this importer.');
  }

  if (dialect === 'mysql' && url.protocol !== 'mysql:') {
    throw new Error('Only MySQL connection strings are supported for this importer.');
  }

  if (dialect === 'sqlite' && url.protocol !== 'file:' && !input.connectionString.trim().startsWith('sqlite://')) {
    // accept raw filesystem paths too
  }

  const catalog = await fetchCatalog(dialect, input.connectionString.trim(), input.schema);
  const importedTables = buildImportedTables(catalog);
  const importedCanvas = buildCanvasPayload(importedTables, catalog.foreignKeys);

  return {
    summaryText: `Imported ${importedTables.length} tables and ${importedCanvas.flow.edges.length} relationships from ${dialect}.`,
    importedCanvas,
  };
};