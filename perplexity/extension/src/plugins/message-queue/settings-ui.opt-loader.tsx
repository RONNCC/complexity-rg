import { Switch } from "@/components/ui/switch";
import { registerSettingsUi } from "@/entrypoints/contexts/options-page/routes/dashboard/pages/plugins/components/plugin-settings-uis/registry";
import { useSettings } from "@/plugins/message-queue/settings";

function MessageQueuePluginSettingsUi() {
  const { settings, update } = useSettings();

  return (
    <div className="x:flex x:max-w-lg x:flex-col x:gap-4">
      <Switch
        textLabel="Enable"
        checked={settings.enabled}
        onCheckedChange={({ checked }) => {
          void update({
            updateFn: (draft) => {
              draft.enabled = checked;
            },
          });
        }}
      />
    </div>
  );
}

export default function Wrapper() {
  "use no memo";

  registerSettingsUi({
    pluginId: "messageQueue",
    ui: <MessageQueuePluginSettingsUi />,
  });
}
