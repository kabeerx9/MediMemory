import { NativeTabs } from "expo-router/unstable-native-tabs";

// Three peers, not a toggle.
//
// The old screen used a segmented control over one scroll container, so
// switching views threw away your position in both and there was nowhere to put
// a third. Real tabs keep per-tab scroll state, pick up liquid glass on iOS 26
// and Material 3 on Android for free, and make Trends a first-class
// destination rather than something bolted onto the record.
export default function WorkspaceTabsLayout() {
  return (
    <NativeTabs minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon
          sf={{ default: "bubble.left", selected: "bubble.left.fill" }}
          md="chat_bubble"
        />
        <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="record">
        <NativeTabs.Trigger.Icon
          sf={{ default: "list.bullet.indent", selected: "list.bullet.indent" }}
          md="list"
        />
        <NativeTabs.Trigger.Label>Record</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="trends">
        <NativeTabs.Trigger.Icon
          sf={{ default: "chart.xyaxis.line", selected: "chart.xyaxis.line" }}
          md="show_chart"
        />
        <NativeTabs.Trigger.Label>Trends</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
