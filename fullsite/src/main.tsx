import { ViteReactSSG } from "vite-react-ssg";
import { routes } from "./App";
import "./index.css";

// Static-site-generation entry. vite-react-ssg renders each static route to HTML
// at build time and hydrates it on the client — same routes, now crawlable.
export const createRoot = ViteReactSSG({ routes });
