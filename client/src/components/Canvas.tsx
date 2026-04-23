import { ReactFlow, type Node, type Edge, type NodeTypes, type EdgeTypes, type OnNodesChange, type OnEdgesChange, type OnConnect } from '@xyflow/react';

type CanvasProps<TNode extends Node = Node, TEdge extends Edge = Edge> = {
nodes: TNode[];
edges: TEdge[];
onNodesChange: OnNodesChange<TNode>;
onEdgesChange: OnEdgesChange<TEdge>;
onConnect: OnConnect;
nodeTypes: NodeTypes;
edgeTypes?: EdgeTypes;
defaultEdgeOptions?: Partial<TEdge>;
};

export function Canvas<TNode extends Node = Node, TEdge extends Edge = Edge>({
nodes,
edges,
onNodesChange,
onEdgesChange,
onConnect,
nodeTypes,
edgeTypes,
defaultEdgeOptions,
}: CanvasProps<TNode, TEdge>) {
return (
<div className='mt-8 h-[64vh] rounded-3xl border border-white/10 bg-black/40 p-6'>
<ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultEdgeOptions={defaultEdgeOptions} fitView />
</div>
);
}