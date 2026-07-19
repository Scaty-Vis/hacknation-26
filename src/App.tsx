import { useEffect, useState } from 'react'
import Landing from './components/Landing'
import Wizard from './components/Wizard'
import Imprint from './components/legal/Imprint'
import PrivacyPolicy from './components/legal/PrivacyPolicy'
import SiteHeader from './components/SiteHeader'
import SiteFooter from './components/SiteFooter'
import type { View } from './types'

function App() {
  const [view, setView] = useState<View>('landing')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader view={view} onGetStarted={() => setView('wizard')} onHome={() => setView('landing')} />
      <div className="flex flex-1 flex-col">
        {view === 'wizard' && <Wizard onStartOver={() => setView('landing')} />}
        {view === 'imprint' && <Imprint />}
        {view === 'privacy' && <PrivacyPolicy />}
        {view === 'landing' && <Landing onGetStarted={() => setView('wizard')} />}
      </div>
      <SiteFooter onNavigateLegal={setView} />
    </div>
  )
}

export default App
