import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// NOTE: React.StrictMode is intentionally NOT used.
// StrictMode double-invokes effects in development (mount → cleanup → mount).
// Photo Sphere Viewer (three.js based) is not resilient to being constructed and
// destroyed mid-load: the throwaway first viewer poisons three's shared texture
// load, so the second viewer hangs forever on its loader and the panorama never
// renders. This is dev-only behaviour (production never double-invokes), but it
// breaks the 360 viewer during local development. Removing StrictMode keeps the
// viewer working in dev; production output is identical either way.
createRoot(document.getElementById('root')!).render(
  <App />
)
