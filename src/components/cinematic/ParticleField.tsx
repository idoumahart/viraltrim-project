import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function Particles({ count = 200 }) {
  const mesh = useRef<THREE.Points>(null);

  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
      velocities[i * 3] = (Math.random() - 0.5) * 0.002;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.002;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.001;
    }
    return { positions, velocities };
  }, [count]);

  useFrame(() => {
    if (!mesh.current) return;
    const pos = mesh.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      pos[i * 3] += particles.velocities[i * 3];
      pos[i * 3 + 1] += particles.velocities[i * 3 + 1];
      pos[i * 3 + 2] += particles.velocities[i * 3 + 2];
      if (Math.abs(pos[i * 3]) > 10) particles.velocities[i * 3] *= -1;
      if (Math.abs(pos[i * 3 + 1]) > 10) particles.velocities[i * 3 + 1] *= -1;
      if (Math.abs(pos[i * 3 + 2]) > 5) particles.velocities[i * 3 + 2] *= -1;
    }
    mesh.current.geometry.attributes.position.needsUpdate = true;
    mesh.current.rotation.y += 0.0003;
  });

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles.positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#5865F2"
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

export function ParticleField() {
  return (
    <div className="absolute inset-0 w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.5} />
        <Particles count={300} />
      </Canvas>
    </div>
  );
}
