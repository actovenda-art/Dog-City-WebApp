import './App.css'
import Pages from "@/pages/index.jsx"
import { Toaster } from "@/components/ui/toaster"

function App() {
  return (
    <div className="app-container">
      <Pages />
      <Toaster />
    </div>
  )
}

export default App