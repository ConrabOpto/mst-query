import { createBrowserRouter } from "react-router-dom";
import { App } from "./components/App";
import { InvoiceList } from "./components/InvoiceList";

export const router = createBrowserRouter([
    {
        path: '/',
        element: <App />,
        children: [
            {
                path: 'company/:companyId',
                element: <InvoiceList />,
            },
        ],
    },
]);
