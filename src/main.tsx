import { createRoot } from "react-dom/client";

// /keepers, /agents and /vault (Track 10 demo) and the Everkeep app are split so each loads only its own styles.
const root = createRoot(document.getElementById("root")!);
// The hackathon app is the Agent Wallet: the bare domain opens it.
if (location.pathname === "/") history.replaceState(null, "", "/agents" + location.search);
if (/^\/(keepers|vault|agents)(\/|$)/.test(location.pathname)) {
  void import("./keepers/KeepersApp").then(({ KeepersApp }) =>
    root.render(<KeepersApp />),
  );
} else {
  void import("./SeriesApp").then(({ SeriesApp }) =>
    root.render(<SeriesApp />),
  );
}
