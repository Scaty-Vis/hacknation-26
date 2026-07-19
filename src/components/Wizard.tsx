import { useState } from 'react'
import StepNav from './StepNav'
import InformationGatheringPanel from './panels/InformationGatheringPanel'
import CallingPanel from './panels/CallingPanel'
import AnalysisPanel from './panels/AnalysisPanel'
import { WIZARD_STEPS, type WizardStepId } from '../types'
import type { EventBidWorkflow, Module1EventPayload } from '../lib/eventbidTypes'

type WizardProps = {
  onStartOver: () => void
}

function Wizard({ onStartOver }: WizardProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [maxUnlockedIndex, setMaxUnlockedIndex] = useState(0)
  const [eventPayload, setEventPayload] = useState<Module1EventPayload | null>(null)
  const [workflow, setWorkflow] = useState<EventBidWorkflow | null>(null)

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
      <main className="min-w-0 flex-1">
        {currentStep === 'gathering' && (
          <InformationGatheringPanel
            onSubmitted={(payload) => {
              setEventPayload(payload)
              unlockStep(1)
              setStepIndex(1)
            }}
          />
        )}
        {currentStep === 'calling' && eventPayload && (
          <CallingPanel
            eventPayload={eventPayload}
            onContinue={(nextWorkflow) => {
              setWorkflow(nextWorkflow)
              unlockStep(2)
              setStepIndex(2)
            }}
            onStartOver={onStartOver}
          />
        )}
        {currentStep === 'analysis' && workflow && (
          <AnalysisPanel workflow={workflow} onStartOver={onStartOver} />
        )}
      </main>
    </div>
  )
}

export default Wizard
