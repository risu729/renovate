import { codeBlock } from 'common-tags';
import type { RenovateConfig } from '../../lib/config/types';
import type { Category } from '../../lib/constants';
import { getManagers } from '../../lib/modules/manager';
import {
  getCustomManagers,
  isCustomManager,
} from '../../lib/modules/manager/custom';
import { readFile, updateFile } from '../utils';
import type { OpenItems } from './github-query-items';
import { generateFeatureAndBugMarkdown } from './github-query-items';
import {
  formatUrls,
  getDisplayName,
  getModuleLink,
  getNameWithUrl,
  replaceContent,
} from './utils';

const noCategoryID = 'no-category';
const noCategoryDisplayName = 'No Category';

function getTitle(
  manager: string,
  displayName: string,
  isCustomMgr: boolean,
): string {
  if (isCustomMgr) {
    return `Custom Manager Support using ${displayName}`;
  }
  return `Automated Dependency Updates for ${displayName}`;
}

function getManagerLink(manager: string): string {
  return getModuleLink(manager, `\`${manager}\``);
}

export const CategoryNames: Record<Category, string> = {
  ansible: 'Ansible',
  batect: 'Batect',
  bazel: 'Bazel',
  c: 'C and C++',
  cd: 'Continuous Delivery',
  ci: 'Continuous Integration',
  custom: 'Custom Managers',
  dart: 'Dart',
  docker: 'Docker',
  dotnet: '.NET',
  elixir: 'Elixir',
  golang: 'Go',
  haskell: 'Haskell',
  helm: 'Helm',
  iac: 'Infrastructure as Code',
  java: 'Java',
  js: 'JavaScript',
  kubernetes: 'Kubernetes',
  node: 'Node.js',
  perl: 'Perl',
  php: 'PHP',
  python: 'Python',
  ruby: 'Ruby',
  rust: 'Rust',
  swift: 'Swift',
  terraform: 'Terraform',
};

export async function generateManagers(
  dist: string,
  managerIssuesMap: OpenItems,
): Promise<void> {
  const allManagers = [...getManagers(), ...getCustomManagers()];

  const allCategories: Record<string, string[]> = {};

  for (const [manager, definition] of allManagers) {
    const { defaultConfig, supportedDatasources, urls } = definition;
    const { managerFilePatterns } = defaultConfig as RenovateConfig;
    const displayName = getDisplayName(manager, definition);
    const isCustomMgr = isCustomManager(manager);

    const categories = definition.categories ?? [noCategoryID];
    for (const category of categories) {
      allCategories[category] ??= [];
      allCategories[category].push(manager);
    }

    let md = codeBlock`
      ---
      title: ${getTitle(manager, displayName, isCustomMgr)}
      sidebar_label: ${displayName}
      edit_url: https://github.com/renovatebot/renovate/edit/main/lib/modules/manager/${
        isCustomMgr ? `custom/${manager}` : manager
      }/readme.md
      ---
      `;
    md += '\n\n';
    md += '**Categories**: ';
    if (categories.length) {
      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        if (i < categories.length - 1) {
          md += `\`${category}\`, `;
        } else {
          md += `\`${category}\``;
        }
      }
    }
    md += '\n\n';

    if (!isCustomMgr) {
      const nameWithUrl = getNameWithUrl(manager, definition);
      md += `Renovate supports updating ${nameWithUrl} dependencies.\n\n`;
      if (defaultConfig.enabled === false) {
        md += '## Enabling\n\n';
        md += `${displayName} functionality is currently in beta testing, so you must opt-in to test it. To enable it, add a configuration like this to either your bot config or your \`renovate.json\`:\n\n`;
        md += '```\n';
        md += `{\n  "${manager}": {\n    "enabled": true\n  }\n}`;
        md += '\n```\n\n';
        md +=
          'If you find any bugs, please [create a new discussion first](https://github.com/renovatebot/renovate/discussions/new). If you find that it works well, then let us know too.\n\n';
      }
      md += '## File Matching\n\n';
      if (
        !Array.isArray(managerFilePatterns) ||
        managerFilePatterns.length === 0
      ) {
        md += `Because file names for \`${manager}\` cannot be easily determined automatically, Renovate will not attempt to match any \`${manager}\` files by default. `;
      } else {
        md += `By default, Renovate will check any files matching `;
        if (managerFilePatterns.length === 1) {
          md += `the following regular expression: \`${managerFilePatterns[0]}\`.\n\n`;
        } else {
          md += `any of the following regular expressions:\n\n`;
          md += '```\n';
          md += managerFilePatterns.join('\n');
          md += '\n```\n\n';
        }
      }
      md += `For details on how to extend a manager's \`managerFilePatterns\` value, please follow [this link](../index.md#file-matching).\n\n`;
      md += '## Supported datasources\n\n';
      const escapedDatasources = (supportedDatasources || [])
        .map(
          (datasource) =>
            `[\`${datasource}\`](../../datasource/${datasource}/index.md)`,
        )
        .join(', ');
      md += `This manager supports extracting the following datasources: ${escapedDatasources}.\n\n`;
      md += formatUrls(urls);
      md += '## Default config\n\n';
      md += '```json\n';
      md += JSON.stringify(definition.defaultConfig, null, 2) + '\n';
      md += '```\n\n';
    }
    const managerReadmeContent = await readFile(
      `lib/modules/manager/${
        isCustomMgr ? `custom/${manager}` : manager
      }/readme.md`,
    );
    if (!isCustomMgr) {
      md += '\n## Additional Information\n\n';
    }
    md += managerReadmeContent;

    md += generateFeatureAndBugMarkdown(managerIssuesMap, manager);

    await updateFile(`${dist}/modules/manager/${manager}/index.md`, md);
  }

  // add noCategoryDisplayName as last option
  const categories = Object.keys(allCategories).filter(
    (category) => category !== noCategoryID,
  );
  categories.sort();
  categories.push(noCategoryID);
  let categoryText = '\n';

  categoryText += '| Group | Category ID | Managers |\n';
  categoryText += '| :-- | :-- | :-- |\n';
  for (const category of categories) {
    const managerLinkList = allCategories[category]
      .map(getManagerLink)
      .join(', ');
    const displayName =
      CategoryNames[category as Category] ?? noCategoryDisplayName;
    const massagedCategory =
      category === noCategoryID ? 'n/a' : `\`${category}\``;
    categoryText += `| ${displayName} | ${massagedCategory} | ${managerLinkList} | \n`;
  }

  let indexContent = await readFile(`docs/usage/modules/manager/index.md`);
  indexContent = replaceContent(indexContent, categoryText);
  await updateFile(`${dist}/modules/manager/index.md`, indexContent);
}
