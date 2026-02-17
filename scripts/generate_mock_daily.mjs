import fs from 'fs';
import path from 'path';

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const templatePath = path.join(root, 'memory', 'templates', 'daily.md');
const outputDir = path.join(root, 'memory', 'daily');
const outputPath = path.join(outputDir, `mock-${today}.md`);

const template = fs.readFileSync(templatePath, 'utf8');

const mockContent = template
  .replace('{{date}}', today)
  .replace('## Top 3 Priorities\n- \n- \n- ', '## Top 3 Priorities\n- Ship secure webhook/cron config\n- Triage overdue tasks\n- Finish one deep-work project milestone')
  .replace('## Must-Do Today\n- ', '## Must-Do Today\n- Finalize 3 tasks due today and clear one blocker')
  .replace('## Risks and Blockers\n- ', '## Risks and Blockers\n- 2 tasks have no project/area linkage')
  .replace('## Suggested Actions (Need Confirmation)\n- [ ] \n- [ ] ', '## Suggested Actions (Need Confirmation)\n- [ ] Move \"Fix Navigation Bug\" to Project \"Launch Personal Website\"\n- [ ] Archive outdated resource notes from 2+ months ago')
  .replace('## Memory Highlights\n- ', '## Memory Highlights\n- Work progress strongest in Coding area over past 7 days')
  .replace(
    '## Source References\n- projects:\n- tasks:\n- resources:\n- history:',
    '## Source References\n- projects: a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01\n- tasks: a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04\n- resources: a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03\n- history: (mock)'
  );

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, mockContent);

console.log(`Generated ${outputPath}`);
