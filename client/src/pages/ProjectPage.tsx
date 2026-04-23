import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { supabase } from '../lib/supabaseClient.ts';
import { Canvas } from '../components/Canvas.tsx';
import { ReactFlow, useNodesState, useEdgesState, addEdge, Position, type Node, type Edge, type Connection, type NodeTypes, type EdgeTypes } from '@xyflow/react';
import { TableNode } from '../components/nodes/TableNode';
import { CommentNode } from '../components/nodes/CommentNode';
import { DeletableEdge } from '../components/edges/DeletableEdge';

type ProjectRow = {
  id: string;
  name: string;
  user_id: string;
  updated_at: string | null;
  canvas_data: unknown;
};

type Column = {
  id: string;
  name: string;
  dataType: 'varchar' | 'int' | 'bigint' | 'bool' | 'date' | 'timestamp' | 'text';
  fieldType: 'none' | 'primary' | 'candidate' | 'unique';
  nullable: boolean;
};

type TableNodeData = {
  tableName: string;
  columns: Column[];
  handles: HandleConfig;
};

type HandleConfig = {
  source: {
    enabled: boolean;
    position: Position;
  };
  target: {
    enabled: boolean;
    position: Position;
  };
};

type CommentNodeData = {
  text: string;
  handles: HandleConfig;
};

type CanvasPayload = {
  version: number;
  savedAt: string;
  flow: {
    nodes: Node[];
    edges: Edge[];
  };
  llmSchema: {
    tables: Array<{
      id: string;
      name: string;
      columns: Column[];
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

type SchemaSuggestionsResponse = {
  suggestionsText: string;
  suggestedCanvas: CanvasPayload;
};

type SqlExportResponse = {
  sqlCommands: string;
};

type SqlDialect = 'postgresql' | 'mysql' | 'sqlite';

type ForeignKeySide = 'source' | 'target';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const SUGGESTIONS_ENDPOINT = `${API_BASE_URL}/api/ai/schema-suggestions`;
const SQL_EXPORT_ENDPOINT = `${API_BASE_URL}/api/ai/export-sql`;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isCanvasPayload = (value: unknown): value is CanvasPayload => {
  if (!isRecord(value)) {
    return false;
  }

  if (!isRecord(value.flow)) {
    return false;
  }

  return Array.isArray(value.flow.nodes) && Array.isArray(value.flow.edges);
};

const parseSuggestionsResponse = (value: unknown): SchemaSuggestionsResponse | null => {
  if (!isRecord(value)) {
    return null;
  }

  const textFromSuggestions = Array.isArray(value.suggestions)
    ? value.suggestions.filter((item): item is string => typeof item === 'string').join('\n')
    : '';

  const suggestionsText =
    typeof value.suggestionsText === 'string'
      ? value.suggestionsText
      : typeof value.summary === 'string'
        ? value.summary
        : textFromSuggestions;

  const suggestedCanvasCandidate = isCanvasPayload(value.suggestedCanvas)
    ? value.suggestedCanvas
    : isCanvasPayload(value.proposedCanvas)
      ? value.proposedCanvas
      : isCanvasPayload(value.canvasData)
        ? value.canvasData
        : null;

  if (!suggestedCanvasCandidate) {
    return null;
  }

  return {
    suggestionsText: suggestionsText || 'No textual suggestions returned.',
    suggestedCanvas: suggestedCanvasCandidate,
  };
};

const parseSqlExportResponse = (value: unknown): SqlExportResponse | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.sqlCommands !== 'string' || !value.sqlCommands.trim()) {
    return null;
  }

  return {
    sqlCommands: value.sqlCommands,
  };
};

const extractTableNodeData = (node: Node): TableNodeData | null => {
  if (!isRecord(node.data)) {
    return null;
  }

  const tableName = typeof node.data.tableName === 'string' ? node.data.tableName : null;
  const columns = Array.isArray(node.data.columns) ? (node.data.columns as Column[]) : null;

  if (!tableName || !columns) {
    return null;
  }

  return {
    tableName,
    columns,
    handles: isRecord(node.data.handles)
      ? (node.data.handles as HandleConfig)
      : {
          source: { enabled: true, position: Position.Right },
          target: { enabled: true, position: Position.Left },
        },
  };
};

const extractCommentNodeData = (node: Node): CommentNodeData | null => {
  if (!isRecord(node.data)) {
    return null;
  }

  const text = typeof node.data.text === 'string' ? node.data.text : null;
  if (text === null) {
    return null;
  }

  return {
    text,
    handles: isRecord(node.data.handles)
      ? (node.data.handles as HandleConfig)
      : {
          source: { enabled: true, position: Position.Right },
          target: { enabled: true, position: Position.Left },
        },
  };
};

const buildLlmSchemaPayload = (nodes: Node[], edges: Edge[]): CanvasPayload['llmSchema'] => {
  const tableNodes = nodes.filter((node) => node.type === 'table');
  const commentNodes = nodes.filter((node) => node.type === 'comment');

  const tableNameById = new Map<string, string>();

  const tables = tableNodes
    .map((node) => {
      const tableData = extractTableNodeData(node);

      if (!tableData) {
        return null;
      }

      tableNameById.set(node.id, tableData.tableName);

      return {
        id: node.id,
        name: tableData.tableName,
        columns: tableData.columns,
        nodePosition: {
          x: node.position.x,
          y: node.position.y,
        },
      };
    })
    .filter((table): table is NonNullable<typeof table> => table !== null);

  const comments = commentNodes
    .map((node) => {
      const commentData = extractCommentNodeData(node);

      if (!commentData) {
        return null;
      }

      return {
        nodeId: node.id,
        text: commentData.text,
        nodePosition: {
          x: node.position.x,
          y: node.position.y,
        },
      };
    })
    .filter((comment): comment is NonNullable<typeof comment> => comment !== null);

  const relationships = edges.map((edge) => {
    return {
      edgeId: edge.id,
      fromTable: tableNameById.get(edge.source) ?? null,
      toTable: tableNameById.get(edge.target) ?? null,
      fromNodeId: edge.source,
      toNodeId: edge.target,
      fromHandle: edge.sourceHandle,
      toHandle: edge.targetHandle,
      label: typeof edge.label === 'string' ? edge.label : null,
    };
  });

  return {
    tables,
    relationships,
    comments,
  };
};

const buildCanvasPayload = (nodes: Node[], edges: Edge[]): CanvasPayload => {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    flow: {
      nodes,
      edges,
    },
    llmSchema: buildLlmSchemaPayload(nodes, edges),
  };
};

const ProjectPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [showTableBuilderModal, setShowTableBuilderModal] = useState(false);
  const [nodeType, setNodeType] = useState<'Table' | 'Comment'>('Table');
  const [tableName, setTableName] = useState('');
  const [tableColumns, setTableColumns] = useState<Column[]>([]);
  const [tableFormError, setTableFormError] = useState('');
  const [sourceHandleEnabled, setSourceHandleEnabled] = useState(true);
  const [sourceHandlePosition, setSourceHandlePosition] = useState<Position>(Position.Right);
  const [targetHandleEnabled, setTargetHandleEnabled] = useState(true);
  const [targetHandlePosition, setTargetHandlePosition] = useState<Position>(Position.Left);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [showSqlExportModal, setShowSqlExportModal] = useState(false);
  const [isFetchingSqlExport, setIsFetchingSqlExport] = useState(false);
  const [sqlExportError, setSqlExportError] = useState('');
  const [sqlCommands, setSqlCommands] = useState('');
  const [sqlDialect, setSqlDialect] = useState<SqlDialect>('postgresql');
  const [sqlCopyState, setSqlCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [sqlCopyError, setSqlCopyError] = useState('');
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [suggestionContext, setSuggestionContext] = useState('');
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestionsText, setSuggestionsText] = useState('');
  const [suggestedCanvas, setSuggestedCanvas] = useState<CanvasPayload | null>(null);
  const [showForeignKeyModal, setShowForeignKeyModal] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [foreignKeySide, setForeignKeySide] = useState<ForeignKeySide>('source');
  const [selectedForeignKeyColumnId, setSelectedForeignKeyColumnId] = useState('');
  const [foreignKeyFormError, setForeignKeyFormError] = useState('');
  const [canvasHydrated, setCanvasHydrated] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(true);

  const getTableDataByNodeId = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) {
        return null;
      }

      return extractTableNodeData(node);
    },
    [nodes],
  );

  const closeForeignKeyModal = useCallback(() => {
    setShowForeignKeyModal(false);
    setPendingConnection(null);
    setForeignKeySide('source');
    setSelectedForeignKeyColumnId('');
    setForeignKeyFormError('');
  }, []);

  const resetTableBuilder = useCallback(() => {
    setTableName('');
    setTableColumns([]);
    setTableFormError('');
  }, []);

  const resetHandleConfig = useCallback(() => {
    setSourceHandleEnabled(true);
    setSourceHandlePosition(Position.Right);
    setTargetHandleEnabled(true);
    setTargetHandlePosition(Position.Left);
  }, []);

  const buildHandleConfig = useCallback((): HandleConfig => {
    return {
      source: {
        enabled: sourceHandleEnabled,
        position: sourceHandlePosition,
      },
      target: {
        enabled: targetHandleEnabled,
        position: targetHandlePosition,
      },
    };
  }, [sourceHandleEnabled, sourceHandlePosition, targetHandleEnabled, targetHandlePosition]);

  const createBlankColumn = useCallback((): Column => {
    return {
      id: crypto.randomUUID(),
      name: '',
      dataType: 'varchar',
      fieldType: 'none',
      nullable: true,
    };
  }, []);

  const openTableBuilder = useCallback(() => {
    resetTableBuilder();
    setTableColumns([createBlankColumn()]);
    setShowAddNodeModal(false);
    setShowTableBuilderModal(true);
  }, [createBlankColumn, resetTableBuilder]);

  const closeTableBuilder = useCallback(() => {
    setShowTableBuilderModal(false);
    resetTableBuilder();
  }, [resetTableBuilder]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) {
        return;
      }

      const sourceTable = getTableDataByNodeId(connection.source);
      const targetTable = getTableDataByNodeId(connection.target);

      if (!sourceTable || !targetTable) {
        setEdges((current) => addEdge({ ...connection, type: 'deletable' }, current));
        return;
      }

      const defaultSide: ForeignKeySide =
        sourceTable.columns.length > 0
          ? 'source'
          : targetTable.columns.length > 0
            ? 'target'
            : 'source';

      const defaultColumns =
        defaultSide === 'source' ? sourceTable.columns : targetTable.columns;

      setPendingConnection(connection);
      setForeignKeySide(defaultSide);
      setSelectedForeignKeyColumnId(defaultColumns[0]?.id ?? '');
      setForeignKeyFormError('');
      setShowForeignKeyModal(true);
    },
    [getTableDataByNodeId, setEdges],
  );

  const pendingSourceTable =
    pendingConnection?.source ? getTableDataByNodeId(pendingConnection.source) : null;
  const pendingTargetTable =
    pendingConnection?.target ? getTableDataByNodeId(pendingConnection.target) : null;

  const foreignKeyColumns =
    foreignKeySide === 'source'
      ? pendingSourceTable?.columns ?? []
      : pendingTargetTable?.columns ?? [];

  const applyForeignKeySelection = useCallback(() => {
    if (!pendingConnection || !pendingConnection.source || !pendingConnection.target) {
      setForeignKeyFormError('Connection context is missing. Please reconnect the tables.');
      return;
    }

    const selectedNodeId =
      foreignKeySide === 'source' ? pendingConnection.source : pendingConnection.target;
    const selectedTable = getTableDataByNodeId(selectedNodeId);

    if (!selectedTable) {
      setForeignKeyFormError('Could not find the selected table. Please reconnect the tables.');
      return;
    }

    const selectedColumn = selectedTable.columns.find(
      (column) => column.id === selectedForeignKeyColumnId,
    );

    if (!selectedColumn) {
      setForeignKeyFormError('Please select a foreign key column before applying.');
      return;
    }

    const edgeLabel = `${selectedTable.tableName}.${selectedColumn.name}`;

    setEdges((current) =>
      addEdge(
        {
          ...pendingConnection,
          type: 'deletable',
          label: edgeLabel,
          data: {
            foreignKey: {
              tableNodeId: selectedNodeId,
              tableName: selectedTable.tableName,
              columnId: selectedColumn.id,
              columnName: selectedColumn.name,
            },
          },
        },
        current,
      ),
    );

    closeForeignKeyModal();
  }, [
    closeForeignKeyModal,
    foreignKeySide,
    getTableDataByNodeId,
    pendingConnection,
    selectedForeignKeyColumnId,
    setEdges,
  ]);

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      table: TableNode,
      comment: CommentNode,
    }),
    [],
  );

  const edgeTypes = useMemo<EdgeTypes>(
    () => ({
      deletable: DeletableEdge,
    }),
    [],
  );

  const updateColumn = useCallback(
    <K extends keyof Column>(columnId: string, key: K, value: Column[K]) => {
      setTableColumns((current) =>
        current.map((column) =>
          column.id === columnId
            ? {
                ...column,
                [key]: value,
              }
            : column,
        ),
      );
    },
    [],
  );

  const addColumn = useCallback(() => {
    setTableColumns((current) => [...current, createBlankColumn()]);
  }, [createBlankColumn]);

  const removeColumn = useCallback((columnId: string) => {
    setTableColumns((current) => current.filter((column) => column.id !== columnId));
  }, []);

  const createCommentNode = useCallback(() => {
    const commentData: CommentNodeData = {
      text: '',
      handles: buildHandleConfig(),
    };

    setNodes((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: 'comment',
        position: { x: 120 + current.length * 30, y: 120 + current.length * 30 },
        data: commentData,
      },
    ]);
    setShowAddNodeModal(false);
    resetHandleConfig();
  }, [buildHandleConfig, resetHandleConfig, setNodes]);

  const handleAddNodeType = useCallback(() => {
    if (nodeType === 'Table') {
      openTableBuilder();
      return;
    }

    createCommentNode();
  }, [createCommentNode, nodeType, openTableBuilder]);

  const createTableNode = useCallback(() => {
    const normalizedTableName = tableName.trim();
    const normalizedColumns = tableColumns.map((column) => ({
      ...column,
      name: column.name.trim(),
    }));

    if (!normalizedTableName) {
      setTableFormError('Table name is required.');
      return;
    }

    if (normalizedColumns.length === 0) {
      setTableFormError('Add at least one column.');
      return;
    }

    if (normalizedColumns.some((column) => !column.name)) {
      setTableFormError('Every column needs a name.');
      return;
    }

    const primaryKeyCount = normalizedColumns.filter(
      (column) => column.fieldType === 'primary',
    ).length;

    if (primaryKeyCount > 1) {
      setTableFormError('Only one primary key is allowed per table.');
      return;
    }

    const nodeData: TableNodeData = {
      tableName: normalizedTableName,
      columns: normalizedColumns,
      handles: buildHandleConfig(),
    };

    setNodes((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        type: 'table',
        position: { x: 120 + current.length * 30, y: 120 + current.length * 30 },
        data: nodeData,
      },
    ]);

    closeTableBuilder();
    resetHandleConfig();
  }, [buildHandleConfig, closeTableBuilder, resetHandleConfig, setNodes, tableColumns, tableName]);
  
  useEffect(() => {
    const loadProject = async () => {
      if (loading) {
        return;
      }

      if (!user || !projectId) {
        setError('Project not found.');
        setPageLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('id, name, user_id, updated_at, canvas_data')
        .eq('id', projectId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message);
        setProject(null);
      } else if (!data) {
        setError('You do not have access to this project.');
        setProject(null);
      } else {
        setProject(data as ProjectRow);
        setError('');

        const canvasData = (data as ProjectRow).canvas_data;

        if (
          isRecord(canvasData) &&
          isRecord(canvasData.flow) &&
          Array.isArray(canvasData.flow.nodes) &&
          Array.isArray(canvasData.flow.edges)
        ) {
          setNodes(canvasData.flow.nodes as Node[]);
          setEdges(canvasData.flow.edges as Edge[]);
        } else {
          setNodes([]);
          setEdges([]);
        }

        skipNextSaveRef.current = true;
        setCanvasHydrated(true);
      }

      setPageLoading(false);
    };

    void loadProject();
  }, [loading, projectId, user]);

  useEffect(() => {
    if (!project || !user || !canvasHydrated) {
      return;
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    setSaveState('saving');
    setSaveError('');

    saveTimerRef.current = setTimeout(() => {
      const persistCanvas = async () => {
        const payload = buildCanvasPayload(nodes, edges);

        const { error: updateError } = await supabase
          .from('projects')
          .update({ canvas_data: payload })
          .eq('id', project.id)
          .eq('user_id', user.id);

        if (updateError) {
          setSaveState('error');
          setSaveError(updateError.message);
          return;
        }

        setSaveState('saved');
      };

      void persistCanvas();
    }, 800);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [canvasHydrated, edges, nodes, project, user]);

  const requestSqlExport = useCallback(async () => {
    if (!project || !user) {
      setSqlExportError('You must be logged in and inside a project to export SQL commands.');
      return;
    }

    setIsFetchingSqlExport(true);
    setSqlExportError('');

    try {
      const currentCanvasData = buildCanvasPayload(nodes, edges);

      const response = await fetch(SQL_EXPORT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: project.id,
          schema: currentCanvasData.llmSchema,
          canvasData: currentCanvasData,
          sqlDialect,
        }),
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message = isRecord(body) && typeof body.error === 'string'
          ? body.error
          : `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      const data: unknown = await response.json();
      const parsedResponse = parseSqlExportResponse(data);

      if (!parsedResponse) {
        throw new Error('Response is missing SQL commands.');
      }

      setSqlCommands(parsedResponse.sqlCommands);
    } catch (requestError) {
      setSqlExportError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to export SQL commands.',
      );
      setSqlCommands('');
    } finally {
      setIsFetchingSqlExport(false);
    }
  }, [edges, nodes, project, sqlDialect, user]);

  const openSqlExportModal = useCallback(() => {
    setShowSqlExportModal(true);
    setSqlCommands('');
    setSqlExportError('');
    setSqlCopyState('idle');
    setSqlCopyError('');
    void requestSqlExport();
  }, [requestSqlExport]);

  const copySqlCommands = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sqlCommands);
      setSqlCopyError('');
      setSqlCopyState('copied');
      setTimeout(() => setSqlCopyState('idle'), 1500);
    } catch (copyFailure) {
      setSqlCopyState('error');
      setSqlCopyError(
        copyFailure instanceof Error
          ? copyFailure.message
          : 'Unable to copy SQL commands to clipboard.',
      );
    }
  }, [sqlCommands]);

  const downloadSqlCommands = useCallback(() => {
    const blob = new Blob([sqlCommands], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${project?.name ?? 'schema'}-sql-commands.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [project?.name, sqlCommands]);

  const openSuggestionsModal = useCallback(() => {
    setSuggestionError('');
    setSuggestionsText('');
    setSuggestedCanvas(null);
    setShowSuggestionsModal(true);
  }, []);

  const requestSchemaSuggestions = useCallback(async () => {
    if (!project || !user) {
      setSuggestionError('You must be logged in and inside a project to request suggestions.');
      return;
    }

    setIsFetchingSuggestions(true);
    setSuggestionError('');

    try {
      const currentCanvasData = buildCanvasPayload(nodes, edges);

      const response = await fetch(SUGGESTIONS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: project.id,
          schema: currentCanvasData.llmSchema,
          canvasData: currentCanvasData,
          userContext: suggestionContext.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data: unknown = await response.json();
      const parsedResponse = parseSuggestionsResponse(data);

      if (!parsedResponse) {
        throw new Error('Response is missing a valid suggested canvas payload.');
      }

      setSuggestionsText(parsedResponse.suggestionsText);
      setSuggestedCanvas(parsedResponse.suggestedCanvas);
    } catch (requestError) {
      setSuggestionError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to fetch schema suggestions.',
      );
    } finally {
      setIsFetchingSuggestions(false);
    }
  }, [edges, nodes, project, suggestionContext, user]);

  const applySuggestedCanvas = useCallback(() => {
    if (!suggestedCanvas) {
      setSuggestionError('No suggested canvas is available to apply.');
      return;
    }

    setNodes(suggestedCanvas.flow.nodes);
    setEdges(suggestedCanvas.flow.edges);
    setShowSuggestionsModal(false);
    setSuggestionError('');
    setSuggestionsText('');
    setSuggestedCanvas(null);
  }, [setEdges, setNodes, suggestedCanvas]);

  if (pageLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-black text-white'>
        Loading project...
      </div>
    );
  }

  if (!project) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-black px-4 text-white'>
        <div className='rounded-3xl border border-white/10 bg-white/5 px-6 py-8 text-center backdrop-blur-xl'>
          <h1 className='text-2xl font-semibold'>Project unavailable</h1>
          <p className='mt-2 text-sm text-white/70'>{error}</p>
          <button
            type='button'
            onClick={() => navigate('/dashboard', { replace: true })}
            className='mt-5 rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200'
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-black px-4 py-6 text-white sm:px-6 lg:px-8'>
      <div className='mx-auto h-[90vh] max-w-6xl rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <p className='text-xs uppercase tracking-[0.35em] text-white/45'>Project</p>
            <h1 className='mt-2 text-3xl font-semibold'>{project.name}</h1>
          </div>
          <Link
            to='/dashboard'
            className='inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15'
          >
            Back to dashboard
          </Link>
        </div>

        <div className='mt-6 flex flex-wrap gap-3'>
          <button
            type='button'
            onClick={() => {
              resetHandleConfig();
              setShowAddNodeModal(true);
            }}
            className='inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15'
          >
            Add Node
          </button>

          <button
            type='button'
            onClick={openSuggestionsModal}
            className='inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15'
          >
            AI Suggestions
          </button>

          <button
            type='button'
            onClick={openSqlExportModal}
            className='inline-flex w-fit rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15'
          >
            Export SQL Commands
          </button>
        </div>

        <div className='mt-3 text-xs text-white/65'>
          {saveState === 'saving' ? 'Saving canvas...' : null}
          {saveState === 'saved' ? 'All canvas changes saved.' : null}
          {saveState === 'error' ? `Save failed: ${saveError}` : null}
        </div>

        <Canvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: 'deletable' }}
        />
      </div>

      {showAddNodeModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4'>
          <div className='w-full max-w-md rounded-2xl border border-white/15 bg-zinc-900 p-5 shadow-2xl'>
            <h2 className='text-lg font-semibold text-white'>Add node</h2>
            <label htmlFor='node-type' className='mt-4 block text-sm text-white/80'>
              Node type
            </label>
            <select
              id='node-type'
              value={nodeType}
              onChange={(event) => setNodeType(event.target.value as 'Table' | 'Comment')}
              className='mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none transition focus:border-white/40'
            >
              <option value='Table'>Table</option>
              <option value='Comment'>Comment</option>
            </select>

            <div className='mt-4 rounded-xl border border-white/10 bg-black/20 p-3'>
              <p className='text-sm font-medium text-white'>Handles</p>
              <p className='mt-1 text-xs text-white/65'>
                Choose whether this node has input/output handles and where they appear.
              </p>

              <div className='mt-3 grid gap-3 sm:grid-cols-2'>
                <div className='rounded-lg border border-white/10 bg-black/30 p-3'>
                  <label className='flex items-center justify-between text-xs text-white/90'>
                    Source handle
                    <input
                      type='checkbox'
                      checked={sourceHandleEnabled}
                      onChange={(event) => setSourceHandleEnabled(event.target.checked)}
                    />
                  </label>
                  <select
                    value={sourceHandlePosition}
                    onChange={(event) => setSourceHandlePosition(event.target.value as Position)}
                    disabled={!sourceHandleEnabled}
                    className='mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white outline-none transition disabled:opacity-50'
                  >
                    <option value={Position.Left}>Left</option>
                    <option value={Position.Right}>Right</option>
                    <option value={Position.Top}>Top</option>
                    <option value={Position.Bottom}>Bottom</option>
                  </select>
                </div>

                <div className='rounded-lg border border-white/10 bg-black/30 p-3'>
                  <label className='flex items-center justify-between text-xs text-white/90'>
                    Target handle
                    <input
                      type='checkbox'
                      checked={targetHandleEnabled}
                      onChange={(event) => setTargetHandleEnabled(event.target.checked)}
                    />
                  </label>
                  <select
                    value={targetHandlePosition}
                    onChange={(event) => setTargetHandlePosition(event.target.value as Position)}
                    disabled={!targetHandleEnabled}
                    className='mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm text-white outline-none transition disabled:opacity-50'
                  >
                    <option value={Position.Left}>Left</option>
                    <option value={Position.Right}>Right</option>
                    <option value={Position.Top}>Top</option>
                    <option value={Position.Bottom}>Bottom</option>
                  </select>
                </div>
              </div>
            </div>

            <div className='mt-5 flex justify-end gap-3'>
              <button
                type='button'
                onClick={() => setShowAddNodeModal(false)}
                className='rounded-full border border-white/20 px-4 py-2 text-sm text-white/90 transition hover:bg-white/10'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={handleAddNodeType}
                className='rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200'
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {showTableBuilderModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4'>
          <div className='w-full max-w-2xl rounded-2xl border border-white/15 bg-zinc-900 p-5 shadow-2xl'>
            <h2 className='text-lg font-semibold text-white'>Create table schema</h2>
            <p className='mt-1 text-sm text-white/70'>
              Define the table name and its columns.
            </p>

            <label htmlFor='table-name' className='mt-4 block text-sm text-white/80'>
              Table name
            </label>
            <input
              id='table-name'
              value={tableName}
              onChange={(event) => setTableName(event.target.value)}
              placeholder='users'
              className='mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none transition focus:border-white/40'
            />

            <div className='mt-5 space-y-3'>
              {tableColumns.map((column, index) => (
                <div
                  key={column.id}
                  className='grid gap-2 rounded-xl border border-white/10 bg-black/25 p-3 sm:grid-cols-[1.1fr_0.9fr_0.9fr_auto_auto]'
                >
                  <input
                    value={column.name}
                    onChange={(event) => updateColumn(column.id, 'name', event.target.value)}
                    placeholder={`column_${index + 1}`}
                    className='rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40'
                  />
                  <select
                    value={column.dataType}
                    onChange={(event) =>
                      updateColumn(column.id, 'dataType', event.target.value as Column['dataType'])
                    }
                    className='rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40'
                  >
                    <option value='varchar'>varchar</option>
                    <option value='int'>int</option>
                    <option value='bigint'>bigint</option>
                    <option value='bool'>bool</option>
                    <option value='date'>date</option>
                    <option value='timestamp'>timestamp</option>
                    <option value='text'>text</option>
                  </select>
                  <select
                    value={column.fieldType}
                    onChange={(event) =>
                      updateColumn(column.id, 'fieldType', event.target.value as Column['fieldType'])
                    }
                    className='rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40'
                  >
                    <option value='none'>none</option>
                    <option value='primary'>primary key</option>
                    <option value='candidate'>candidate key</option>
                    <option value='unique'>unique</option>
                  </select>
                  <label className='inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs text-white/90'>
                    <input
                      type='checkbox'
                      checked={column.nullable}
                      onChange={(event) => updateColumn(column.id, 'nullable', event.target.checked)}
                    />
                    NULL
                  </label>
                  <button
                    type='button'
                    onClick={() => removeColumn(column.id)}
                    className='rounded-lg border border-red-400/35 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/15'
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              type='button'
              onClick={addColumn}
              className='mt-4 rounded-full border border-white/20 px-4 py-2 text-sm text-white transition hover:bg-white/10'
            >
              Add column
            </button>

            {tableFormError && <p className='mt-3 text-sm text-red-300'>{tableFormError}</p>}

            <div className='mt-6 flex justify-end gap-3'>
              <button
                type='button'
                onClick={closeTableBuilder}
                className='rounded-full border border-white/20 px-4 py-2 text-sm text-white/90 transition hover:bg-white/10'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={createTableNode}
                className='rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200'
              >
                Create table
              </button>
            </div>
          </div>
        </div>
      )}

      {showSqlExportModal ? (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4'>
          <div className='w-full max-w-4xl rounded-2xl border border-white/15 bg-zinc-900 p-5 shadow-2xl'>
            <h2 className='text-lg font-semibold text-white'>Export SQL Commands</h2>
            <p className='mt-1 text-sm text-white/70'>
              SQL commands generated from the current canvas schema.
            </p>

            <div className='mt-4 grid gap-3 sm:grid-cols-[220px_auto] sm:items-end'>
              <div>
                <label htmlFor='sql-dialect' className='block text-xs text-white/75'>
                  SQL dialect
                </label>
                <select
                  id='sql-dialect'
                  value={sqlDialect}
                  onChange={(event) => setSqlDialect(event.target.value as SqlDialect)}
                  className='mt-1.5 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40'
                >
                  <option value='postgresql'>PostgreSQL</option>
                  <option value='mysql'>MySQL</option>
                  <option value='sqlite'>SQLite</option>
                </select>
              </div>
              <div>
                <button
                  type='button'
                  onClick={() => void requestSqlExport()}
                  disabled={isFetchingSqlExport}
                  className='rounded-full border border-white/20 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60'
                >
                  {isFetchingSqlExport ? 'Generating...' : 'Regenerate SQL'}
                </button>
              </div>
            </div>

            {isFetchingSqlExport ? (
              <div className='mt-4 rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-white/80'>
                Generating SQL commands...
              </div>
            ) : null}

            {sqlExportError ? (
              <p className='mt-4 text-sm text-red-300'>{sqlExportError}</p>
            ) : null}

            {sqlCommands ? (
              <div className='mt-4 rounded-xl border border-white/10 bg-black/25 p-3'>
                <pre className='max-h-[46vh] overflow-auto whitespace-pre-wrap text-xs leading-5 text-white/85'>
                  {sqlCommands}
                </pre>
              </div>
            ) : null}

            <div className='mt-5 flex flex-wrap items-center justify-between gap-3'>
              <div className='text-xs text-white/65'>
                {sqlCopyState === 'copied' ? 'SQL commands copied to clipboard.' : null}
                {sqlCopyState === 'error' ? `Copy failed: ${sqlCopyError}` : null}
              </div>

              <div className='flex flex-wrap justify-end gap-3'>
                <button
                  type='button'
                  onClick={() => {
                    setShowSqlExportModal(false);
                    setSqlCopyState('idle');
                    setSqlCopyError('');
                  }}
                  className='rounded-full border border-white/20 px-4 py-2 text-sm text-white/90 transition hover:bg-white/10'
                >
                  Close
                </button>
                <button
                  type='button'
                  onClick={() => void copySqlCommands()}
                  disabled={!sqlCommands}
                  className='rounded-full border border-white/20 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50'
                >
                  Copy
                </button>
                <button
                  type='button'
                  onClick={downloadSqlCommands}
                  disabled={!sqlCommands}
                  className='rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50'
                >
                  Download .txt
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showSuggestionsModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4'>
          <div className='w-full max-w-5xl rounded-2xl border border-white/15 bg-zinc-900 p-5 shadow-2xl'>
            <h2 className='text-lg font-semibold text-white'>AI Schema Suggestions</h2>
            <p className='mt-1 text-sm text-white/70'>
              Send your current schema to Grok and get optimization suggestions.
            </p>

            <label htmlFor='ai-context' className='mt-4 block text-sm text-white/80'>
              Extra context for AI (optional)
            </label>
            <textarea
              id='ai-context'
              value={suggestionContext}
              onChange={(event) => setSuggestionContext(event.target.value)}
              placeholder='Example: prioritize read-heavy queries, keep naming conventions snake_case, optimize for PostgreSQL.'
              className='mt-2 h-24 w-full resize-none rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40'
            />

            <div className='mt-3 flex items-center gap-3'>
              <button
                type='button'
                onClick={() => void requestSchemaSuggestions()}
                disabled={isFetchingSuggestions}
                className='rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60'
              >
                {isFetchingSuggestions ? 'Requesting...' : 'Get suggestions'}
              </button>
            </div>

            {suggestionError ? <p className='mt-3 text-sm text-red-300'>{suggestionError}</p> : null}

            {suggestionsText ? (
              <div className='mt-4 rounded-xl border border-white/10 bg-black/25 p-3'>
                <p className='text-sm font-medium text-white'>Textual suggestions</p>
                <pre className='mt-2 max-h-44 overflow-auto whitespace-pre-wrap text-xs leading-5 text-white/85'>
                  {suggestionsText}
                </pre>
              </div>
            ) : null}

            {suggestedCanvas ? (
              <div className='mt-4 rounded-xl border border-white/10 bg-black/25 p-3'>
                <p className='text-sm font-medium text-white'>Proposed canvas preview</p>
                <p className='mt-1 text-xs text-white/65'>
                  Review how the updated schema graph will look before applying changes.
                </p>
                <div className='mt-3 h-[42vh] rounded-xl border border-white/10 bg-black/40'>
                  <ReactFlow
                    nodes={suggestedCanvas.flow.nodes}
                    edges={suggestedCanvas.flow.edges}
                    onNodesChange={() => undefined}
                    onEdgesChange={() => undefined}
                    onConnect={() => undefined}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    defaultEdgeOptions={{ type: 'deletable' }}
                    fitView
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    zoomOnDoubleClick={false}
                  />
                </div>
              </div>
            ) : null}

            <div className='mt-6 flex justify-end gap-3'>
              <button
                type='button'
                onClick={() => setShowSuggestionsModal(false)}
                className='rounded-full border border-white/20 px-4 py-2 text-sm text-white/90 transition hover:bg-white/10'
              >
                Close
              </button>
              <button
                type='button'
                onClick={applySuggestedCanvas}
                disabled={!suggestedCanvas}
                className='rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50'
              >
                Apply suggested changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showForeignKeyModal && pendingConnection ? (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4'>
          <div className='w-full max-w-lg rounded-2xl border border-white/15 bg-zinc-900 p-5 shadow-2xl'>
            <h2 className='text-lg font-semibold text-white'>Configure relationship</h2>
            <p className='mt-1 text-sm text-white/70'>
              Choose which foreign key column is used for this table connection.
            </p>

            <div className='mt-3 rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-white/75'>
              <p>
                Source: <span className='font-medium text-white'>{pendingSourceTable?.tableName ?? pendingConnection.source}</span>
              </p>
              <p className='mt-1'>
                Target: <span className='font-medium text-white'>{pendingTargetTable?.tableName ?? pendingConnection.target}</span>
              </p>
            </div>

            <label htmlFor='fk-side' className='mt-4 block text-sm text-white/80'>
              Foreign key table
            </label>
            <select
              id='fk-side'
              value={foreignKeySide}
              onChange={(event) => {
                const nextSide = event.target.value as ForeignKeySide;
                setForeignKeySide(nextSide);
                const nextColumns =
                  nextSide === 'source'
                    ? pendingSourceTable?.columns ?? []
                    : pendingTargetTable?.columns ?? [];
                setSelectedForeignKeyColumnId(nextColumns[0]?.id ?? '');
                setForeignKeyFormError('');
              }}
              className='mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none transition focus:border-white/40'
            >
              <option value='source'>{pendingSourceTable?.tableName ?? 'Source table'}</option>
              <option value='target'>{pendingTargetTable?.tableName ?? 'Target table'}</option>
            </select>

            <label htmlFor='fk-column' className='mt-4 block text-sm text-white/80'>
              Foreign key column
            </label>
            <select
              id='fk-column'
              value={selectedForeignKeyColumnId}
              onChange={(event) => {
                setSelectedForeignKeyColumnId(event.target.value);
                setForeignKeyFormError('');
              }}
              className='mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none transition focus:border-white/40'
            >
              {foreignKeyColumns.length === 0 ? (
                <option value=''>No columns available</option>
              ) : (
                foreignKeyColumns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name} ({column.dataType})
                  </option>
                ))
              )}
            </select>

            {foreignKeyFormError ? (
              <p className='mt-3 text-sm text-red-300'>{foreignKeyFormError}</p>
            ) : null}

            <div className='mt-6 flex justify-end gap-3'>
              <button
                type='button'
                onClick={closeForeignKeyModal}
                className='rounded-full border border-white/20 px-4 py-2 text-sm text-white/90 transition hover:bg-white/10'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={applyForeignKeySelection}
                disabled={foreignKeyColumns.length === 0}
                className='rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50'
              >
                Create connection
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ProjectPage;