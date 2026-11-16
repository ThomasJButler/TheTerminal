/**
 * Hand-written copy that is not project, timeline or blog data. One file so the wording is
 * reviewable in one place.
 *
 * Sources: the GitHub profile README (the most recent statement of where Tom is and what he
 * is doing), the personal site's content.ts and About page, and the commercial site's
 * public/data JSON. Where they disagreed, the README won because it is the newest.
 *
 * Standing rules carried over from the personal site: UK spelling, contractions, no em
 * dashes, never "Founder" as a title, the Level 4 apprenticeship is "studied 2023-24".
 */

export const SITE_NAME = 'Tom Butler';
export const MACHINE = 'TJB-100';

export const LINKS = {
  github: 'https://github.com/ThomasJButler',
  linkedin: 'https://www.linkedin.com/in/thomasbutleruk',
  email: 'dev@thomasjbutler.me',
  codepen: 'https://codepen.io/thomasbutler',
  aiPortfolio: 'https://agenticaiprojectsportfolio.vercel.app/',
  timetravel: 'https://thomasjbutler.github.io/version-timetravel/',
  agencyShowcase:
    'https://tombutler.notion.site/Web-Agency-Showcase-1a11b94bcaea80ffa87ae2fb8994e4de',
  coffee: 'https://buymeacoffee.com/ojrwoqkgmv',
  formEndpoint: 'https://formspree.io/f/xeoeenqv',
};

export const ROLE = 'Junior AI Agent Developer';
export const LOCATION = 'Chalfont St Giles, Buckinghamshire';
export const TAGLINE = 'Full stack · Python and TypeScript · AI embedded systems';

/** The profile README's "A Bit About Me", paragraph for paragraph. */
export const BIO: string[] = [
  'Career changer. Former pro cricketer, commercial diver, then a DWP Work Coach helping young people into their dream careers. After a while, I realised my own dream career was quite literally staring at me in the face through a computer screen. Have always been a nerd at heart, however too scared to really go for it and took the safe choices (well, after the diving).',
  'I only took the plunge (no pun intended) into software from a standing start in early 2022. Learning around my DWP job and building things, purely for fun. AI releasing in late 2022 inspired me to continue this journey, and embrace the tools that are a critical part of modern life today, and most probably, the future of software engineering.',
  'I took a cloud and data engineering bootcamp in early 2023 and went on to work 18 months as an apprentice developer at a HubSpot agency in Cheshire. From December 2024 I was building under a personal AI startup: fully solo, with a lot of shipping, whilst working the odd jobs to keep the lights on and continue my development passion.',
  "I'm always aiming to learn and improve my code and fundamentals, as this is the only part of software that doesn't change every few years, and whatever I am learning I build a side project alongside it. Some of these projects have really kicked on since, and allow me to continue learning in that specific area over time.",
  'I think software should give people time back, not take it from them. Most of what I build is aimed at that, making tech adapt to humans and not the other way around.',
];

export const NOW: string[] = [
  'As of September 2026 I am working as a Junior AI Agent Developer at **Levocell**, a sustainable AI smart energy company in Buckinghamshire. This is now my sole focus long term, and I truly believe we are onto something big that is needed more than ever, with the state of rising energy costs in the UK.',
  'What I build: RAG pipelines, multi-agent tooling, websites and web apps, voice agents, local AI embedded systems and full stack digital products.',
  'The passion project is **Sanctuary**, a fully private on-device iOS app for neurodiverse minds, rolling out on iOS 27 using local Apple foundation models. See `projects/sanctuary.md`.',
];

export const USE_NOW = [
  'Python', 'TypeScript', 'React', 'FastAPI', 'LangChain', 'Ollama', 'Claude Code', 'DuckDB',
  'Swift', 'Supabase', 'Vite',
];
export const USE_NOW_ALSO = ['LangGraph', 'RAG', 'Pinecone', 'Splink', 'Playwright'];
export const WORKED_WITH = [
  '.NET/C#', 'Node.js', 'SQL/MongoDB', 'Azure', 'AWS', 'HubSpot', 'Umbraco', 'Bootstrap',
  'CSS3/SCSS', 'JavaScript', 'Vercel', 'BitBucket', 'Docker',
];

