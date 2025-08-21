#!/usr/bin/env node

const { LinearClient } = require('@linear/sdk');
const { Command } = require('commander');
require('dotenv').config();

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Format priority
function formatPriority(priority) {
  if (!priority) return colors.gray + 'None' + colors.reset;

  const priorityColors = {
    0: colors.gray + '⚪ None',
    1: colors.red + '🔴 Urgent',
    2: colors.yellow + '🟡 High',
    3: colors.blue + '🔵 Medium',
    4: colors.cyan + '⚪ Low'
  };

  return (priorityColors[priority.value] || colors.gray + 'Unknown') + colors.reset;
}

// Format status
function formatStatus(status) {
  if (!status) return colors.gray + 'Unknown' + colors.reset;

  const statusColors = {
    'Todo': colors.gray,
    'Backlog': colors.gray,
    'In Progress': colors.yellow,
    'In Review': colors.cyan,
    'Done': colors.green,
    'Canceled': colors.red
  };

  const color = statusColors[status] || colors.gray;
  return color + status + colors.reset;
}

// Format date
function formatDate(dateString) {
  if (!dateString) return colors.gray + 'N/A' + colors.reset;

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return colors.green + 'Today' + colors.reset;
  } else if (diffDays === 1) {
    return colors.green + 'Yesterday' + colors.reset;
  } else if (diffDays < 7) {
    return colors.cyan + `${diffDays} days ago` + colors.reset;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return colors.blue + `${weeks} week${weeks > 1 ? 's' : ''} ago` + colors.reset;
  } else {
    return colors.gray + date.toLocaleDateString() + colors.reset;
  }
}

// Display issues in table format
function displayTable(issues) {
  if (issues.length === 0) {
    console.log(colors.yellow + '\nNo issues found matching your criteria.' + colors.reset);
    return;
  }

  console.log(`\n${colors.bright}Found ${issues.length} issue${issues.length !== 1 ? 's' : ''}:${colors.reset}\n`);

  issues.forEach((issue, index) => {
    // Issue header
    console.log(`${colors.bright}${index + 1}. [${issue.identifier}] ${issue.title}${colors.reset}`);

    // Issue details
    console.log(`   ${colors.gray}Status:${colors.reset} ${formatStatus(issue.status)}`);
    console.log(`   ${colors.gray}Priority:${colors.reset} ${formatPriority(issue.priority)}`);

    if (issue.assignee) {
      console.log(`   ${colors.gray}Assignee:${colors.reset} ${issue.assignee}`);
    }

    if (issue.labels && issue.labels.length > 0) {
      console.log(`   ${colors.gray}Labels:${colors.reset} ${colors.magenta}${issue.labels.join(', ')}${colors.reset}`);
    }

    if (issue.team) {
      console.log(`   ${colors.gray}Team:${colors.reset} ${issue.team}`);
    }

    console.log(`   ${colors.gray}Created:${colors.reset} ${formatDate(issue.createdAt)}`);
    console.log(`   ${colors.gray}Updated:${colors.reset} ${formatDate(issue.updatedAt)}`);

    if (issue.url) {
      console.log(`   ${colors.gray}URL:${colors.reset} ${colors.blue}${issue.url}${colors.reset}`);
    }

    // Description preview (first 100 chars)
    if (issue.description) {
      const preview = issue.description.replace(/\n/g, ' ').substring(0, 100);
      const ellipsis = issue.description.length > 100 ? '...' : '';
      console.log(`   ${colors.gray}Description:${colors.reset} ${colors.dim}${preview}${ellipsis}${colors.reset}`);
    }

    console.log(); // Empty line between issues
  });
}

