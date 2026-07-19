import { useEffect, useState } from 'react'
import Landing from './components/Landing'
import Wizard from './components/Wizard'
import Imprint from './components/legal/Imprint'
import PrivacyPolicy from './components/legal/PrivacyPolicy'

type View = 'landing' | 'wizard' | 'imprint' | 'privacy'

function App() {
  const [view, setView] = useState<View>('landing')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  if (view === 'wizard') return <Wizard onStartOver={() => setView('landing')} />
  if (view === 'imprint') return <Imprint onBack={() => setView('landing')} />
  if (view === 'privacy') return <PrivacyPolicy onBack={() => setView('landing')} />

  return <Landing onGetStarted={() => setView('wizard')} onNavigateLegal={setView} />
}

export default App
