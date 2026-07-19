export type WizardStepId = 'gathering' | 'calling' | 'analysis'

export const WIZARD_STEPS: { id: WizardStepId; label: string; description: string }[] = [
  { id: 'gathering', label: 'Information Gathering', description: 'Talk to our AI to describe your event' },
  { id: 'calling', label: 'Calling', description: 'We call vendors on your behalf' },
  { id: 'analysis', label: 'Analysis', description: 'Compare the deals we found' },
]
