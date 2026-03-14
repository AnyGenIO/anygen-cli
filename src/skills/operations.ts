/**
 * Operation 定义
 *
 * 每个 operation 描述一种 AnyGen 内容生成类型，
 * 用于生成对应的 Skill 操作指南 (operations/*.md)
 */

export interface OperationDef {
  /** 操作名称（API 参数值） */
  name: string;
  /** 人类可读标题 */
  title: string;
  /** 内容类型名称（用于用户交互） */
  contentName: string;
  /** 描述 */
  description: string;
  /** 预计时间 */
  estimatedTime: string;
  /** 导出格式（可选） */
  exportFormat?: string;
  /** 输出文件类型（用于下载交付） */
  outputFileType?: string;
  /** 是否需要本地渲染（如 smart_draw） */
  requiresRendering?: boolean;
  /** subagent 超时秒数 */
  spawnTimeoutSeconds: number;
  /** poll 超时秒数 */
  pollTimeoutSeconds: number;
  /** 触发词 */
  triggers: string;
  /** 修改示例 */
  modifyExamples: string[];
  /** Skill 目录名称（与 clawhub 一致） */
  trackingName: string;
  /** 特殊说明 */
  notes?: string[];
  /** Phase 1 示例消息 */
  prepareExample: string;
  /** Phase 1 续轮示例 */
  prepareFollowUp: string;
}

