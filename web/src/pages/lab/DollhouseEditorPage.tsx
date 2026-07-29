import React, { useCallback, useRef, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Splat, TransformControls, Html, Grid } from '@react-three/drei';
import { Button } from '@/components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants';
import { ArrowLeft, Move, RotateCw, Link, Save, Maximize, Settings, Eye, Grid as GridIcon } from 'lucide-react';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

// Define the connections
type Connection = {
  id: string;
  fromModel: string;
  toModel: string;
  position: [number, number, number];
};

type ModelData = {
  id: string;
  name: string;
  src: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

// Layout prior: room1 → short hallway (curtains) → room2 along +Z walk axis.
// Prefer /splats/connected_tour.splat (joint SfM) for a single walkable volume.
const INITIAL_MODELS: ModelData[] = [
  { id: 'room1', name: 'Room 1', src: '/splats/room1.splat', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  { id: 'hallway', name: 'Hallway', src: '/splats/hallway.splat', position: [0, 0, 1.7], rotation: [0, 0, 0], scale: [1, 1, 1] },
  { id: 'room2', name: 'Room 2', src: '/splats/room2.splat', position: [0, 0, 2.2], rotation: [0, 0, 0], scale: [1, 1, 1] },
];

export function DollhouseEditorPage() {
  const navigate = useNavigate();

  const [models, setModels] = useState<ModelData[]>(INITIAL_MODELS);
  const [connections, setConnections] = useState<Connection[]>([]);

  const [activeModelId, setActiveModelId] = useState<string>('room1');
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale' | 'connect'>('translate');
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  const activeModel = models.find(m => m.id === activeModelId);
  // Only ever dereferenced inside callbacks/effects below, never during render.
  const groupRefsRef = useRef(new Map<string, THREE.Group>());
  // This state mirrors "the currently active group" so TransformControls'
  // `object` prop is read from state during render, never from the ref map.
  // Kept in sync by the per-model ref callback below (inline ref callbacks
  // re-fire on every render, so this updates whenever activeModelId changes).
  const [activeGroup, setActiveGroup] = useState<THREE.Group | null>(null);

  const updateModel = (id: string, updates: Partial<ModelData>) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleTransformChange = useCallback(() => {
    const obj = groupRefsRef.current.get(activeModelId);
    if (!obj) return;
    updateModel(activeModelId, {
      position: [obj.position.x, obj.position.y, obj.position.z],
      rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
    });
  }, [activeModelId]);

  const handlePlaceConnection = useCallback(
    (point: THREE.Vector3) => {
      const toModelId = models.find(m => m.id !== activeModelId)?.id ?? 'room2';
      const newConn: Connection = {
        id: uuidv4(),
        fromModel: activeModelId,
        toModel: toModelId,
        position: [point.x, point.y, point.z],
      };
      setConnections(prev => [...prev, newConn]);
    },
    [activeModelId, models]
  );

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans">
      {/* TOP BAR */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 pointer-events-none">
        <Button 
          variant="secondary" 
          className="rounded-full bg-black/50 backdrop-blur-md text-white border-white/10 hover:bg-white/20 pointer-events-auto"
          onClick={() => navigate(ROUTES.LAB)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Lab
        </Button>
        
        <div className="flex gap-2 pointer-events-auto bg-black/50 backdrop-blur-md rounded-full p-1 border border-white/10">
           <Button variant="ghost" size="sm" className={`rounded-full ${showGrid ? 'bg-white/20' : ''}`} onClick={() => setShowGrid(!showGrid)}>
             <GridIcon className="h-4 w-4 mr-2" /> Grid
           </Button>
           <Button
             variant="default"
             size="sm"
             disabled
             title="Not wired up yet — layout persistence is coming in a later pass."
             className="rounded-full bg-blue-600 opacity-50 hover:bg-blue-600"
           >
             <Save className="h-4 w-4 mr-2" /> Save Tour
           </Button>
        </div>
      </div>

      {/* CANVAS */}
      <Canvas camera={{ position: [0, 8, 15], fov: 45 }}>
        <color attach="background" args={['#0a0a0c']} />
        <ambientLight intensity={0.5} />
        
        {showGrid && <Grid infiniteGrid fadeDistance={50} sectionColor="#444" cellColor="#222" />}

        {models.map(model => (
          <group
            key={model.id}
            ref={el => {
              if (el) groupRefsRef.current.set(model.id, el);
              else groupRefsRef.current.delete(model.id);
              if (model.id === activeModelId) setActiveGroup(el);
            }}
            position={model.position}
            rotation={model.rotation}
            scale={model.scale}
          >
            <Splat src={model.src} />
          </group>
        ))}

        {activeGroup && transformMode !== 'connect' && (
          <TransformControls
            object={activeGroup}
            mode={transformMode}
            onChange={handleTransformChange}
            ref={(controls) => {
              if (!controls) return;
              // three-stdlib's TransformControls dispatches a 'dragging-changed'
              // event that isn't part of the typed Object3D event map.
              const dispatcher = controls as unknown as THREE.EventDispatcher<{
                'dragging-changed': { value: boolean };
              }>;
              const onDraggingChanged = (e: { value: boolean }) => setOrbitEnabled(!e.value);
              dispatcher.addEventListener('dragging-changed', onDraggingChanged);
              return () => dispatcher.removeEventListener('dragging-changed', onDraggingChanged);
            }}
          />
        )}

        {/* Invisible floor plane — click while in "connect" mode to place a
            door/portal marker between the active model and the next one. */}
        {transformMode === 'connect' && (
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              handlePlaceConnection(e.point);
            }}
          >
            <planeGeometry args={[100, 100]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        )}

        {/* Render Connections */}
        {connections.map(conn => (
          <group key={conn.id} position={conn.position}>
             <Html center zIndexRange={[100, 0]}>
               <div className="bg-yellow-500 text-black text-xs px-2 py-1 rounded-full border-2 border-white shadow-lg cursor-pointer whitespace-nowrap animate-bounce font-bold">
                 Door / Portal
               </div>
             </Html>
             <mesh>
               <boxGeometry args={[0.2, 2, 1]} />
               <meshStandardMaterial color="yellow" transparent opacity={0.5} />
             </mesh>
          </group>
        ))}

        <OrbitControls makeDefault enabled={orbitEnabled} />
      </Canvas>

      {/* TOOLBAR (BOTTOM) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-2 p-2 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
        <Button 
          variant="ghost" 
          size="icon" 
          className={`rounded-xl text-white hover:bg-white/20 hover:text-white ${transformMode === 'translate' ? 'bg-white/20' : ''}`}
          onClick={() => setTransformMode('translate')}
          title="Translate"
        >
          <Move className="h-5 w-5" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className={`rounded-xl text-white hover:bg-white/20 hover:text-white ${transformMode === 'rotate' ? 'bg-white/20' : ''}`}
          onClick={() => setTransformMode('rotate')}
          title="Rotate"
        >
          <RotateCw className="h-5 w-5" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className={`rounded-xl text-white hover:bg-white/20 hover:text-white ${transformMode === 'scale' ? 'bg-white/20' : ''}`}
          onClick={() => setTransformMode('scale')}
          title="Scale"
        >
          <Maximize className="h-5 w-5" />
        </Button>
        <div className="w-px h-8 bg-white/20 self-center mx-1" />
        <Button
          variant="ghost"
          size="icon"
          className={`rounded-xl text-white hover:bg-white/20 hover:text-white ${transformMode === 'connect' ? 'bg-yellow-500/50' : ''}`}
          onClick={() => setTransformMode(prev => (prev === 'connect' ? 'translate' : 'connect'))}
          title={transformMode === 'connect' ? 'Click the floor to place a connection' : 'Add Connection'}
        >
          <Link className="h-5 w-5" />
        </Button>
      </div>

      {/* SIDEBAR (RIGHT) */}
      <div className="absolute top-20 right-4 w-72 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 z-20 text-white shadow-2xl">
        <div className="flex items-center gap-2 mb-4 text-white/90">
          <Settings className="w-5 h-5" />
          <h2 className="font-semibold text-sm tracking-wide uppercase">Scene Composer</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-white/50 mb-2 block uppercase tracking-wider">Models</label>
            <div className="flex flex-col gap-1">
              {models.map(m => (
                <button
                  key={m.id}
                  onClick={() => setActiveModelId(m.id)}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeModelId === m.id ? 'bg-blue-600 text-white' : 'hover:bg-white/10 text-white/80'}`}
                >
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 opacity-70" />
                    {m.name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {activeModel && (
            <div className="pt-4 border-t border-white/10 space-y-4">
              <div className="text-xs font-medium text-white/50 uppercase tracking-wider">Transform ({activeModel.name})</div>
              
              <div className="space-y-3">
                <div className="grid grid-cols-[40px_1fr] items-center gap-2">
                  <span className="text-xs text-white/50">Pos</span>
                  <div className="grid grid-cols-3 gap-1">
                    {['X', 'Y', 'Z'].map((axis, i) => (
                      <div key={axis} className="bg-white/5 rounded px-2 py-1 text-xs text-center border border-white/10">
                        {activeModel.position[i].toFixed(2)}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-[40px_1fr] items-center gap-2">
                  <span className="text-xs text-white/50">Rot</span>
                  <div className="grid grid-cols-3 gap-1">
                    {['X', 'Y', 'Z'].map((axis, i) => (
                      <div key={axis} className="bg-white/5 rounded px-2 py-1 text-xs text-center border border-white/10">
                        {(activeModel.rotation[i] * (180/Math.PI)).toFixed(0)}°
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {connections.length > 0 && (
            <div className="pt-4 border-t border-white/10 space-y-3">
              <div className="text-xs font-medium text-white/50 uppercase tracking-wider">Connections</div>
              <div className="space-y-2">
                {connections.map(conn => (
                   <div key={conn.id} className="flex items-center justify-between bg-white/5 p-2 rounded border border-white/10">
                     <span className="text-xs text-white/80">{models.find(m=>m.id===conn.fromModel)?.name} &rarr; {models.find(m=>m.id===conn.toModel)?.name}</span>
                     <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30" onClick={() => setConnections(prev => prev.filter(c => c.id !== conn.id))}>Del</Button>
                   </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
