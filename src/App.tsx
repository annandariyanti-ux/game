/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Heart, Zap, Play, RotateCcw, Crosshair, Target, Shield, Skull, Map, Waves, Trees } from 'lucide-react';

// --- Constants ---
const TILE_SIZE = 40;
const GRID_WIDTH = 20;
const GRID_HEIGHT = 15;
const CANVAS_WIDTH = GRID_WIDTH * TILE_SIZE;
const CANVAS_HEIGHT = GRID_HEIGHT * TILE_SIZE;

type EntityType = 'player' | 'gem' | 'obstacle' | 'enemy' | 'projectile' | 'particle';
type LevelTheme = 'jungle' | 'road' | 'sea';

interface Entity {
  id: string;
  x: number;
  y: number;
  type: EntityType | 'powerup';
  color: string;
  health?: number;
  maxHealth?: number;
  vx?: number;
  vy?: number;
  life?: number;
  size?: number;
  rotation?: number;
  lastShot?: number;
}

interface GameState {
  player: { x: number; y: number; health: number; score: number; lastShot: number; lastKnife: number; isMoving: boolean };
  projectiles: Entity[];
  enemies: Entity[];
  obstacles: Entity[];
  particles: Entity[];
  powerups: Entity[];
  isGameOver: boolean;
  isPaused: boolean;
  level: number;
  enemiesKilled: number;
  totalEnemies: number;
  theme: LevelTheme;
}

