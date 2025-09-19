#!/usr/bin/env node

const { LinearClient } = require('@linear/sdk');
const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const os = require('os');
const toml = require('toml');
require('dotenv').config();

// Config file paths
const CONFIG_PATH = path.join(os.homedir(), '.linear-cli-config.json');
const LOCAL_CONFIG_NAME = '.linear.toml';

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

// Load local config from current directory
function loadLocalConfig() {
  let currentDir = process.cwd();

  // Walk up the directory tree looking for .linear.toml
  while (currentDir !== path.parse(currentDir).root) {
    const localConfigPath = path.join(currentDir, LOCAL_CONFIG_NAME);

    if (fs.existsSync(localConfigPath)) {
      try {
        const tomlContent = fs.readFileSync(localConfigPath, 'utf8');
        return toml.parse(tomlContent);
      } catch (error) {
        console.error(`${colors.yellow}Warning: Could not parse local config file at ${localConfigPath}${colors.reset}`);
        console.error(`${colors.yellow}${error.message}${colors.reset}`);
      }
    }

    currentDir = path.dirname(currentDir);
  }

  return {};
}

// Load config
function loadConfig() {
  // Load global config
  let globalConfig = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      globalConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (error) {
    console.error(`${colors.yellow}Warning: Could not load global config file${colors.reset}`);
  }

  // Load local config
  const localConfig = loadLocalConfig();

  // Merge configs with local taking precedence
  return { ...globalConfig, ...localConfig };
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
      assignmentIndicator = ` [UNASSIGNED]`;
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

// Mark a ticket as done and ready for deployment
async function markTicketDone(ticketId, options) {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    console.error(`${colors.red}Error: LINEAR_API_KEY environment variable is not set.${colors.reset}`);
    process.exit(1);
  }

  try {
    const linearClient = new LinearClient({ apiKey });

    // Load config to get deployment target
    const config = loadConfig();

    if (!config.deploymentTarget) {
      console.error(`${colors.red}Error: deploymentTarget not configured${colors.reset}`);
      console.error(`${colors.yellow}Please set deploymentTarget in your .linear.toml file${colors.reset}`);
      console.error(`${colors.dim}Example: deploymentTarget = "staging" or deploymentTarget = "production"${colors.reset}`);
      process.exit(1);
    }

    const deploymentTarget = config.deploymentTarget.toLowerCase();
    if (deploymentTarget !== 'staging' && deploymentTarget !== 'production') {
      console.error(`${colors.red}Error: Invalid deploymentTarget '${config.deploymentTarget}'${colors.reset}`);
      console.error(`${colors.yellow}deploymentTarget must be either 'staging' or 'production'${colors.reset}`);
      process.exit(1);
    }

    console.log(`${colors.cyan}Marking ${ticketId} as done and deploying to ${deploymentTarget}...${colors.reset}`);

    // First, fetch the issue to verify it exists and get current state
    const issueQuery = `
      query GetIssue($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          assignee {
            id
            name
          }
          state {
            id
            name
          }
          labels {
            nodes {
              id
              name
            }
          }
        }
      }
    `;

    if (options.verbose) {
      console.log(`${colors.dim}Fetching issue ${ticketId}...${colors.reset}`);
    }

    const issueResponse = await linearClient._request(issueQuery, { id: ticketId });

    if (!issueResponse.issue) {
      console.error(`${colors.red}Error: Issue ${ticketId} not found${colors.reset}`);
      process.exit(1);
    }

    const issue = issueResponse.issue;
    console.log(`\n${colors.bright}Found issue: ${issue.identifier} - ${issue.title}${colors.reset}`);

    // Find Colby user
    const usersQuery = `
      query GetUsers {
        users {
          nodes {
            id
            name
            email
          }
        }
      }
    `;

    if (options.verbose) {
      console.log(`${colors.dim}Fetching users to find Colby...${colors.reset}`);
    }

    const usersResponse = await linearClient._request(usersQuery);
    const colby = usersResponse.users.nodes.find(user =>
      user.name?.toLowerCase().includes('colby') ||
      user.email?.toLowerCase().includes('colby')
    );

    if (!colby) {
      console.error(`${colors.red}Error: Could not find user 'Colby'${colors.reset}`);
      process.exit(1);
    }

    // Find "In Review" state for the issue's team
    const statesQuery = `
      query GetStates($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
              type
            }
          }
        }
      }
    `;

    // Get team ID from issue
    const teamQuery = `
      query GetIssueTeam($id: String!) {
        issue(id: $id) {
          team {
            id
          }
        }
      }
    `;

    const teamResponse = await linearClient._request(teamQuery, { id: ticketId });
    const teamId = teamResponse.issue.team.id;

    if (options.verbose) {
      console.log(`${colors.dim}Fetching workflow states for team...${colors.reset}`);
    }

    const statesResponse = await linearClient._request(statesQuery, { teamId });
    const inReviewState = statesResponse.team.states.nodes.find(state =>
      state.name.toLowerCase() === 'in review' ||
      state.name.toLowerCase().includes('review')
    );

    if (!inReviewState) {
      console.error(`${colors.red}Error: Could not find 'In Review' state for this team${colors.reset}`);
      process.exit(1);
    }

    // Find the appropriate environment label for the issue's team
    const labelsQuery = `
      query GetLabels($teamId: String!) {
        team(id: $teamId) {
          labels {
            nodes {
              id
              name
              parent {
                id
                name
              }
            }
          }
        }
      }
    `;

    if (options.verbose) {
      console.log(`${colors.dim}Fetching labels for team to find ${deploymentTarget} environment label...${colors.reset}`);
    }

    const labelsResponse = await linearClient._request(labelsQuery, { teamId });
    const teamLabels = labelsResponse.team.labels.nodes;
    let environmentLabel = teamLabels.find(label =>
      label.name.toLowerCase() === deploymentTarget ||
      label.name.toLowerCase() === `${deploymentTarget} environment`
    );

    let allLabels = teamLabels;

    if (!environmentLabel) {
      // If not found in team labels, check workspace-wide labels
      const workspaceLabelsQuery = `
        query GetWorkspaceLabels {
          issueLabels {
            nodes {
              id
              name
              parent {
                id
                name
              }
            }
          }
        }
      `;

      if (options.verbose) {
        console.log(`${colors.dim}Checking workspace-wide labels for ${deploymentTarget} environment label...${colors.reset}`);
      }

      const workspaceLabelsResponse = await linearClient._request(workspaceLabelsQuery);
      const workspaceLabel = workspaceLabelsResponse.issueLabels.nodes.find(label =>
        label.name.toLowerCase() === deploymentTarget ||
        label.name.toLowerCase() === `${deploymentTarget} environment`
      );

      if (!workspaceLabel) {
        console.error(`${colors.red}Error: Could not find '${deploymentTarget}' environment label for this team or workspace${colors.reset}`);
        console.error(`${colors.yellow}The ${deploymentTarget} environment label must exist in your Linear workspace or team${colors.reset}`);
        process.exit(1);
      }

      // Use the workspace label if found
      environmentLabel = workspaceLabel;
      allLabels = workspaceLabelsResponse.issueLabels.nodes;
    }

    // Now update the issue with all three changes
    const updateMutation = `
      mutation UpdateIssue($id: String!, $assigneeId: String!, $stateId: String!, $labelIds: [String!]!) {
        issueUpdate(
          id: $id,
          input: {
            assigneeId: $assigneeId,
            stateId: $stateId,
            labelIds: $labelIds
          }
        ) {
          success
          issue {
            id
            identifier
            title
            assignee {
              name
            }
            state {
              name
            }
            labels {
              nodes {
                name
              }
            }
          }
        }
      }
    `;

    // Collect existing label IDs, removing any from the same group as the environment label
    let existingLabelIds = issue.labels.nodes.map(label => label.id);

    // Get full label info with parent groups (allLabels was set above based on where we found the environment label)
    const environmentLabelFull = allLabels.find(l => l.id === environmentLabel.id);

    // If environment label has a parent group (environment labels), remove other labels from same group
    if (environmentLabelFull && environmentLabelFull.parent) {
      const conflictingLabelNames = allLabels
        .filter(l => l.parent && l.parent.id === environmentLabelFull.parent.id)
        .map(l => l.name.toLowerCase());

      existingLabelIds = issue.labels.nodes
        .filter(label => !conflictingLabelNames.includes(label.name.toLowerCase()))
        .map(label => label.id);
    } else {
      // Just remove any environment labels to avoid duplicates
      existingLabelIds = issue.labels.nodes
        .filter(label =>
          label.name.toLowerCase() !== 'staging' &&
          label.name.toLowerCase() !== 'production' &&
          label.name.toLowerCase() !== 'staging environment' &&
          label.name.toLowerCase() !== 'production environment'
        )
        .map(label => label.id);
    }

    const labelIds = [...existingLabelIds, environmentLabel.id];

    if (options.verbose) {
      console.log(`${colors.dim}Updating issue...${colors.reset}`);
      console.log(`${colors.dim}  Assignee: ${colby.name}${colors.reset}`);
      console.log(`${colors.dim}  State: ${inReviewState.name}${colors.reset}`);
      console.log(`${colors.dim}  Labels: ${labelIds.length} label(s)${colors.reset}`);
    }

    const updateResponse = await linearClient._request(updateMutation, {
      id: ticketId,
      assigneeId: colby.id,
      stateId: inReviewState.id,
      labelIds: labelIds
    });

    if (updateResponse.issueUpdate.success) {
      const updatedIssue = updateResponse.issueUpdate.issue;
      console.log(`\n${colors.green}✓ Successfully marked ${updatedIssue.identifier} as done:${colors.reset}`);
      console.log(`  ${colors.bright}Assignee:${colors.reset} ${updatedIssue.assignee.name}`);
      console.log(`  ${colors.bright}Status:${colors.reset} ${updatedIssue.state.name}`);
      console.log(`  ${colors.bright}Environment:${colors.reset} ${deploymentTarget}`);
      console.log(`  ${colors.bright}Labels:${colors.reset} ${updatedIssue.labels.nodes.map(l => l.name).join(', ')}`);
    } else {
      console.error(`${colors.red}Error: Failed to update issue${colors.reset}`);
      process.exit(1);
    }

  } catch (error) {
    console.error(`${colors.red}Error marking ticket as done:${colors.reset}`, error.message);
    if (options.verbose && error.errors) {
      console.error(`${colors.dim}GraphQL errors:${colors.reset}`, JSON.stringify(error.errors, null, 2));
    }
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
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
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

        if (comment.user?.id === userInfo.id && commentTime > fourHoursAgo) {
          hasRecentComment = true;
          break;
        }
      }

      // Skip if user has commented recently (unless --include-commented flag is set)
      if (hasRecentComment && !options.includeCommented) continue;

      // Skip if not assigned to current user (unless --backlog flag is set)
      // When backlog is enabled, show unassigned issues and issues assigned to the user
      if (!options.backlog) {
        // Default behavior: only show issues assigned to me
        if (!issue.assignee || issue.assignee.id !== userInfo.id) continue;
      } else {
        // Backlog mode: show unassigned OR assigned to me
        if (issue.assignee && issue.assignee.id !== userInfo.id) continue;
      }

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

// Done command - mark a ticket as done and ready for deployment
program
  .command('done <ticketId>')
  .description('Mark a ticket as done (assign to Colby, set to In Review, add deployment environment label)')
  .option('-v, --verbose', 'show detailed API request logging')
  .action(async (ticketId, options) => {
    await markTicketDone(ticketId, options);
  });

// Default command (issues)
program
  .option('-f, --format <format>', 'output format: table or json', 'table')
  .option('-l, --limit <number>', 'maximum number of priority issues to show', (val) => parseInt(val), 2)
  .option('-t, --team <key>', 'filter by team key (e.g., STCH)')
  .option('-v, --verbose', 'show detailed API request logging')
  .option('--include-commented', 'include issues you have commented on recently')
  .option('-b, --backlog', 'include backlog and unassigned issues')
  .helpOption('-h, --help', 'display help for command')
  .action(fetchPriorityTickets);

// Parse arguments and run
program.parse(process.argv);

module.exports = { fetchPriorityTickets };