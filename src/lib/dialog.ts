/** Native confirmations are asynchronous in a system webview. */
export function confirmAction(text: string): boolean | Promise<boolean> {
  if ("__TAURI_INTERNALS__" in window) {
    return import("@tauri-apps/plugin-dialog").then(({ confirm }) => confirm(text, { title: "ScheduGrr", kind: "warning" }));
  }
  return window.confirm(text);
}
