import LegalLayout, { LegalSection } from './LegalLayout'

function Imprint() {
  return (
    <LegalLayout title="Imprint">
      <LegalSection title="Information according to § 5 DDG">
        <p>
          Bidly Inc.
          <br />
          Leubnitzer Str. 28
          <br />
          01069 Dresden
          <br />
          Germany
        </p>
      </LegalSection>

      <LegalSection title="Represented by">
        <p>Kai K.</p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Email: contact@bidly.example
          <br />
        </p>
      </LegalSection>

      <LegalSection title="Responsible for content according to § 18 (2) MStV">
        <p>
          Kai K.
          <br />
          Leubnitzer Str. 28, 01069 Dresden, Germany
        </p>
      </LegalSection>

      <LegalSection title="EU dispute resolution">
        <p>
          The European Commission provides a platform for online dispute resolution (ODR), available at{' '}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            ec.europa.eu/consumers/odr
          </a>
          . Our email address can be found above. We are not obliged, and do not agree, to participate in dispute
          resolution proceedings before a consumer arbitration board.
        </p>
      </LegalSection>

      <LegalSection title="Liability for content">
        <p>
          As a service provider, we are responsible for our own content on these pages under general law. We are,
          however, not obliged to monitor transmitted or stored third-party information, or to investigate
          circumstances that indicate unlawful activity. Obligations to remove or block the use of information under
          general law remain unaffected.
        </p>
      </LegalSection>

      <LegalSection title="Liability for links">
        <p>
          Our offering contains links to external third-party websites over whose content we have no influence. We
          therefore cannot accept any liability for this external content; the respective provider or operator of a
          linked page is always responsible for its content.
        </p>
      </LegalSection>

      <LegalSection title="Copyright">
        <p>
          Content and works created by us on these pages are subject to copyright law. Duplication, processing,
          distribution, or any form of commercial use beyond the scope of copyright law requires our prior written
          consent.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}

export default Imprint
