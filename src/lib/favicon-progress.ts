const ICON_SIZE = 32;
const LINK_ID = "dynamic-favicon";

function getOrCreateLink(): HTMLLinkElement {
  let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = LINK_ID;
    link.rel = "icon";
    link.type = "image/png";
    document.head.appendChild(link);
  }
  return link;
}

function createCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext("2d")!;
  return [canvas, ctx];
}

/** Draw a circular progress ring (0–100%) and apply as favicon. */
export function setFaviconProgress(percent: number) {
  const [canvas, ctx] = createCanvas();
  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;
  const r = 13;
  const lineWidth = 4;

  // Dark background circle
  ctx.beginPath();
  ctx.arc(cx, cy, cx, 0, Math.PI * 2);
  ctx.fillStyle = "#1e1e2e";
  ctx.fill();

  // Track ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#3b3b4f";
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Progress arc
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (Math.PI * 2 * Math.min(percent, 100)) / 100;
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = "#60a5fa"; // blue-400
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.stroke();

  // Percent text
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${percent === 100 ? 9 : 10}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(percent)}`, cx, cy + 1);

  getOrCreateLink().href = canvas.toDataURL("image/png");
}

/** Show a green circle with a white checkmark. */
export function setFaviconDone() {
  const [canvas, ctx] = createCanvas();
  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;

  // Green circle
  ctx.beginPath();
  ctx.arc(cx, cy, cx, 0, Math.PI * 2);
  ctx.fillStyle = "#22c55e"; // green-500
  ctx.fill();

  // White checkmark
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(9, 17);
  ctx.lineTo(14, 22);
  ctx.lineTo(23, 11);
  ctx.stroke();

  getOrCreateLink().href = canvas.toDataURL("image/png");
}

/** Show a red circle with a white X. */
export function setFaviconError() {
  const [canvas, ctx] = createCanvas();
  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;

  // Red circle
  ctx.beginPath();
  ctx.arc(cx, cy, cx, 0, Math.PI * 2);
  ctx.fillStyle = "#ef4444"; // red-500
  ctx.fill();

  // White X
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(10, 10);
  ctx.lineTo(22, 22);
  ctx.moveTo(22, 10);
  ctx.lineTo(10, 22);
  ctx.stroke();

  getOrCreateLink().href = canvas.toDataURL("image/png");
}

/** Remove the dynamic favicon, reverting to browser default. */
export function clearFavicon() {
  const link = document.getElementById(LINK_ID);
  if (link) link.remove();
}
