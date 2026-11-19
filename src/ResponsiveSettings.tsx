import { useId, useRef, type ReactNode } from "react";

// One shared modal and form tree for both explorers and all viewport sizes.
export function ResponsiveSettings({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return <section className="responsive-settings">
    <button ref={trigger} className="settings-toggle" aria-haspopup="dialog" aria-controls={id} onClick={() => dialog.current?.showModal()}>Settings</button>
    <dialog ref={dialog} id={id} className="settings-dialog" aria-labelledby={`${id}-title`} onClose={() => trigger.current?.focus()}>
      <div className="settings-dialog-heading">
        <h2 id={`${id}-title`}>Settings</h2>
        <button type="button" className="settings-dismiss" aria-label="Close settings" onClick={() => dialog.current?.close()}>×</button>
      </div>
      <div className="settings-dialog-content">{children}</div>
      {footer && <div className="settings-dialog-footer">{footer}</div>}
    </dialog>
  </section>;
}
