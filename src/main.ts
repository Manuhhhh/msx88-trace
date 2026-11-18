import "./style.css";
import { mountApp } from "./ui/app";
import { getArch } from "./ui/arch";
import { mountMipsApp } from "./ui/mips-app";

const root = document.querySelector<HTMLDivElement>("#app")!;
// each architecture is a separate screen; choosing the other one loads the page again, so nothing of the first one lingers
if (getArch() === "mips") mountMipsApp(root);
else mountApp(root);
