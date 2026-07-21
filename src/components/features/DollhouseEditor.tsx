import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Splat, OrbitControls, TransformControls } from '@react-three/drei';
import { Button } from '@/components/ui/Button';

// Mock data structure until backend schema is ready
interface RoomSplat {
  id: string;
  name: string;
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
}

interface DollhouseEditorProps {
  rooms: RoomSplat[];
  onSave: (layouts: any) => void;
}

export const DollhouseEditor: React.FC<DollhouseEditorProps> = ({ rooms: initialRooms, onSave }) => {
  const [rooms, setRooms] = useState<RoomSplat[]>(initialRooms);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const handleSave = () => {
    onSave(rooms.map(r => ({
      id: r.id,
      position: r.position,
      rotation: r.rotation
    })));
  };

  return (
    <div className="w-full h-[600px] flex flex-col border border-border rounded-lg overflow-hidden bg-background">
      {/* Editor Toolbar */}
      <div className="flex items-center justify-between p-4 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">Dollhouse Editor</span>
          <span className="text-xs text-muted-foreground ml-2">
            Select a room below to move/rotate it
          </span>
        </div>
        <Button onClick={handleSave} size="sm">Save Layout</Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-card border-r border-border overflow-y-auto p-4 flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Rooms</h3>
          {rooms.map(room => (
            <button
              key={room.id}
              onClick={() => setActiveRoomId(room.id)}
              className={`text-left px-3 py-2 text-sm rounded-md transition-colors ${
                activeRoomId === room.id 
                  ? 'bg-primary text-primary-foreground font-medium' 
                  : 'hover:bg-accent'
              }`}
            >
              {room.name}
            </button>
          ))}
        </div>

        {/* 3D Viewport */}
        <div className="flex-1 relative bg-black">
          <Canvas camera={{ position: [0, 5, 10], fov: 60 }}>
            <color attach="background" args={['#111']} />
            
            {rooms.map(room => {
              const isSelected = activeRoomId === room.id;
              
              return (
                <group 
                  key={room.id} 
                  position={room.position} 
                  rotation={room.rotation}
                >
                  {isSelected ? (
                    <TransformControls mode="translate">
                      <Splat src={room.url} />
                    </TransformControls>
                  ) : (
                    <Splat src={room.url} />
                  )}
                </group>
              );
            })}
            
            <OrbitControls makeDefault />
            
            {/* Grid for reference */}
            <gridHelper args={[20, 20, '#444', '#222']} position={[0, -1, 0]} />
            <axesHelper args={[5]} />
          </Canvas>
        </div>
      </div>
    </div>
  );
};
