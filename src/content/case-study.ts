export interface CaseStudy {
  slug: string;
  title: string;
  subtitle: string;
  /** Which project in projects.ts this deep-dives. */
  projectId: string;
  problem: string[];
  approach: string[];
  architecture: { step: string; detail: string }[];
  proves: string[];
  /**
   * What this actually is, stated before anyone has to ask.
   *
   * The build used hosted models, and the case study argues for running the model where
   * you control it. Saying so plainly is not a weakness: a reader who spots the Claude and
   * Pinecone badges and no disclosure concludes the write-up is dishonest, whereas a reader
   * who is told up front concludes the opposite.
   */
  provenance: string;
  /** Null until there are real, measured figures. Do not invent these. */
  results: { value: string; label: string }[] | null;
}

export const CASE_STUDY: CaseStudy = {
  slug: 'isq-agent',
  projectId: 'isq-agent',
  title: 'Answering security questionnaires without leaking the answers',
  subtitle: 'A private RAG agent that drafts supplier security questionnaires, grounds every answer in your own policy, and flags the ones a human needs to look at.',
  problem: [
    'Supplier security questionnaires are a tax on selling. A single one can run to two hundred questions, most of which you have answered before, in slightly different words, in a document nobody can find.',
    'The obvious fix is to point an LLM at it. The obvious problem with the obvious fix is that a security questionnaire is a document about your security, and pasting it, along with your policies, into someone else’s API is a strange way to demonstrate that you take data protection seriously.',
    'So the requirement writes itself: it has to be good enough to save real time, and it has to run somewhere you control.',
  ],
  approach: [
    'Retrieval over your own policy documents, not a general model’s memory. Every answer is drafted from something you have actually written and approved, and it cites which document it came from, so a reviewer can check it in seconds rather than trusting it.',
    'A confidence score on every answer, and a hard rule that low-confidence answers are never submitted silently. The agent is a drafting assistant with a paper trail, not an oracle.',
    'The model is a swappable part. Retrieval, grounding, scoring and the audit log are the system; the thing that writes the sentence is a component behind an interface. Point it at a hosted API or at an open model on your own hardware and the pipeline does not change.',
  ],
  architecture: [
    { step: 'Ingest', detail: 'Your policies, previous questionnaires and controls documentation, chunked and embedded into a private vector store.' },
    { step: 'Retrieve', detail: 'For each question, pull the passages that actually bear on it, tuned on your content rather than on a demo corpus.' },
    { step: 'Draft', detail: 'The model answers strictly from the retrieved passages, and cites them. If the passages do not support an answer, it says so instead of inventing one.' },
    { step: 'Score', detail: 'Each answer gets a confidence score based on how well the retrieved evidence actually covers the question.' },
    { step: 'Review', detail: 'Anything below the bar is routed to a human, with the evidence attached. The reviewer is checking, not writing from scratch.' },
  ],
  proves: [
    'That the hard part of a RAG agent is not the model. It is the retrieval, the grounding, the confidence scoring and the audit trail, and none of those care which model you plug in.',
    'That grounding and citation are not a nice-to-have. They are what make an AI answer checkable, and therefore usable, in a context where being wrong has consequences.',
    'That the honest move is to build the escape hatch in from the start: the system is designed to know when it does not know.',
  ],
  provenance:
    'Built as a working system, not a demo: a Python and FastAPI RAG engine with an n8n orchestration tier, 480+ tests, test-driven throughout. It was built for a technical assessment with RiverAI and presented in person. This build ran on hosted models (Claude, Voyage, Pinecone), which is worth saying plainly given the point above about running it where you control it: the model is a component behind an interface, so the same pipeline runs against open models on your own hardware. The repository and the deployments are offline, so there is no live link to give you.',
  results: null,
};