/** "Why does this site exist?" Tom's own words, from the personal site's About page. */
export const WHY: string[] = [
  'Fair. I ask myself most days.',
  "It's where I experiment and crash things. I built it from scratch, and every version I've ever shipped still runs, which you can go and poke at.",
  "It keeps my web work sharp and it keeps the personal stuff separate from the commercial stuff. Some of what's here could be commercial one day. Sanctuary, Offshore, The Kicker, Octopus.",
  "A senior developer once told me that the longer you do this, the more you notice what you don't know, and that the job is learning to be comfortable with that. He was right. I know a fraction of this field. In twenty years I expect to know a slightly larger fraction of a much bigger field, because this stuff changes constantly, so the gap will look about the same size it does now. Unknown unknowns. Software is humbling about them.",
  "Which means if you stop learning, you don't hold your position. You get worse, because everything around you moved and you didn't. Degree or no degree. Genius or not.",
  "So what I'm building is the habit, not the finished article. Keep learning, keep trying things, stay curious, let it stack up. The evidence is on this machine.",
];

/** The years before the first line of code, from the personal site's About page. */
export const BEFORE: { era: string; title: string; text: string }[] = [
  {
    era: '2000s',
    title: 'The beginning',
    text: 'Jailbreaking an iPod Touch, obsessed with The Matrix, and always the one with app ideas and no way to build them.',
  },
  {
    era: '2014-20',
    title: 'Everything but code',
    text: 'Two seasons of Victorian Premier League cricket in Melbourne, commercial diving, paraplanning in financial services, and a conveyancing desk in Southport. Not a line of code in any of it.',
  },
  {
    era: '2021-23',
    title: 'DWP Work Coach',
    text: "Twenty appointments a day, 150 people on the caseload, and I could only ever help one of them at a time. That's the whole reason I moved into software.",
  },
  {
    era: 'Early 2022',
    title: 'First line of code',
    text: 'From a standing start, teaching myself around a full-time job at the DWP. Cloud Engineering and Data Science bootcamp with The Growth Company in 2023.',
  },
];

/* ─── Work: the commercial side ─── */

export const FUELIUS = {
  dates: 'August 2023 to December 2024',
  role: 'Apprentice full-stack developer',
  where: 'Fuelius, a HubSpot partner agency in Chester',
  body: [
    'Client websites for event venues, technology companies, healthcare providers and more: twelve named clients, an NHS trust among them. JIRA tickets, code review and release branches on live client sites.',
    "The agency taught me fundamentals and to question everything. I don't use most of that stack day to day now. I use the habits daily.",
    'Studied the Level 4 Software Developer Apprenticeship with Estio alongside the role (studied 2023-24). Made redundant December 2024.',
  ],
  stack: ['Umbraco', 'HubSpot', 'HubL', 'C#/.NET', 'SCSS', 'JavaScript', 'JIRA', 'Azure', 'BitBucket', 'Docker'],
};

export const CLIENTS = [
  'M&S Bank Arena', 'CDW', 'ACC Liverpool', 'InfoTrack', 'MasterMover', 'Merseyrail', 'PvCase',
  'Premex', 'Fusion21', 'Lancashire Cricket', 'Orega', "Liverpool Women's NHS Foundation Trust",
];

export const INDEPENDENT = {
  dates: 'December 2024 to August 2026',
  body: [
    'Where my independent work lived, under the name AiTomatic. Solo and self-funded. Data pipelines, RAG systems, multi-agent tooling, an entity-resolution engine across two government registers, and a lot of shipping.',
    'Sanctuary came out of it: native iOS, Swift and SwiftData, fully on-device. A daily functioning app for neurodiverse users, built from lived experience. Nothing leaves the phone, which is the whole design rather than a feature.',
  ],
};

