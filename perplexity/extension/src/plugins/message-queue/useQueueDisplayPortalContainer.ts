import { DomSelectorsService } from "@/entrypoints/contexts/content-scripts/services/dom-selectors/service-init.loader";
import { domObserverService } from "@/services/features/dom-observer";
import { createDomObserverId } from "@/services/features/dom-observer/types";

const CONTAINER_ATTR = "data-cplx-message-queue-container";

export default function useQueueDisplayPortalContainer() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  // A fresh id per mount, not a shared module-level constant: the dom
  // observer service never clears its per-element "already handled" flag on
  // unsubscribe, so remounting (e.g. toggling this plugin off/on) with a
  // reused id on a follow-up box that's still in the DOM would silently
  // never call onAdd again, leaving the queue UI gone until a full nav.
  const [observerId] = useState(() =>
    createDomObserverId(
      "misc",
      `messageQueue:queueDisplay:${crypto.randomUUID()}`,
    ),
  );

  useEffect(() => {
    domObserverService.subscribe({
      id: observerId,
      // Subscribe to the follow-up query box itself, then inject a sibling
      // div before it so we don't disturb the nth-child selectors inside
      // ATTR_WRAPPER that other toolbar plugins rely on.
      selector: DomSelectorsService.Root.cplxAttribute(
        DomSelectorsService.Root.internalAttributes.QUERY_BOX
          .FOLLOW_UP_QUERY_BOX,
      ),
      onAdd: (node) => {
        const $existing = $(`[${CONTAINER_ATTR}]`);
        if ($existing[0] && document.contains($existing[0])) {
          setContainer($existing[0]!);
          return;
        }
        $existing.remove();

        const $container = $("<div>").attr(CONTAINER_ATTR, "true");
        $(node).before($container);
        setContainer($container[0]!);
      },
      onRemove: () => {
        $(`[${CONTAINER_ATTR}]`).remove();
        setContainer(null);
      },
      existingCheck: true,
    });

    return () => {
      domObserverService.unsubscribe(observerId);
    };
  }, [observerId]);

  return container;
}
