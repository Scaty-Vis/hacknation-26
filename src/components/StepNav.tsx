import { WIZARD_STEPS, type WizardStepId } from '../types'

type StepNavProps = {
  currentStep: WizardStepId
  maxUnlockedIndex: number
  onSelect: (step: WizardStepId) => void
}

function StepNav({ currentStep, maxUnlockedIndex, onSelect }: StepNavProps) {
  return (
    <nav className="w-full shrink-0 border-b border-border bg-card md:w-64 md:min-h-full md:border-r md:border-b-0">
      <ol className="flex flex-row md:flex-col">
        {WIZARD_STEPS.map((step, index) => {
          const isCurrent = step.id === currentStep
          const isUnlocked = index <= maxUnlockedIndex
          const isComplete = index < maxUnlockedIndex

          return (
            <li key={step.id} className="flex-1 md:flex-none">
              <button
                type="button"
                disabled={!isUnlocked}
                onClick={() => onSelect(step.id)}
                className={`flex w-full items-center gap-3 border-l-4 px-4 py-4 text-left transition-colors ${
                  isCurrent ? 'border-primary bg-background' : 'border-transparent hover:bg-background/60'
                } ${!isUnlocked ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    isComplete || isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {isComplete ? '✓' : index + 1}
                </span>
                <span className="hidden flex-col md:flex">
                  <span className="text-sm font-medium text-foreground">{step.label}</span>
                  <span className="text-xs text-muted-foreground">{step.description}</span>
                </span>
                <span className="text-xs font-medium text-foreground md:hidden">{step.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default StepNav
