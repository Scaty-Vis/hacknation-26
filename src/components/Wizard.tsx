import { useState } from 'react'
import StepNav from './StepNav'
import InformationGatheringPanel from './panels/InformationGatheringPanel'
import CallingPanel from './panels/CallingPanel'
import AnalysisPanel from './panels/AnalysisPanel'
import { WIZARD_STEPS, type WizardStepId } from '../types'

type WizardProps = {
  onStartOver: () => void
}

function Wizard({ onStartOver }: WizardProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [maxUnlockedIndex, setMaxUnlockedIndex] = useState(0)

  const currentStep = WIZARD_STEPS[stepIndex].id

  const goToStep = (step: WizardStepId) => {
    const index = WIZARD_STEPS.findIndex((s) => s.id === step)
    if (index <= maxUnlockedIndex) setStepIndex(index)
  }

  const unlockStep = (index: number) => {
    setMaxUnlockedIndex((prev) => Math.max(prev, index))
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <StepNav currentStep={currentStep} maxUnlockedIndex={maxUnlockedIndex} onSelect={goToStep} />
      <main className="flex-1">
        {currentStep === 'gathering' && (
          <InformationGatheringPanel
            onSubmitted={() => {
              unlockStep(stepIndex + 1)
              setStepIndex((prev) => prev + 1)
            }}
          />
        )}
        {currentStep === 'calling' && <CallingPanel onStartOver={onStartOver} />}
        {currentStep === 'analysis' && <AnalysisPanel onStartOver={onStartOver} />}
      </main>
    </div>
  )
}

export default Wizard
