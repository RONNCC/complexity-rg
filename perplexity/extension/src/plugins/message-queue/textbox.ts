import { isLexical } from "@/entrypoints/contexts/content-scripts/ui-groups/elements/query-box/utils";
import { getTextContent } from "@/utils/dom-utils/lexical-utils";
import { getTaskScheduler } from "@/utils/misc/utils";
import { setLexicalEditorContent } from "@/utils/wrappers/lexical";

export function getTextboxContent(textbox: HTMLElement): string {
  if (isLexical(textbox)) {
    return getTextContent({ element: textbox, omitDecorators: true });
  }
  return (textbox as HTMLTextAreaElement).value;
}

export function clearTextbox(textbox: HTMLElement, onCleared?: () => void) {
  const clear = () => {
    if ("__lexicalEditor" in textbox) {
      setLexicalEditorContent({ content: "", activeTextbox: textbox });
    } else {
      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      nativeValueSetter?.call(textbox, "");
      textbox.dispatchEvent(new Event("input", { bubbles: true }));
    }
    onCleared?.();
  };

  // Lexical may still be reconciling a pending update (e.g. from the Enter
  // keydown that triggered this clear); deferring ensures our clear is the
  // last write and doesn't get clobbered by that reconciliation.
  getTaskScheduler()(clear);
}
