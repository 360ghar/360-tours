import { useEffect, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type SkyboxStatus = 'loading' | 'ready' | 'error';

// NOTE: deliberately NOT re-exported from '@/hooks' index — importing it there
// would pull three.js into every chunk that touches the hooks barrel. Import
// directly from '@/hooks/useSkyboxRenderer' (only the lazy View3DPage does).

/**
 * Recursively dispose every geometry, material, and texture under `root`.
 * three.js does NOT GC GPU resources, so any subgraph removed from a live
 * scene (or never attached, e.g. an in-flight GLTF that resolves after
 * cleanup) must be walked explicitly to avoid GPU/heap leaks.
 */
function disposeObjectResources(root: THREE.Object3D): void {
  root.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const materials: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      }
    }
  });
}

/**
 * Renders a GLB skybox mesh (inward-facing textured cube, unlit) onto the
 * given canvas with the camera near the origin, letting the user look around
 * and move slightly within the room.
 */
export function useSkyboxRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  meshUrl: string | undefined
): SkyboxStatus {
  const [status, setStatus] = useState<SkyboxStatus>('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!meshUrl || !canvas) return;

    let disposed = false;
    let frameId = 0;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(Math.max(canvas.clientWidth, 1), Math.max(canvas.clientHeight, 1), false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      Math.max(canvas.clientWidth, 1) / Math.max(canvas.clientHeight, 1),
      0.01,
      100
    );
    // Inside the skybox cube, slightly off the OrbitControls target (origin).
    camera.position.set(0, 0, 0.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 2.5;

    // Unlit (KHR_materials_unlit) materials ignore lights; this covers any
    // non-unlit fallback meshes.
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    new GLTFLoader().load(
      meshUrl,
      gltf => {
        if (disposed) {
          // Never attached to the scene; the cleanup traversal below would
          // miss it, so dispose the freshly-parsed GLTF here to avoid
          // orphaned geometry/material/texture objects.
          disposeObjectResources(gltf.scene);
          return;
        }
        scene.add(gltf.scene);

        // Clamp dolly / far plane to the actual GLB size so navigation stays
        // inside the mesh regardless of how large or small the skybox is.
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const halfExtents = [size.x / 2, size.y / 2, size.z / 2];
        const minHalfExtent = Math.min(...halfExtents);
        const maxExtent = Math.max(size.x, size.y, size.z);
        if (
          Number.isFinite(minHalfExtent) &&
          minHalfExtent > 0 &&
          Number.isFinite(maxExtent) &&
          maxExtent > 0
        ) {
          controls.maxDistance = minHalfExtent * 0.45;
          camera.far = Math.max(100, maxExtent * 4);
          camera.updateProjectionMatrix();
        }

        setStatus('ready');
      },
      undefined,
      () => {
        if (!disposed) setStatus('error');
      }
    );

    const onResize = () => {
      const w = Math.max(canvas.clientWidth, 1);
      const h = Math.max(canvas.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', onResize);

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      disposeObjectResources(scene);
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [canvasRef, meshUrl]);

  return status;
}
