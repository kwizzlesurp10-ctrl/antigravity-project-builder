'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ORBITAL_MODULES, OrbitalModule } from '@/lib/modules-catalog';
import { useOrbitalStore } from '@/store/useOrbitalStore';
import {
  RotateCcw,
  Sparkles,
  Maximize2,
  Compass,
  Zap,
  Info,
} from 'lucide-react';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface CelestialBody {
  module: OrbitalModule;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  targetRadius: number;
  currentRadius: number;
  angle: number;
  speed: number;
  elevation: number;
  mass: number;
  screenX: number;
  screenY: number;
  screenRadius: number;
  trail: Array<{ x: number; y: number; z: number; alpha: number }>;
}

interface OrbitalPhysicsCanvasProps {
  customModules?: OrbitalModule[];
  className?: string;
}

const G_CONST = 1200;
const INNER_ORBIT = 155;
const OUTER_ORBIT = 275;
const FOV = 600;

export function OrbitalPhysicsCanvas({
  customModules = [],
  className = '',
}: OrbitalPhysicsCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    dockedIds,
    setDockedIds,
    selectedModuleId,
    setSelectedModuleId,
    kesslerMode,
    setKesslerMode,
  } = useOrbitalStore();

  const toggleModuleDock = useCallback((id: string) => {
    if (dockedIds.includes(id)) {
      setDockedIds(dockedIds.filter((d) => d !== id));
    } else {
      setDockedIds([...dockedIds, id]);
    }
  }, [dockedIds, setDockedIds]);

  const triggerKesslerSyndrome = useCallback(() => {
    setKesslerMode((prev) => !prev);
  }, [setKesslerMode]);

  const allModules = useMemo(() => {
    const combined = [...ORBITAL_MODULES];
    for (const cm of customModules) {
      if (!combined.some((m) => m.id === cm.id)) {
        combined.push(cm);
      }
    }
    return combined;
  }, [customModules]);

  // Camera state
  const cameraRef = useRef({
    rotX: 0.35,
    rotY: 0,
    zoom: 1,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
    autoRotate: true,
  });

  const [hoveredBody, setHoveredBody] = useState<CelestialBody | null>(null);
  const [viewPreset, setViewPreset] = useState<'perspective' | 'top' | 'edge'>('perspective');
  const [simulationSpeed, setSimulationSpeed] = useState<number>(1);

  const bodiesRef = useRef<CelestialBody[]>([]);
  const stardustRef = useRef<Particle[]>([]);
  const jetsRef = useRef<Particle[]>([]);
  const animationFrameId = useRef<number | null>(null);

  // Initialize celestial bodies
  useEffect(() => {
    const bodies: CelestialBody[] = allModules.map((mod, idx) => {
      const isDocked = dockedIds.includes(mod.id);
      const angle = (idx / allModules.length) * Math.PI * 2;
      const targetRadius = isDocked ? INNER_ORBIT : OUTER_ORBIT;
      const elevation = ((idx % 3) - 1) * 22; // slight 3D inclination
      const speed = Math.sqrt(G_CONST / targetRadius) * 0.0028 * (isDocked ? 1.3 : 0.85);

      return {
        module: mod,
        x: Math.cos(angle) * targetRadius,
        y: elevation,
        z: Math.sin(angle) * targetRadius,
        vx: -Math.sin(angle) * speed * 40,
        vy: 0,
        vz: Math.cos(angle) * speed * 40,
        targetRadius,
        currentRadius: targetRadius,
        angle,
        speed,
        elevation,
        mass: mod.mass || 10,
        screenX: 0,
        screenY: 0,
        screenRadius: 10,
        trail: [],
      };
    });

    bodiesRef.current = bodies;

    // Background stardust
    const particles: Particle[] = [];
    for (let i = 0; i < 220; i++) {
      const r = 80 + Math.random() * 420;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.7;
      particles.push({
        x: r * Math.cos(theta) * Math.cos(phi),
        y: r * Math.sin(phi) * 0.45,
        z: r * Math.sin(theta) * Math.cos(phi),
        vx: 0,
        vy: 0,
        vz: 0,
        size: Math.random() * 1.6 + 0.4,
        color: Math.random() > 0.4 ? '#22d3ee' : '#a855f7',
        alpha: Math.random() * 0.6 + 0.2,
        life: 0,
        maxLife: 100,
      });
    }
    stardustRef.current = particles;

    // Relativistic jets
    const jets: Particle[] = [];
    for (let j = 0; j < 60; j++) {
      jets.push({
        x: (Math.random() - 0.5) * 8,
        y: (Math.random() - 0.5) * 220,
        z: (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 3),
        vz: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2 + 1,
        color: '#38bdf8',
        alpha: Math.random() * 0.8,
        life: 0,
        maxLife: 80,
      });
    }
    jetsRef.current = jets;
  }, [allModules]);

  // Sync docked state target radii
  useEffect(() => {
    bodiesRef.current.forEach((body) => {
      const isDocked = dockedIds.includes(body.module.id);
      body.targetRadius = isDocked ? INNER_ORBIT : OUTER_ORBIT;
      body.speed = Math.sqrt(G_CONST / body.targetRadius) * 0.0028 * (isDocked ? 1.3 : 0.85);
    });
  }, [dockedIds]);

  // View preset handler
  const setPreset = useCallback((preset: 'perspective' | 'top' | 'edge') => {
    setViewPreset(preset);
    const cam = cameraRef.current;
    if (preset === 'top') {
      cam.rotX = Math.PI / 2 - 0.05;
      cam.rotY = 0;
      cam.zoom = 1;
    } else if (preset === 'edge') {
      cam.rotX = 0.02;
      cam.rotY = 0;
      cam.zoom = 1.1;
    } else {
      cam.rotX = 0.35;
      cam.rotY = 0;
      cam.zoom = 1;
    }
  }, []);

  // Main render & physics loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1) * simulationSpeed;
      lastTime = now;

      // Handle canvas resize
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      const width = rect.width;
      const height = rect.height;
      const cx = width / 2;
      const cy = height / 2;

      // Clear with deep cosmic black
      ctx.fillStyle = '#060814';
      ctx.fillRect(0, 0, width, height);

      const cam = cameraRef.current;
      if (cam.autoRotate && !cam.isDragging) {
        cam.rotY += 0.0035 * simulationSpeed;
      }

      const cosY = Math.cos(cam.rotY);
      const sinY = Math.sin(cam.rotY);
      const cosX = Math.cos(cam.rotX);
      const sinX = Math.sin(cam.rotX);

      // 3D projection helper
      const project = (x: number, y: number, z: number) => {
        // Rotate Y
        const x1 = x * cosY - z * sinY;
        const z1 = z * cosY + x * sinY;
        // Rotate X
        const y2 = y * cosX - z1 * sinX;
        const z2 = z1 * cosX + y * sinX;

        const effectiveFov = FOV * cam.zoom;
        const scale = effectiveFov / (effectiveFov + z2 + 350);
        return {
          sx: cx + x1 * scale,
          sy: cy + y2 * scale,
          scale: Math.max(scale, 0.05),
          depth: z2,
        };
      };

      // 1. Draw background stardust
      for (const p of stardustRef.current) {
        const prj = project(p.x, p.y, p.z);
        if (prj.depth > -340) {
          ctx.beginPath();
          ctx.arc(prj.sx, prj.sy, Math.max(0.6, p.size * prj.scale), 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha * Math.min(1, prj.scale * 1.5);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1.0;

      // 2. Relativistic polar jets
      for (const jet of jetsRef.current) {
        jet.y += jet.vy * simulationSpeed;
        if (Math.abs(jet.y) > 230) {
          jet.y = (Math.random() - 0.5) * 20;
          jet.vy = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 3);
        }
        const prj = project(jet.x, jet.y, jet.z);
        ctx.beginPath();
        ctx.arc(prj.sx, prj.sy, jet.size * prj.scale, 0, Math.PI * 2);
        ctx.fillStyle = kesslerMode ? '#fb7185' : '#38bdf8';
        ctx.globalAlpha = Math.max(0, 0.7 - Math.abs(jet.y) / 240);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // 3. Central Singularity Accretion Rings (Inner & Outer Orbital Belts)
      const drawOrbitRing = (radius: number, color: string, dashes: number[], alpha: number) => {
        ctx.beginPath();
        const segments = 64;
        let first = true;
        for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * Math.PI * 2;
          const px = Math.cos(theta) * radius;
          const pz = Math.sin(theta) * radius;
          const prj = project(px, 0, pz);
          if (first) {
            ctx.moveTo(prj.sx, prj.sy);
            first = false;
          } else {
            ctx.lineTo(prj.sx, prj.sy);
          }
        }
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1.2;
        ctx.setLineDash(dashes);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;
      };

      drawOrbitRing(INNER_ORBIT, kesslerMode ? '#f43f5e' : '#22d3ee', [6, 6], 0.38);
      drawOrbitRing(OUTER_ORBIT, '#64748b', [3, 8], 0.22);

      // 4. Central Singularity Core (Black Hole & Photon Sphere Glow)
      const corePrj = project(0, 0, 0);
      const coreRadius = (kesslerMode ? 36 : 28) * corePrj.scale;

      // Accretion Glow
      const glowGrad = ctx.createRadialGradient(
        corePrj.sx,
        corePrj.sy,
        coreRadius * 0.5,
        corePrj.sx,
        corePrj.sy,
        coreRadius * 3.5
      );
      glowGrad.addColorStop(0, kesslerMode ? 'rgba(244,63,94,0.7)' : 'rgba(34,211,238,0.6)');
      glowGrad.addColorStop(0.5, kesslerMode ? 'rgba(225,29,72,0.2)' : 'rgba(56,189,248,0.18)');
      glowGrad.addColorStop(1, 'rgba(6,8,20,0)');

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(corePrj.sx, corePrj.sy, coreRadius * 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Black Hole Event Horizon
      ctx.beginPath();
      ctx.arc(corePrj.sx, corePrj.sy, coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#02040a';
      ctx.fill();
      ctx.strokeStyle = kesslerMode ? '#fb7185' : '#38bdf8';
      ctx.lineWidth = 2 * corePrj.scale;
      ctx.stroke();

      // 5. Update & Draw Celestial Bodies (Modules)
      const sortedBodies = [...bodiesRef.current].sort((a, b) => {
        // Sort back-to-front depth
        const pa = project(a.x, a.y, a.z);
        const pb = project(b.x, b.y, b.z);
        return pb.depth - pa.depth;
      });

      for (const body of sortedBodies) {
        // Orbital mechanics
        if (kesslerMode) {
          // Repulsive anti-gravity explosion
          const dist = Math.sqrt(body.x * body.x + body.z * body.z) || 1;
          body.x += (body.x / dist) * 180 * dt;
          body.z += (body.z / dist) * 180 * dt;
          body.y += (Math.random() - 0.5) * 60 * dt;
        } else {
          // Smooth radial easing toward target orbit
          body.currentRadius += (body.targetRadius - body.currentRadius) * 2.5 * dt;
          body.angle += body.speed * (simulationSpeed * 60) * dt;

          body.x = Math.cos(body.angle) * body.currentRadius;
          body.z = Math.sin(body.angle) * body.currentRadius;
          body.y = body.elevation * Math.sin(body.angle * 2);
        }

        // Record trailing stardust wake
        body.trail.push({ x: body.x, y: body.y, z: body.z, alpha: 0.8 });
        if (body.trail.length > 20) {
          body.trail.shift();
        }

        // Project position
        const prj = project(body.x, body.y, body.z);
        body.screenX = prj.sx;
        body.screenY = prj.sy;
        const isDocked = dockedIds.includes(body.module.id);
        const isSelected = selectedModuleId === body.module.id;
        const baseRadius = (isDocked ? 12 : 9) + (isSelected ? 3 : 0);
        body.screenRadius = Math.max(5, baseRadius * prj.scale);

        // Draw stardust tail
        if (body.trail.length > 1) {
          ctx.beginPath();
          for (let t = 0; t < body.trail.length; t++) {
            const tp = project(body.trail[t].x, body.trail[t].y, body.trail[t].z);
            if (t === 0) ctx.moveTo(tp.sx, tp.sy);
            else ctx.lineTo(tp.sx, tp.sy);
          }
          ctx.strokeStyle = body.module.color;
          ctx.lineWidth = (isDocked ? 2.5 : 1.2) * prj.scale;
          ctx.globalAlpha = 0.35 * prj.scale;
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }

        // Gravitational tether line to Singularity Core
        ctx.beginPath();
        ctx.moveTo(corePrj.sx, corePrj.sy);
        ctx.lineTo(prj.sx, prj.sy);
        ctx.strokeStyle = isDocked ? body.module.color : '#334155';
        ctx.lineWidth = (isDocked ? 1.5 : 0.6) * prj.scale;
        ctx.globalAlpha = (isDocked ? 0.65 : 0.18) * prj.scale;
        ctx.setLineDash(isDocked ? [] : [3, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;

        // Celestial Body Orb
        const nodeGlow = ctx.createRadialGradient(
          prj.sx,
          prj.sy,
          body.screenRadius * 0.2,
          prj.sx,
          prj.sy,
          body.screenRadius * 2.2
        );
        nodeGlow.addColorStop(0, body.module.color);
        nodeGlow.addColorStop(0.5, body.module.color + '66');
        nodeGlow.addColorStop(1, 'transparent');

        ctx.fillStyle = nodeGlow;
        ctx.beginPath();
        ctx.arc(prj.sx, prj.sy, body.screenRadius * 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(prj.sx, prj.sy, body.screenRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#090d1f';
        ctx.fill();
        ctx.strokeStyle = body.module.color;
        ctx.lineWidth = (isSelected ? 3 : 1.8) * prj.scale;
        ctx.stroke();

        // Label
        ctx.font = `${Math.max(9, Math.round(11 * prj.scale))}px ui-sans-serif, system-ui`;
        ctx.fillStyle = isDocked ? '#ffffff' : '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText(body.module.name, prj.sx, prj.sy + body.screenRadius + 14 * prj.scale);
      }

      ctx.restore();
      animationFrameId.current = requestAnimationFrame(render);
    };

    animationFrameId.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [dockedIds, selectedModuleId, kesslerMode, simulationSpeed]);

  // Mouse interaction handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    cameraRef.current.isDragging = true;
    cameraRef.current.lastMouseX = e.clientX;
    cameraRef.current.lastMouseY = e.clientY;
    cameraRef.current.autoRotate = false;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (cameraRef.current.isDragging) {
      const dx = e.clientX - cameraRef.current.lastMouseX;
      const dy = e.clientY - cameraRef.current.lastMouseY;
      cameraRef.current.rotY += dx * 0.007;
      cameraRef.current.rotX = Math.max(
        -Math.PI / 2 + 0.1,
        Math.min(Math.PI / 2 - 0.1, cameraRef.current.rotX + dy * 0.007)
      );
      cameraRef.current.lastMouseX = e.clientX;
      cameraRef.current.lastMouseY = e.clientY;
    }

    // Raycast hover detection
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let hit: CelestialBody | null = null;
    for (const b of bodiesRef.current) {
      const dist = Math.hypot(b.screenX - mouseX, b.screenY - mouseY);
      if (dist <= b.screenRadius + 6) {
        hit = b;
        break;
      }
    }
    setHoveredBody(hit);
  };

  const handleMouseUp = () => {
    cameraRef.current.isDragging = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check central singularity click
    const corePrjX = rect.width / 2;
    const corePrjY = rect.height / 2;
    if (Math.hypot(corePrjX - mouseX, corePrjY - mouseY) < 36) {
      triggerKesslerSyndrome();
      return;
    }

    // Check module nodes
    for (const b of bodiesRef.current) {
      const dist = Math.hypot(b.screenX - mouseX, b.screenY - mouseY);
      if (dist <= b.screenRadius + 8) {
        setSelectedModuleId(b.module.id);
        toggleModuleDock(b.module.id);
        break;
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[620px] rounded-3xl overflow-hidden border border-cyan-500/20 bg-[#060814] shadow-2xl ${className}`}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* Floating HUD Controls */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-slate-950/80 px-3 py-1.5 backdrop-blur-md text-xs text-cyan-300 font-mono">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>N-BODY ORBITAL ENGINE</span>
          <span className="text-slate-400">•</span>
          <span className="text-emerald-400">{dockedIds.length} DOCKED</span>
        </div>

        <button
          onClick={() => {
            cameraRef.current.autoRotate = !cameraRef.current.autoRotate;
          }}
          className="rounded-full border border-slate-700 bg-slate-950/80 p-2 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50 backdrop-blur-md transition-all"
          title="Toggle Auto-Rotation"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={triggerKesslerSyndrome}
          className={`rounded-full border p-2 backdrop-blur-md transition-all ${
            kesslerMode
              ? 'border-rose-500 bg-rose-950/80 text-rose-300'
              : 'border-slate-700 bg-slate-950/80 text-slate-300 hover:border-rose-500/50 hover:text-rose-400'
          }`}
          title="Trigger Kessler Syndrome Supernova"
        >
          <Zap className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Camera Presets & Speed Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-slate-950/85 border border-slate-800 rounded-xl p-1 backdrop-blur-md text-xs font-mono">
        <button
          onClick={() => setPreset('perspective')}
          className={`px-2.5 py-1 rounded-lg transition-all ${
            viewPreset === 'perspective'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          3D Angle
        </button>
        <button
          onClick={() => setPreset('top')}
          className={`px-2.5 py-1 rounded-lg transition-all ${
            viewPreset === 'top'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Polar Top
        </button>
        <button
          onClick={() => setPreset('edge')}
          className={`px-2.5 py-1 rounded-lg transition-all ${
            viewPreset === 'edge'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Equator Edge
        </button>
      </div>

      {/* Speed Slider in Bottom Left */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 bg-slate-950/80 border border-slate-800/80 rounded-xl px-3 py-1.5 backdrop-blur-md text-xs font-mono text-slate-400">
        <Compass className="w-3.5 h-3.5 text-cyan-400" />
        <span>WARP:</span>
        {[0.5, 1, 2].map((spd) => (
          <button
            key={spd}
            onClick={() => setSimulationSpeed(spd)}
            className={`px-1.5 py-0.5 rounded ${
              simulationSpeed === spd
                ? 'bg-cyan-500/30 text-cyan-200 font-bold'
                : 'hover:text-slate-200'
            }`}
          >
            {spd}x
          </button>
        ))}
      </div>

      {/* Hovered Celestial Body Tooltip */}
      {hoveredBody && (
        <div
          className="absolute z-30 pointer-events-none rounded-xl border border-cyan-500/40 bg-slate-950/90 p-3 shadow-2xl backdrop-blur-xl text-xs max-w-xs transition-all"
          style={{
            left: Math.min(Math.max(hoveredBody.screenX + 16, 12), 400),
            top: Math.min(Math.max(hoveredBody.screenY - 24, 12), 520),
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: hoveredBody.module.color }}
            />
            <span className="font-bold text-slate-100">{hoveredBody.module.name}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">
            {hoveredBody.module.subtitle}
          </p>
          <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-1.5 text-[10px] font-mono">
            <span className="text-slate-400">
              STATUS:{' '}
              <strong
                className={
                  dockedIds.includes(hoveredBody.module.id)
                    ? 'text-cyan-400'
                    : 'text-slate-400'
                }
              >
                {dockedIds.includes(hoveredBody.module.id) ? 'DOCKED' : 'ORBITING'}
              </strong>
            </span>
            <span className="text-emerald-400">{hoveredBody.module.mass}u MASS</span>
          </div>
        </div>
      )}

      {/* Instructions footer */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-slate-950/70 border border-slate-900 rounded-lg px-2.5 py-1">
        <Info className="w-3 h-3 text-cyan-400" />
        <span>Click body to Dock/Undock • Drag to rotate camera</span>
      </div>
    </div>
  );
}
