#!/usr/bin/env node

const { LinearClient } = require('@linear/sdk');
const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

// Config file path
const CONFIG_PATH = path.join(os.homedir(), '.linear-cli-config.json');

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

// Load config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (error) {
    console.error(`${colors.yellow}Warning: Could not load config file${colors.reset}`);
  }
  return {};
}

// Save config
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error(`${colors.red}Error saving config:${colors.reset}`, error.message);
    return false;
  }
}

// Format priority
function formatPriority(priority) {
  if (priority === null || priority === undefined || priority === 0) return 'None';

  const priorityMap = {
    1: 'Urgent',
    2: 'High',
    3: 'Medium',
    4: 'Low'
  };

  return priorityMap[priority] || 'Unknown';
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

// Format date/time with relative formatting
function formatRelativeTime(dateString) {
  if (!dateString) return colors.gray + 'N/A' + colors.reset;

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) {
    return colors.green + 'Just now' + colors.reset;
  } else if (diffMins < 60) {
    return colors.green + `${diffMins} min${diffMins > 1 ? 's' : ''} ago` + colors.reset;
  } else if (diffHours < 24) {
    return colors.cyan + `${diffHours} hour${diffHours > 1 ? 's' : ''} ago` + colors.reset;
  } else if (diffDays < 7) {
    return colors.blue + `${diffDays} day${diffDays > 1 ? 's' : ''} ago` + colors.reset;
  } else {
    return colors.gray + date.toLocaleDateString() + colors.reset;
  }
}

// Display focused issues
function displayFocusedIssues(issues) {
  if (issues.length === 0) {
    console.log(colors.green + '\n✨ All caught up! No high-priority issues need your attention right now.' + colors.reset);
    return;
  }

  console.log(`\n${colors.bright}${colors.cyan}📋 Focus on these issues:${colors.reset}\n`);

  issues.forEach((issue, index) => {
    let assignmentIndicator = '';
    if (issue.isAssignedToMe) {
      assignmentIndicator = ` ${colors.green}[YOURS]${colors.reset}`;
    } else if (!issue.assignee) {
      assignmentIndicator = ` ${colors.yellow}[UNASSIGNED]${colors.reset}`;
    } else {
      assignmentIndicator = ` ${colors.dim}[${issue.assignee}]${colors.reset}`;
    }

    console.log(`${colors.bright}${index + 1}. [${issue.identifier}] ${issue.title}${colors.reset}${assignmentIndicator}`);
    console.log(`   ${colors.gray}Priority:${colors.reset} ${formatPriority(issue.priority)}`);
    console.log(`   ${colors.gray}Status:${colors.reset} ${formatStatus(issue.status)}`);

    if (issue.lastCommentTime) {
      console.log(`   ${colors.gray}Last activity:${colors.reset} ${formatRelativeTime(issue.lastCommentTime)}`);
    }

    if (issue.team) {
      console.log(`   ${colors.gray}Team:${colors.reset} ${issue.team}`);
    }

    if (issue.labels && issue.labels.length > 0) {
      console.log(`   ${colors.gray}Labels:${colors.reset} ${colors.magenta}${issue.labels.join(', ')}${colors.reset}`);
    }

    console.log(`   ${colors.gray}URL:${colors.reset} ${colors.blue}${issue.url}${colors.reset}`);

    if (issue.description) {
      const preview = issue.description.replace(/\n/g, ' ').substring(0, 100);
      const ellipsis = issue.description.length > 100 ? '...' : '';
      console.log(`   ${colors.gray}Description:${colors.reset} ${colors.dim}${preview}${ellipsis}${colors.reset}`);
    }

    console.log();
  });
}

