import { nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createTaskbarBadgeSvg } from './taskbarBadge';

export function createAppIcon(unfinishedTodoCount = 0) {
  if (unfinishedTodoCount <= 0) {
    const assetIcon = nativeImage.createFromPath(resolveAppIconPath());
    if (!assetIcon.isEmpty()) return assetIcon;
  }

  const svg = createAppIconSvg(unfinishedTodoCount);
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

export function hasAppIconAsset(): boolean {
  return existsSync(resolveAppIconPath());
}

export function resolveAppIconPath(): string {
  return path.join(process.cwd(), 'assets', 'app-icon.png');
}

export function createTaskbarBadgeIcon(count: number) {
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(createTaskbarBadgeSvg(count)).toString('base64')}`
  );
}

export function createAppIconSvg(unfinishedTodoCount = 0): string {
  const label = unfinishedTodoCount > 99 ? '99+' : String(Math.max(0, unfinishedTodoCount));
  const badgeFontSize = label.length >= 3 ? 24 : label.length === 2 ? 29 : 33;
  const badge = unfinishedTodoCount > 0
    ? `
      <g id="unfinished-todo-badge">
        <circle cx="214" cy="42" r="30" fill="#E5484D"/>
        <circle cx="214" cy="42" r="25" fill="#FF4D55"/>
        <text
          x="214"
          y="45"
          fill="#FFFFFF"
          font-family="Segoe UI, Arial, sans-serif"
          font-size="${badgeFontSize}"
          font-weight="800"
          text-anchor="middle"
          dominant-baseline="middle">${label}</text>
      </g>
    `
    : '';

  return `
    <svg id="xuanfu-xiaoxing-icon" xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <defs>
        <linearGradient id="bg" x1="42" y1="15" x2="215" y2="245" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#5FCBFF"/>
          <stop offset="0.54" stop-color="#62A8FF"/>
          <stop offset="1" stop-color="#A59BFF"/>
        </linearGradient>
        <linearGradient id="planet" x1="74" y1="71" x2="176" y2="188" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#FFFFFF"/>
          <stop offset="0.55" stop-color="#E9F8FF"/>
          <stop offset="1" stop-color="#C6D7FF"/>
        </linearGradient>
        <linearGradient id="ring" x1="30" y1="134" x2="222" y2="105" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#DFFFFF"/>
          <stop offset="0.5" stop-color="#FFFFFF"/>
          <stop offset="1" stop-color="#35B4FF"/>
        </linearGradient>
        <linearGradient id="bellGradient" x1="178" y1="46" x2="220" y2="109" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#FFE98A"/>
          <stop offset="1" stop-color="#FF9D1F"/>
        </linearGradient>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#4278D9" flood-opacity="0.35"/>
        </filter>
      </defs>
      <rect width="256" height="256" rx="52" fill="url(#bg)"/>
      <path d="M42 205C87 230 169 229 216 197" fill="none" stroke="#617CFF" stroke-width="13" stroke-linecap="round" opacity="0.17"/>
      <g id="todo-card" transform="rotate(-5 70 72)" filter="url(#softShadow)">
        <rect x="35" y="39" width="74" height="73" rx="14" fill="#F4F7FF"/>
        <rect x="35" y="39" width="74" height="19" rx="14" fill="#6D81FF"/>
        <path d="M50 34v17M70 31v17M91 35v17" stroke="#DDF0FF" stroke-width="7" stroke-linecap="round"/>
        <circle cx="55" cy="75" r="10" fill="#2F86FF"/>
        <path d="m50 74 4 4 8-10" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="55" cy="98" r="10" fill="#2F86FF"/>
        <path d="m50 97 4 4 8-10" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M73 72h24M73 95h22" stroke="#B7C2E6" stroke-width="6" stroke-linecap="round"/>
      </g>
      <g id="bell" filter="url(#softShadow)">
        <path d="M192 42c16 2 27 16 25 32l-2 17 10 13-55-7 13-10 2-18c2-16-8-28 7-27Z" fill="url(#bellGradient)"/>
        <path d="M176 96c8 9 25 11 34 4" fill="none" stroke="#FFE7A0" stroke-width="8" stroke-linecap="round"/>
        <circle cx="193" cy="104" r="8" fill="#EA7B14"/>
        <path d="M207 34l5-13M223 45l12-8M229 62l14 1" stroke="#FFD452" stroke-width="7" stroke-linecap="round"/>
      </g>
      <path d="M30 150c33-30 125-54 181-24" fill="none" stroke="#A5F4FF" stroke-width="21" stroke-linecap="round" opacity="0.95"/>
      <path d="M30 150c42 28 139 23 190-25" fill="none" stroke="url(#ring)" stroke-width="9" stroke-linecap="round"/>
      <g id="planet-face" filter="url(#softShadow)">
        <circle cx="131" cy="132" r="57" fill="url(#planet)"/>
        <ellipse cx="104" cy="106" rx="27" ry="17" fill="#FFFFFF" opacity="0.7" transform="rotate(-28 104 106)"/>
        <ellipse cx="110" cy="137" rx="9" ry="16" fill="#080A66"/>
        <ellipse cx="150" cy="137" rx="9" ry="16" fill="#080A66"/>
        <circle cx="114" cy="129" r="3" fill="#FFFFFF"/>
        <circle cx="154" cy="129" r="3" fill="#FFFFFF"/>
        <path d="M125 154c5 6 14 6 19 0" fill="none" stroke="#080A66" stroke-width="5" stroke-linecap="round"/>
        <ellipse cx="88" cy="159" rx="15" ry="9" fill="#FF8BC2" opacity="0.82"/>
        <ellipse cx="168" cy="159" rx="15" ry="9" fill="#FF8BC2" opacity="0.82"/>
      </g>
      <path d="M62 173c-11 16-13 32-15 47M62 173l-17 7M62 173l15 11M47 220l-16 9M47 220l15 10" stroke="#7DE246" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="64" cy="161" r="9" fill="#A4F15F"/>
      <path d="M213 151c10 14 22 32 22 44 0 13-10 22-22 22s-22-9-22-22c0-12 12-30 22-44Z" fill="#98E8FF" stroke="#DDFBFF" stroke-width="5"/>
      <path d="M179 30l5 10 10 5-10 5-5 10-5-10-10-5 10-5 5-10ZM32 180l4 7 8 4-8 4-4 8-4-8-8-4 8-4 4-7ZM224 124l4 7 8 4-8 4-4 8-4-8-8-4 8-4 4-7Z" fill="#FFFFFF"/>
      ${badge}
    </svg>
  `;
}
