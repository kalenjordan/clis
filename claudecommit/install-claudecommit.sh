#!/bin/bash

# Installation script for claudecommit

echo "Installing claudecommit globally..."

# Option 1: Create a symlink in /usr/local/bin (recommended)
if [ -w /usr/local/bin ]; then
    ln -sf "$(pwd)/claudecommit" /usr/local/bin/claudecommit
    echo "✓ Installed claudecommit to /usr/local/bin/"
    echo "You can now use 'claudecommit' from anywhere!"
else
    # Option 2: Try with sudo
    echo "Need sudo access to install to /usr/local/bin"
    sudo ln -sf "$(pwd)/claudecommit" /usr/local/bin/claudecommit
    echo "✓ Installed claudecommit to /usr/local/bin/"
    echo "You can now use 'claudecommit' from anywhere!"
fi

echo ""
echo "Usage:"
echo "  claudecommit              # Add all changes and commit with AI message"
echo "  claudecommit --no-add     # Only commit staged changes"
echo "  claudecommit -m 'message' # Use custom message"
echo ""
echo "To uninstall: rm /usr/local/bin/claudecommit"