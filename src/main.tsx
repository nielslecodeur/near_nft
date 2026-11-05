import { createRoot } from "react-dom/client";

// /keepers and /vault (Track 10 demo) and the Everkeep app are split so each loads only its own styles.
const root = createRoot(document.getElementById("root")!);
if (/^\/(keepers|vault)(\/|$)/.test(location.pathname)) {
  void import("./keepers/KeepersApp").then(({ KeepersApp }) =>
    root.render(<KeepersApp />),
  );
} else {
  void import("./SeriesApp").then(({ SeriesApp }) =>
    root.render(<SeriesApp />),
  );
}
