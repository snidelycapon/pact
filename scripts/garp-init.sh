#!/usr/bin/env bash
set -euo pipefail

# garp-init.sh -- Initialize or join a GARP shared repository.
#
# Usage:
#   garp-init.sh new  <path> <team_name> <member1> [member2 ...]
#   garp-init.sh join <git_url> <path>
#
# Members are specified as user_id/display_name pairs (e.g. cory/Cory).
#
# Examples:
#   garp-init.sh new  ~/repos/my-team "My Team" alice/Alice bob/Bob
#   garp-init.sh join git@github.com:org/garp-team.git ~/repos/garp-team

readonly PROGRAM="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly GARP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<EOF
Usage:
  $PROGRAM new  <path> <team_name> <member1> [member2 ...]
  $PROGRAM join <git_url> <path>

Commands:
  new   Create a new GARP shared repository with directory structure and config.
  join  Clone an existing GARP shared repository.

Members (new):
  Specified as user_id/DisplayName pairs separated by a slash.
  Example: alice/Alice bob/Bob charlie/"Charlie B"

Examples:
  $PROGRAM new  ~/repos/my-team "My Team" alice/Alice bob/Bob
  $PROGRAM join git@github.com:org/garp-team.git ~/repos/garp-team
EOF
  exit 1
}

die() { echo "Error: $*" >&2; exit 1; }

# --------------------------------------------------------------------------
# new: create a fresh GARP shared repo
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

  echo "Creating GARP shared repo at $repo_path ..."

  mkdir -p "$repo_path"
  git init --initial-branch=main "$repo_path" > /dev/null

  # Directory structure
  mkdir -p \
    "$repo_path/requests/pending" \
    "$repo_path/requests/active" \
    "$repo_path/requests/completed" \
    "$repo_path/responses" \
    "$repo_path/skills"

  # .gitkeep files
  for dir in requests/pending requests/active requests/completed responses; do
    touch "$repo_path/$dir/.gitkeep"
  done

  # Seed with example skills
  local examples_skills="$GARP_ROOT/examples/skills"
  if [[ -d "$examples_skills" ]]; then
    for skill_dir in "$examples_skills"/*/; do
      local skill_name="$(basename "$skill_dir")"
      cp -R "$skill_dir" "$repo_path/skills/$skill_name"
    done
  else
    echo "Warning: Could not find example skills at $examples_skills. Seeding empty skills directory."
    touch "$repo_path/skills/.gitkeep"
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
  git -C "$repo_path" commit -m "Initialize GARP repo structure" > /dev/null

  echo "Done. GARP repo initialized at $repo_path"
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
    echo "  3. Add skill contracts to skills/<type>/SKILL.md"
    echo "  4. Configure your MCP source with GARP_REPO=$repo_path"
  else
    echo "  1. Add skill contracts to skills/<type>/SKILL.md"
    echo "  2. Configure your MCP source with GARP_REPO=$repo_path"
  fi
}

# --------------------------------------------------------------------------
# join: clone an existing GARP shared repo
# --------------------------------------------------------------------------
cmd_join() {
  local git_url="$1"
  local repo_path="$2"

  # Expand ~ if present
  repo_path="${repo_path/#\~/$HOME}"

  [[ -e "$repo_path" ]] && die "Path already exists: $repo_path"

  echo "Cloning GARP shared repo from $git_url ..."
  git clone "$git_url" "$repo_path"

  # Validate it looks like a GARP repo
  if [[ ! -f "$repo_path/config.json" ]]; then
    echo "Warning: No config.json found. This may not be an initialized GARP repo."
  elif [[ ! -d "$repo_path/requests/pending" ]]; then
    echo "Warning: Missing requests/pending directory. This may not be an initialized GARP repo."
  else
    echo "Done. GARP repo cloned to $repo_path"
  fi

  echo ""
  echo "Next steps:"
  echo "  1. Configure your MCP source with GARP_REPO=$repo_path"
  echo "  2. Set GARP_USER to your user_id from config.json"
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
