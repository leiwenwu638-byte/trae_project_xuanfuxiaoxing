export function createTaskbarBadgeSvg(count: number): string {
  const label = count > 99 ? '99+' : String(Math.max(0, count));
  const fontSize = label.length >= 3 ? 84 : label.length === 2 ? 98 : 118;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <circle cx="128" cy="128" r="116" fill="#E5484D"/>
      <circle cx="128" cy="128" r="102" fill="#F2555A"/>
      <text
        x="128"
        y="142"
        fill="#FFFFFF"
        font-family="Segoe UI, Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="800"
        text-anchor="middle"
        dominant-baseline="middle">${label}</text>
    </svg>
  `;
}
