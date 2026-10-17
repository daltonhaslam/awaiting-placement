// Hand-made content for tests that check one case alone, now that the fixture carries the real content.

// One timeline item, the CMS-0057-F decision deadline: the pathway's deadline line, its Since/From switch, and the
// board's "Upcoming" status read it.
export const DEADLINE = {
  date: '2026-01-01', title: 'CMS-0057-F decision deadlines take effect',
  body: 'MA plans must decide standard requests within 7 days and urgent ones within 72 hours.',
  src: [{ label: 'CMS-0057-F, Federal Register, February 8, 2024', type: 'gov', verified: true,
    url: 'https://www.federalregister.gov/documents/2024/02/08/2024-00895/medicare-and-medicaid-programs-patient-protection-and-affordable-care-act-advancing-interoperability-and-improving-prior-authorization' }],
};

// Content with only that item on the timeline.
export const withTimeline = (content, items = [DEADLINE]) => ({ ...structuredClone(content), timeline: items });