// List all teams
async function listTeams(options) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.error(`${colors.red}Error: LINEAR_API_KEY environment variable is not set.${colors.reset}`);
    process.exit(1);
  }

  try {
    const linearClient = new LinearClient({ apiKey });
    
    if (options.verbose) {
      console.log(`${colors.dim}API Request: linearClient.teams()${colors.reset}`);
    }
    
    const teams = await linearClient.teams();
    const config = loadConfig();
    
    if (options.format === 'json') {
      const teamsData = teams.nodes.map(team => ({
        key: team.key,
        name: team.name,
        id: team.id,
        isDefault: config.defaultTeam === team.key
      }));
      console.log(JSON.stringify(teamsData, null, 2));
    } else {
      console.log(`\n${colors.cyan}Available teams:${colors.reset}\n`);
      
      for (const team of teams.nodes) {
        const isDefault = config.defaultTeam === team.key;
        const defaultIndicator = isDefault ? ` ${colors.green}[DEFAULT]${colors.reset}` : '';
        console.log(`  ${colors.bright}[${team.key}]${colors.reset} ${team.name}${defaultIndicator}`);
        console.log(`    ${colors.gray}ID: ${team.id}${colors.reset}`);
      }
      
      if (config.defaultTeam) {
        console.log(`\n${colors.dim}Current default team: ${config.defaultTeam}${colors.reset}`);
      } else {
        console.log(`\n${colors.dim}No default team set. Use --set-default to set one.${colors.reset}`);
      }
    }
  } catch (error) {
    console.error(`${colors.red}Error fetching teams:${colors.reset}`, error.message);
    process.exit(1);
  }
}

// Set default team
async function setDefaultTeam(teamKey, options) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.error(`${colors.red}Error: LINEAR_API_KEY environment variable is not set.${colors.reset}`);
    process.exit(1);
  }

  try {
    const linearClient = new LinearClient({ apiKey });
    
    if (options.verbose) {
      console.log(`${colors.dim}API Request: linearClient.teams()${colors.reset}`);
    }
    
    const teams = await linearClient.teams();
    const team = teams.nodes.find(t => t.key === teamKey);
    
    if (!team) {
      console.error(`${colors.red}Error: Team with key '${teamKey}' not found.${colors.reset}`);
      console.log(`\nAvailable teams:`);
      for (const t of teams.nodes) {
        console.log(`  - ${t.key}: ${t.name}`);
      }
      process.exit(1);
    }
    
    const config = loadConfig();
    config.defaultTeam = teamKey;
    
    if (saveConfig(config)) {
      console.log(`${colors.green}✓ Default team set to: ${team.name} [${team.key}]${colors.reset}`);
    }
  } catch (error) {
    console.error(`${colors.red}Error setting default team:${colors.reset}`, error.message);
    process.exit(1);
  }
}

