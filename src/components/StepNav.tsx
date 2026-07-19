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
            <li key={step.id} className="min-w-0 flex-1 md:flex-none">
              <button
                type="button"
                disabled={!isUnlocked}
                onClick={() => onSelect(step.id)}
                className={`flex w-full min-w-0 items-center justify-center gap-2 border-l-4 px-2 py-3 text-left transition-colors md:justify-start md:gap-3 md:px-4 md:py-4 ${
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
                  {isComplete ? '\u2713' : index + 1}
                </span>
                <span className="hidden flex-col md:flex">
                  <span className="text-sm font-medium text-foreground">{step.label}</span>
                  <span className="text-xs text-muted-foreground">{step.description}</span>
                </span>
                <span className="min-w-0 text-center text-xs font-medium leading-tight text-foreground md:hidden">
                  {step.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default StepNav
