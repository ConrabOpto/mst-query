import React from 'react';
import ReactDOM from 'react-dom/client';
import {  RouterProvider } from 'react-router-dom';
import { createContext, QueryClient } from 'mst-query';
import { onSnapshot } from 'mobx-state-tree';
import { RootStore } from './models/stores';
import { router } from './router';
import './index.css';

if (import.meta.hot) {
    import.meta.hot.on(
        'vite:beforeUpdate',
        /* eslint-disable-next-line no-console */
        () => console.clear()
    );
}

export const queryClient = new QueryClient({ RootStore });

export const { QueryClientProvider, useRootStore } = createContext(queryClient);

let initialData: any;
// const storageData = localStorage.getItem('table-filters');
// if (storageData) {
//     initialData = JSON.parse(storageData);
// }
queryClient.init(initialData);

// const rootStore = queryClient.rootStore;
// onSnapshot(rootStore, (snapshot) => {
//     localStorage.setItem('table-filters', JSON.stringify(snapshot));
// });

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <QueryClientProvider>
            <RouterProvider router={router}></RouterProvider>
        </QueryClientProvider>
    </React.StrictMode>
);
