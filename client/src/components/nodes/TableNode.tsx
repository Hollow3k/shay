import { useState } from 'react';
import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react';

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

type TableFlowNode = Node<TableNodeData, 'table'>;

export function TableNode({ id, data }: NodeProps<TableFlowNode>) {
  const { setNodes } = useReactFlow();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editedTableName, setEditedTableName] = useState('');
  const [editedColumns, setEditedColumns] = useState<Column[]>([]);
  const [formError, setFormError] = useState('');

  const tableData: TableNodeData = {
    tableName: data.tableName ?? 'Untitled Table',
    columns: data.columns ?? [],
    handles: data.handles ?? {
      source: { enabled: true, position: Position.Right },
      target: { enabled: true, position: Position.Left },
    },
  };

  const getFieldBadge = (fieldType: Column['fieldType']) => {
    if (fieldType === 'primary') {
      return 'PK';
    }

    if (fieldType === 'candidate') {
      return 'CK';
    }

    if (fieldType === 'unique') {
      return 'UQ';
    }

    return null;
  };

  const deleteNode = () => {
    if (!window.confirm('Delete this node?')) {
      return;
    }

    setNodes((current) => current.filter((node) => node.id !== id));
  };

  const createBlankColumn = () => {
    return {
      id: crypto.randomUUID(),
      name: '',
      dataType: 'varchar' as Column['dataType'],
      fieldType: 'none' as Column['fieldType'],
      nullable: true,
    };
  };

  const openEditor = () => {
    setEditedTableName(tableData.tableName);
    setEditedColumns(tableData.columns.map((column) => ({ ...column })));
    setFormError('');
    setIsEditOpen(true);
  };

  const updateColumn = <K extends keyof Column>(columnId: string, key: K, value: Column[K]) => {
    setEditedColumns((current) =>
      current.map((column) =>
        column.id === columnId
          ? {
              ...column,
              [key]: value,
            }
          : column,
      ),
    );
  };

  const removeColumn = (columnId: string) => {
    setEditedColumns((current) => current.filter((column) => column.id !== columnId));
  };

  const addColumn = () => {
    setEditedColumns((current) => [...current, createBlankColumn()]);
  };

  const saveEdits = () => {
    const normalizedTableName = editedTableName.trim();
    const normalizedColumns = editedColumns.map((column) => ({
      ...column,
      name: column.name.trim(),
    }));

    if (!normalizedTableName) {
      setFormError('Table name is required.');
      return;
    }

    if (normalizedColumns.length === 0) {
      setFormError('Add at least one column.');
      return;
    }

    if (normalizedColumns.some((column) => !column.name)) {
      setFormError('Every column needs a name.');
      return;
    }

    const primaryKeyCount = normalizedColumns.filter((column) => column.fieldType === 'primary').length;
    if (primaryKeyCount > 1) {
      setFormError('Only one primary key is allowed per table.');
      return;
    }

    setNodes((current) =>
      current.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                tableName: normalizedTableName,
                columns: normalizedColumns,
              },
            }
          : node,
      ),
    );

    setIsEditOpen(false);
  };

  return (
    <>
      <div className='relative min-w-72 rounded-xl border border-white/20 bg-zinc-900 text-white shadow-xl'>
        {tableData.handles.target.enabled ? (
          <Handle
            type='target'
            position={tableData.handles.target.position}
            style={{ background: '#111827', border: '2px solid #3b82f6' }}
          />
        ) : null}
        {tableData.handles.source.enabled ? (
          <Handle
            type='source'
            position={tableData.handles.source.position}
            style={{ background: '#111827', border: '2px solid #ef4444' }}
          />
        ) : null}

        <div className='nodrag absolute right-2 top-2 z-10 flex items-center gap-1'>
          <button
            type='button'
            onClick={openEditor}
            className='inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-zinc-950/80 text-[10px] font-semibold text-white/90 transition hover:bg-zinc-700/90'
            aria-label='Edit node'
            title='Edit node'
          >
            <svg
              xmlns='http://www.w3.org/2000/svg'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
              className='h-3.5 w-3.5'
            >
              <path d='M12 20h9' />
              <path d='M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z' />
            </svg>
          </button>
          <button
            type='button'
            onClick={deleteNode}
            className='inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-zinc-950/80 text-xs font-semibold text-white/90 transition hover:bg-red-600/90'
            aria-label='Delete node'
            title='Delete node'
          >
            <span className='relative -top-px leading-none'>X</span>
          </button>
        </div>

        <div className='border-b border-white/15 px-3 py-2 text-sm font-semibold tracking-wide'>
          {tableData.tableName}
        </div>
        {tableData.columns.length === 0 ? (
          <div className='px-3 py-2 text-xs text-white/80'>No columns yet</div>
        ) : (
          <div className='divide-y divide-white/10'>
            {tableData.columns.map((column) => {
              const fieldBadge = getFieldBadge(column.fieldType);

              return (
                <div key={column.id} className='grid grid-cols-[1fr_auto] gap-2 px-3 py-2 text-xs'>
                  <div>
                    <p className='font-medium text-white'>{column.name}</p>
                    <p className='text-white/65'>
                      {column.dataType} {column.nullable ? 'NULL' : 'NOT NULL'}
                    </p>
                  </div>
                  <div className='flex items-center'>
                    {fieldBadge ? (
                      <span className='rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/90'>
                        {fieldBadge}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isEditOpen ? (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4'>
          <div className='nodrag w-full max-w-xl rounded-2xl border border-white/15 bg-zinc-900 p-4 shadow-2xl'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <h2 className='text-base font-semibold text-white'>Edit table schema</h2>
                <p className='mt-0.5 text-xs text-white/70'>Update table details and columns quickly.</p>
              </div>
              <button
                type='button'
                onClick={() => setIsEditOpen(false)}
                className='rounded-full border border-white/20 px-2 py-1 text-xs text-white/80 transition hover:bg-white/10'
              >
                Close
              </button>
            </div>

            <label htmlFor={`table-name-${id}`} className='mt-3 block text-xs text-white/80'>
              Table name
            </label>
            <input
              id={`table-name-${id}`}
              value={editedTableName}
              onChange={(event) => setEditedTableName(event.target.value)}
              placeholder='users'
              className='mt-1.5 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-white/40'
            />

            <div className='mt-3 flex items-center justify-between gap-2'>
              <p className='text-xs text-white/70'>Columns: {editedColumns.length}</p>
              <button
                type='button'
                onClick={addColumn}
                className='rounded-full border border-white/20 px-3 py-1.5 text-xs text-white transition hover:bg-white/10'
              >
                Add column
              </button>
            </div>

            <div className='mt-2 max-h-[45vh] space-y-2 overflow-y-auto pr-1'>
              {editedColumns.map((column, index) => (
                <div
                  key={column.id}
                  className='grid gap-2 rounded-lg border border-white/10 bg-black/25 p-2 sm:grid-cols-[1fr_112px_118px_auto_auto]'
                >
                  <input
                    value={column.name}
                    onChange={(event) => updateColumn(column.id, 'name', event.target.value)}
                    placeholder={`column_${index + 1}`}
                    className='rounded-md border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-white outline-none transition focus:border-white/40'
                  />
                  <select
                    value={column.dataType}
                    onChange={(event) =>
                      updateColumn(column.id, 'dataType', event.target.value as Column['dataType'])
                    }
                    className='rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white outline-none transition focus:border-white/40'
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
                    className='rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white outline-none transition focus:border-white/40'
                  >
                    <option value='none'>none</option>
                    <option value='primary'>primary key</option>
                    <option value='candidate'>candidate key</option>
                    <option value='unique'>unique</option>
                  </select>
                  <label className='inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/90'>
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
                    className='rounded-md border border-red-400/35 px-2 py-1 text-[11px] font-medium text-red-300 transition hover:bg-red-500/15'
                  >
                    Del
                  </button>
                </div>
              ))}
            </div>

            {formError ? <p className='mt-2 text-xs text-red-300'>{formError}</p> : null}

            <div className='mt-4 flex justify-end gap-2'>
              <button
                type='button'
                onClick={() => setIsEditOpen(false)}
                className='rounded-full border border-white/20 px-3 py-1.5 text-xs text-white/90 transition hover:bg-white/10'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={saveEdits}
                className='rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black transition hover:bg-zinc-200'
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
