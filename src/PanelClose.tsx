export function PanelClose({ label }: { label: string }) {
  return <button type="button" className="panel-close" aria-label={`Close ${label}`} onClick={(event) => {
    const panel = event.currentTarget.closest("details");
    if (!panel) return;
    panel.open = false;
    panel.querySelector("summary")?.focus();
  }}><span aria-hidden="true">×</span></button>;
}