// Main function to fetch priority Linear tickets
async function fetchPriorityTickets(options) {
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

    // Load config for default team
    const config = loadConfig();
    const teamFilter = options.team || config.defaultTeam;
    
    if (teamFilter) {
      console.log(`${colors.cyan}Checking priority issues for team: ${teamFilter}...${colors.reset}`);
    } else {
      console.log(`${colors.cyan}Checking priority issues...${colors.reset}`);
    }

    // Build the GraphQL query to fetch everything in one request
    const query = `
      query GetIssuesAndViewer($issueFilter: IssueFilter) {
        viewer {
          id
          name
        }
        issues(first: 30, filter: $issueFilter) {
          nodes {
            id
            identifier
            title
            description
            priority
            prioritySortOrder
            url
            createdAt
            updatedAt
            
            assignee {
              id
              name
            }
            
            state {
              name
              type
            }
            
            team {
              key
              name
            }
            
            labels {
              nodes {
                name
              }
            }
            
            comments(first: 10) {
              nodes {
                id
                createdAt
                user {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `;

    // Build filter variables
    const variables = {
      issueFilter: {
        state: {
          type: { nin: ["completed", "canceled"] },
          name: { nin: ["Ready to Deploy", "Done"] }
        }
      }
    };
    
    // Add team filter if specified
    if (teamFilter) {
      variables.issueFilter.team = { key: { eq: teamFilter } };
    }

    if (options.verbose) {
      console.log(`${colors.dim}API Request: Single GraphQL query fetching viewer + 30 issues with all nested data${colors.reset}`);
      console.log(`${colors.dim}  Filter: ${JSON.stringify(variables.issueFilter)}${colors.reset}`);
    }

    // Execute the single GraphQL query
    const response = await linearClient._request(query, variables);

    const userInfo = response.viewer;
    const issues = response.issues.nodes;

    // Process issues and check for recent comments
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const processedIssues = [];

    for (const issue of issues) {
      // Check if user commented recently
      let hasRecentComment = false;
      let lastCommentTime = null;

      for (const comment of issue.comments.nodes) {
        const commentTime = new Date(comment.createdAt);

        if (!lastCommentTime || commentTime > lastCommentTime) {
          lastCommentTime = commentTime;
        }

        if (comment.user?.id === userInfo.id && commentTime > twoHoursAgo) {
          hasRecentComment = true;
          break;
        }
      }

      // Skip if user has commented recently
      if (hasRecentComment) continue;

      // Skip if assigned to someone else (but keep unassigned issues)
      if (issue.assignee && issue.assignee.id !== userInfo.id) continue;

      // Add to processed issues - all data is already fetched!
      processedIssues.push({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        prioritySortOrder: issue.prioritySortOrder,
        status: issue.state?.name,
        assignee: issue.assignee?.name,
        isAssignedToMe: issue.assignee?.id === userInfo.id,
        team: issue.team?.name,
        labels: issue.labels?.nodes.map(l => l.name) || [],
        url: issue.url,
        lastCommentTime: lastCommentTime?.toISOString()
      });
    }

    // Sort by status, assignment, and priority
    processedIssues.sort((a, b) => {
      // First, prioritize assigned to me
      if (a.isAssignedToMe && !b.isAssignedToMe) return -1;
      if (!a.isAssignedToMe && b.isAssignedToMe) return 1;

      // Then prioritize by status (In Review > In Progress > Todo > Backlog)
      const getStatusWeight = (status) => {
        const statusOrder = {
          'In Review': 1,
          'In Progress': 2,
          'Todo': 3,
          'Backlog': 4
        };
        return statusOrder[status] || 5; // Unknown statuses go last
      };
      
      const statusDiff = getStatusWeight(a.status) - getStatusWeight(b.status);
      if (statusDiff !== 0) return statusDiff;

      // Finally sort by priority (1 = Urgent, 2 = High, 3 = Medium, 4 = Low, 0/null = None)
      // Lower number = higher priority, except 0 which is "None"
      const getPriorityWeight = (p) => {
        if (p === null || p === 0) return 5; // None = lowest
        return p;
      };

      return getPriorityWeight(a.priority) - getPriorityWeight(b.priority);
    });

    // Take the requested number of issues
    const focusedIssues = processedIssues.slice(0, options.limit);

    // Output in requested format
    if (options.format === 'json') {
      console.log(JSON.stringify(focusedIssues, null, 2));
    } else {
      displayFocusedIssues(focusedIssues);
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
  .description('CLI tool for Linear issue management')
  .version('1.0.0');

// Teams command
program
  .command('teams')
  .description('List all teams or set default team')
  .option('-s, --set-default <key>', 'set default team by key (e.g., STCH)')
  .option('-f, --format <format>', 'output format: table or json', 'table')
  .option('-v, --verbose', 'show detailed API request logging')
  .action(async (options) => {
    if (options.setDefault) {
      await setDefaultTeam(options.setDefault, options);
    } else {
      await listTeams(options);
    }
  });

// Default command (issues)
program
  .option('-f, --format <format>', 'output format: table or json', 'table')
  .option('-l, --limit <number>', 'maximum number of priority issues to show', (val) => parseInt(val), 2)
  .option('-t, --team <key>', 'filter by team key (e.g., STCH)')
  .option('-v, --verbose', 'show detailed API request logging')
  .helpOption('-h, --help', 'display help for command')
  .addHelpText('after', `
${colors.cyan}Description:${colors.reset}
  This tool helps you focus by showing your highest priority Linear issues
  that you haven't commented on in the last 2 hours.

${colors.cyan}Environment Variables:${colors.reset}
  ${colors.green}LINEAR_API_KEY${colors.reset}          Your Linear API key (required)

  To get your API key:
  1. Go to Linear Settings → API → Personal API keys
  2. Create a new key with read access
  3. Add it to your .env file: LINEAR_API_KEY=your_key_here

${colors.cyan}Examples:${colors.reset}
  ${colors.gray}# Show your top 2 priority issues (default)${colors.reset}
  $ linear

  ${colors.gray}# Show top 5 priority issues${colors.reset}
  $ linear --limit 5

  ${colors.gray}# Filter by team${colors.reset}
  $ linear --team STCH

  ${colors.gray}# List all teams${colors.reset}
  $ linear teams

  ${colors.gray}# Set default team${colors.reset}
  $ linear teams --set-default STCH

  ${colors.gray}# Get priority issues in JSON format${colors.reset}
  $ linear --format json`)
  .action(fetchPriorityTickets);

// Parse arguments and run
program.parse(process.argv);

// If no command was provided, show the default (issues)
if (!process.argv.slice(2).length) {
  fetchPriorityTickets(program.opts());
}

module.exports = { fetchPriorityTickets };