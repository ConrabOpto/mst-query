'use client';
import * as React from 'react';
import type { QueryClient } from './QueryClient';

export const Context = React.createContext<QueryClient<any> | undefined>(undefined);
