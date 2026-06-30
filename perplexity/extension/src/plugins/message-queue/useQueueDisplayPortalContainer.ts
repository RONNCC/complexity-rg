import { DomSelectorsService } from "@/entrypoints/contexts/content-scripts/services/dom-selectors/service-init.loader";
import { domObserverService } from "@/services/features/dom-observer";
import { createDomObserverId } from "@/services/features/dom-observer/types";

const OBSERVER_ID = createDomObserverId("misc", "messageQueue:queueDisplay");
const CONTAINER_ATTR = "data-cplx-message-queue-container";

export default function useQueueDisplayPortalContainer() {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    domObserverService.subscribe({
      id: OBSERVER_ID,
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
      domObserverService.unsubscribe(OBSERVER_ID);
    };
  }, []);

  return container;
}