// Main function to fetch Linear tickets
async function fetchLinearTickets(options) {
  // Check for API key
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.error(`${colors.red}Error: LINEAR_API_KEY environment variable is not set.${colors.reset}`);
    console.log(`\nPlease set your Linear API key in a .env file or as an environment variable.`);
    console.log(`You can get your API key from: ${colors.blue}https://linear.app/settings/api${colors.reset}\n`);
    process.exit(1);
  }

  try {
    // Initialize Linear client
    const linearClient = new LinearClient({ apiKey });

    console.log(`${colors.cyan}Fetching Linear tickets...${colors.reset}`);

    let issues;

    // Determine which query to use
    if (options.myIssues) {
      // Fetch issues assigned to the current user
      const result = await linearClient.viewer.assignedIssues({
        first: options.limit,
        includeArchived: options.includeArchived,
        orderBy: LinearClient.PaginationOrderBy.UpdatedAt
      });
      issues = result.nodes;
    } else {
      // Build filter object for general issue query
      const filter = {
        first: options.limit,
        includeArchived: options.includeArchived,
        orderBy: LinearClient.PaginationOrderBy.UpdatedAt
      };

      // Add filters if specified
      if (options.team) {
        filter.filter = { ...filter.filter, team: { name: { eq: options.team } } };
      }
      if (options.assignee) {
        filter.filter = { ...filter.filter, assignee: { name: { eq: options.assignee } } };
      }
      if (options.state) {
        filter.filter = { ...filter.filter, state: { name: { eq: options.state } } };
      }
      if (options.label) {
        filter.filter = { ...filter.filter, labels: { name: { eq: options.label } } };
      }
      if (options.project) {
        filter.filter = { ...filter.filter, project: { name: { eq: options.project } } };
      }
      if (options.createdAfter) {
        filter.filter = { ...filter.filter, createdAt: { gte: options.createdAfter } };
      }
      if (options.updatedAfter) {
        filter.filter = { ...filter.filter, updatedAt: { gte: options.updatedAfter } };
      }

      // Fetch issues with filters
      const result = await linearClient.issues(filter);
      issues = result.nodes;
    }

    // Process and format issues
    const formattedIssues = await Promise.all(issues.map(async (issue) => {
      const [assignee, state, team, labels] = await Promise.all([
        issue.assignee,
        issue.state,
        issue.team,
        issue.labels()
      ]);

      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority ? { value: issue.priority, name: issue.priorityLabel } : null,
        status: state?.name,
        assignee: assignee?.name,
        team: team?.name,
        labels: labels?.nodes.map(l => l.name) || [],
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        url: issue.url,
        gitBranchName: issue.branchName
      };
    }));

    // Apply text search if query is specified
    let finalIssues = formattedIssues;
    if (options.query) {
      const query = options.query.toLowerCase();
      finalIssues = formattedIssues.filter(issue =>
        issue.title?.toLowerCase().includes(query) ||
        issue.description?.toLowerCase().includes(query)
      );
    }

    // Output in requested format
    if (options.format === 'json') {
      console.log(JSON.stringify(finalIssues, null, 2));
    } else {
      displayTable(finalIssues);
    }

  } catch (error) {
    console.error(`${colors.red}Error fetching Linear tickets:${colors.reset}`, error.message);

    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.log(`\n${colors.yellow}It looks like your API key might be invalid.${colors.reset}`);
      console.log(`Please check your LINEAR_API_KEY in the .env file.`);
    }

    process.exit(1);
  }
}

// Set up Commander
const program = new Command();

program
  .name('linear')
  .description('CLI tool for fetching and managing Linear tickets')
  .version('1.0.0');

program
  .option('-f, --format <format>', 'output format: table or json', 'table')
  .option('-l, --limit <number>', 'maximum number of issues to fetch', parseInt, 50)
  .option('-m, --my-issues', 'fetch only issues assigned to you')
  .option('--include-archived', 'include archived issues')
  .option('-t, --team <name>', 'filter by team name or ID')
  .option('-a, --assignee <name>', 'filter by assignee name or ID')
  .option('-s, --state <state>', 'filter by state (e.g., "In Progress", "Todo", "Done")')
  .option('--label <label>', 'filter by label name or ID')
  .option('-p, --project <name>', 'filter by project name or ID')
  .option('-q, --query <text>', 'search for text in title or description')
  .option('--created-after <date>', 'filter issues created after this date (ISO format or duration like "-P7D")')
  .option('--updated-after <date>', 'filter issues updated after this date (ISO format or duration like "-P7D")')
  .helpOption('-h, --help', 'display help for command')
  .addHelpText('after', `
${colors.cyan}Environment Variables:${colors.reset}
  ${colors.green}LINEAR_API_KEY${colors.reset}          Your Linear API key (required)

  To get your API key:
  1. Go to Linear Settings → API → Personal API keys
  2. Create a new key with read access
  3. Add it to your .env file: LINEAR_API_KEY=your_key_here

${colors.cyan}Examples:${colors.reset}
  ${colors.gray}# Fetch your assigned issues${colors.reset}
  $ linear --my-issues

  ${colors.gray}# Fetch issues from a specific team in JSON format${colors.reset}
  $ linear --team "Engineering" --format json

  ${colors.gray}# Search for issues containing "bug" updated in the last 7 days${colors.reset}
  $ linear --query "bug" --updated-after "-P7D"

  ${colors.gray}# Fetch issues in a specific state with a limit${colors.reset}
  $ linear --state "In Progress" --limit 20`);

// Parse arguments and run
program.parse(process.argv);
const options = program.opts();

// Run the main function
fetchLinearTickets(options);

module.exports = { fetchLinearTickets };