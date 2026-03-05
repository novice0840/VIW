export interface PlanetDef {
  name: string;
  radius: number;
  orbitR: number;
  speed: number;
  color: [number, number, number];
  tilt: number;
  rings?: boolean;
  ringInner?: number;
  ringOuter?: number;
}

export const SUN = {
  radius: 3.5,
  color: [1.0, 0.85, 0.2] as [number, number, number],
  glowColor: [1.0, 0.5, 0.0] as [number, number, number],
};

export const PLANETS: PlanetDef[] = [
  { name: 'Mercury', radius: 0.38, orbitR: 7, speed: 4.74, color: [0.7, 0.6, 0.5], tilt: 0.03 },
  { name: 'Venus', radius: 0.95, orbitR: 11, speed: 3.5, color: [0.9, 0.8, 0.5], tilt: 3.1 },
  { name: 'Earth', radius: 1.0, orbitR: 15, speed: 2.98, color: [0.2, 0.5, 0.9], tilt: 0.41 },
  { name: 'Mars', radius: 0.53, orbitR: 20, speed: 2.41, color: [0.8, 0.3, 0.1], tilt: 0.44 },
  { name: 'Jupiter', radius: 2.5, orbitR: 28, speed: 1.31, color: [0.8, 0.6, 0.4], tilt: 0.05 },
  {
    name: 'Saturn',
    radius: 2.1,
    orbitR: 38,
    speed: 0.97,
    color: [0.9, 0.8, 0.5],
    tilt: 0.47,
    rings: true,
    ringInner: 2.8,
    ringOuter: 4.5,
  },
  { name: 'Uranus', radius: 1.6, orbitR: 50, speed: 0.68, color: [0.5, 0.8, 0.9], tilt: 1.71 },
  { name: 'Neptune', radius: 1.55, orbitR: 62, speed: 0.54, color: [0.2, 0.3, 0.9], tilt: 0.49 },
];

export const STAR_COUNT = 3000;
