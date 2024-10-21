import { StrictMode } from "react";
import * as ReactDOMClient from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { createContext, QueryClient } from "mst-query";
import { RootStore } from "./models/stores";
import { router } from "./router";
import "./styles.css";

const rootElement = document.getElementById("root");
const root = ReactDOMClient.createRoot(rootElement as HTMLElement);

export const queryClient = new QueryClient({ RootStore });

export const { QueryClientProvider, useRootStore } = createContext(queryClient);

root.render(
  <StrictMode>
    <QueryClientProvider>
      <RouterProvider router={router}></RouterProvider>
    </QueryClientProvider>
  </StrictMode>
);