const INITIAL_STATE: GameState = {
  player: { x: 2, y: 2, health: 100, score: 0, lastShot: 0, lastKnife: 0, isMoving: false },
  projectiles: [],
  enemies: [],
  obstacles: [],
  particles: [],
  powerups: [],
  isGameOver: false,
  isPaused: true,
  level: 1,
  enemiesKilled: 0,
  totalEnemies: 0,
  theme: 'jungle',
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const [screenShake, setScreenShake] = useState(0);
  const [flash, setFlash] = useState(0);
  const requestRef = useRef<number>(null);
  const keysPressed = useRef<Set<string>>(new Set());
  const mousePos = useRef({ x: 0, y: 0 });

  // --- Level Generation ---
  const generateLevel = useCallback((level: number) => {
    const obstacles: Entity[] = [];
    const enemies: Entity[] = [];
    
    // Determine theme
    const themes: LevelTheme[] = ['jungle', 'road', 'sea'];
    const theme = themes[(level - 1) % 3];

    // Procedural obstacles
    const obstacleColor = theme === 'jungle' ? '#064e3b' : theme === 'road' ? '#4b5563' : '#1e3a8a';
    for (let i = 0; i < 12 + level * 2; i++) {
      const ox = Math.floor(Math.random() * (GRID_WIDTH - 2)) + 1;
      const oy = Math.floor(Math.random() * (GRID_HEIGHT - 2)) + 1;
      if (Math.abs(ox - 2) > 2 || Math.abs(oy - 2) > 2) {
        obstacles.push({
          id: `obs-${i}`,
          x: ox,
          y: oy,
          type: 'obstacle',
          color: obstacleColor,
        });
      }
    }

    // Enemies
    const numEnemies = 4 + level * 2;
    const isBossLevel = level % 5 === 0;
    
    if (isBossLevel) {
      enemies.push({
        id: `boss-${level}-${Date.now()}`,
        x: GRID_WIDTH - 5,
        y: GRID_HEIGHT / 2,
        type: 'enemy',
        color: '#7c3aed', // Purple boss
        health: 500 + level * 50,
        maxHealth: 500 + level * 50,
        vx: 0,
        vy: 0,
        size: 2.5, // Larger size
      });
    }

    for (let i = 0; i < (isBossLevel ? numEnemies / 2 : numEnemies); i++) {
      enemies.push({
        id: `enemy-${i}-${Date.now()}`,
        x: Math.floor(Math.random() * (GRID_WIDTH - 10)) + 8,
        y: Math.floor(Math.random() * (GRID_HEIGHT - 10)) + 8,
        type: 'enemy',
        color: '#ef4444',
        health: 60 + level * 15,
        maxHealth: 60 + level * 15,
        vx: (Math.random() - 0.5) * 0.03,
        vy: (Math.random() - 0.5) * 0.03,
      });
    }

    setGameState(prev => ({
      ...prev,
      obstacles,
      enemies,
      projectiles: [],
      particles: [],
      powerups: [],
      isGameOver: false,
      isPaused: false,
      level,
      enemiesKilled: 0,
      totalEnemies: numEnemies,
      theme,
    }));
  }, []);

  const startGame = () => {
    generateLevel(1);
    setGameState(prev => ({ 
      ...prev, 
      player: { ...INITIAL_STATE.player }, 
      score: 0,
      isPaused: false 
    }));
  };

  // --- Input Handling ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keysPressed.current.add(e.code);
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.code);
    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mousePos.current = {
        x: (e.clientX - rect.left) / TILE_SIZE,
        y: (e.clientY - rect.top) / TILE_SIZE,
      };
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const createParticles = (x: number, y: number, color: string, count: number) => {
    const newParticles: Entity[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: `p-${Math.random()}`,
        x,
        y,
        type: 'particle',
        color,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        life: 1.0,
        size: Math.random() * 4 + 2,
      });
    }
    return newParticles;
  };

  // --- Game Loop ---
  const update = useCallback((time: number) => {
    setGameState(prev => {
      if (prev.isPaused || prev.isGameOver) return prev;

      let { x, y, health, score, lastShot, lastKnife } = prev.player;
      const moveSpeed = 0.12;
      let dx = 0;
      let dy = 0;

      if (keysPressed.current.has('ArrowUp') || keysPressed.current.has('KeyW')) dy -= moveSpeed;
      if (keysPressed.current.has('ArrowDown') || keysPressed.current.has('KeyS')) dy += moveSpeed;
      if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('KeyA')) dx -= moveSpeed;
      if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('KeyD')) dx += moveSpeed;

      const isMoving = dx !== 0 || dy !== 0;
      if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

      const nextX = x + dx;
      const nextY = y + dy;
      const boundedX = Math.max(0.5, Math.min(GRID_WIDTH - 1.5, nextX));
      const boundedY = Math.max(0.5, Math.min(GRID_HEIGHT - 1.5, nextY));

      const isColliding = prev.obstacles.some(obs => 
        Math.abs(boundedX - obs.x) < 0.7 && Math.abs(boundedY - obs.y) < 0.7
      );

      const finalX = isColliding ? x : boundedX;
      const finalY = isColliding ? y : boundedY;

      // Shooting
      let newProjectiles = [...prev.projectiles];
      const now = Date.now();
      
      // Gun Fire
      if ((keysPressed.current.has('Space') || keysPressed.current.has('Click')) && now - lastShot > 180) {
        const angle = Math.atan2(mousePos.current.y - finalY, mousePos.current.x - finalX);
        newProjectiles.push({
          id: `proj-${now}`,
          x: finalX,
          y: finalY,
          type: 'projectile',
          color: '#fbbf24', // Tracer color
          vx: Math.cos(angle) * 0.4,
          vy: Math.sin(angle) * 0.4,
        });
        lastShot = now;
        setScreenShake(3);
      }

      // Knife Attack (Right Click or E)
      let knifeHit = false;
      if ((keysPressed.current.has('KeyE') || keysPressed.current.has('ContextMenu')) && now - lastKnife > 500) {
        lastKnife = now;
        setScreenShake(5);
        knifeHit = true;
      }

      // Update Projectiles
      newProjectiles = newProjectiles.map(p => ({
        ...p,
        x: p.x + (p.vx || 0),
        y: p.y + (p.vy || 0),
      })).filter(p => p.x > 0 && p.x < GRID_WIDTH && p.y > 0 && p.y < GRID_HEIGHT);

      // Update Enemies & Enemy Shooting
      let newEnemies = prev.enemies.map(enemy => {
        const distToPlayer = Math.sqrt((finalX - enemy.x)**2 + (finalY - enemy.y)**2);
        
        // Knife collision
        if (knifeHit && distToPlayer < 1.5) {
          const angleToEnemy = Math.atan2(enemy.y - finalY, enemy.x - finalX);
          const playerAngle = Math.atan2(mousePos.current.y - finalY, mousePos.current.x - finalX);
          const angleDiff = Math.abs(angleToEnemy - playerAngle);
          
          if (angleDiff < 1.0 || angleDiff > Math.PI * 2 - 1.0) {
            enemy.health = (enemy.health || 0) - 100; // Instant kill or heavy damage
            newParticles.push(...createParticles(enemy.x, enemy.y, '#ef4444', 20));
          }
        }

        let evx = enemy.vx || 0;
        let evy = enemy.vy || 0;
        let enemyLastShot = enemy.lastShot || 0;

        if (distToPlayer < 10) {
          const speedMult = enemy.size ? 0.0005 : 0.0015;
          evx += (finalX - enemy.x) * speedMult;
          evy += (finalY - enemy.y) * speedMult;

          // Enemy shooting back
          const fireRate = enemy.size ? 800 : 2000;
          if (now - enemyLastShot > fireRate && Math.random() < 0.02) {
            const angle = Math.atan2(finalY - enemy.y, finalX - enemy.x);
            const bulletCount = enemy.size ? 3 : 1;
            
            for (let b = 0; b < bulletCount; b++) {
              const spread = (b - (bulletCount-1)/2) * 0.2;
              newProjectiles.push({
                id: `enemy-proj-${now}-${Math.random()}`,
                x: enemy.x,
                y: enemy.y,
                type: 'projectile',
                color: '#ef4444', // Red tracers for enemies
                vx: Math.cos(angle + spread) * 0.2,
                vy: Math.sin(angle + spread) * 0.2,
              });
            }
            enemyLastShot = now;
          }
        }

        evx *= 0.97;
        evy *= 0.97;

        return {
          ...enemy,
          x: enemy.x + evx,
          y: enemy.y + evy,
          vx: evx,
          vy: evy,
          lastShot: enemyLastShot,
        };
      });

      // Update Powerups
      let newPowerups = prev.powerups.filter(p => {
        const dist = Math.sqrt((finalX - p.x)**2 + (finalY - p.y)**2);
        if (dist < 0.8) {
          health = Math.min(100, health + 30);
          score += 50;
          return false;
        }
        return true;
      });

      // Update Particles
      let newParticles = prev.particles.map(p => ({
        ...p,
        x: p.x + (p.vx || 0),
        y: p.y + (p.vy || 0),
        life: (p.life || 0) - 0.02,
      })).filter(p => (p.life || 0) > 0);

      // Collision: Projectile vs Enemy/Player
      let enemiesKilled = prev.enemiesKilled;
      newProjectiles = newProjectiles.filter(p => {
        let hit = false;
        
        // If it's an enemy projectile, check against player
        if (p.color === '#ef4444') {
          const distToPlayer = Math.sqrt((p.x - finalX)**2 + (p.y - finalY)**2);
          if (distToPlayer < 0.6) {
            health -= 10;
            setScreenShake(4);
            setFlash(0.3);
            return false;
          }
        } else {
          // Player projectile vs enemies
          newEnemies = newEnemies.map(enemy => {
            const dist = Math.sqrt((p.x - enemy.x)**2 + (p.y - enemy.y)**2);
            if (dist < 0.6) {
              hit = true;
              const newHealth = (enemy.health || 0) - 25;
              if (newHealth <= 0) {
                newParticles.push(...createParticles(enemy.x, enemy.y, '#ef4444', 12));
                enemiesKilled++;
                score += 100;
                // Chance for powerup
                if (Math.random() < 0.2) {
                  newPowerups.push({
                    id: `pw-${Date.now()}`,
                    x: enemy.x,
                    y: enemy.y,
                    type: 'powerup',
                    color: '#22c55e',
                  });
                }
                return null as any;
              }
              newParticles.push(...createParticles(p.x, p.y, '#fbbf24', 4));
              return { ...enemy, health: newHealth };
            }
            return enemy;
          }).filter(Boolean);
        }
        return !hit;
      });

      // Collision: Enemy vs Player
      newEnemies.forEach(enemy => {
        const dist = Math.sqrt((finalX - enemy.x)**2 + (finalY - enemy.y)**2);
        if (dist < 0.7) {
          health -= 0.8;
          setScreenShake(5);
          setFlash(0.4);
        }
      });

      // Level Clear?
      if (newEnemies.length === 0 && prev.totalEnemies > 0) {
        setTimeout(() => generateLevel(prev.level + 1), 1200);
        return { ...prev, isPaused: true, enemies: [] };
      }

      if (health <= 0) return { ...prev, isGameOver: true, player: { ...prev.player, health: 0 } };

      return {
        ...prev,
        player: { ...prev.player, x: finalX, y: finalY, health, score, lastShot, lastKnife, isMoving },
        projectiles: newProjectiles,
        enemies: newEnemies.filter(e => e && (e.health || 0) > 0),
        particles: newParticles,
        powerups: newPowerups,
        enemiesKilled: enemiesKilled + (prev.enemies.length - newEnemies.filter(e => e && (e.health || 0) > 0).length),
      };
    });

    if (screenShake > 0) setScreenShake(s => Math.max(0, s - 0.5));
    if (flash > 0) setFlash(f => Math.max(0, f - 0.05));
    requestRef.current = requestAnimationFrame(update);
  }, [generateLevel, flash, screenShake]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [update]);

  // --- Rendering Helpers ---
  const drawCharacter = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, isMoving: boolean, color: string, isPlayer: boolean, lastActionTime: number = 0, size: number = 1, lastShotTime: number = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.rotate(angle);

    const now = Date.now();
    const isPlayerKnifing = isPlayer && now - lastActionTime < 200;
    const isFiring = now - lastShotTime < 50;

    // Walking animation bob
    const bob = isMoving ? Math.sin(now * 0.015) * 3 : 0;
    const legSwing = isMoving ? Math.sin(now * 0.015) * 8 : 0;
    
    // Legs
    ctx.fillStyle = isPlayer ? '#1a2e05' : '#450a0a'; // Camo or dark red pants
    ctx.fillRect(-8, 6 + bob + legSwing, 6, 8);
    ctx.fillRect(2, 6 + bob - legSwing, 6, 8);

    // Arms
    ctx.fillStyle = '#d4a373'; // Skin tone
    ctx.fillRect(-16, -4 + bob, 6, 12); // Left arm
    ctx.fillRect(10, -4 + bob, 6, 12);  // Right arm

    // Body (Torso)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-14, -10 + bob, 28, 20, 6);
    ctx.fill();

    // Head
    ctx.fillStyle = '#d4a373'; // Skin tone
    ctx.beginPath();
    ctx.arc(0, bob, 10, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(4, bob - 3, 2, 0, Math.PI * 2);
    ctx.arc(4, bob + 3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(5, bob - 3, 1, 0, Math.PI * 2);
    ctx.arc(5, bob + 3, 1, 0, Math.PI * 2);
    ctx.fill();

    // Hair / Headband
    if (isPlayer) {
      ctx.fillStyle = '#271709'; // Dark hair
      ctx.beginPath();
      ctx.arc(0, bob, 10, Math.PI, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ef4444'; // Red headband
      ctx.fillRect(-10, -4 + bob, 20, 4);
      
      // Headband tails
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -2 + bob);
      ctx.lineTo(-20, 2 + bob + Math.sin(now * 0.01) * 4);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#111'; // Enemy helmet/hair
      ctx.beginPath();
      ctx.arc(0, bob, 10, Math.PI, Math.PI * 2);
      ctx.fill();
    }

    // Weapon
    if (isPlayerKnifing) {
      ctx.fillStyle = '#94a3b8'; // Steel
      ctx.fillRect(10, -2 + bob, 18, 4); // Knife blade
      ctx.fillStyle = '#451a03'; // Handle
      ctx.fillRect(8, -2 + bob, 4, 4);
    } else {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(12, 4 + bob, 20, 6); // Rifle
      if (isFiring) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(34, 7 + bob, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(8, -6 + bob, 2.5, 0, Math.PI * 2);
    ctx.arc(8, 6 + bob, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(9, -6 + bob, 1, 0, Math.PI * 2);
    ctx.arc(9, 6 + bob, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // --- Rendering ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.save();
    if (screenShake > 0) ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);

    // Background based on theme
    const bgColors = { jungle: '#064e3b', road: '#1f2937', sea: '#1e3a8a' };
    const floorColors = { jungle: '#065f46', road: '#374151', sea: '#1d4ed8' };
    
    ctx.fillStyle = bgColors[gameState.theme];
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Floor texture
    ctx.fillStyle = floorColors[gameState.theme];
    for (let i = 0; i < 100; i++) {
        const tx = (Math.sin(i * 1234.5) * 0.5 + 0.5) * CANVAS_WIDTH;
        const ty = (Math.cos(i * 5432.1) * 0.5 + 0.5) * CANVAS_HEIGHT;
        ctx.globalAlpha = 0.15;
        
        if (gameState.theme === 'jungle') {
          ctx.beginPath();
          ctx.arc(tx, ty, Math.random() * 20 + 10, 0, Math.PI * 2);
          ctx.fill();
        } else if (gameState.theme === 'road') {
          // Lane markings
          if (i % 10 === 0) {
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(tx, ty, 40, 4);
          } else {
            ctx.fillRect(tx, ty, 2, 2);
          }
        } else {
          // Waves
          ctx.beginPath();
          ctx.ellipse(tx, ty, 20, 5, Math.sin(Date.now() * 0.001 + i), 0, Math.PI * 2);
          ctx.stroke();
        }
    }
    ctx.globalAlpha = 1.0;

    // Obstacles
    gameState.obstacles.forEach(obs => {
      ctx.fillStyle = obs.color;
      ctx.beginPath();
      const ox = obs.x * TILE_SIZE;
      const oy = obs.y * TILE_SIZE;
      
      if (gameState.theme === 'jungle') {
          // Draw Tree
          ctx.fillStyle = '#064e3b';
          ctx.beginPath();
          ctx.arc(ox + 20, oy + 20, 18, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#065f46';
          ctx.beginPath();
          ctx.arc(ox + 20, oy + 20, 12, 0, Math.PI * 2);
          ctx.fill();
          // Tree shadow
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath();
          ctx.ellipse(ox + 25, oy + 25, 15, 10, 0, 0, Math.PI * 2);
          ctx.fill();
      } else if (gameState.theme === 'road') {
          // Draw Crate
          ctx.roundRect(ox + 4, oy + 4, 32, 32, 4);
          ctx.fill();
          ctx.strokeStyle = '#111';
          ctx.strokeRect(ox + 8, oy + 8, 24, 24);
          // Crate shadow
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(ox + 36, oy + 10, 4, 30);
      } else {
          // Draw Rock
          ctx.beginPath();
          ctx.moveTo(ox + 20, oy + 4);
          ctx.lineTo(ox + 36, oy + 20);
          ctx.lineTo(ox + 20, oy + 36);
          ctx.lineTo(ox + 4, oy + 20);
          ctx.closePath();
          ctx.fill();
          // Rock shadow
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath();
          ctx.ellipse(ox + 25, oy + 25, 12, 8, 0, 0, Math.PI * 2);
          ctx.fill();
      }
    });

    // Powerups
    gameState.powerups.forEach(p => {
      const px = p.x * TILE_SIZE;
      const py = p.y * TILE_SIZE;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.roundRect(px + 10, py + 10, 20, 20, 4);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.fillRect(px + 18, py + 12, 4, 16);
      ctx.fillRect(px + 12, py + 18, 16, 4);
      ctx.shadowBlur = 0;
    });

    // Particles
    gameState.particles.forEach(p => {
      ctx.globalAlpha = p.life || 0;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * TILE_SIZE, p.y * TILE_SIZE, p.size || 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Projectiles
    gameState.projectiles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x * TILE_SIZE, p.y * TILE_SIZE, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Enemies
    gameState.enemies.forEach(enemy => {
      const angle = Math.atan2(gameState.player.y - enemy.y, gameState.player.x - enemy.x);
      drawCharacter(ctx, enemy.x * TILE_SIZE, enemy.y * TILE_SIZE, angle, true, enemy.color, false, 0, enemy.size || 1, enemy.lastShot || 0);
      
      // Health Bar
      const ex = enemy.x * TILE_SIZE;
      const ey = enemy.y * TILE_SIZE;
      const healthPct = (enemy.health || 0) / (enemy.maxHealth || 1);
      const barWidth = (enemy.size || 1) * 30;
      ctx.fillStyle = '#000';
      ctx.fillRect(ex - barWidth/2, ey - (enemy.size ? 40 : 28), barWidth, 4);
      ctx.fillStyle = enemy.size ? '#7c3aed' : '#ef4444';
      ctx.fillRect(ex - barWidth/2, ey - (enemy.size ? 40 : 28), barWidth * healthPct, 4);
    });

    // Player
    const px = gameState.player.x * TILE_SIZE;
    const py = gameState.player.y * TILE_SIZE;
    const playerAngle = Math.atan2(mousePos.current.y - gameState.player.y, mousePos.current.x - gameState.player.x);
    drawCharacter(ctx, px, py, playerAngle, gameState.player.isMoving, '#3b82f6', true, gameState.player.lastKnife, 1, gameState.player.lastShot);

    // Damage Flash
    if (flash > 0) {
      ctx.fillStyle = `rgba(239, 68, 68, ${flash})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Scanlines / CRT Overlay
    ctx.fillStyle = 'rgba(18, 16, 16, 0.1)';
    for (let i = 0; i < CANVAS_HEIGHT; i += 4) {
      ctx.fillRect(0, i, CANVAS_WIDTH, 1);
    }
    
    // Vignette
    const grd = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 0, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH/1.2);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.restore();
  }, [gameState, screenShake, flash]);

  return (
    <div className="min-h-screen bg-[#020617] text-white font-sans flex flex-col items-center justify-center p-6 select-none">
      {/* Military HUD */}
      <div className="w-full max-w-[800px] flex gap-4 mb-6">
        <div className="flex-1 bg-black/40 border-l-4 border-blue-500 backdrop-blur-md p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-blue-400 text-[10px] uppercase tracking-[0.2em] font-black">
            <Shield className="w-3 h-3" /> ADEN STATUS
          </div>
          <div className="flex items-end gap-3">
            <span className="text-3xl font-mono font-black tracking-tighter leading-none">{Math.ceil(gameState.player.health)}</span>
            <div className="flex-1 h-2 bg-white/5 rounded-full mb-1 overflow-hidden">
              <motion.div 
                className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                animate={{ width: `${gameState.player.health}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex-1 bg-black/40 border-l-4 border-amber-500 backdrop-blur-md p-4 flex flex-col items-center justify-center">
          <div className="text-amber-500/60 text-[10px] uppercase tracking-[0.3em] font-black mb-1">INTEL SCORE</div>
          <div className="text-3xl font-mono font-black tracking-tighter text-white leading-none">
            {gameState.player.score.toLocaleString()}
          </div>
        </div>

        <div className="flex-1 bg-black/40 border-l-4 border-red-500 backdrop-blur-md p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-red-400 text-[10px] uppercase tracking-[0.2em] font-black">
            <Target className="w-3 h-3" /> SECTOR: {gameState.theme.toUpperCase()}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xl font-mono font-black">LVL {gameState.level}</span>
            <div className="flex gap-1">
              {Array.from({ length: gameState.totalEnemies }).map((_, i) => (
                <div key={i} className={`w-2 h-4 rounded-sm ${i < gameState.enemiesKilled ? 'bg-red-500' : 'bg-white/10'}`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="relative group">
        <div className="absolute -inset-2 bg-blue-500/10 blur-3xl rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onContextMenu={(e) => e.preventDefault()}
            className="bg-black cursor-crosshair"
          />

          <AnimatePresence>
            {gameState.isPaused && !gameState.isGameOver && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-12 text-center"
              >
                <div className="mb-10 relative">
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center gap-4 mb-2"
                  >
                    <div className="h-1 w-12 bg-red-500" />
                    <span className="text-red-500 font-black tracking-[0.5em] text-xs">OPERATIVE ADEN</span>
                    <div className="h-1 w-12 bg-red-500" />
                  </motion.div>
                  <motion.h1 
                    initial={{ y: 30 }} animate={{ y: 0 }}
                    className="text-8xl font-black tracking-tighter uppercase text-white leading-none"
                  >
                    ADEN<br/><span className="text-red-600">RAMBO</span>
                  </motion.h1>
                </div>
                
                <p className="text-white/40 mb-12 text-[10px] uppercase tracking-[0.6em] max-w-sm leading-relaxed">
                  Sector infiltration authorized. Jungle, Road, and Sea environments detected. Eliminate all hostiles.
                </p>

                <button 
                  onClick={startGame}
                  className="group relative px-20 py-6 bg-red-600 hover:bg-red-500 text-white rounded-sm font-black text-2xl transition-all hover:scale-105 active:scale-95 flex items-center gap-4"
                >
                  <div className="flex items-center gap-4">
                    <Play className="w-7 h-7 fill-current" />
                    START MISSION
                  </div>
                </button>

                <div className="mt-16 grid grid-cols-3 gap-12 text-[9px] text-white/30 uppercase tracking-[0.3em] font-black">
                  <div className="flex flex-col items-center gap-3">
                    <Trees className="w-5 h-5 text-green-500" />
                    <span>Jungle</span>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <Map className="w-5 h-5 text-gray-400" />
                    <span>Road</span>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <Waves className="w-5 h-5 text-blue-500" />
                    <span>Sea</span>
                  </div>
                </div>
              </motion.div>
            )}

            {gameState.isGameOver && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute inset-0 bg-red-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-12"
              >
                <Skull className="w-24 h-24 text-white mb-6 animate-pulse" />
                <h2 className="text-7xl font-black mb-2 text-white tracking-tighter uppercase">MISSION FAILED</h2>
                <div className="h-1 w-48 bg-white/20 mb-10" />
                <div className="grid grid-cols-2 gap-16 mb-12">
                  <div className="text-center">
                    <div className="text-white/40 text-[10px] uppercase tracking-widest mb-2">Intel Gathered</div>
                    <div className="text-4xl font-mono font-black">{gameState.player.score}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white/40 text-[10px] uppercase tracking-widest mb-2">Sectors Cleared</div>
                    <div className="text-4xl font-mono font-black">{gameState.level - 1}</div>
                  </div>
                </div>
                <button 
                  onClick={startGame}
                  className="px-16 py-6 bg-white text-red-900 hover:bg-red-50 rounded-sm font-black text-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-4"
                >
                  <div className="flex items-center gap-4">
                    <RotateCcw className="w-6 h-6" />
                    RETRY MISSION
                  </div>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-10 flex items-center gap-10 text-white/20 text-[8px] uppercase tracking-[0.5em] font-black">
        <div className="flex items-center gap-2"><Trees className="w-3 h-3" /> Jungle Sector</div>
        <div className="flex items-center gap-2"><Map className="w-3 h-3" /> Road Sector</div>
        <div className="flex items-center gap-2"><Waves className="w-3 h-3" /> Sea Sector</div>
      </div>
    </div>
  );
}
