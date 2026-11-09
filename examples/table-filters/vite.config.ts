import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom', 'mobx', 'mobx-state-tree', 'mobx-react', 'mobx-react-lite'] },
  plugins: [react()]
})
