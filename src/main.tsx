import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./app/router";
import { MotionProvider } from "./shared/ui/motion-provider";
import { TooltipProvider } from "./shared/ui/tooltip";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </MotionProvider>
  </StrictMode>,
);