export const OPERATIONS: OperationDef[] = [
  {
    name: 'slide',
    title: 'Slide / PPT Generation',
    contentName: 'slides',
    description: 'Use this skill any time the user wants to create, design, or produce slide presentations \u2014 as standalone files or embedded content. This includes: pitch decks, slide decks, keynote presentations, training materials, project proposals, quarterly reviews, weekly report slides, investor pitches, product launches, team kickoffs, business plans, onboarding decks, strategy presentations, sales pitches, conference talks, and any request involving \'slides\' or \'PPT\'. Also trigger when: user says \u505A PPT, \u505A\u4E2A\u6C47\u62A5, \u5199\u4E2A\u6F14\u793A\u6587\u7A3F, \u5B63\u5EA6\u6C47\u62A5, \u7ADE\u54C1\u5206\u6790\u62A5\u544A\uFF08\u8981PPT\uFF09, \u4EA7\u54C1\u53D1\u5E03\u4F1A, \u57F9\u8BAD\u6750\u6599, \u5468\u62A5. If slides, decks, or presentations need to be produced, use this skill.',
    estimatedTime: '10-15 minutes',
    outputFileType: 'PPTX',
    trackingName: 'slide-generator',
    spawnTimeoutSeconds: 1500,
    pollTimeoutSeconds: 1200,
    triggers: 'pitch decks, keynotes, training materials, project proposals, quarterly reviews, investor pitches, product launches, onboarding decks, sales pitches, conference talks, \u505APPT, \u505A\u4E2A\u6C47\u62A5, \u5199\u4E2A\u6F14\u793A\u6587\u7A3F, \u5B63\u5EA6\u6C47\u62A5, \u4EA7\u54C1\u53D1\u5E03\u4F1A, \u57F9\u8BAD\u6750\u6599, \u5468\u62A5',
    modifyExamples: [
      'Change the title on page 3 to "Product Overview"',
      'Add a summary slide at the end',
      'Make the color scheme warmer',
      'Replace the chart on page 5 with a pie chart',
    ],
    prepareExample: 'I need a slide deck for our Q4 board review. Key content: [extracted summary]',
    prepareFollowUp: 'The audience is C-level execs, goal is to approve next quarter\'s budget',
  },
  {
    name: 'doc',
    title: 'Document / DOCX Generation',
    contentName: 'document',
    description: 'Use this skill any time the user wants to create, draft, or generate a written document or report. This includes: competitive analysis, market research reports, technical design docs, PRDs, project proposals, meeting summaries, white papers, business plans, literature reviews, due diligence reports, industry analysis, executive summaries, SOPs, memos, and any request where the output is a structured document. Also trigger when: user says \u5199\u4E2A\u6587\u6863, \u505A\u4E2A\u7ADE\u54C1\u8C03\u7814, \u5199\u4EFD\u62A5\u544A, \u4EA7\u54C1\u9700\u6C42\u6587\u6863, \u6280\u672F\u65B9\u6848, \u9879\u76EE\u63D0\u6848, \u884C\u4E1A\u5206\u6790, \u4F1A\u8BAE\u7EAA\u8981\u6574\u7406\u6210\u6587\u6863. If a document or report needs to be created, use this skill.',
    estimatedTime: '10-15 minutes',
    exportFormat: 'docx',
    outputFileType: 'DOCX',
    trackingName: 'doc-generator',
    spawnTimeoutSeconds: 1500,
    pollTimeoutSeconds: 1200,
    triggers: 'technical design docs, PRDs, competitive analysis, white papers, meeting summaries, business plans, executive summaries, SOPs, memos, \u5199\u4E2A\u6587\u6863, \u505A\u4E2A\u7ADE\u54C1\u8C03\u7814, \u5199\u4EFD\u62A5\u544A, \u4EA7\u54C1\u9700\u6C42\u6587\u6863, \u6280\u672F\u65B9\u6848, \u9879\u76EE\u63D0\u6848, \u884C\u4E1A\u5206\u6790, \u4F1A\u8BAE\u7EAA\u8981',
    modifyExamples: [
      'Change the section title to "Executive Summary"',
      'Add a conclusion section',
      'Make the formatting more formal',
      'Expand the methodology section',
    ],
    prepareExample: 'I need a technical design document based on this report. Key content: [extracted summary]',
    prepareFollowUp: 'The audience is engineering managers, goal is to document the auth system architecture',
  },
  {
    name: 'smart_draw',
    title: 'Diagram Generation (SmartDraw)',
    contentName: 'diagram',
    description: 'Use this skill any time the user wants to create diagrams, flowcharts, or visual structures. This includes: architecture diagrams, mind maps, org charts, user journey maps, system design diagrams, ER diagrams, sequence diagrams, process flows, decision trees, network topologies, class diagrams, Gantt charts, SWOT analysis diagrams, wireframes, and sitemaps. Also trigger when: user says \u753B\u4E2A\u6D41\u7A0B\u56FE, \u505A\u4E2A\u67B6\u6784\u56FE, \u601D\u7EF4\u5BFC\u56FE, \u7EC4\u7EC7\u67B6\u6784\u56FE, \u7528\u6237\u65C5\u7A0B\u56FE, \u7CFB\u7EDF\u8BBE\u8BA1\u56FE, \u7518\u7279\u56FE. If a diagram or visual structure needs to be drawn, use this skill.',
    estimatedTime: '30-60 seconds',
    exportFormat: 'drawio',
    requiresRendering: true,
    trackingName: 'diagram-generator',
    spawnTimeoutSeconds: 300,
    pollTimeoutSeconds: 180,
    triggers: 'architecture diagrams, flowcharts, mind maps, org charts, ER diagrams, sequence diagrams, class diagrams, UML, Gantt charts, wireframes, sitemaps, decision trees, \u753B\u4E2A\u6D41\u7A0B\u56FE, \u505A\u4E2A\u67B6\u6784\u56FE, \u601D\u7EF4\u5BFC\u56FE, \u7EC4\u7EC7\u67B6\u6784\u56FE, \u7CFB\u7EDF\u8BBE\u8BA1\u56FE, \u7518\u7279\u56FE',
    modifyExamples: [
      'Add a database node between the API gateway and user service',
      'Change the arrow style to dashed lines',
      'Add labels to the connections',
      'Reorganize the layout to be horizontal',
    ],
    prepareExample: 'I need an architecture diagram based on this design doc. Key content: [extracted summary]',
    prepareFollowUp: 'Include API gateway, auth service, user service, and PostgreSQL database. Show the request flow',
  },
  {
    name: 'deep_research',
    title: 'Deep Research Report',
    contentName: 'research report',
    description: 'Use this skill any time the user wants in-depth research or comprehensive analysis on any topic. This includes: industry analysis, competitive landscape mapping, market sizing, trend analysis, technology reviews, investment research, sector overviews, due diligence, benchmark studies, patent landscape analysis, regulatory analysis, and academic surveys. Also trigger when: user says \u5E2E\u6211\u8C03\u7814\u4E00\u4E0B, \u6DF1\u5EA6\u5206\u6790, \u884C\u4E1A\u7814\u7A76, \u5E02\u573A\u89C4\u6A21\u5206\u6790, \u7ADE\u4E89\u683C\u5C40, \u6280\u672F\u8D8B\u52BF, \u505A\u4E2A\u7814\u7A76\u62A5\u544A. If deep research or comprehensive analysis is needed, use this skill.',
    estimatedTime: '10-20 minutes',
    trackingName: 'deep-research',
    spawnTimeoutSeconds: 1500,
    pollTimeoutSeconds: 1200,
    triggers: 'industry analysis, market sizing, competitive landscape, trend analysis, technology reviews, benchmark studies, regulatory analysis, academic surveys, \u5E2E\u6211\u8C03\u7814\u4E00\u4E0B, \u6DF1\u5EA6\u5206\u6790, \u884C\u4E1A\u7814\u7A76, \u5E02\u573A\u89C4\u6A21\u5206\u6790, \u505A\u4E2A\u7814\u7A76\u62A5\u544A',
    modifyExamples: [
      'Add a section on regulatory implications',
      'Expand the competitor analysis',
      'Include more data on market sizing',
      'Add a SWOT analysis',
    ],
    prepareExample: 'I need a deep research report on the global AI chip market. Key content: [extracted summary]',
    prepareFollowUp: 'Focus on NVIDIA, AMD, and custom silicon. Include 3-year outlook and market size estimates',
  },
  {
    name: 'data_analysis',
    title: 'Data Analysis (CSV)',
    contentName: 'analysis results',
    description: 'Use this skill any time the user wants to analyze data, create charts, or build data visualizations. This includes: sales analysis, financial modeling, cohort analysis, funnel analysis, A/B test results, KPI tracking, data reports, revenue breakdowns, user retention analysis, conversion rate analysis, CSV summarization, and dashboard creation. Also trigger when: user says \u5206\u6790\u8FD9\u7EC4\u6570\u636E, \u505A\u4E2A\u56FE\u8868, \u6570\u636E\u53EF\u89C6\u5316, \u9500\u552E\u5206\u6790, \u6F0F\u6597\u5206\u6790, \u7559\u5B58\u5206\u6790, \u505A\u4E2A\u6570\u636E\u62A5\u8868. If data needs to be analyzed or visualized, use this skill.',
    estimatedTime: '10-15 minutes',
    trackingName: 'data-analysis',
    spawnTimeoutSeconds: 1500,
    pollTimeoutSeconds: 1200,
    triggers: 'CSV analysis, charts, dashboards, funnel analysis, cohort analysis, KPI tracking, A/B test results, revenue breakdowns, retention analysis, \u5206\u6790\u8FD9\u7EC4\u6570\u636E, \u505A\u4E2A\u56FE\u8868, \u6570\u636E\u53EF\u89C6\u5316, \u9500\u552E\u5206\u6790, \u6F0F\u6597\u5206\u6790, \u505A\u4E2A\u6570\u636E\u62A5\u8868',
    modifyExamples: [
      'Change the chart type to bar chart',
      'Add a trend line to the revenue chart',
      'Filter data by region: Asia',
      'Add a comparison with last quarter',
    ],
    prepareExample: 'I need to analyze this sales data. Columns: date, product, region, revenue, units. Key content: [extracted summary]',
    prepareFollowUp: 'Focus on monthly revenue trends by region, and create a chart showing top products',
  },
  {
    name: 'finance',
    title: 'Financial Research',
    contentName: 'research report',
    description: 'Use this skill any time the user wants financial analysis, earnings research, or investment-related reports. This includes: earnings call summaries, quarterly financial analysis, stock research, equity research reports, financial due diligence, company valuations, DCF models, balance sheet analysis, income statement breakdowns, cash flow analysis, SEC filing summaries, investor memos, portfolio analysis, IPO analysis, M&A research, and credit analysis. Also trigger when: user says \u5206\u6790\u8D22\u62A5, \u505A\u4E2A\u4F30\u503C, \u80A1\u7968\u7814\u7A76, \u8D22\u52A1\u5C3D\u8C03, \u73B0\u91D1\u6D41\u5206\u6790, \u6536\u5165\u5206\u6790, \u5B63\u5EA6\u8D22\u52A1\u5206\u6790. If financial research or analysis is needed, use this skill.',
    estimatedTime: '10-15 minutes',
    trackingName: 'financial-research',
    spawnTimeoutSeconds: 1500,
    pollTimeoutSeconds: 1200,
    triggers: 'earnings analysis, stock research, company valuations, DCF models, balance sheet analysis, cash flow analysis, SEC filings, M&A research, IPO analysis, \u5206\u6790\u8D22\u62A5, \u505A\u4E2A\u4F30\u503C, \u80A1\u7968\u7814\u7A76, \u8D22\u52A1\u5C3D\u8C03, \u5B63\u5EA6\u8D22\u52A1\u5206\u6790',
    modifyExamples: [
      'Add a DCF valuation model',
      'Compare with industry peers',
      'Expand the revenue segment analysis',
      'Add quarterly trend charts',
    ],
    prepareExample: 'Analyze NVIDIA\'s latest earnings. Key content: [extracted summary]',
    prepareFollowUp: 'Focus on revenue breakdown by segment, YoY growth, and forward guidance',
    notes: ['Disclaimer: This tool is not investment advice. It uses publicly available data from sources like Bloomberg, Yahoo Finance, and company filings.'],
  },
  {
    name: 'storybook',
    title: 'Storybook / Creative Visuals',
    contentName: 'storybook',
    description: 'Use this skill any time the user wants to create visual stories, illustrated narratives, or storybook content. This includes: storybooks, comics, children\'s books, illustrated guides, step-by-step visual tutorials, brand stories, product stories, picture books, graphic novels, and visual explainers. Also trigger when: user says \u505A\u4E2A\u7ED8\u672C, \u753B\u4E2A\u6545\u4E8B, \u505A\u4E2A\u6F2B\u753B, \u505A\u4E2A\u56FE\u6587\u6559\u7A0B, \u505A\u4E2A\u54C1\u724C\u6545\u4E8B. If a visual story or illustrated content needs to be created, use this skill.',
    estimatedTime: '10-15 minutes',
    trackingName: 'storybook-generator',
    spawnTimeoutSeconds: 1500,
    pollTimeoutSeconds: 1200,
    triggers: 'illustrated stories, comics, children\'s books, picture books, graphic novels, visual tutorials, brand stories, \u505A\u4E2A\u7ED8\u672C, \u753B\u4E2A\u6545\u4E8B, \u505A\u4E2A\u6F2B\u753B, \u505A\u4E2A\u56FE\u6587\u6559\u7A0B, \u505A\u4E2A\u54C1\u724C\u6545\u4E8B',
    modifyExamples: [
      'Change the art style to watercolor',
      'Add a new scene after page 3',
      'Make the character expressions more cheerful',
      'Change the color palette to warmer tones',
    ],
    prepareExample: 'I need a storybook for a product demo video. Key content: [extracted summary]',
    prepareFollowUp: 'The visual style should be modern and clean, targeting tech-savvy users',
  },
  {
    name: 'website',
    title: 'Website Generation',
    contentName: 'website',
    description: 'Use this skill any time the user wants to build a website or landing page. This includes: product pages, portfolio sites, event pages, coming soon pages, pricing pages, company intro sites, personal blogs, signup pages, app download pages, and campaign pages. Also trigger when: user says \u505A\u4E2A\u7F51\u7AD9, \u5EFA\u4E2A\u843D\u5730\u9875, \u505A\u4E2A\u4EA7\u54C1\u9875, \u505A\u4E2A\u6D3B\u52A8\u9875, \u505A\u4E2A\u4E2A\u4EBA\u4E3B\u9875. If a website or web page needs to be created, use this skill.',
    estimatedTime: '10-15 minutes',
    trackingName: 'website-generator',
    spawnTimeoutSeconds: 1500,
    pollTimeoutSeconds: 1200,
    triggers: 'landing pages, product pages, portfolio sites, pricing pages, personal blogs, event pages, campaign pages, \u505A\u4E2A\u7F51\u7AD9, \u5EFA\u4E2A\u843D\u5730\u9875, \u505A\u4E2A\u4EA7\u54C1\u9875, \u505A\u4E2A\u6D3B\u52A8\u9875, \u505A\u4E2A\u4E2A\u4EBA\u4E3B\u9875',
    modifyExamples: [
      'Change the hero section background color',
      'Add a testimonials section',
      'Update the pricing table',
      'Make the design more minimalist',
    ],
    prepareExample: 'I need a product landing page. Key content: [extracted summary]',
    prepareFollowUp: 'Target audience is small business owners, include hero section, features, pricing, and CTA',
  },
  {
    name: 'ai_designer',
    title: 'Image Design',
    contentName: 'image',
    description: 'Use this skill any time the user wants to generate, create, or design images, illustrations, or visual assets. This includes: posters, banners, social media graphics, product mockups, logo concepts, thumbnails, marketing creatives, profile pictures, book covers, album art, icon designs, and any request for AI-generated imagery. Also trigger when: user says \u751F\u6210\u56FE\u7247, \u505A\u4E2A\u6D77\u62A5, \u753B\u4E2A\u63D2\u56FE, \u8BBE\u8BA1\u4E2Abanner, \u505A\u4E2A\u5C01\u9762, \u793E\u4EA4\u5A92\u4F53\u914D\u56FE, \u4EA7\u54C1\u6548\u679C\u56FE. If an image or visual asset needs to be created, use this skill.',
    estimatedTime: '5-10 minutes',
    trackingName: 'image-generator',
    spawnTimeoutSeconds: 1500,
    pollTimeoutSeconds: 1200,
    triggers: 'posters, banners, social media graphics, product mockups, logo concepts, marketing creatives, book covers, icon designs, \u751F\u6210\u56FE\u7247, \u505A\u4E2A\u6D77\u62A5, \u753B\u4E2A\u63D2\u56FE, \u8BBE\u8BA1\u4E2Abanner, \u505A\u4E2A\u5C01\u9762, \u4EA7\u54C1\u6548\u679C\u56FE',
    modifyExamples: [
      'Make the background darker',
      'Change the text to bold font',
      'Add a logo in the top-right corner',
      'Adjust the color scheme to blue tones',
    ],
    prepareExample: 'I need a poster design for a music festival. Style reference uploaded.',
    prepareFollowUp: 'Vibrant colors, modern style, include artist names and venue info',
  },
];
