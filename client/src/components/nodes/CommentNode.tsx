import { useEffect, useState } from 'react';
import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react';

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

type CommentFlowNode = Node<CommentNodeData, 'comment'>;

export function CommentNode({ id, data }: NodeProps<CommentFlowNode>) {
  const { setNodes } = useReactFlow();
  const [text, setText] = useState(data.text ?? '');

  const handles: HandleConfig = data.handles ?? {
    source: { enabled: true, position: Position.Right },
    target: { enabled: true, position: Position.Left },
  };

  useEffect(() => {
    setText(data.text ?? '');
  }, [data.text]);

  const handleTextChange = (nextText: string) => {
    setText(nextText);
    setNodes((current) =>
      current.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                text: nextText,
              },
            }
          : node,
      ),
    );
  };

  const deleteNode = () => {
    if (!window.confirm('Delete this node?')) {
      return;
    }

    setNodes((current) => current.filter((node) => node.id !== id));
  };

  return (
    <div className='relative min-w-64 rounded-xl border border-white/20 bg-zinc-900/95 p-2 text-white shadow-xl backdrop-blur'>
      {handles.target.enabled ? (
        <Handle
          type='target'
          position={handles.target.position}
          style={{ background: '#111827', border: '2px solid #3b82f6' }}
        />
      ) : null}
      {handles.source.enabled ? (
        <Handle
          type='source'
          position={handles.source.position}
          style={{ background: '#111827', border: '2px solid #ef4444' }}
        />
      ) : null}

      <button
        type='button'
        onClick={deleteNode}
        className='nodrag absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-zinc-950/80 text-xs font-semibold text-white/90 transition hover:bg-red-600/90'
        aria-label='Delete node'
        title='Delete node'
      >
        <span className='-translate-y-px leading-none'>x</span>
      </button>

      <textarea
        value={text}
        onChange={(event) => handleTextChange(event.target.value)}
        placeholder='Type your comment...'
        className='nodrag h-28 w-full resize-none rounded-lg border border-white/15 bg-black/35 p-2 text-sm text-white placeholder:text-white/45 outline-none transition focus:border-white/35'
      />
    </div>
  );
}
