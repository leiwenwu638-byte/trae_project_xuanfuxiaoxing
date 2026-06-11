import { nativeImage } from 'electron';
import { createTaskbarBadgeSvg } from './taskbarBadge';

export function createAppIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <rect width="256" height="256" rx="56" fill="#2F6F73"/>
      <path d="M128 38c19 30 50 48 86 52-16 31-18 67-5 102-36-4-68 8-95 31-16-32-42-54-76-64 25-25 36-58 32-94 34 10 68 1 58-27Z" fill="#F8F7F0"/>
      <path d="M128 78c14 22 37 35 64 38-12 23-13 50-4 75-26-3-50 6-70 23-12-24-31-40-56-47 18-19 27-43 24-70 25 8 50 1 42-19Z" fill="#9FE2D0"/>
      <circle cx="128" cy="128" r="22" fill="#2F6F73"/>
      <path d="M128 105v46M105 128h46" stroke="#F8F7F0" stroke-width="14" stroke-linecap="round"/>
    </svg>
  `;

  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

export function createTaskbarBadgeIcon(count: number) {
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(createTaskbarBadgeSvg(count)).toString('base64')}`
  );
}
