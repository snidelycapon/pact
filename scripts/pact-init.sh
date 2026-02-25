#!/usr/bin/env bash
set -euo pipefail

# pact-init.sh -- Initialize or join a PACT shared repository.
#
# Usage:
#   pact-init.sh new  <path> <team_name> <member1> [member2 ...]
#   pact-init.sh join <git_url> <path>
#
# Members are specified as user_id/display_name pairs (e.g. cory/Cory).
#
# Examples:
#   pact-init.sh new  ~/repos/my-team "My Team" alice/Alice bob/Bob
#   pact-init.sh join git@github.com:org/pact-team.git ~/repos/pact-team

readonly PROGRAM="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly PACT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<EOF
Usage:
  $PROGRAM new  <path> <team_name> <member1> [member2 ...]
  $PROGRAM join <git_url> <path>

Commands:
  new   Create a new PACT shared repository with directory structure and config.
  join  Clone an existing PACT shared repository.

Members (new):
  Specified as user_id/DisplayName pairs separated by a slash.
  Example: alice/Alice bob/Bob charlie/"Charlie B"

Examples:
  $PROGRAM new  ~/repos/my-team "My Team" alice/Alice bob/Bob
  $PROGRAM join git@github.com:org/pact-team.git ~/repos/pact-team
EOF
  exit 1
}

die() { echo "Error: $*" >&2; exit 1; }

# --------------------------------------------------------------------------
# new: create a fresh PACT shared repo
# --------------------------------------------------------------------------
cmd_new() {
  local repo_path="$1"; shift
  local team_name="$1"; shift
  local -a raw_members=("$@")

  [[ ${#raw_members[@]} -ge 1 ]] || die "At least one member is required."

  # Expand ~ if present
  repo_path="${repo_path/#\~/$HOME}"

  [[ -e "$repo_path" ]] && die "Path already exists: $repo_path"

  # Parse members: expect user_id/DisplayName
  local members_json="["
  local first=true
  for entry in "${raw_members[@]}"; do
    local user_id="${entry%%/*}"
    local display_name="${entry#*/}"
    [[ "$user_id" != "$entry" ]] || die "Invalid member format '$entry'. Expected user_id/DisplayName."
    [[ -n "$user_id" ]] || die "Empty user_id in '$entry'."
    [[ -n "$display_name" ]] || die "Empty display_name in '$entry'."

    if $first; then first=false; else members_json+=","; fi
    members_json+=$'\n    { "user_id": "'"$user_id"'", "display_name": "'"$display_name"'" }'
  done
  members_json+=$'\n  ]'

  echo "Creating PACT shared repo at $repo_path ..."

  mkdir -p "$repo_path"
  git init --initial-branch=main "$repo_path" > /dev/null

  # Directory structure
  mkdir -p \
    "$repo_path/requests/pending" \
    "$repo_path/requests/active" \
    "$repo_path/requests/completed" \
    "$repo_path/requests/cancelled" \
    "$repo_path/responses" \
    "$repo_path/pact-store"

  # .gitkeep files
  for dir in requests/pending requests/active requests/completed requests/cancelled responses; do
    touch "$repo_path/$dir/.gitkeep"
  done

  # Seed with default pacts from pact-store/
  local pact_store="$PACT_ROOT/pact-store"
  if [[ -d "$pact_store" ]]; then
    cp "$pact_store"/*.md "$repo_path/pact-store/"
  else
    echo "Warning: Could not find pact-store at $pact_store. Seeding empty pact-store directory."
    touch "$repo_path/pact-store/.gitkeep"
  fi

  # config.json
  cat > "$repo_path/config.json" <<CONF
{
  "team_name": "$team_name",
  "version": 1,
  "members": $members_json
}
CONF

  # Initial commit
  git -C "$repo_path" add -A
  git -C "$repo_path" commit -m "Initialize PACT repo structure" > /dev/null

  echo "Done. PACT repo initialized at $repo_path"
  echo ""

  # Offer to push to a remote
  if [[ -t 0 ]]; then
    echo -n "Would you like to push this repo to a git remote? [y/N] "
    read -r answer
    if [[ "$answer" =~ ^[Yy] ]]; then
      echo -n "Remote URL (e.g. git@github.com:org/repo.git): "
      read -r remote_url
      [[ -n "$remote_url" ]] || die "No remote URL provided."
      git -C "$repo_path" remote add origin "$remote_url"
      git -C "$repo_path" push -u origin main
      echo "Pushed to $remote_url"
    fi
  fi

  echo ""
  echo "Next steps:"
  if ! git -C "$repo_path" remote get-url origin &>/dev/null; then
    echo "  1. Add a remote:  git -C $repo_path remote add origin <url>"
    echo "  2. Push:          git -C $repo_path push -u origin main"
    echo "  3. Add pacts to pact-store/<type>.md"
    echo "  4. Configure your MCP source with PACT_REPO=$repo_path"
  else
    echo "  1. Add pacts to pact-store/<type>.md"
    echo "  2. Configure your MCP source with PACT_REPO=$repo_path"
  fi
}

# --------------------------------------------------------------------------
# join: clone an existing PACT shared repo
# --------------------------------------------------------------------------
cmd_join() {
  local git_url="$1"
  local repo_path="$2"

  # Expand ~ if present
  repo_path="${repo_path/#\~/$HOME}"

  [[ -e "$repo_path" ]] && die "Path already exists: $repo_path"

  echo "Cloning PACT shared repo from $git_url ..."
  git clone "$git_url" "$repo_path"

  # Validate it looks like a PACT repo
  if [[ ! -f "$repo_path/config.json" ]]; then
    echo "Warning: No config.json found. This may not be an initialized PACT repo."
  elif [[ ! -d "$repo_path/requests/pending" ]]; then
    echo "Warning: Missing requests/pending directory. This may not be an initialized PACT repo."
  else
    echo "Done. PACT repo cloned to $repo_path"
  fi

  echo ""
  echo "Next steps:"
  echo "  1. Configure your MCP source with PACT_REPO=$repo_path"
  echo "  2. Set PACT_USER to your user_id from config.json"
}

# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
[[ $# -ge 1 ]] || usage

case "$1" in
  new)
    [[ $# -ge 4 ]] || { echo "Error: 'new' requires <path> <team_name> <member1> [member2 ...]" >&2; usage; }
    shift; cmd_new "$@"
    ;;
  join)
    [[ $# -eq 3 ]] || { echo "Error: 'join' requires <git_url> <path>" >&2; usage; }
    shift; cmd_join "$@"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    die "Unknown command '$1'. Use 'new' or 'join'."
    ;;
esac
