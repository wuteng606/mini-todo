import ReactDOM from "react-dom/client";
import { MainApp } from "./components/MainApp";
import { PopoverApp } from "./components/PopoverApp";
import "./styles.css";

const params = new URLSearchParams(location.search);
const isPopover = params.get("view") === "popover";

if (isPopover) document.body.classList.add("popover-body");

ReactDOM.createRoot(document.getElementById("root")!).render(
  isPopover ? <PopoverApp /> : <MainApp />,
);