/** The commercial site's "what I'd be happy to be interviewed on, and roughly how deep it goes". */
export const SKILL_DEPTH: { title: string; text: string; level: string }[] = [
  { title: 'Web Development', level: '4 years', text: 'HTML5, CSS3, JavaScript and React, with Bootstrap, Tailwind and Sass. Client releases across 12 accounts at a HubSpot and Umbraco agency.' },
  { title: 'Programming & Backend', level: '4 years', text: 'Python, C# and .NET, Node.js. FastAPI, ASP.NET Core, Django and Express in production and in side projects.' },
  { title: 'Version Control & API', level: '4 years', text: 'Git, GitHub, GitLab and BitBucket, REST APIs, GraphQL and Swagger. JIRA tickets, code review and release branches on live client sites.' },
  { title: 'AI Systems & Agents', level: '3 years', text: 'RAG pipelines, LangChain and LangGraph agents, evaluation and confidence scoring, local models with Ollama, the Claude and OpenAI SDKs. Systems, not model training.' },
  { title: 'Database Management', level: '4 years', text: 'SQL, schema design and query optimisation. PostgreSQL, MySQL, MongoDB, Supabase and DuckDB.' },
  { title: 'Deployment', level: '4 years', text: 'Docker, GitHub Actions and CI/CD pipelines. Vercel, Netlify, Render, Azure App Service and IIS.' },
  { title: 'Testing & QA', level: '4 years', text: 'Vitest, Playwright, pytest and xUnit. 480+ tests on the ISQ Agent, 600+ on Sanctuary, and a backtest gate on The Kicker that fails CI if a refit gets worse.' },
  { title: 'Data Engineering & Pipelines', level: '4 years', text: "DuckDB, pandas and Splink entity resolution on the Offshore Property Map. Monthly change-file ingestion, FollowTheMoney export, and a pipeline that can prove how often it's wrong." },
  { title: 'Accessibility & Design Systems', level: '4 years', text: 'WCAG AA across 30+ CSS Showcase demos, WCAG AAA targets on Sanctuary, Material Design 3 token systems, reduced motion by default.' },
  { title: 'iOS / Swift', level: 'In active development', text: 'SwiftUI, SwiftData and on-device speech and AI for Sanctuary. Self-taught to ship native rather than wrap a webview.' },
];

export const CERTS: { when: string; title: string; by: string; text: string }[] = [
  { when: '2023-26', title: 'Front-End Engineer Career Path', by: 'Codecademy', text: "Started alongside the Level 4 apprenticeship to cover the front-end depth it didn't go into, and finished in August 2026. Codecademy calls it 115 hours. It took me 2,000+, because I built every project by hand and went slow enough to understand and troubleshoot it myself rather than let AI do it." },
  { when: '2025', title: 'Mastering Generative AI & Agents for Developers Bootcamp', by: 'Codecademy', text: 'Six-week AI bootcamp: 12+ frameworks and six applications built.' },
  { when: '2025', title: 'City & Guilds Level 2 ICT System Support Diploma', by: 'JCB Training', text: 'Eight-week bootcamp covering IT infrastructure, networking and system administration.' },
  { when: '2025-', title: 'AI/ML Engineer Career Path', by: 'Codecademy', text: 'Enrolled: neural networks, deep learning and production ML systems.' },
  { when: '2023-25', title: 'Full Stack Engineer Career Path', by: 'Codecademy', text: 'React, Node.js, TypeScript, SQL and modern deployment practices.' },
  { when: '2023-24', title: 'Level 4 Software Developer Apprenticeship (studied 2023-24)', by: 'Estio', text: 'Studied alongside the Fuelius role. It gave me the fundamentals: software development principles, agile, and the habit of questioning everything.' },
  { when: '2024', title: 'Data and Programming Foundations for AI', by: 'Codecademy', text: 'Data structures, algorithms and AI-specific programming concepts.' },
  { when: '2024', title: 'Build a Machine Learning Model', by: 'Codecademy', text: 'Hands-on model training and evaluation.' },
  { when: '2023-24', title: 'Data Analysis with Python', by: 'freeCodeCamp', text: 'pandas, NumPy and data visualisation.' },
  { when: '2023', title: 'HubSpot CMS for Developers 1 and 2', by: 'HubSpot', text: 'Both HubSpot developer certifications for CMS development.' },
  { when: '2023', title: 'AWS Cloud Quest and AWS Skill Builder', by: 'AWS', text: 'Cloud architecture, core AWS services and deployment.' },
  { when: '2023', title: 'Introduction to Cybersecurity, Data Analytics Essentials, Packet Tracer', by: 'Cisco', text: 'Security principles, analysis techniques and hands-on network simulation.' },
  { when: '2023', title: 'Cloud Engineering and Data Science Bootcamp', by: 'The Growth Company', text: 'Cloud platforms (AWS, Azure), Python and data science fundamentals.' },
  { when: '2022-23', title: 'Intro to LLMs and Prompt Engineering Practices', by: 'Codecademy', text: 'LLM fundamentals, RAG and zero-shot learning. Where the AI side started.' },
];

