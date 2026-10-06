import { createSignal, Show } from "solid-js";
import { CONFIG_HELP, docsUrl } from "./config-help";
import FloatingLayer from "./FloatingLayer";

export default function HelpPopover(props: { topic: keyof typeof CONFIG_HELP; label: string }) {
  const [open, setOpen] = createSignal(false);
  let button!: HTMLButtonElement;
  return (
    <>
      <button
        ref={button}
        type="button"
        class="config-help-button"
        aria-label={`Help: ${props.label}`}
        aria-haspopup="dialog"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
      >
        ?
      </button>
      <Show when={open()}>
        <FloatingLayer anchor={button} class="config-help-popover" onClose={() => setOpen(false)}>
          <div role="dialog" aria-label={props.label}>
            <strong>{props.label}</strong>
            <p>{CONFIG_HELP[props.topic].text}</p>
            <a
              ref={(link) => requestAnimationFrame(() => link.focus())}
              href={docsUrl(CONFIG_HELP[props.topic].page)}
              target="_blank"
              rel="noreferrer"
            >
              Read more ↗
            </a>
          </div>
        </FloatingLayer>
      </Show>
    </>
  );
}
