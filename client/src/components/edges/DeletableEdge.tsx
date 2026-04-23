import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';

type DeletableFlowEdge = Edge<Record<string, never>, 'deletable'>;

export function DeletableEdge({
  id,
  label,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<DeletableFlowEdge>) {
  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const removeEdge = () => {
    if (!window.confirm('Delete this edge?')) {
      return;
    }

    setEdges((current) => current.filter((edge) => edge.id !== id));
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} />
      <EdgeLabelRenderer>
        {typeof label === 'string' && label.trim() ? (
          <div
            className='nodrag nopan absolute -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/20 bg-zinc-900/95 px-2 py-1 text-[10px] font-medium text-white shadow-lg'
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 18}px)`,
              pointerEvents: 'none',
            }}
            title={label}
          >
            {label}
          </div>
        ) : null}
        <button
          type='button'
          onClick={removeEdge}
          className='nodrag nopan absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-zinc-900/95 text-xs font-semibold text-white shadow-lg transition hover:bg-red-600/90'
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          aria-label='Delete edge'
          title='Delete edge'
        >
          <span className='relative -top-px leading-none'>X</span>
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