export const INTERESTS: { title: string; text: string }[] = [
  { title: 'Playing guitar and creating music', text: 'Exploring different genres and improving my skills.' },
  { title: 'Cricket', text: 'Loved to play ever since childhood.' },
  { title: 'Skiing', text: 'Enjoying the slopes and the fresh mountain air.' },
  { title: 'Hiking and camping', text: 'Exploring the great outdoors.' },
  { title: 'Casual gaming', text: 'The odd game here and there, to relax and unwind.' },
  { title: 'AI image and model creation', text: 'Learning to use new and existing AI tools.' },
];

export const BLOG_META: Record<string, { title: string; excerpt: string; date: string; tags: string[] }> = {
  'ai-that-codes-like-you': { title: 'AI That Codes Like You', excerpt: 'Building AI systems that understand and replicate individual coding styles', date: '2025-09-20', tags: ['AI', 'Machine Learning', 'Development'] },
  'building-bridges-not-replacements': { title: 'Building Bridges, Not Replacements', excerpt: 'How technology should empower humans rather than replace them', date: '2024-11-28', tags: ['Tech Philosophy', 'Human-Centered Design'] },
  'context-engineering-101': { title: 'Context Engineering 101', excerpt: 'A comprehensive guide to managing context in AI systems', date: '2025-03-14', tags: ['AI', 'Engineering', 'Tutorial'] },
  'context-loss-productivity-killer': { title: 'Context Loss: The Productivity Killer', excerpt: 'How context loss impacts development productivity and how to prevent it', date: '2025-01-08', tags: ['Productivity', 'Development'] },
  'from-prompts-to-context-systems': { title: 'From Prompts to Context Systems', excerpt: 'The paradigm shift in AI interaction models', date: '2025-04-25', tags: ['AI', 'System Design'] },
  'losing-craftsmanship-to-automation': { title: 'Losing Craftsmanship to Automation', excerpt: 'Preserving the art of coding in an automated world', date: '2024-11-05', tags: ['Craftsmanship', 'Automation'] },
  'making-ai-more-human': { title: 'Making AI More Human', excerpt: 'Beyond the uncanny valley of code generation', date: '2025-08-03', tags: ['AI', 'UX', 'Human-Centered Design'] },
  'manifesto-human-first-tech': { title: 'Manifesto: Human-First Tech', excerpt: 'A call for technology that serves humanity', date: '2025-07-10', tags: ['Tech Philosophy', 'Manifesto'] },
  'tech-burnout-crisis': { title: 'The Tech Burnout Crisis', excerpt: 'Understanding and addressing developer burnout in the AI age', date: '2024-10-08', tags: ['Mental Health', 'Developer Wellness'] },
  'the-personalization-revolution': { title: 'The Personalisation Revolution', excerpt: 'How personalised AI will transform development', date: '2025-10-15', tags: ['AI', 'Personalisation', 'Future Tech'] },
};
