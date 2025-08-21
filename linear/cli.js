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
  if (priority === null || priority === undefined) return colors.gray + '⚪ None' + colors.reset;

  const priorityMap = {
    0: colors.gray + '⚪ None',
    1: colors.red + '🔴 Urgent',
    2: colors.yellow + '🟡 High',
    3: colors.blue + '🔵 Medium',
    4: colors.cyan + '⚪ Low'
  };

  return (priorityMap[priority] || colors.gray + '⚪ Unknown') + colors.reset;
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

    console.log(`${colors.cyan}Checking priority issues...${colors.reset}`);

    // Get the current viewer (authenticated user) for comment filtering
    const viewer = await linearClient.viewer;
    const userInfo = await viewer;
    
    // Fetch ALL issues (assigned and unassigned)
    // Fetch extra to account for filtering
    const issuesResult = await linearClient.issues({
      first: options.limit * 10, // Fetch extra to account for filtered ones
      filter: {
        state: {
          type: { nin: ["completed", "canceled"] } // Exclude completed/canceled
        }
      }
    });
    
    // Process issues and check for recent comments
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const processedIssues = [];

    for (const issue of issuesResult.nodes) {
      // Stop if we have enough issues
      if (processedIssues.length >= options.limit) break;

      // Get issue details
      const [assignee, state, team, labels, comments] = await Promise.all([
        issue.assignee,
        issue.state,
        issue.team,
        issue.labels(),
        issue.comments({
          first: 10 // Check last 10 comments
        })
      ]);

      // Check if user commented recently
      let hasRecentComment = false;
      let lastCommentTime = null;

      for (const comment of comments.nodes) {
        const commentUser = await comment.user;
        const commentTime = new Date(comment.createdAt);
        
        if (!lastCommentTime || commentTime > lastCommentTime) {
          lastCommentTime = commentTime;
        }

        if (commentUser?.id === userInfo.id && commentTime > twoHoursAgo) {
          hasRecentComment = true;
          break;
        }
      }

      // Skip if user has commented recently
      if (hasRecentComment) continue;

      // Add to processed issues
      processedIssues.push({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        status: state?.name,
        assignee: assignee?.name,
        isAssignedToMe: assignee?.id === userInfo.id,
        team: team?.name,
        labels: labels?.nodes.map(l => l.name) || [],
        url: issue.url,
        lastCommentTime: lastCommentTime?.toISOString()
      });
    }

    // Sort by priority (lower number = higher priority, null = lowest)
    // Also prioritize issues assigned to the user
    processedIssues.sort((a, b) => {
      // First, prioritize assigned to me
      if (a.isAssignedToMe && !b.isAssignedToMe) return -1;
      if (!a.isAssignedToMe && b.isAssignedToMe) return 1;
      
      // Then sort by priority
      if (a.priority === null) return 1;
      if (b.priority === null) return -1;
      return a.priority - b.priority;
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
  .description('CLI tool for fetching your highest priority Linear tickets')
  .version('1.0.0');

program
  .option('-f, --format <format>', 'output format: table or json', 'table')
  .option('-l, --limit <number>', 'maximum number of priority issues to show', parseInt, 2)
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

  ${colors.gray}# Get priority issues in JSON format${colors.reset}
  $ linear --format json`);

// Parse arguments and run
program.parse(process.argv);
const options = program.opts();

// Run the main function
fetchPriorityTickets(options);

module.exports = { fetchPriorityTickets };