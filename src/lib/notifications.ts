/**
 * Browser notifications and toast system for batch processing
 */

import { toast } from "sonner";

/**
 * Request permission for browser notifications
 * @returns Whether permission was granted
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    console.warn("Browser does not support notifications");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

/**
 * Check if browser notifications are enabled
 */
export function isNotificationEnabled(): boolean {
  return "Notification" in window && Notification.permission === "granted";
}

/**
 * Show a browser notification (if permitted)
 */
function showBrowserNotification(title: string, body: string): void {
  if (!isNotificationEnabled()) return;

  new Notification(title, {
    body,
    icon: "/favicon.ico",
    tag: "reelforge-batch",
  });
}

/**
 * Notify when a single video completes processing
 */
export function notifyVideoComplete(videoName: string): void {
  const message = `✅ ${videoName} procesado correctamente`;

  toast.success(message, {
    description: "El video está listo",
  });

  showBrowserNotification("ReelForge", message);
}

/**
 * Notify when the entire batch completes
 */
export function notifyBatchComplete(count: number): void {
  const message = `🎉 ${count} video${count !== 1 ? "s" : ""} procesado${count !== 1 ? "s" : ""}`;

  toast.success(message, {
    description: "Procesamiento por lotes completado",
    duration: 5000,
  });

  showBrowserNotification("ReelForge - Lote Completado", message);
}

/**
 * Notify when a video fails processing
 */
export function notifyError(videoName: string, error: string): void {
  const message = `❌ Error procesando ${videoName}`;

  toast.error(message, {
    description: error,
    duration: 8000,
  });

  showBrowserNotification("ReelForge - Error", `${message}: ${error}`);
}

/**
 * Notify when processing starts
 */
export function notifyProcessingStart(count: number): void {
  toast.info(`Iniciando procesamiento de ${count} video${count !== 1 ? "s" : ""}`, {
    description: "Puedes ver el progreso en la cola",
  });
}

/**
 * Show a warning notification
 */
export function notifyWarning(message: string, description?: string): void {
  toast.warning(message, {
    description,
  });
}

/**
 * Show an info notification
 */
export function notifyInfo(message: string, description?: string): void {
  toast.info(message, {
    description,
  });
}
